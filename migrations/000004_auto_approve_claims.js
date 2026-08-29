exports.shorthands = undefined;

const NODE_CHANGE_REASON = "Automatically activated by the claim-first policy";
const EDGE_CHANGE_REASON = "Automatically activated with claim-first knowledge";
const POLICY_ACTOR = "system:auto-approval-policy";

exports.up = (pgm) => {
  pgm.sql(`
    WITH migrated_nodes AS (
      UPDATE knowledge_nodes
      SET
        type = 'CLAIM',
        lifecycle_status = 'ACTIVE',
        metadata = jsonb_set(
          metadata,
          '{auto_approval_migration}',
          jsonb_build_object('prior_type', type::text),
          true
        ),
        current_version = current_version + 1,
        updated_by = '${POLICY_ACTOR}'
      WHERE lifecycle_status = 'PROPOSED'
      RETURNING *
    )
    INSERT INTO knowledge_node_versions (
      workspace_id, node_id, version, title, canonical_statement, statement_hash,
      metadata, origin, verification, lifecycle_status, sensitivity, confidence,
      importance, salience, usefulness_score, change_reason, changed_by
    )
    SELECT
      workspace_id, id, current_version, title, canonical_statement, statement_hash,
      metadata, origin, verification, lifecycle_status, sensitivity, confidence,
      importance, salience, usefulness_score, '${NODE_CHANGE_REASON}', '${POLICY_ACTOR}'
    FROM migrated_nodes;

    WITH migrated_edges AS (
      UPDATE knowledge_edges
      SET
        lifecycle_status = 'ACTIVE',
        provenance = jsonb_set(
          provenance,
          '{auto_approval_migration}',
          jsonb_build_object('prior_status', lifecycle_status::text),
          true
        ),
        current_version = current_version + 1,
        updated_by = '${POLICY_ACTOR}'
      WHERE lifecycle_status = 'PROPOSED'
      RETURNING *
    )
    INSERT INTO knowledge_edge_versions (
      workspace_id, edge_id, version, source_node_id, target_node_id, type,
      strength, confidence, lifecycle_status, provenance, valid_from, valid_until,
      change_reason, changed_by
    )
    SELECT
      workspace_id, id, current_version, source_node_id, target_node_id, type,
      strength, confidence, lifecycle_status, provenance, valid_from, valid_until,
      '${EDGE_CHANGE_REASON}', '${POLICY_ACTOR}'
    FROM migrated_edges;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    WITH reversible_edges AS (
      SELECT edge.id, edge.current_version
      FROM knowledge_edges edge
      JOIN knowledge_edge_versions version
        ON version.edge_id = edge.id AND version.version = edge.current_version
      WHERE edge.provenance ? 'auto_approval_migration'
        AND version.change_reason = '${EDGE_CHANGE_REASON}'
    ), deleted_versions AS (
      DELETE FROM knowledge_edge_versions version
      USING reversible_edges edge
      WHERE version.edge_id = edge.id AND version.version = edge.current_version
    )
    UPDATE knowledge_edges edge
    SET
      lifecycle_status = 'PROPOSED',
      provenance = edge.provenance - 'auto_approval_migration',
      current_version = edge.current_version - 1,
      updated_by = '${POLICY_ACTOR}'
    FROM reversible_edges reversible
    WHERE edge.id = reversible.id;

    WITH reversible_nodes AS (
      SELECT node.id, node.current_version
      FROM knowledge_nodes node
      JOIN knowledge_node_versions version
        ON version.node_id = node.id AND version.version = node.current_version
      WHERE node.metadata ? 'auto_approval_migration'
        AND version.change_reason = '${NODE_CHANGE_REASON}'
    ), deleted_versions AS (
      DELETE FROM knowledge_node_versions version
      USING reversible_nodes node
      WHERE version.node_id = node.id AND version.version = node.current_version
    )
    UPDATE knowledge_nodes node
    SET
      type = (node.metadata #>> '{auto_approval_migration,prior_type}')::knowledge_node_type,
      lifecycle_status = 'PROPOSED',
      metadata = node.metadata - 'auto_approval_migration',
      current_version = node.current_version - 1,
      updated_by = '${POLICY_ACTOR}'
    FROM reversible_nodes reversible
    WHERE node.id = reversible.id;
  `);
};
