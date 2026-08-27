import { query, withTransaction } from "@/src/db/pool";
import { mapNode, vectorLiteral } from "@/src/db/records";
import type { KnowledgeNode, ProvenanceReference, ScoreComponents } from "@/src/domain/models";
import {
  GRAPH_DEPTH_DECAY,
  GRAPH_FANOUT_LIMIT,
  REINFORCEMENT_DELTAS,
  SCORING_WEIGHTS,
  reciprocalRankFusion,
  recencyScore,
  scoreComponents,
  verificationConfidence,
} from "@/src/domain/scoring";
import { estimateTokens } from "@/src/domain/tokens";
import type { RetrievalInput } from "@/src/domain/schemas";
import type { UsageOutcome } from "@/src/domain/enums";
import { badRequest, notFound } from "@/src/domain/errors";
import { createEmbeddingGateway } from "@/src/gateways/factory";
import type { EmbeddingGateway } from "@/src/gateways/types";
import { logger } from "@/src/lib/logger";

interface SeedRow extends Record<string, unknown> {
  id: string;
  semantic_score?: number;
  lexical_score?: number;
}

interface GraphRow extends Record<string, unknown> {
  id: string;
  seed_node_id: string;
  activation: number;
  depth: number;
  path_node_ids: string[];
  path_edge_ids: string[];
  path_directions: string[];
  path_edge_types: string[] | string;
}

interface Candidate {
  node: KnowledgeNode;
  final_score: number;
  score_components: ScoreComponents;
  why_recalled: string;
  seed_node_id: string;
  graph_path: {
    node_ids: string[];
    edge_ids: string[];
    directions: string[];
    edge_types: string[];
    depth: number;
  };
  contradiction_ids: string[];
  provenance: ProvenanceReference[];
  estimated_tokens: number;
}

const round = (value: number) => Number(value.toFixed(8));

const CONTEXT_SECTION_NAMES = [
  "verified_supportable_knowledge",
  "user_supplied_observations",
  "unverified_generated_insights",
  "constraints_and_prohibited_claims",
  "contradictions_and_caveats",
  "prior_approved_positioning",
  "voice_patterns",
] as const;

const CONTEXT_WARNINGS = [
  "Trust labels are independent: editorial approval is not factual verification.",
  "Unverified and disputed items must remain attributed in downstream generation.",
] as const;

type ContextSectionName = (typeof CONTEXT_SECTION_NAMES)[number];

function emptyContextSections(): Record<ContextSectionName, Array<Record<string, unknown>>> {
  return Object.fromEntries(CONTEXT_SECTION_NAMES.map((name) => [name, []])) as unknown as Record<
    ContextSectionName,
    Array<Record<string, unknown>>
  >;
}

function parsePostgresArray(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (!value || value === "{}") return [];
  return value
    .slice(1, -1)
    .split(",")
    .map((entry) => entry.replace(/^"|"$/g, ""));
}

function lexicalTsQuery(value: string): string {
  const tokens =
    value
      .toLocaleLowerCase("en")
      .match(/[a-z0-9]+/g)
      ?.slice(0, 20) ?? [];
  return tokens.length
    ? [...new Set(tokens)].map((token) => `${token}:*`).join(" | ")
    : "__no_match__";
}

function maximumSensitivityRankSql(parameter: number) {
  return `(CASE sensitivity
    WHEN 'PUBLIC' THEN 0 WHEN 'INTERNAL' THEN 1
    WHEN 'CONFIDENTIAL' THEN 2 WHEN 'RESTRICTED' THEN 3 END) <= $${parameter}`;
}

function explainRecall(components: ScoreComponents, depth: number, pathTypes: string[]) {
  const reasons: string[] = [];
  if (components.semantic_relevance >= 0.5) reasons.push("semantic match");
  if (components.lexical_relevance >= 0.25) reasons.push("lexical match");
  if (depth > 0)
    reasons.push(
      `activated ${depth} hop${depth === 1 ? "" : "s"} through ${pathTypes.join(" → ")}`,
    );
  if (components.verification_confidence >= 0.75) reasons.push("strong trust support");
  return reasons.length ? reasons.join("; ") : "bounded seed or graph relevance";
}

function compactProvenance(reference: ProvenanceReference) {
  return {
    ref: `${reference.source_system}:${reference.external_id}:v${reference.source_version}`,
    source_id: reference.source_id,
    source_type: reference.source_type,
    excerpt:
      reference.excerpt.length > 240
        ? `${reference.excerpt.slice(0, 237).trimEnd()}…`
        : reference.excerpt,
  };
}

function contextSection(node: KnowledgeNode): ContextSectionName {
  if (node.type === "CONSTRAINT") return "constraints_and_prohibited_claims";
  if (node.type === "COUNTERARGUMENT" || node.verification === "DISPUTED")
    return "contradictions_and_caveats";
  if (node.type === "VOICE_PATTERN") return "voice_patterns";
  if (node.origin === "APPROVED_COPY" || node.type === "POSITION")
    return "prior_approved_positioning";
  if (node.origin === "USER_SIGNAL" || node.type === "OBSERVATION")
    return "user_supplied_observations";
  if (["HUMAN_CONFIRMED", "SOURCE_SUPPORTED"].includes(node.verification))
    return "verified_supportable_knowledge";
  return "unverified_generated_insights";
}

function contextEntry(candidate: Candidate) {
  return {
    node_id: candidate.node.id,
    type: candidate.node.type,
    statement: candidate.node.canonical_statement,
    trust: {
      origin: candidate.node.origin,
      verification: candidate.node.verification,
      lifecycle_status: candidate.node.lifecycle_status,
      confidence: candidate.node.confidence,
    },
    provenance: candidate.provenance.slice(0, 3).map(compactProvenance),
    caveat:
      candidate.node.verification === "UNVERIFIED"
        ? "Unverified: use as attributed context, not established fact."
        : candidate.node.verification === "DISPUTED"
          ? "Disputed: retain the disagreement and do not resolve it silently."
          : undefined,
  };
}

export class RetrievalService {
  constructor(
    private readonly embeddingGateway: EmbeddingGateway | null = createEmbeddingGateway(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async retrieve(input: RetrievalInput, actor: string) {
    let queryEmbedding: number[] | null = null;
    if (this.embeddingGateway) {
      try {
        queryEmbedding = await this.embeddingGateway.embed(input.query);
      } catch (error) {
        logger.warn("retrieval.embedding_fallback", {
          workspace_id: input.workspace_id,
          message: error instanceof Error ? error.message : "Unknown embedding failure",
        });
      }
    }

    const filters = [
      input.workspace_id,
      input.allowed_verification_levels,
      input.desired_node_types,
      ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"].indexOf(input.maximum_sensitivity),
    ];
    const semanticRows = queryEmbedding
      ? await query<SeedRow>(
          `SELECT *, GREATEST(0, 1 - (embedding <=> $5::vector))::float8 AS semantic_score
           FROM knowledge_nodes
           WHERE workspace_id = $1 AND lifecycle_status = 'ACTIVE'
             AND verification = ANY($2::knowledge_verification[])
             AND (cardinality($3::knowledge_node_type[]) = 0 OR type = ANY($3::knowledge_node_type[]))
             AND ${maximumSensitivityRankSql(4)}
             AND embedding IS NOT NULL
           ORDER BY embedding <=> $5::vector, id LIMIT 30`,
          [...filters, vectorLiteral(queryEmbedding)],
        )
      : { rows: [] as SeedRow[] };
    const lexicalRows = await query<SeedRow>(
      `SELECT *, ts_rank_cd(search_document, to_tsquery('english', $5))::float8 AS lexical_score
       FROM knowledge_nodes
       WHERE workspace_id = $1 AND lifecycle_status = 'ACTIVE'
         AND verification = ANY($2::knowledge_verification[])
         AND (cardinality($3::knowledge_node_type[]) = 0 OR type = ANY($3::knowledge_node_type[]))
         AND ${maximumSensitivityRankSql(4)}
         AND search_document @@ to_tsquery('english', $5)
       ORDER BY lexical_score DESC, id LIMIT 30`,
      [...filters, lexicalTsQuery(input.query)],
    );
    const pinnedRows = input.pinned_node_ids.length
      ? await query<SeedRow>(
          `SELECT * FROM knowledge_nodes
           WHERE workspace_id = $1 AND lifecycle_status = 'ACTIVE'
             AND id = ANY($5::uuid[])
             AND verification = ANY($2::knowledge_verification[])
             AND (cardinality($3::knowledge_node_type[]) = 0 OR type = ANY($3::knowledge_node_type[]))
             AND ${maximumSensitivityRankSql(4)}
           ORDER BY id`,
          [...filters, input.pinned_node_ids],
        )
      : { rows: [] as SeedRow[] };

    const fused = reciprocalRankFusion(
      [
        semanticRows.rows.map((row) => ({ id: row.id, score: Number(row.semantic_score) })),
        lexicalRows.rows.map((row) => ({ id: row.id, score: Number(row.lexical_score) })),
      ].filter((list) => list.length),
    );
    pinnedRows.rows.forEach((row) => fused.set(row.id, 1));
    const orderedSeeds = [...fused.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 20);

    const graphRows = orderedSeeds.length
      ? await query<GraphRow>(
          `WITH RECURSIVE seed AS (
            SELECT value.node_id, value.node_id AS seed_node_id, value.activation,
              ARRAY[value.node_id]::uuid[] AS path_node_ids,
              ARRAY[]::uuid[] AS path_edge_ids,
              ARRAY[]::text[] AS path_directions,
              ARRAY[]::knowledge_edge_type[] AS path_edge_types,
              0 AS depth
            FROM unnest($2::uuid[], $3::float8[]) AS value(node_id, activation)
          ), walk AS (
            SELECT * FROM seed
            UNION ALL
            SELECT adjacent.next_node_id, walk.seed_node_id,
              (walk.activation * adjacent.strength * adjacent.confidence * $5)::float8,
              walk.path_node_ids || adjacent.next_node_id,
              walk.path_edge_ids || adjacent.edge_id,
              walk.path_directions || adjacent.direction,
              walk.path_edge_types || adjacent.edge_type,
              walk.depth + 1
            FROM walk
            JOIN LATERAL (
              SELECT connected.*
              FROM (
                SELECT e.id AS edge_id, e.target_node_id AS next_node_id,
                  e.strength::float8, e.confidence::float8, 'OUT'::text AS direction,
                  e.type AS edge_type
                FROM knowledge_edges e
                WHERE e.workspace_id = $1 AND e.source_node_id = walk.node_id
                  AND e.lifecycle_status = 'ACTIVE'
                  AND (e.valid_from IS NULL OR e.valid_from <= now())
                  AND (e.valid_until IS NULL OR e.valid_until > now())
                UNION ALL
                SELECT e.id, e.source_node_id, e.strength::float8, e.confidence::float8,
                  'IN'::text, e.type
                FROM knowledge_edges e
                WHERE e.workspace_id = $1 AND e.target_node_id = walk.node_id
                  AND e.lifecycle_status = 'ACTIVE'
                  AND (e.valid_from IS NULL OR e.valid_from <= now())
                  AND (e.valid_until IS NULL OR e.valid_until > now())
              ) connected
              ORDER BY (connected.edge_type = 'CONTRADICTS') DESC,
                connected.strength * connected.confidence DESC,
                connected.edge_id, connected.direction
              LIMIT $9
            ) adjacent ON true
            WHERE walk.depth < $4
              AND NOT adjacent.next_node_id = ANY(walk.path_node_ids)
          )
          SELECT DISTINCT ON (walk.node_id) nodes.*, walk.seed_node_id,
            walk.activation, walk.depth, walk.path_node_ids, walk.path_edge_ids,
            walk.path_directions, walk.path_edge_types
          FROM walk
          JOIN knowledge_nodes nodes ON nodes.workspace_id = $1 AND nodes.id = walk.node_id
          WHERE nodes.lifecycle_status = 'ACTIVE'
            AND nodes.verification = ANY($6::knowledge_verification[])
            AND (cardinality($7::knowledge_node_type[]) = 0 OR nodes.type = ANY($7::knowledge_node_type[]))
            AND (CASE nodes.sensitivity WHEN 'PUBLIC' THEN 0 WHEN 'INTERNAL' THEN 1
              WHEN 'CONFIDENTIAL' THEN 2 WHEN 'RESTRICTED' THEN 3 END) <= $8
          ORDER BY walk.node_id, walk.activation DESC, walk.depth ASC, walk.seed_node_id`,
          [
            input.workspace_id,
            orderedSeeds.map(([id]) => id),
            orderedSeeds.map(([, activation]) => activation),
            input.maximum_graph_depth,
            GRAPH_DEPTH_DECAY,
            input.allowed_verification_levels,
            input.desired_node_types,
            filters[3],
            GRAPH_FANOUT_LIMIT,
          ],
        )
      : { rows: [] as GraphRow[] };

    const semanticScores = new Map(
      semanticRows.rows.map((row) => [row.id, Math.max(0, Number(row.semantic_score))]),
    );
    const maximumLexical = Math.max(0, ...lexicalRows.rows.map((row) => Number(row.lexical_score)));
    const lexicalScores = new Map(
      lexicalRows.rows.map((row) => [
        row.id,
        maximumLexical ? Number(row.lexical_score) / maximumLexical : 0,
      ]),
    );
    const now = this.clock();
    const candidates: Candidate[] = graphRows.rows.map((row) => {
      const node = mapNode(row);
      const components: ScoreComponents = {
        semantic_relevance: semanticScores.get(node.id) ?? 0,
        lexical_relevance: lexicalScores.get(node.id) ?? 0,
        graph_activation: Math.min(1, Math.max(0, Number(row.activation))),
        verification_confidence: verificationConfidence(node.verification, node.confidence),
        importance_salience: (node.importance + node.salience) / 2,
        recency_usefulness:
          recencyScore(new Date(node.updated_at), now) * 0.55 + node.usefulness_score * 0.45,
      };
      const pathEdgeTypes = parsePostgresArray(row.path_edge_types);
      const why = explainRecall(components, Number(row.depth), pathEdgeTypes);
      return {
        node,
        final_score: round(scoreComponents(components)),
        score_components: Object.fromEntries(
          Object.entries(components).map(([key, value]) => [key, round(value)]),
        ) as unknown as ScoreComponents,
        why_recalled: why,
        seed_node_id: row.seed_node_id,
        graph_path: {
          node_ids: row.path_node_ids ?? [node.id],
          edge_ids: row.path_edge_ids ?? [],
          directions: row.path_directions ?? [],
          edge_types: pathEdgeTypes,
          depth: Number(row.depth),
        },
        contradiction_ids: [],
        provenance: [],
        estimated_tokens: 0,
      };
    });
    const candidateById = new Map(candidates.map((candidate) => [candidate.node.id, candidate]));
    if (candidates.length) {
      const contradictions = await query<{ source_node_id: string; target_node_id: string }>(
        `SELECT source_node_id, target_node_id FROM knowledge_edges
         WHERE workspace_id = $1 AND type = 'CONTRADICTS' AND lifecycle_status = 'ACTIVE'
           AND (source_node_id = ANY($2::uuid[]) OR target_node_id = ANY($2::uuid[]))`,
        [input.workspace_id, candidates.map((candidate) => candidate.node.id)],
      );
      for (const edge of contradictions.rows) {
        const source = candidateById.get(edge.source_node_id);
        const target = candidateById.get(edge.target_node_id);
        if (source && target) {
          source.contradiction_ids.push(target.node.id);
          target.contradiction_ids.push(source.node.id);
        }
      }
      const provenance = await query<ProvenanceReference & { node_id: string }>(
        `SELECT ns.node_id, s.id AS source_id, s.source_system, s.source_type,
          s.external_id, s.source_version, ns.supporting_excerpt AS excerpt
         FROM knowledge_node_sources ns
         JOIN knowledge_sources s ON s.workspace_id = ns.workspace_id AND s.id = ns.source_id
         WHERE ns.workspace_id = $1 AND ns.node_id = ANY($2::uuid[])
         ORDER BY s.occurred_at DESC`,
        [input.workspace_id, candidates.map((candidate) => candidate.node.id)],
      );
      provenance.rows.forEach((reference) => {
        candidateById.get(reference.node_id)?.provenance.push(reference);
      });
    }
    candidates.forEach((candidate) => {
      candidate.estimated_tokens = estimateTokens(JSON.stringify(contextEntry(candidate)));
    });

    candidates.sort(
      (left, right) =>
        right.final_score - left.final_score || left.node.id.localeCompare(right.node.id),
    );
    const top = candidates[0];
    const forcedContradiction = top
      ? candidates.find((candidate) => top.contradiction_ids.includes(candidate.node.id))
      : undefined;
    const reviewOrder = top
      ? [
          top,
          ...(forcedContradiction ? [forcedContradiction] : []),
          ...candidates.filter((item) => item !== top && item !== forcedContradiction),
        ]
      : [];
    const selected: Candidate[] = [];
    const seedCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();
    const sections = emptyContextSections();
    const contextBase = {
      contract_version: "1.0",
      query: input.query,
      purpose: input.purpose,
      warnings: [...CONTEXT_WARNINGS],
      sections,
    };
    let usedTokens = estimateTokens(
      JSON.stringify({
        ...contextBase,
        retrieval_run_id: "00000000-0000-4000-8000-000000000000",
        estimated_tokens: input.token_budget,
        token_budget: input.token_budget,
      }),
    );
    if (usedTokens > input.token_budget) {
      throw badRequest(
        "CONTEXT_BUDGET_TOO_SMALL",
        "The token budget is too small for the working-memory envelope and request metadata.",
        { minimum_required: usedTokens },
      );
    }
    for (const candidate of reviewOrder) {
      if (selected.length >= input.result_limit) break;
      if (usedTokens + candidate.estimated_tokens > input.token_budget) continue;
      const isProtected =
        candidate === forcedContradiction ||
        candidate.node.type === "CONSTRAINT" ||
        candidate.node.type === "COUNTERARGUMENT";
      if (!isProtected && (seedCounts.get(candidate.seed_node_id) ?? 0) >= 3) continue;
      if (!isProtected && (typeCounts.get(candidate.node.type) ?? 0) >= 3) continue;
      selected.push(candidate);
      usedTokens += candidate.estimated_tokens;
      seedCounts.set(candidate.seed_node_id, (seedCounts.get(candidate.seed_node_id) ?? 0) + 1);
      typeCounts.set(candidate.node.type, (typeCounts.get(candidate.node.type) ?? 0) + 1);
    }

    selected.forEach((candidate) => {
      sections[contextSection(candidate.node)].push(contextEntry(candidate));
    });

    const contextPack = {
      ...contextBase,
      estimated_tokens: usedTokens,
      token_budget: input.token_budget,
    };
    const seedAudit = orderedSeeds.map(([id, fusedScore]) => ({
      node_id: id,
      fused_score: round(fusedScore),
      semantic_score: round(semanticScores.get(id) ?? 0),
      lexical_score: round(lexicalScores.get(id) ?? 0),
      pinned: input.pinned_node_ids.includes(id),
    }));
    const runId = await this.recordRun(
      input,
      actor,
      Boolean(queryEmbedding),
      seedAudit,
      contextPack,
      selected,
    );
    const responseItems = selected.map((candidate) => ({
      node_id: candidate.node.id,
      type: candidate.node.type,
      canonical_statement: candidate.node.canonical_statement,
      trust: {
        origin: candidate.node.origin,
        verification: candidate.node.verification,
        lifecycle_status: candidate.node.lifecycle_status,
        confidence: candidate.node.confidence,
      },
      sensitivity: candidate.node.sensitivity,
      final_score: candidate.final_score,
      score_components: candidate.score_components,
      why_recalled: candidate.why_recalled,
      supporting_provenance: candidate.provenance.map(compactProvenance),
      graph_path: candidate.graph_path,
      contradicting_nodes: candidate.contradiction_ids
        .map((id) => candidateById.get(id))
        .filter((item): item is Candidate => Boolean(item))
        .map((item) => ({
          node_id: item.node.id,
          canonical_statement: item.node.canonical_statement,
          verification: item.node.verification,
        })),
      estimated_tokens: candidate.estimated_tokens,
    }));
    return {
      retrieval_run_id: runId,
      embedding_available: Boolean(queryEmbedding),
      seed_results: seedAudit,
      items: responseItems,
      context_pack: { ...contextPack, retrieval_run_id: runId },
    };
  }

  async reportUsage(
    workspaceId: string,
    retrievalRunId: string,
    nodeIds: string[],
    outcome: Exclude<UsageOutcome, "SUPPLIED">,
    metadata: Record<string, unknown>,
    actor: string,
  ) {
    const uniqueIds = [...new Set(nodeIds)];
    return withTransaction(async (client) => {
      const run = await client.query(
        `SELECT id FROM retrieval_runs WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, retrievalRunId],
      );
      if (!run.rowCount) throw notFound("Retrieval run");
      const supplied = await client.query<{ node_id: string }>(
        `SELECT node_id FROM retrieval_run_items
         WHERE workspace_id = $1 AND retrieval_run_id = $2 AND node_id = ANY($3::uuid[])`,
        [workspaceId, retrievalRunId, uniqueIds],
      );
      if (supplied.rowCount !== uniqueIds.length) {
        throw badRequest(
          "UNSUPPLIED_USAGE",
          "Usage can only be reported for nodes supplied by this retrieval run.",
        );
      }
      const delta = REINFORCEMENT_DELTAS[outcome];
      for (const nodeId of uniqueIds) {
        await client.query(
          `INSERT INTO knowledge_usage (
            workspace_id, retrieval_run_id, node_id, outcome,
            reinforcement_delta, metadata, reported_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [workspaceId, retrievalRunId, nodeId, outcome, delta, metadata, actor],
        );
        await client.query(
          `UPDATE knowledge_nodes
           SET usefulness_score = LEAST(0.9, GREATEST(0.1, usefulness_score + $3))
           WHERE workspace_id = $1 AND id = $2`,
          [workspaceId, nodeId, delta],
        );
      }
      return { recorded: uniqueIds.length, reinforcement_delta: delta };
    });
  }

  private async recordRun(
    input: RetrievalInput,
    actor: string,
    embeddingAvailable: boolean,
    seeds: Array<Record<string, unknown>>,
    contextPack: Record<string, unknown>,
    items: Candidate[],
  ) {
    return withTransaction(async (client) => {
      const run = await client.query<{ id: string }>(
        `INSERT INTO retrieval_runs (
          workspace_id, query, purpose, requesting_system, audience, constraints,
          scoring_config, embedding_available, seed_results, context_pack,
          estimated_tokens, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          input.workspace_id,
          input.query,
          input.purpose,
          input.requesting_system,
          input.audience,
          {
            desired_node_types: input.desired_node_types,
            allowed_verification_levels: input.allowed_verification_levels,
            maximum_sensitivity: input.maximum_sensitivity,
            maximum_graph_depth: input.maximum_graph_depth,
            result_limit: input.result_limit,
            token_budget: input.token_budget,
            pinned_node_ids: input.pinned_node_ids,
          },
          {
            weights: SCORING_WEIGHTS,
            graph_depth_decay: GRAPH_DEPTH_DECAY,
            graph_fanout_limit: GRAPH_FANOUT_LIMIT,
          },
          embeddingAvailable,
          JSON.stringify(seeds),
          contextPack,
          contextPack.estimated_tokens,
          actor,
        ],
      );
      for (const [index, item] of items.entries()) {
        await client.query(
          `INSERT INTO retrieval_run_items (
            retrieval_run_id, workspace_id, node_id, rank, score, score_components,
            seed_node_id, path_node_ids, path_edge_ids, path_directions,
            path_edge_types, selected, estimated_tokens, why_recalled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $13)`,
          [
            run.rows[0].id,
            input.workspace_id,
            item.node.id,
            index + 1,
            item.final_score,
            item.score_components,
            item.seed_node_id,
            item.graph_path.node_ids,
            item.graph_path.edge_ids,
            item.graph_path.directions,
            item.graph_path.edge_types,
            item.estimated_tokens,
            item.why_recalled,
          ],
        );
        await client.query(
          `INSERT INTO knowledge_usage (
            workspace_id, retrieval_run_id, node_id, outcome,
            reinforcement_delta, metadata, reported_by
          ) VALUES ($1, $2, $3, 'SUPPLIED', 0, $4, $5)`,
          [
            input.workspace_id,
            run.rows[0].id,
            item.node.id,
            { path_edge_ids: item.graph_path.edge_ids },
            actor,
          ],
        );
      }
      return run.rows[0].id;
    });
  }
}

export const retrievalService = new RetrievalService();
