import type { PoolClient } from "pg";
import { isDeepStrictEqual } from "node:util";
import { withTransaction, query } from "@/src/db/pool";
import { mapSource, vectorLiteral } from "@/src/db/records";
import { conflict, notFound } from "@/src/domain/errors";
import type { Origin, Sensitivity, Verification } from "@/src/domain/enums";
import { validateGroundedExtraction } from "@/src/domain/extraction-quality";
import type { KnowledgeSource } from "@/src/domain/models";
import { sha256, statementHash } from "@/src/domain/normalize";
import type { ExtractionOutput, SourceIngestionInput } from "@/src/domain/schemas";
import { ExtractionOutputSchema } from "@/src/domain/schemas";
import { createEmbeddingGateway, createWorkspaceExtractionGateway } from "@/src/gateways/factory";
import type { EmbeddingGateway, KnowledgeExtractionGateway } from "@/src/gateways/types";
import { logger } from "@/src/lib/logger";

interface ExtractionRecord {
  id: string;
  workspace_id: string;
  source_id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  attempt: number;
  gateway: string | null;
  model: string | null;
  proposals: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  created_by: string;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
}

function serializeExtraction(row: ExtractionRecord) {
  return {
    ...row,
    attempt: Number(row.attempt),
    created_at: new Date(row.created_at).toISOString(),
    started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
    completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

function sourceTrust(source: KnowledgeSource): { origin: Origin; verification: Verification } {
  const origins: Record<string, Origin> = {
    signal: "USER_SIGNAL",
    generated_insight: "AI_DERIVED",
    operator_evidence: "OPERATOR",
    approved_revision: "APPROVED_COPY",
    published_artifact: "APPROVED_COPY",
    external_source: "EXTERNAL_SOURCE",
    correction: "OPERATOR",
  };
  return {
    origin: origins[source.source_type] ?? "AI_DERIVED",
    verification: source.verification_assertion?.level ?? "UNVERIFIED",
  };
}

function operatorIntakeSensitivity(source: KnowledgeSource): Sensitivity | null {
  const intake = source.metadata.operator_intake;
  if (!intake || typeof intake !== "object" || !("sensitivity" in intake)) return null;
  const value = String(intake.sensitivity);
  return new Set<Sensitivity>(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).has(
    value as Sensitivity,
  )
    ? (value as Sensitivity)
    : null;
}

export function applyOperatorIntakeSensitivity(
  source: KnowledgeSource,
  output: ExtractionOutput,
): ExtractionOutput {
  const sensitivity = operatorIntakeSensitivity(source);
  if (!sensitivity) return output;
  return ExtractionOutputSchema.parse({
    ...output,
    nodes: output.nodes.map((node) => ({ ...node, sensitivity })),
  });
}

export function applyAutomaticClaimPolicy(output: ExtractionOutput): ExtractionOutput {
  return ExtractionOutputSchema.parse({
    ...output,
    nodes: output.nodes.map((node) => ({ ...node, type: "CLAIM" })),
  });
}

export function ensureApprovedArtifact(
  source: KnowledgeSource,
  output: ExtractionOutput,
): ExtractionOutput {
  if (!["approved_revision", "published_artifact"].includes(source.source_type)) return output;

  const nodes = [...output.nodes];
  const edges = [...output.edges];
  let artifact = nodes.find((node) => node.type === "ARTIFACT");
  if (!artifact) {
    let tempId = "__approved_artifact";
    const usedIds = new Set(nodes.map((node) => node.temp_id));
    while (usedIds.has(tempId)) tempId = `${tempId}_anchor`;
    artifact = {
      temp_id: tempId,
      type: "ARTIFACT",
      title: `Approved artifact · ${source.external_id}`.slice(0, 240),
      canonical_statement: `Approved artifact ${source.source_system}:${source.external_id}:v${source.source_version}.`,
      metadata: {
        knowledge_role: "SOURCE_ARTIFACT_ANCHOR",
        source_system: source.source_system,
        source_type: source.source_type,
        external_id: source.external_id,
        source_version: source.source_version,
      },
      confidence: 1,
      importance: 0.5,
      salience: 0.5,
      sensitivity: "INTERNAL",
      source_excerpt: source.content.slice(0, 4_000),
      suggested_duplicate_candidates: [],
      potential_contradictions: [],
      rationale: "Deterministic artifact anchor for provenance and graph navigation.",
    };
    nodes.push(artifact);
  }

  for (const node of nodes) {
    if (node.temp_id === artifact.temp_id) continue;
    const alreadyConnected = edges.some(
      (edge) =>
        edge.source_temp_id === node.temp_id &&
        edge.target_temp_id === artifact.temp_id &&
        edge.type === "EXPRESSED_IN",
    );
    if (!alreadyConnected) {
      edges.push({
        source_temp_id: node.temp_id,
        target_temp_id: artifact.temp_id,
        type: "EXPRESSED_IN",
        strength: 1,
        confidence: node.confidence,
        source_excerpt: node.source_excerpt,
        rationale: "Connects reusable knowledge to the approved artifact that expressed it.",
      });
    }
  }

  return ExtractionOutputSchema.parse({
    nodes,
    edges,
    audit_summary: `${output.audit_summary} Approved-artifact anchoring was enforced.`.slice(
      0,
      2_000,
    ),
  });
}

async function insertNodeVersion(
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

async function insertEdgeVersion(
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

export class SourceService {
  constructor(
    private readonly extractionGateway: KnowledgeExtractionGateway | null | undefined = undefined,
    private readonly embeddingGateway: EmbeddingGateway | null = createEmbeddingGateway(),
  ) {}

  async ingest(input: SourceIngestionInput, actor: string) {
    const hash = sha256(input.content);
    const result = await withTransaction(async (client) => {
      const sourceIdentity = JSON.stringify([
        input.workspace_id,
        input.source_system,
        input.source_type,
        input.external_id,
        String(input.source_version),
      ]);
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [sourceIdentity]);
      await client.query(
        `INSERT INTO workspaces (id, name) VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [input.workspace_id, input.workspace_id],
      );
      const existing = await client.query(
        `SELECT * FROM knowledge_sources
         WHERE workspace_id = $1 AND source_system = $2 AND source_type = $3
           AND external_id = $4 AND source_version = $5`,
        [
          input.workspace_id,
          input.source_system,
          input.source_type,
          input.external_id,
          input.source_version,
        ],
      );
      if (existing.rowCount) {
        const source = mapSource(existing.rows[0]);
        const conflictingFields = [
          ...(source.content_hash !== hash ? ["content"] : []),
          ...(!isDeepStrictEqual(source.metadata, input.metadata) ? ["metadata"] : []),
          ...(new Date(source.occurred_at).getTime() !== new Date(input.occurred_at).getTime()
            ? ["occurred_at"]
            : []),
          ...(!isDeepStrictEqual(
            source.verification_assertion,
            input.verification_assertion ?? null,
          )
            ? ["verification_assertion"]
            : []),
        ];
        if (conflictingFields.length) {
          throw conflict(
            "IDEMPOTENCY_CONFLICT",
            "This source identity already exists with a different immutable snapshot.",
            {
              conflicting_fields: conflictingFields,
              existing_content_hash: source.content_hash,
              received_content_hash: hash,
            },
          );
        }
        return { source, replayed: true };
      }

      const inserted = await client.query(
        `INSERT INTO knowledge_sources (
          workspace_id, source_system, source_type, external_id, source_version,
          content, metadata, content_hash, occurred_at, verification_assertion, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          input.workspace_id,
          input.source_system,
          input.source_type,
          input.external_id,
          input.source_version,
          input.content,
          input.metadata,
          hash,
          input.occurred_at,
          input.verification_assertion ?? null,
          actor,
        ],
      );
      const source = mapSource(inserted.rows[0]);
      await client.query(
        `INSERT INTO outbox_events (
          workspace_id, event_type, aggregate_type, aggregate_id, payload
        ) VALUES ($1, 'knowledge.source.ingested', 'knowledge_source', $2, $3)`,
        [input.workspace_id, source.id, { source_id: source.id, source_type: source.source_type }],
      );
      return { source, replayed: false };
    });

    let extraction = null;
    if (!result.replayed && input.auto_extract) {
      extraction = await this.requestExtraction(input.workspace_id, result.source.id, actor);
    }
    logger.info("source.ingested", {
      workspace_id: input.workspace_id,
      source_id: result.source.id,
      replayed: result.replayed,
    });
    return { ...result, extraction };
  }

  async getSource(workspaceId: string, sourceId: string): Promise<KnowledgeSource> {
    const result = await query(
      `SELECT * FROM knowledge_sources WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, sourceId],
    );
    if (!result.rowCount) throw notFound("Source");
    return mapSource(result.rows[0]);
  }

  async getExtraction(workspaceId: string, extractionId: string) {
    const result = await query<ExtractionRecord>(
      `SELECT * FROM knowledge_extractions WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, extractionId],
    );
    if (!result.rowCount) throw notFound("Extraction");
    return serializeExtraction(result.rows[0]);
  }

  async requestExtraction(workspaceId: string, sourceId: string, actor: string) {
    const source = await this.getSource(workspaceId, sourceId);
    const extractionGateway =
      this.extractionGateway === undefined
        ? await createWorkspaceExtractionGateway(workspaceId)
        : this.extractionGateway;
    const extraction = await withTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [sourceId]);
      const inserted = await client.query<ExtractionRecord>(
        `INSERT INTO knowledge_extractions (
          workspace_id, source_id, attempt, gateway, model, created_by
        )
        SELECT $1, $2, COALESCE(MAX(attempt), 0) + 1, $3, $4, $5
        FROM knowledge_extractions WHERE source_id = $2
        RETURNING *`,
        [
          workspaceId,
          sourceId,
          extractionGateway?.name ?? null,
          extractionGateway?.model ?? null,
          actor,
        ],
      );
      return inserted.rows[0];
    });

    if (!extractionGateway) {
      return this.failExtraction(
        extraction.id,
        "GATEWAY_UNAVAILABLE",
        "Extraction is not configured.",
      );
    }

    await query(
      `UPDATE knowledge_extractions SET status = 'RUNNING', started_at = now() WHERE id = $1`,
      [extraction.id],
    );

    try {
      const extracted = await extractionGateway.extract(source);
      const proposals = applyAutomaticClaimPolicy(
        applyOperatorIntakeSensitivity(
          source,
          ensureApprovedArtifact(source, ExtractionOutputSchema.parse(extracted.output)),
        ),
      );
      validateGroundedExtraction(source, proposals);
      await query(`UPDATE knowledge_extractions SET gateway = $2, model = $3 WHERE id = $1`, [
        extraction.id,
        extractionGateway.name,
        extracted.model,
      ]);
      const embeddings = await this.embedProposals(proposals);
      const created = await this.persistProposals(
        source,
        extraction.id,
        proposals,
        embeddings,
        actor,
      );
      logger.info("extraction.succeeded", {
        workspace_id: workspaceId,
        source_id: sourceId,
        extraction_id: extraction.id,
        model: extracted.model,
        nodes: created.nodes.length,
        edges: created.edges.length,
      });
      return this.getExtraction(workspaceId, extraction.id);
    } catch (error) {
      logger.warn("extraction.failed", {
        workspace_id: workspaceId,
        source_id: sourceId,
        extraction_id: extraction.id,
        message: error instanceof Error ? error.message : "Unknown extraction failure",
      });
      return this.failExtraction(
        extraction.id,
        "EXTRACTION_FAILED",
        error instanceof Error ? error.message.slice(0, 1_000) : "Unknown extraction failure.",
      );
    }
  }

  private async embedProposals(proposals: ExtractionOutput): Promise<Array<number[] | null>> {
    if (!this.embeddingGateway) return proposals.nodes.map(() => null);
    return Promise.all(
      proposals.nodes.map(async (node) => {
        try {
          return await this.embeddingGateway!.embed(node.canonical_statement);
        } catch (error) {
          logger.warn("embedding.failed", {
            message: error instanceof Error ? error.message : "Unknown embedding failure",
          });
          return null;
        }
      }),
    );
  }

  private async persistProposals(
    source: KnowledgeSource,
    extractionId: string,
    proposals: ExtractionOutput,
    embeddings: Array<number[] | null>,
    actor: string,
  ) {
    const { origin, verification } = sourceTrust(source);
    return withTransaction(async (client) => {
      const state = await client.query(
        `SELECT status FROM knowledge_extractions WHERE id = $1 FOR UPDATE`,
        [extractionId],
      );
      if (state.rows[0]?.status !== "RUNNING") throw new Error("Extraction is no longer running.");

      const knownIds = new Set<string>();
      const suggestedIds = proposals.nodes.flatMap((node) => [
        ...node.suggested_duplicate_candidates,
        ...node.potential_contradictions,
      ]);
      if (suggestedIds.length) {
        const known = await client.query<{ id: string }>(
          `SELECT id FROM knowledge_nodes WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
          [source.workspace_id, suggestedIds],
        );
        known.rows.forEach((row) => knownIds.add(row.id));
      }

      const nodeIds = new Map<string, string>();
      const createdNodes: string[] = [];
      for (const [index, proposal] of proposals.nodes.entries()) {
        const hash = statementHash(proposal.canonical_statement);
        const exact = await client.query<{ id: string }>(
          `SELECT id FROM knowledge_nodes
           WHERE workspace_id = $1 AND statement_hash = $2 AND lifecycle_status <> 'ARCHIVED'
           LIMIT 10`,
          [source.workspace_id, hash],
        );
        let semantic: Array<{ id: string; similarity: number }> = [];
        const embedding = embeddings[index];
        if (embedding) {
          const candidates = await client.query<{ id: string; similarity: number }>(
            `SELECT id, (1 - (embedding <=> $2::vector))::float8 AS similarity
             FROM knowledge_nodes
             WHERE workspace_id = $1 AND embedding IS NOT NULL
               AND lifecycle_status <> 'ARCHIVED'
               AND 1 - (embedding <=> $2::vector) >= 0.88
             ORDER BY embedding <=> $2::vector LIMIT 5`,
            [source.workspace_id, vectorLiteral(embedding)],
          );
          semantic = candidates.rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
        }
        const duplicateCandidates = [
          ...new Set([
            ...exact.rows.map((row) => row.id),
            ...semantic.map((row) => row.id),
            ...proposal.suggested_duplicate_candidates.filter((id) => knownIds.has(id)),
          ]),
        ];
        const metadata = {
          ...proposal.metadata,
          extraction: {
            extraction_id: extractionId,
            rationale: proposal.rationale,
            duplicate_candidates: duplicateCandidates,
            semantic_duplicate_scores: semantic,
            potential_contradictions: proposal.potential_contradictions.filter((id) =>
              knownIds.has(id),
            ),
          },
        };
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO knowledge_nodes (
            workspace_id, type, title, canonical_statement, statement_hash, metadata,
            origin, verification, lifecycle_status, sensitivity, confidence, importance,
            salience, embedding, created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, $10, $11,
            $12, $13::vector, $14, $14)
          RETURNING id`,
          [
            source.workspace_id,
            proposal.type,
            proposal.title,
            proposal.canonical_statement,
            hash,
            metadata,
            origin,
            verification,
            proposal.sensitivity,
            proposal.confidence,
            proposal.importance,
            proposal.salience,
            embedding ? vectorLiteral(embedding) : null,
            actor,
          ],
        );
        const id = inserted.rows[0].id;
        nodeIds.set(proposal.temp_id, id);
        createdNodes.push(id);
        await client.query(
          `INSERT INTO knowledge_node_sources (
            workspace_id, node_id, source_id, supporting_excerpt
          ) VALUES ($1, $2, $3, $4)`,
          [source.workspace_id, id, source.id, proposal.source_excerpt],
        );
        await insertNodeVersion(
          client,
          source.workspace_id,
          id,
          actor,
          "Automatically activated from immutable source as CLAIM",
        );
      }

      const createdEdges: string[] = [];
      for (const proposal of proposals.edges) {
        const sourceNodeId = nodeIds.get(proposal.source_temp_id);
        const targetNodeId = nodeIds.get(proposal.target_temp_id);
        if (!sourceNodeId || !targetNodeId) throw new Error("Extraction edge endpoint is missing.");
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO knowledge_edges (
            workspace_id, source_node_id, target_node_id, type, strength, confidence,
            lifecycle_status, provenance, created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8, $8)
          RETURNING id`,
          [
            source.workspace_id,
            sourceNodeId,
            targetNodeId,
            proposal.type,
            proposal.strength,
            proposal.confidence,
            { extraction_id: extractionId, rationale: proposal.rationale },
            actor,
          ],
        );
        const edgeId = inserted.rows[0].id;
        createdEdges.push(edgeId);
        await client.query(
          `INSERT INTO knowledge_edge_sources (
            workspace_id, edge_id, source_id, supporting_excerpt
          ) VALUES ($1, $2, $3, $4)`,
          [source.workspace_id, edgeId, source.id, proposal.source_excerpt],
        );
        await insertEdgeVersion(
          client,
          source.workspace_id,
          edgeId,
          actor,
          "Automatically activated with extracted claims",
        );
      }

      const applied = {
        audit_summary: proposals.audit_summary,
        created_node_ids: createdNodes,
        created_edge_ids: createdEdges,
      };
      await client.query(
        `UPDATE knowledge_extractions
         SET status = 'SUCCEEDED', proposals = $2, completed_at = now()
         WHERE id = $1`,
        [extractionId, applied],
      );
      await client.query(
        `INSERT INTO outbox_events (
          workspace_id, event_type, aggregate_type, aggregate_id, payload
        ) VALUES ($1, 'knowledge.extraction.succeeded', 'knowledge_extraction', $2, $3)`,
        [source.workspace_id, extractionId, applied],
      );
      return { nodes: createdNodes, edges: createdEdges };
    });
  }

  private async failExtraction(id: string, code: string, message: string) {
    const result = await query<ExtractionRecord>(
      `UPDATE knowledge_extractions
       SET status = 'FAILED', error_code = $2, error_message = $3, completed_at = now()
       WHERE id = $1 RETURNING *`,
      [id, code, message],
    );
    return serializeExtraction(result.rows[0]);
  }
}

export const sourceService = new SourceService();
