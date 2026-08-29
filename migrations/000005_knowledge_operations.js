exports.shorthands = undefined;

const LEGACY_NODE_TYPES = [
  "EPISODE",
  "SIGNAL",
  "OBSERVATION",
  "CLAIM",
  "CONCEPT",
  "ENTITY",
  "EXPERIENCE",
  "EVIDENCE",
  "CONSTRAINT",
  "COUNTERARGUMENT",
  "POSITION",
  "AUDIENCE_INSIGHT",
  "VOICE_PATTERN",
  "ARTIFACT",
];

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TYPE knowledge_operation AS ENUM ('INSERT', 'CHALLENGE', 'EXTEND');
    CREATE TYPE knowledge_node_type_next AS ENUM (
      'FACT', 'OBSERVATION', 'PRINCIPLE', 'DECISION', 'PROCEDURE',
      'CLAIM', 'EVIDENCE', 'HYPOTHESIS', 'ARGUMENT', 'INSIGHT'
    );

    ALTER TABLE knowledge_nodes
      ADD COLUMN operation knowledge_operation NOT NULL DEFAULT 'INSERT';

    UPDATE knowledge_nodes
    SET metadata = jsonb_set(
      metadata,
      '{operation_migration}',
      jsonb_build_object(
        'prior_type',
        COALESCE(metadata #>> '{auto_approval_migration,prior_type}', type::text)
      ),
      true
    );

    ALTER TABLE knowledge_nodes
      ALTER COLUMN type TYPE knowledge_node_type_next
      USING (
        CASE COALESCE(metadata #>> '{operation_migration,prior_type}', type::text)
          WHEN 'ENTITY' THEN 'FACT'
          WHEN 'EVIDENCE' THEN 'FACT'
          WHEN 'ARTIFACT' THEN 'FACT'
          WHEN 'CONCEPT' THEN 'PRINCIPLE'
          WHEN 'CONSTRAINT' THEN 'PRINCIPLE'
          WHEN 'POSITION' THEN 'PRINCIPLE'
          WHEN 'VOICE_PATTERN' THEN 'PROCEDURE'
          ELSE 'OBSERVATION'
        END
      )::knowledge_node_type_next;

    DROP TYPE knowledge_node_type;
    ALTER TYPE knowledge_node_type_next RENAME TO knowledge_node_type;

    ALTER TABLE knowledge_nodes ADD CONSTRAINT knowledge_nodes_operation_type_check CHECK (
      (operation = 'INSERT' AND type IN ('FACT', 'OBSERVATION', 'PRINCIPLE', 'DECISION', 'PROCEDURE'))
      OR (operation = 'CHALLENGE' AND type IN ('CLAIM', 'EVIDENCE', 'HYPOTHESIS'))
      OR (operation = 'EXTEND' AND type IN ('ARGUMENT', 'INSIGHT'))
    );

    CREATE INDEX knowledge_nodes_operation_idx
      ON knowledge_nodes (workspace_id, operation, lifecycle_status, updated_at DESC);

    ALTER TABLE knowledge_sources DROP CONSTRAINT knowledge_sources_source_type_check;
    ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_source_type_check CHECK (
      source_type IN (
        'signal', 'generated_insight', 'operator_evidence', 'approved_revision',
        'published_artifact', 'external_source', 'correction', 'operation_request'
      )
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE knowledge_sources DROP CONSTRAINT knowledge_sources_source_type_check;
    ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_source_type_check CHECK (
      source_type IN (
        'signal', 'generated_insight', 'operator_evidence', 'approved_revision',
        'published_artifact', 'external_source', 'correction'
      )
    );

    DROP INDEX IF EXISTS knowledge_nodes_operation_idx;
    ALTER TABLE knowledge_nodes DROP CONSTRAINT knowledge_nodes_operation_type_check;

    CREATE TYPE knowledge_node_type_legacy AS ENUM (
      ${LEGACY_NODE_TYPES.map((type) => `'${type}'`).join(", ")}
    );

    ALTER TABLE knowledge_nodes
      ALTER COLUMN type TYPE knowledge_node_type_legacy
      USING (
        CASE
          WHEN metadata #>> '{operation_migration,prior_type}' IN (
            ${LEGACY_NODE_TYPES.map((type) => `'${type}'`).join(", ")}
          ) THEN metadata #>> '{operation_migration,prior_type}'
          ELSE CASE type::text
            WHEN 'FACT' THEN 'EVIDENCE'
            WHEN 'OBSERVATION' THEN 'OBSERVATION'
            WHEN 'PRINCIPLE' THEN 'CONSTRAINT'
            WHEN 'DECISION' THEN 'POSITION'
            WHEN 'PROCEDURE' THEN 'VOICE_PATTERN'
            WHEN 'CLAIM' THEN 'CLAIM'
            WHEN 'EVIDENCE' THEN 'EVIDENCE'
            WHEN 'HYPOTHESIS' THEN 'CLAIM'
            WHEN 'ARGUMENT' THEN 'COUNTERARGUMENT'
            WHEN 'INSIGHT' THEN 'AUDIENCE_INSIGHT'
          END
        END
      )::knowledge_node_type_legacy;

    DROP TYPE knowledge_node_type;
    ALTER TYPE knowledge_node_type_legacy RENAME TO knowledge_node_type;

    UPDATE knowledge_nodes
    SET metadata = metadata - 'operation_migration'
    WHERE metadata ? 'operation_migration';

    ALTER TABLE knowledge_nodes DROP COLUMN operation;
    DROP TYPE knowledge_operation;
  `);
};
