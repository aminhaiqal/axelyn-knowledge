import type { PoolClient } from "pg";
import { query, withTransaction } from "@/src/db/pool";
import { mapNode, vectorLiteral } from "@/src/db/records";
import { badRequest, conflict, notFound } from "@/src/domain/errors";
import type { LifecycleStatus } from "@/src/domain/enums";
import { statementHash } from "@/src/domain/normalize";
import type { EdgeCreateInput, NodeCreateInput, NodePatchInput } from "@/src/domain/schemas";
import { createEmbeddingGateway } from "@/src/gateways/factory";
import type { EmbeddingGateway } from "@/src/gateways/types";
import { logger } from "@/src/lib/logger";

interface ListOptions {
  workspace_id: string;
  query?: string;
  type?: string;
  origin?: string;
  verification?: string;
  lifecycle_status?: string;
  sensitivity?: string;
  cursor?: string;
  limit: number;
}

function encodeCursor(updatedAt: Date | string, id: string) {
  return Buffer.from(JSON.stringify([new Date(updatedAt).toISOString(), id])).toString("base64url");
}

function decodeCursor(cursor?: string): [string, string] | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string"
    ) {
      return [value[0], value[1]];
    }
  } catch {
    // Report one stable public error below.
  }
  throw badRequest("INVALID_CURSOR", "The pagination cursor is invalid.");
}

async function recordNodeVersion(
  client: PoolClient,
  workspaceId: string,
  nodeId: string,
  actor: string,
  reason: string,
) {
  await client.query(
    `INSERT INTO knowledge_node_versions (
      workspace_id, node_id, version, title, canonical_statement, statement_hash,
      metadata, origin, verification, lifecycle_status, sensitivity, confidence,
      importance, salience, usefulness_score, change_reason, changed_by
    )
    SELECT workspace_id, id, current_version, title, canonical_statement, statement_hash,
      metadata, origin, verification, lifecycle_status, sensitivity, confidence,
      importance, salience, usefulness_score, $3, $4
    FROM knowledge_nodes WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, nodeId, reason, actor],
  );
}

async function recordEdgeVersion(
  client: PoolClient,
  workspaceId: string,
  edgeId: string,
  actor: string,
  reason: string,
) {
  await client.query(
    `INSERT INTO knowledge_edge_versions (
      workspace_id, edge_id, version, source_node_id, target_node_id, type,
      strength, confidence, lifecycle_status, provenance, valid_from, valid_until,
      change_reason, changed_by
    )
    SELECT workspace_id, id, current_version, source_node_id, target_node_id, type,
      strength, confidence, lifecycle_status, provenance, valid_from, valid_until,
      $3, $4
    FROM knowledge_edges WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, edgeId, reason, actor],
  );
}

export class NodeService {
  constructor(
    private readonly embeddingGateway: EmbeddingGateway | null = createEmbeddingGateway(),
  ) {}

  async create(input: NodeCreateInput, actor: string) {
    if (["AI_DERIVED", "APPROVED_COPY"].includes(input.origin) && input.source_links.length === 0) {
      throw badRequest(
        "PROVENANCE_REQUIRED",
        "AI-derived and approved-copy knowledge requires at least one immutable source link.",
      );
    }
    if (input.verification === "SOURCE_SUPPORTED" && input.source_links.length === 0) {
      throw badRequest(
        "SOURCE_REQUIRED_FOR_VERIFICATION",
        "Source-supported knowledge requires supporting provenance.",
      );
    }

    let embedding: number[] | null = null;
    if (this.embeddingGateway) {
      try {
        embedding = await this.embeddingGateway.embed(input.canonical_statement);
      } catch (error) {
        logger.warn("embedding.failed", {
          message: error instanceof Error ? error.message : "Unknown embedding failure",
        });
      }
    }
    const hash = statementHash(input.canonical_statement);

    const node = await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO workspaces (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING`,
        [input.workspace_id],
      );
      await this.assertSourceLinks(client, input.workspace_id, input.source_links);
      const duplicateRows = await client.query<{ id: string }>(
        `SELECT id FROM knowledge_nodes
         WHERE workspace_id = $1 AND statement_hash = $2 AND lifecycle_status <> 'ARCHIVED'
         LIMIT 10`,
        [input.workspace_id, hash],
      );
      const metadata = {
        ...input.metadata,
        ...(duplicateRows.rowCount
          ? { duplicate_suggestions: duplicateRows.rows.map((row) => row.id) }
          : {}),
      };
      const inserted = await client.query(
        `INSERT INTO knowledge_nodes (
          workspace_id, type, title, canonical_statement, statement_hash, metadata,
          origin, verification, lifecycle_status, sensitivity, confidence, importance,
          salience, embedding, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14::vector, $15, $15)
        RETURNING *`,
        [
          input.workspace_id,
          input.type,
          input.title,
          input.canonical_statement,
          hash,
          metadata,
          input.origin,
          input.verification,
          input.lifecycle_status,
          input.sensitivity,
          input.confidence,
          input.importance,
          input.salience,
          embedding ? vectorLiteral(embedding) : null,
          actor,
        ],
      );
      const created = mapNode(inserted.rows[0]);
      for (const link of input.source_links) {
        await client.query(
          `INSERT INTO knowledge_node_sources (
            workspace_id, node_id, source_id, supporting_excerpt
          ) VALUES ($1, $2, $3, $4)`,
          [input.workspace_id, created.id, link.source_id, link.excerpt],
        );
      }
      await recordNodeVersion(client, input.workspace_id, created.id, actor, "Node created");
      await client.query(
        `INSERT INTO outbox_events (
          workspace_id, event_type, aggregate_type, aggregate_id, payload
        ) VALUES ($1, 'knowledge.node.created', 'knowledge_node', $2, $3)`,
        [input.workspace_id, created.id, { node_id: created.id }],
      );
      return created;
    });
    return node;
  }

  async createEdge(input: EdgeCreateInput, actor: string) {
    if (input.source_node_id === input.target_node_id) {
      throw badRequest("SELF_EDGE", "A knowledge edge cannot point to the same node.");
    }
    return withTransaction(async (client) => {
      const endpoints = await client.query<{ id: string }>(
        `SELECT id FROM knowledge_nodes
         WHERE workspace_id = $1 AND id = ANY($2::uuid[]) FOR SHARE`,
        [input.workspace_id, [input.source_node_id, input.target_node_id]],
      );
      if (endpoints.rowCount !== 2) {
        throw badRequest(
          "INVALID_EDGE_ENDPOINTS",
          "Both edge endpoints must exist in the same workspace.",
        );
      }
      await this.assertSourceLinks(client, input.workspace_id, input.source_links);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO knowledge_edges (
          workspace_id, source_node_id, target_node_id, type, strength, confidence,
          lifecycle_status, provenance, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING id`,
        [
          input.workspace_id,
          input.source_node_id,
          input.target_node_id,
          input.type,
          input.strength,
          input.confidence,
          input.lifecycle_status,
          input.provenance,
          actor,
        ],
      );
      const edgeId = inserted.rows[0].id;
      for (const link of input.source_links) {
        await client.query(
          `INSERT INTO knowledge_edge_sources (
            workspace_id, edge_id, source_id, supporting_excerpt
          ) VALUES ($1, $2, $3, $4)`,
          [input.workspace_id, edgeId, link.source_id, link.excerpt],
        );
      }
      await recordEdgeVersion(client, input.workspace_id, edgeId, actor, "Edge created");
      return this.getEdge(input.workspace_id, edgeId, client);
    });
  }

  async list(options: ListOptions) {
    const cursor = decodeCursor(options.cursor);
    const values: unknown[] = [options.workspace_id, options.limit + 1];
    const clauses = ["workspace_id = $1"];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      clauses.push(sql.replace("?", `$${values.length}`));
    };
    if (options.query) add("search_document @@ websearch_to_tsquery('english', ?)", options.query);
    if (options.type) add("type = ?::knowledge_node_type", options.type);
    if (options.origin) add("origin = ?::knowledge_origin", options.origin);
    if (options.verification) add("verification = ?::knowledge_verification", options.verification);
    if (options.lifecycle_status)
      add("lifecycle_status = ?::knowledge_lifecycle", options.lifecycle_status);
    if (options.sensitivity) add("sensitivity = ?::knowledge_sensitivity", options.sensitivity);
    if (cursor) {
      values.push(cursor[0], cursor[1]);
      clauses.push(
        `(updated_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
      );
    }
    const result = await query(
      `SELECT * FROM knowledge_nodes
       WHERE ${clauses.join(" AND ")}
       ORDER BY updated_at DESC, id DESC LIMIT $2`,
      values,
    );
    const hasMore = result.rows.length > options.limit;
    const rows = result.rows.slice(0, options.limit).map(mapNode);
    const last = rows.at(-1);
    return {
      items: rows,
      next_cursor: hasMore && last ? encodeCursor(last.updated_at, last.id) : null,
    };
  }

  async inbox(workspaceId: string, limit = 50) {
    const [nodes, edges] = await Promise.all([
      query(
        `SELECT n.*,
          COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
            'source_id', s.id, 'source_system', s.source_system, 'source_type', s.source_type,
            'external_id', s.external_id, 'source_version', s.source_version,
            'excerpt', ns.supporting_excerpt, 'content', s.content
          )) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb) AS provenance
         FROM knowledge_nodes n
         LEFT JOIN knowledge_node_sources ns ON ns.workspace_id = n.workspace_id AND ns.node_id = n.id
         LEFT JOIN knowledge_sources s ON s.workspace_id = ns.workspace_id AND s.id = ns.source_id
         WHERE n.workspace_id = $1 AND n.lifecycle_status = 'PROPOSED'
         GROUP BY n.id ORDER BY n.created_at ASC LIMIT $2`,
        [workspaceId, limit],
      ),
      query(
        `SELECT e.*, sn.title AS source_title, tn.title AS target_title,
          COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
            'source_id', s.id, 'source_system', s.source_system,
            'source_type', s.source_type, 'external_id', s.external_id,
            'source_version', s.source_version, 'excerpt', es.supporting_excerpt,
            'content', s.content
          )) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb) AS sources
         FROM knowledge_edges e
         JOIN knowledge_nodes sn ON sn.workspace_id = e.workspace_id AND sn.id = e.source_node_id
         JOIN knowledge_nodes tn ON tn.workspace_id = e.workspace_id AND tn.id = e.target_node_id
         LEFT JOIN knowledge_edge_sources es ON es.workspace_id = e.workspace_id AND es.edge_id = e.id
         LEFT JOIN knowledge_sources s ON s.workspace_id = es.workspace_id AND s.id = es.source_id
         WHERE e.workspace_id = $1 AND e.lifecycle_status = 'PROPOSED'
         GROUP BY e.id, sn.title, tn.title ORDER BY e.created_at ASC LIMIT $2`,
        [workspaceId, limit],
      ),
    ]);
    return {
      nodes: nodes.rows.map((row) => ({ ...mapNode(row), provenance: row.provenance })),
      edges: edges.rows,
    };
  }

  async get(workspaceId: string, nodeId: string) {
    const result = await query(
      `SELECT * FROM knowledge_nodes WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, nodeId],
    );
    if (!result.rowCount) throw notFound("Knowledge node");
    const [sources, versions, edges, usage, aliases] = await Promise.all([
      query(
        `SELECT s.id AS source_id, s.source_system, s.source_type, s.external_id,
          s.source_version, ns.supporting_excerpt AS excerpt, s.occurred_at
         FROM knowledge_node_sources ns
         JOIN knowledge_sources s ON s.workspace_id = ns.workspace_id AND s.id = ns.source_id
         WHERE ns.workspace_id = $1 AND ns.node_id = $2 ORDER BY s.occurred_at DESC`,
        [workspaceId, nodeId],
      ),
      query(
        `SELECT * FROM knowledge_node_versions
         WHERE workspace_id = $1 AND node_id = $2 ORDER BY version DESC`,
        [workspaceId, nodeId],
      ),
      query(
        `SELECT e.*, sn.title AS source_title, tn.title AS target_title,
          CASE WHEN e.source_node_id = $2 THEN 'OUT' ELSE 'IN' END AS direction
         FROM knowledge_edges e
         JOIN knowledge_nodes sn ON sn.workspace_id = e.workspace_id AND sn.id = e.source_node_id
         JOIN knowledge_nodes tn ON tn.workspace_id = e.workspace_id AND tn.id = e.target_node_id
         WHERE e.workspace_id = $1 AND (e.source_node_id = $2 OR e.target_node_id = $2)
         ORDER BY e.created_at DESC`,
        [workspaceId, nodeId],
      ),
      query(
        `SELECT * FROM knowledge_usage
         WHERE workspace_id = $1 AND node_id = $2 ORDER BY created_at DESC LIMIT 100`,
        [workspaceId, nodeId],
      ),
      query(
        `SELECT alias, source_node_id, created_by, created_at
         FROM knowledge_node_aliases WHERE workspace_id = $1 AND node_id = $2
         ORDER BY created_at DESC`,
        [workspaceId, nodeId],
      ),
    ]);
    return {
      ...mapNode(result.rows[0]),
      provenance: sources.rows,
      versions: versions.rows,
      relationships: edges.rows,
      contradictions: edges.rows.filter((edge) => edge.type === "CONTRADICTS"),
      usage: usage.rows,
      aliases: aliases.rows,
    };
  }

  async patch(workspaceId: string, nodeId: string, input: NodePatchInput, actor: string) {
    let refreshedEmbedding: number[] | null | undefined;
    if (input.canonical_statement !== undefined) {
      refreshedEmbedding = null;
      if (this.embeddingGateway) {
        try {
          refreshedEmbedding = await this.embeddingGateway.embed(input.canonical_statement);
        } catch (error) {
          logger.warn("embedding.failed", {
            message: error instanceof Error ? error.message : "Unknown embedding failure",
          });
        }
      }
    }
    return withTransaction(async (client) => {
      const current = await client.query(
        `SELECT * FROM knowledge_nodes WHERE workspace_id = $1 AND id = $2 FOR UPDATE`,
        [workspaceId, nodeId],
      );
      if (!current.rowCount) throw notFound("Knowledge node");
      if (Number(current.rows[0].current_version) !== input.expected_version) {
        throw conflict("VERSION_CONFLICT", "The knowledge node was changed by another actor.", {
          current_version: Number(current.rows[0].current_version),
        });
      }
      if (input.verification === "SOURCE_SUPPORTED") {
        const provenance = await client.query(
          `SELECT 1 FROM knowledge_node_sources
           WHERE workspace_id = $1 AND node_id = $2 LIMIT 1`,
          [workspaceId, nodeId],
        );
        if (!provenance.rowCount) {
          throw badRequest(
            "SOURCE_REQUIRED_FOR_VERIFICATION",
            "Source-supported knowledge requires supporting provenance.",
          );
        }
      }
      const statement = input.canonical_statement ?? current.rows[0].canonical_statement;
      const result = await client.query(
        `UPDATE knowledge_nodes SET
          title = COALESCE($3, title),
          canonical_statement = COALESCE($4, canonical_statement),
          statement_hash = $5,
          metadata = COALESCE($6, metadata),
          verification = COALESCE($7::knowledge_verification, verification),
          sensitivity = COALESCE($8::knowledge_sensitivity, sensitivity),
          confidence = COALESCE($9, confidence),
          importance = COALESCE($10, importance),
          salience = COALESCE($11, salience),
          embedding = CASE WHEN $12::boolean THEN $13::vector ELSE embedding END,
          current_version = current_version + 1,
          updated_by = $14
         WHERE workspace_id = $1 AND id = $2 RETURNING *`,
        [
          workspaceId,
          nodeId,
          input.title ?? null,
          input.canonical_statement ?? null,
          statementHash(statement),
          input.metadata ?? null,
          input.verification ?? null,
          input.sensitivity ?? null,
          input.confidence ?? null,
          input.importance ?? null,
          input.salience ?? null,
          input.canonical_statement !== undefined,
          refreshedEmbedding ? vectorLiteral(refreshedEmbedding) : null,
          actor,
        ],
      );
      await recordNodeVersion(client, workspaceId, nodeId, actor, input.change_reason);
      return mapNode(result.rows[0]);
    });
  }

  async transition(
    workspaceId: string,
    nodeId: string,
    lifecycle: Extract<LifecycleStatus, "ACTIVE" | "REJECTED" | "ARCHIVED">,
    actor: string,
    reason: string,
  ) {
    return withTransaction(async (client) => {
      const current = await client.query(
        `SELECT * FROM knowledge_nodes WHERE workspace_id = $1 AND id = $2 FOR UPDATE`,
        [workspaceId, nodeId],
      );
      if (!current.rowCount) throw notFound("Knowledge node");
      const result = await client.query(
        `UPDATE knowledge_nodes SET lifecycle_status = $3::knowledge_lifecycle,
          archived_at = CASE WHEN $3::knowledge_lifecycle = 'ARCHIVED' THEN now() ELSE NULL END,
          current_version = current_version + 1, updated_by = $4
         WHERE workspace_id = $1 AND id = $2 RETURNING *`,
        [workspaceId, nodeId, lifecycle, actor],
      );
      await recordNodeVersion(client, workspaceId, nodeId, actor, reason);
      if (lifecycle !== "ACTIVE") {
        const affectedEdges = await client.query<{ id: string }>(
          `UPDATE knowledge_edges SET lifecycle_status = $3::knowledge_lifecycle,
            archived_at = CASE WHEN $3::knowledge_lifecycle = 'ARCHIVED' THEN now() ELSE archived_at END,
            current_version = current_version + 1, updated_by = $4
           WHERE workspace_id = $1
             AND (source_node_id = $2 OR target_node_id = $2)
             AND lifecycle_status IN ('PROPOSED', 'ACTIVE')
           RETURNING id`,
          [workspaceId, nodeId, lifecycle, actor],
        );
        for (const edge of affectedEdges.rows) {
          await recordEdgeVersion(
            client,
            workspaceId,
            edge.id,
            actor,
            `Endpoint node changed lifecycle: ${reason}`,
          );
        }
      }
      return mapNode(result.rows[0]);
    });
  }

  async reviewEdge(
    workspaceId: string,
    edgeId: string,
    lifecycle: Extract<LifecycleStatus, "ACTIVE" | "REJECTED">,
    actor: string,
    reason: string,
  ) {
    return withTransaction(async (client) => {
      const current = await client.query(
        `SELECT * FROM knowledge_edges WHERE workspace_id = $1 AND id = $2 FOR UPDATE`,
        [workspaceId, edgeId],
      );
      if (!current.rowCount) throw notFound("Knowledge edge");
      if (lifecycle === "ACTIVE") {
        const endpoints = await client.query<{ lifecycle_status: string }>(
          `SELECT lifecycle_status FROM knowledge_nodes
           WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
          [workspaceId, [current.rows[0].source_node_id, current.rows[0].target_node_id]],
        );
        if (endpoints.rows.some((row) => row.lifecycle_status !== "ACTIVE")) {
          throw conflict(
            "INACTIVE_EDGE_ENDPOINT",
            "Approve both endpoint nodes before approving this relationship.",
          );
        }
      }
      await client.query(
        `UPDATE knowledge_edges SET lifecycle_status = $3,
          current_version = current_version + 1, updated_by = $4
         WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, edgeId, lifecycle, actor],
      );
      await recordEdgeVersion(client, workspaceId, edgeId, actor, reason);
      return this.getEdge(workspaceId, edgeId, client);
    });
  }

  async merge(
    workspaceId: string,
    sourceNodeId: string,
    targetNodeId: string,
    expectedSourceVersion: number,
    expectedTargetVersion: number,
    actor: string,
    reason: string,
  ) {
    if (sourceNodeId === targetNodeId)
      throw badRequest("INVALID_MERGE", "A node cannot merge into itself.");
    await withTransaction(async (client) => {
      const locked = await client.query(
        `SELECT * FROM knowledge_nodes
         WHERE workspace_id = $1 AND id = ANY($2::uuid[])
         ORDER BY id FOR UPDATE`,
        [workspaceId, [sourceNodeId, targetNodeId]],
      );
      if (locked.rowCount !== 2) throw notFound("Merge node");
      const source = locked.rows.find((row) => row.id === sourceNodeId)!;
      const target = locked.rows.find((row) => row.id === targetNodeId)!;
      if (
        Number(source.current_version) !== expectedSourceVersion ||
        Number(target.current_version) !== expectedTargetVersion
      ) {
        throw conflict("VERSION_CONFLICT", "One of the merge nodes changed before review.");
      }
      const contradiction = await client.query(
        `SELECT id FROM knowledge_edges
         WHERE workspace_id = $1 AND type = 'CONTRADICTS' AND lifecycle_status <> 'ARCHIVED'
           AND ((source_node_id = $2 AND target_node_id = $3)
             OR (source_node_id = $3 AND target_node_id = $2)) LIMIT 1`,
        [workspaceId, sourceNodeId, targetNodeId],
      );
      if (contradiction.rowCount) {
        throw conflict(
          "CONTRADICTORY_MERGE",
          "Contradictory claims cannot be merged. Resolve or supersede them explicitly.",
        );
      }

      await client.query(
        `INSERT INTO knowledge_node_sources (
          workspace_id, node_id, source_id, supporting_excerpt
        )
        SELECT workspace_id, $3, source_id, supporting_excerpt
        FROM knowledge_node_sources WHERE workspace_id = $1 AND node_id = $2
        ON CONFLICT DO NOTHING`,
        [workspaceId, sourceNodeId, targetNodeId],
      );
      await client.query(
        `INSERT INTO knowledge_node_aliases (
          workspace_id, node_id, alias, alias_hash, source_node_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (workspace_id, node_id, alias_hash) DO NOTHING`,
        [
          workspaceId,
          targetNodeId,
          source.canonical_statement,
          source.statement_hash,
          sourceNodeId,
          actor,
        ],
      );

      const affectedEdges = await client.query<{
        id: string;
        source_node_id: string;
        target_node_id: string;
      }>(
        `SELECT id, source_node_id, target_node_id FROM knowledge_edges
         WHERE workspace_id = $1 AND (source_node_id = $2 OR target_node_id = $2)
         FOR UPDATE`,
        [workspaceId, sourceNodeId],
      );
      for (const edge of affectedEdges.rows) {
        const nextSource =
          edge.source_node_id === sourceNodeId ? targetNodeId : edge.source_node_id;
        const nextTarget =
          edge.target_node_id === sourceNodeId ? targetNodeId : edge.target_node_id;
        const becomesSelf = nextSource === nextTarget;
        if (becomesSelf) {
          await client.query(
            `UPDATE knowledge_edges SET lifecycle_status = 'ARCHIVED', archived_at = now(),
              current_version = current_version + 1, updated_by = $3
             WHERE workspace_id = $1 AND id = $2`,
            [workspaceId, edge.id, actor],
          );
        } else {
          await client.query(
            `UPDATE knowledge_edges SET source_node_id = $3, target_node_id = $4,
              current_version = current_version + 1, updated_by = $5
             WHERE workspace_id = $1 AND id = $2`,
            [workspaceId, edge.id, nextSource, nextTarget, actor],
          );
        }
        await recordEdgeVersion(client, workspaceId, edge.id, actor, `Merge: ${reason}`);
      }

      await client.query(
        `UPDATE knowledge_nodes SET lifecycle_status = 'ARCHIVED', archived_at = now(),
          current_version = current_version + 1, updated_by = $3,
          metadata = metadata || jsonb_build_object('merged_into', $4::text)
         WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, sourceNodeId, actor, targetNodeId],
      );
      await recordNodeVersion(client, workspaceId, sourceNodeId, actor, `Merged: ${reason}`);
      await client.query(
        `UPDATE knowledge_nodes SET current_version = current_version + 1, updated_by = $3,
          metadata = metadata || jsonb_build_object('last_merged_node', $2::text)
         WHERE workspace_id = $1 AND id = $4`,
        [workspaceId, sourceNodeId, actor, targetNodeId],
      );
      await recordNodeVersion(
        client,
        workspaceId,
        targetNodeId,
        actor,
        `Accepted merge: ${reason}`,
      );

      const sourceLink = await client.query<{ source_id: string; supporting_excerpt: string }>(
        `SELECT source_id, supporting_excerpt FROM knowledge_node_sources
         WHERE workspace_id = $1 AND node_id = $2 LIMIT 1`,
        [workspaceId, sourceNodeId],
      );
      if (sourceLink.rowCount) {
        const supersedes = await client.query<{ id: string }>(
          `INSERT INTO knowledge_edges (
            workspace_id, source_node_id, target_node_id, type, strength, confidence,
            lifecycle_status, provenance, created_by, updated_by
          ) VALUES ($1, $2, $3, 'SUPERSEDES', 1, 1, 'ACTIVE', $4, $5, $5)
          RETURNING id`,
          [workspaceId, targetNodeId, sourceNodeId, { merge_reason: reason }, actor],
        );
        await client.query(
          `INSERT INTO knowledge_edge_sources (
            workspace_id, edge_id, source_id, supporting_excerpt
          ) VALUES ($1, $2, $3, $4)`,
          [
            workspaceId,
            supersedes.rows[0].id,
            sourceLink.rows[0].source_id,
            sourceLink.rows[0].supporting_excerpt,
          ],
        );
        await recordEdgeVersion(
          client,
          workspaceId,
          supersedes.rows[0].id,
          actor,
          `Superseding merge: ${reason}`,
        );
      }
      await client.query(
        `INSERT INTO outbox_events (
          workspace_id, event_type, aggregate_type, aggregate_id, payload
        ) VALUES ($1, 'knowledge.node.merged', 'knowledge_node', $2, $3)`,
        [workspaceId, targetNodeId, { source_node_id: sourceNodeId, target_node_id: targetNodeId }],
      );
    });
    return this.get(workspaceId, targetNodeId);
  }

  async neighborhood(workspaceId: string, nodeId: string, depth: number, limit: number) {
    const exists = await query(
      `SELECT id FROM knowledge_nodes WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, nodeId],
    );
    if (!exists.rowCount) throw notFound("Knowledge node");
    const nodes = await query(
      `WITH RECURSIVE walk AS (
        SELECT $2::uuid AS node_id, ARRAY[$2::uuid] AS path, 0 AS depth
        UNION ALL
        SELECT adjacent.next_node_id, walk.path || adjacent.next_node_id, walk.depth + 1
        FROM walk
        JOIN LATERAL (
          SELECT e.target_node_id AS next_node_id
          FROM knowledge_edges e
          WHERE e.workspace_id = $1 AND e.source_node_id = walk.node_id
            AND e.lifecycle_status = 'ACTIVE'
          UNION
          SELECT e.source_node_id AS next_node_id
          FROM knowledge_edges e
          WHERE e.workspace_id = $1 AND e.target_node_id = walk.node_id
            AND e.lifecycle_status = 'ACTIVE'
        ) adjacent ON true
        WHERE walk.depth < $3 AND NOT adjacent.next_node_id = ANY(walk.path)
      )
      SELECT DISTINCT ON (n.id) n.*, walk.depth
      FROM walk JOIN knowledge_nodes n ON n.workspace_id = $1 AND n.id = walk.node_id
      ORDER BY n.id, walk.depth LIMIT $4`,
      [workspaceId, nodeId, depth, limit],
    );
    const nodeIds = nodes.rows.map((row) => row.id);
    const edges = nodeIds.length
      ? await query(
          `SELECT * FROM knowledge_edges
           WHERE workspace_id = $1 AND lifecycle_status = 'ACTIVE'
             AND source_node_id = ANY($2::uuid[]) AND target_node_id = ANY($2::uuid[])
           ORDER BY created_at`,
          [workspaceId, nodeIds],
        )
      : { rows: [] };
    return {
      nodes: nodes.rows.map((row) => ({ ...mapNode(row), depth: Number(row.depth) })),
      edges: edges.rows,
    };
  }

  async dashboard(workspaceId: string) {
    const [totals, recentSources, failures, awaiting] = await Promise.all([
      query(
        `SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE lifecycle_status = 'PROPOSED')::int AS proposed,
          count(*) FILTER (WHERE lifecycle_status = 'ACTIVE')::int AS active,
          jsonb_object_agg(type, type_count) AS by_type,
          jsonb_object_agg(verification, verification_count) AS by_verification
         FROM (
           SELECT *, count(*) OVER (PARTITION BY type) AS type_count,
             count(*) OVER (PARTITION BY verification) AS verification_count
           FROM knowledge_nodes WHERE workspace_id = $1
         ) nodes`,
        [workspaceId],
      ),
      query(
        `SELECT id, source_system, source_type, external_id, created_at
         FROM knowledge_sources WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 8`,
        [workspaceId],
      ),
      query(
        `SELECT e.id, e.source_id, e.error_code, e.error_message, e.completed_at,
          s.source_system, s.external_id
         FROM knowledge_extractions e
         JOIN knowledge_sources s ON s.workspace_id = e.workspace_id AND s.id = e.source_id
         WHERE e.workspace_id = $1 AND e.status = 'FAILED'
         ORDER BY e.completed_at DESC LIMIT 8`,
        [workspaceId],
      ),
      query(
        `SELECT id, type, title, origin, verification, created_at
         FROM knowledge_nodes WHERE workspace_id = $1 AND lifecycle_status = 'PROPOSED'
         ORDER BY created_at ASC LIMIT 8`,
        [workspaceId],
      ),
    ]);
    return {
      totals: totals.rows[0] ?? {
        total: 0,
        proposed: 0,
        active: 0,
        by_type: {},
        by_verification: {},
      },
      recent_sources: recentSources.rows,
      extraction_failures: failures.rows,
      awaiting_review: awaiting.rows,
    };
  }

  private async getEdge(workspaceId: string, edgeId: string, client?: PoolClient) {
    const sql = `SELECT * FROM knowledge_edges WHERE workspace_id = $1 AND id = $2`;
    const result = client
      ? await client.query(sql, [workspaceId, edgeId])
      : await query(sql, [workspaceId, edgeId]);
    if (!result.rowCount) throw notFound("Knowledge edge");
    return result.rows[0];
  }

  private async assertSourceLinks(
    client: PoolClient,
    workspaceId: string,
    links: Array<{ source_id: string; excerpt: string }>,
  ) {
    if (!links.length) return;
    const unique = [...new Set(links.map((link) => link.source_id))];
    const sources = await client.query<{ id: string; content: string }>(
      `SELECT id, content FROM knowledge_sources
       WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
      [workspaceId, unique],
    );
    if (sources.rowCount !== unique.length) {
      throw badRequest(
        "INVALID_PROVENANCE",
        "Every source link must reference an immutable source in the same workspace.",
      );
    }
    const contentById = new Map(sources.rows.map((source) => [source.id, source.content]));
    if (links.some((link) => !contentById.get(link.source_id)?.includes(link.excerpt))) {
      throw badRequest(
        "INVALID_PROVENANCE_EXCERPT",
        "Every supporting excerpt must occur verbatim in its immutable source.",
      );
    }
  }
}

export const nodeService = new NodeService();
