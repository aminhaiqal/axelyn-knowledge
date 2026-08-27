import { describe, expect, it } from "vitest";
import { query } from "@/src/db/pool";
import type { NodeCreateInput, RetrievalInput, SourceIngestionInput } from "@/src/domain/schemas";
import { NodeService } from "@/src/services/node-service";
import { RetrievalService } from "@/src/services/retrieval-service";
import { SourceService } from "@/src/services/source-service";
import {
  FailingEmbeddingGateway,
  FakeEmbeddingGateway,
  FakeExtractionGateway,
} from "@/tests/helpers/fakes";

const actor = "test:operator";
const sourceService = new SourceService(null, null);
const nodeService = new NodeService(null);

async function ingest(
  workspace: string,
  externalId: string,
  content: string,
  overrides: Partial<SourceIngestionInput> = {},
) {
  const input: SourceIngestionInput = {
    workspace_id: workspace,
    source_system: "integration-fixture",
    source_type: "external_source",
    external_id: externalId,
    source_version: 1,
    content,
    metadata: {},
    occurred_at: "2026-01-01T00:00:00.000Z",
    auto_extract: false,
    ...overrides,
  };
  return (await sourceService.ingest(input, actor)).source;
}

async function createNode(
  workspace: string,
  source: Awaited<ReturnType<typeof ingest>>,
  input: Partial<NodeCreateInput> & Pick<NodeCreateInput, "title" | "canonical_statement" | "type">,
  service = nodeService,
) {
  return service.create(
    {
      workspace_id: workspace,
      type: input.type,
      title: input.title,
      canonical_statement: input.canonical_statement,
      metadata: input.metadata ?? {},
      origin: input.origin ?? "EXTERNAL_SOURCE",
      verification: input.verification ?? "SOURCE_SUPPORTED",
      lifecycle_status: input.lifecycle_status ?? "ACTIVE",
      sensitivity: input.sensitivity ?? "INTERNAL",
      confidence: input.confidence ?? 0.9,
      importance: input.importance ?? 0.7,
      salience: input.salience ?? 0.7,
      source_links: [{ source_id: source.id, excerpt: source.content }],
    },
    actor,
  );
}

describe("source ingestion and extraction", () => {
  it("is idempotent, rejects conflicting replays, and keeps snapshots immutable", async () => {
    const first = await sourceService.ingest(
      {
        workspace_id: "axelyn",
        source_system: "axelyn-signal",
        source_type: "signal",
        external_id: "signal-1",
        source_version: 1,
        content: "Explainability matters in regulated systems.",
        metadata: {},
        occurred_at: "2026-01-01T00:00:00.000Z",
        auto_extract: false,
      },
      actor,
    );
    const replay = await sourceService.ingest(
      {
        workspace_id: "axelyn",
        source_system: "axelyn-signal",
        source_type: "signal",
        external_id: "signal-1",
        source_version: 1,
        content: "Explainability matters in regulated systems.",
        metadata: {},
        occurred_at: "2026-01-01T00:00:00.000Z",
        auto_extract: false,
      },
      actor,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.source.id).toBe(first.source.id);

    await expect(
      sourceService.ingest(
        {
          workspace_id: "axelyn",
          source_system: "axelyn-signal",
          source_type: "signal",
          external_id: "signal-1",
          source_version: 1,
          content: "Different content.",
          metadata: {},
          occurred_at: "2026-01-01T00:00:00.000Z",
          auto_extract: false,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      sourceService.ingest(
        {
          workspace_id: "axelyn",
          source_system: "axelyn-signal",
          source_type: "signal",
          external_id: "signal-1",
          source_version: 1,
          content: "Explainability matters in regulated systems.",
          metadata: { platform: "LINKEDIN" },
          occurred_at: "2026-01-01T00:00:00.000Z",
          auto_extract: false,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      query(`UPDATE knowledge_sources SET content = 'mutated' WHERE id = $1`, [first.source.id]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      query(`DELETE FROM knowledge_sources WHERE id = $1`, [first.source.id]),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("serializes concurrent replays of the same source identity", async () => {
    const payload: SourceIngestionInput = {
      workspace_id: "axelyn",
      source_system: "axelyn-signal",
      source_type: "signal",
      external_id: "concurrent-signal",
      source_version: 1,
      content: "One immutable concurrent payload.",
      metadata: {},
      occurred_at: "2026-01-01T00:00:00.000Z",
      auto_extract: false,
    };
    const results = await Promise.all([
      sourceService.ingest(payload, actor),
      sourceService.ingest(payload, actor),
    ]);
    expect(new Set(results.map((result) => result.source.id)).size).toBe(1);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
  });

  it("applies a valid extraction atomically and keeps approved copy unverified", async () => {
    const source = await ingest(
      "axelyn",
      "approved-proof",
      "Show the evidence path. Name uncertainty.",
      { source_type: "approved_revision" },
    );
    const extraction = new SourceService(
      new FakeExtractionGateway({
        nodes: [
          {
            temp_id: "position",
            type: "POSITION",
            title: "Show evidence paths",
            canonical_statement: "Explanations should show the evidence path.",
            metadata: {},
            confidence: 0.8,
            importance: 0.8,
            salience: 0.7,
            sensitivity: "PUBLIC",
            source_excerpt: "Show the evidence path.",
            suggested_duplicate_candidates: [],
            potential_contradictions: [],
            rationale: "Reusable position stated in the proof.",
          },
          {
            temp_id: "voice",
            type: "VOICE_PATTERN",
            title: "Name uncertainty",
            canonical_statement: "Name uncertainty directly.",
            metadata: {},
            confidence: 0.9,
            importance: 0.6,
            salience: 0.8,
            sensitivity: "PUBLIC",
            source_excerpt: "Name uncertainty.",
            suggested_duplicate_candidates: [],
            potential_contradictions: [],
            rationale: "Reusable voice instruction.",
          },
        ],
        edges: [
          {
            source_temp_id: "voice",
            target_temp_id: "position",
            type: "APPLIES_TO",
            strength: 0.8,
            confidence: 0.8,
            source_excerpt: "Name uncertainty.",
            rationale: "The voice pattern applies to the position.",
          },
        ],
        audit_summary: "Two atomic proposals.",
      }),
      null,
    );
    const result = await extraction.requestExtraction("axelyn", source.id, actor);
    expect(result.status).toBe("SUCCEEDED");
    const created = await query(
      `SELECT origin, verification, lifecycle_status FROM knowledge_nodes ORDER BY title`,
    );
    expect(created.rows).toHaveLength(3);
    expect(created.rows.every((row) => row.origin === "APPROVED_COPY")).toBe(true);
    expect(created.rows.every((row) => row.verification === "UNVERIFIED")).toBe(true);
    expect(created.rows.every((row) => row.lifecycle_status === "PROPOSED")).toBe(true);
    expect(
      (await query(`SELECT count(*)::int AS count FROM knowledge_nodes WHERE type = 'ARTIFACT'`))
        .rows[0].count,
    ).toBe(1);
    expect(
      (await query(`SELECT count(*)::int AS count FROM knowledge_node_sources`)).rows[0].count,
    ).toBe(3);
    expect(
      (await query(`SELECT count(*)::int AS count FROM knowledge_edge_sources`)).rows[0].count,
    ).toBe(3);
    expect(
      (
        await query(
          `SELECT count(*)::int AS count FROM knowledge_edges WHERE type = 'EXPRESSED_IN'`,
        )
      ).rows[0].count,
    ).toBe(2);
  });

  it("records a failed extraction without partially applying proposals", async () => {
    const source = await ingest("axelyn", "bad-excerpt", "Only this content exists.");
    const extraction = new SourceService(
      new FakeExtractionGateway({
        nodes: [
          {
            temp_id: "n1",
            type: "CLAIM",
            title: "Invented",
            canonical_statement: "An invented claim.",
            metadata: {},
            confidence: 0.5,
            importance: 0.5,
            salience: 0.5,
            sensitivity: "INTERNAL",
            source_excerpt: "This excerpt was never supplied.",
            suggested_duplicate_candidates: [],
            potential_contradictions: [],
            rationale: "Invalid fixture.",
          },
        ],
        edges: [],
        audit_summary: "Invalid.",
      }),
      null,
    );
    const result = await extraction.requestExtraction("axelyn", source.id, actor);
    expect(result.status).toBe("FAILED");
    expect((await query(`SELECT count(*)::int AS count FROM knowledge_nodes`)).rows[0].count).toBe(
      0,
    );
  });

  it("commits ingestion when extraction is unavailable and supports a later retry", async () => {
    const ingested = await sourceService.ingest(
      {
        workspace_id: "axelyn",
        source_system: "integration-fixture",
        source_type: "operator_evidence",
        external_id: "retryable-extraction",
        source_version: 1,
        content: "A retryable source states that evidence paths help reviewers.",
        metadata: {},
        occurred_at: "2026-01-01T00:00:00.000Z",
        auto_extract: true,
      },
      actor,
    );
    expect(ingested.source.id).toBeTruthy();
    expect(ingested.extraction?.status).toBe("FAILED");
    expect(ingested.extraction?.error_code).toBe("GATEWAY_UNAVAILABLE");

    const retryService = new SourceService(
      new FakeExtractionGateway({
        nodes: [
          {
            temp_id: "evidence",
            type: "EVIDENCE",
            title: "Evidence paths help reviewers",
            canonical_statement: "Evidence paths can help reviewers.",
            metadata: {},
            confidence: 0.8,
            importance: 0.7,
            salience: 0.7,
            sensitivity: "INTERNAL",
            source_excerpt: "evidence paths help reviewers",
            suggested_duplicate_candidates: [],
            potential_contradictions: [],
            rationale: "Reusable evidence from the immutable source.",
          },
        ],
        edges: [],
        audit_summary: "One retry proposal.",
      }),
      null,
    );
    const retried = await retryService.requestExtraction("axelyn", ingested.source.id, actor);
    expect(retried.status).toBe("SUCCEEDED");
    expect(retried.attempt).toBe(2);
  });

  it("rejects manual provenance excerpts that are not in the immutable source", async () => {
    const source = await ingest("axelyn", "invalid-manual-excerpt", "Only supplied evidence.");
    await expect(
      nodeService.create(
        {
          workspace_id: "axelyn",
          type: "EVIDENCE",
          title: "Invalid provenance",
          canonical_statement: "A claim with fabricated provenance.",
          metadata: {},
          origin: "EXTERNAL_SOURCE",
          verification: "SOURCE_SUPPORTED",
          lifecycle_status: "PROPOSED",
          sensitivity: "INTERNAL",
          confidence: 0.5,
          importance: 0.5,
          salience: 0.5,
          source_links: [{ source_id: source.id, excerpt: "Never supplied." }],
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PROVENANCE_EXCERPT" });
  });
});

describe("trust, revisions, isolation, and consolidation", () => {
  it("approval activates editorial usefulness without changing verification and records versions", async () => {
    const source = await ingest("axelyn", "approved-node", "A useful but unverified position.", {
      source_type: "approved_revision",
    });
    const node = await createNode("axelyn", source, {
      type: "POSITION",
      title: "Useful position",
      canonical_statement: "A useful but unverified position.",
      origin: "APPROVED_COPY",
      verification: "UNVERIFIED",
      lifecycle_status: "PROPOSED",
    });
    const approved = await nodeService.transition(
      "axelyn",
      node.id,
      "ACTIVE",
      actor,
      "Editorially approved",
    );
    expect(approved.verification).toBe("UNVERIFIED");
    expect(approved.lifecycle_status).toBe("ACTIVE");
    const corrected = await nodeService.patch(
      "axelyn",
      node.id,
      {
        expected_version: approved.current_version,
        canonical_statement: "A corrected but still unverified position.",
        change_reason: "Corrected wording",
      },
      actor,
    );
    expect(corrected.current_version).toBe(3);
    expect(
      (
        await query(
          `SELECT count(*)::int AS count FROM knowledge_node_versions WHERE node_id = $1`,
          [node.id],
        )
      ).rows[0].count,
    ).toBe(3);
  });

  it("archives connected active edges and records their revisions with the endpoint", async () => {
    const source = await ingest("axelyn", "edge-archive", "Two related atomic memories.");
    const first = await createNode("axelyn", source, {
      type: "CONCEPT",
      title: "First concept",
      canonical_statement: "The first concept is active.",
    });
    const second = await createNode("axelyn", source, {
      type: "CONCEPT",
      title: "Second concept",
      canonical_statement: "The second concept is active.",
    });
    const edge = await nodeService.createEdge(
      {
        workspace_id: "axelyn",
        source_node_id: first.id,
        target_node_id: second.id,
        type: "RELATED_TO",
        strength: 0.8,
        confidence: 0.8,
        lifecycle_status: "ACTIVE",
        provenance: {},
        source_links: [{ source_id: source.id, excerpt: source.content }],
      },
      actor,
    );
    await nodeService.transition("axelyn", first.id, "ARCHIVED", actor, "No longer active");
    const stored = await query<{ lifecycle_status: string; current_version: number }>(
      `SELECT lifecycle_status, current_version FROM knowledge_edges WHERE id = $1`,
      [edge.id],
    );
    expect(stored.rows[0].lifecycle_status).toBe("ARCHIVED");
    expect(Number(stored.rows[0].current_version)).toBe(2);
    expect(
      (
        await query(
          `SELECT count(*)::int AS count FROM knowledge_edge_versions WHERE edge_id = $1`,
          [edge.id],
        )
      ).rows[0].count,
    ).toBe(2);
  });

  it("does not allow SOURCE_SUPPORTED verification without linked evidence", async () => {
    const node = await nodeService.create(
      {
        workspace_id: "axelyn",
        type: "OBSERVATION",
        title: "Manual observation",
        canonical_statement: "An operator recorded an observation without source evidence.",
        metadata: {},
        origin: "OPERATOR",
        verification: "UNVERIFIED",
        lifecycle_status: "PROPOSED",
        sensitivity: "INTERNAL",
        confidence: 0.5,
        importance: 0.5,
        salience: 0.5,
        source_links: [],
      },
      actor,
    );
    await expect(
      nodeService.patch(
        "axelyn",
        node.id,
        {
          expected_version: node.current_version,
          verification: "SOURCE_SUPPORTED",
          change_reason: "Attempted unsupported verification",
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "SOURCE_REQUIRED_FOR_VERIFICATION" });
  });

  it("rejects cross-workspace reads and edges at service and database layers", async () => {
    const sourceA = await ingest("workspace-a", "source-a", "Workspace A evidence.");
    const sourceB = await ingest("workspace-b", "source-b", "Workspace B evidence.");
    const nodeA = await createNode("workspace-a", sourceA, {
      type: "EVIDENCE",
      title: "A",
      canonical_statement: "Workspace A evidence.",
    });
    const nodeB = await createNode("workspace-b", sourceB, {
      type: "EVIDENCE",
      title: "B",
      canonical_statement: "Workspace B evidence.",
    });
    await expect(nodeService.get("workspace-a", nodeB.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      nodeService.patch(
        "workspace-a",
        nodeB.id,
        {
          expected_version: nodeB.current_version,
          title: "Cross-workspace mutation",
          change_reason: "Must be rejected",
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      nodeService.createEdge(
        {
          workspace_id: "workspace-a",
          source_node_id: nodeA.id,
          target_node_id: nodeB.id,
          type: "RELATED_TO",
          strength: 0.5,
          confidence: 0.5,
          lifecycle_status: "ACTIVE",
          provenance: {},
          source_links: [{ source_id: sourceA.id, excerpt: sourceA.content }],
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_EDGE_ENDPOINTS" });
    await expect(
      query(
        `INSERT INTO knowledge_edges (
          workspace_id, source_node_id, target_node_id, type, created_by, updated_by
        ) VALUES ('workspace-a', $1, $2, 'RELATED_TO', $3, $3)`,
        [nodeA.id, nodeB.id, actor],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    const retrieval = await new RetrievalService(null).retrieve(
      {
        workspace_id: "workspace-a",
        query: "Workspace B evidence",
        purpose: "isolation test",
        requesting_system: "integration-test",
        audience: "test",
        desired_node_types: [],
        allowed_verification_levels: ["SOURCE_SUPPORTED"],
        maximum_sensitivity: "INTERNAL",
        maximum_graph_depth: 1,
        result_limit: 10,
        token_budget: 600,
        pinned_node_ids: [],
      },
      actor,
    );
    expect(retrieval.items.some((item) => item.node_id === nodeB.id)).toBe(false);
  });

  it("never merges explicitly contradictory claims", async () => {
    const source = await ingest("axelyn", "merge-source", "Claim one. Claim two.");
    const first = await createNode("axelyn", source, {
      type: "CLAIM",
      title: "First",
      canonical_statement: "Claim one.",
    });
    const second = await createNode("axelyn", source, {
      type: "CLAIM",
      title: "Second",
      canonical_statement: "Claim two.",
    });
    await nodeService.createEdge(
      {
        workspace_id: "axelyn",
        source_node_id: first.id,
        target_node_id: second.id,
        type: "CONTRADICTS",
        strength: 1,
        confidence: 1,
        lifecycle_status: "ACTIVE",
        provenance: {},
        source_links: [{ source_id: source.id, excerpt: source.content }],
      },
      actor,
    );
    await expect(
      nodeService.merge(
        "axelyn",
        first.id,
        second.id,
        first.current_version,
        second.current_version,
        actor,
        "They look similar",
      ),
    ).rejects.toMatchObject({ code: "CONTRADICTORY_MERGE" });
  });

  it("merges reviewed duplicates while retaining aliases, provenance, edges, and versions", async () => {
    const firstSource = await ingest("axelyn", "merge-first", "Evidence path wording one.");
    const secondSource = await ingest("axelyn", "merge-second", "Evidence path wording two.");
    const sourceNode = await createNode("axelyn", firstSource, {
      type: "CONCEPT",
      title: "Evidence path",
      canonical_statement: "An explanation should expose its evidence path.",
    });
    const targetNode = await createNode("axelyn", secondSource, {
      type: "CONCEPT",
      title: "Traceable evidence path",
      canonical_statement: "Explanations should expose their evidence paths.",
    });
    const related = await createNode("axelyn", secondSource, {
      type: "EVIDENCE",
      title: "Related evidence",
      canonical_statement: "A traceable path lets a reviewer inspect supporting evidence.",
    });
    const movedEdge = await nodeService.createEdge(
      {
        workspace_id: "axelyn",
        source_node_id: sourceNode.id,
        target_node_id: related.id,
        type: "RELATED_TO",
        strength: 0.8,
        confidence: 0.8,
        lifecycle_status: "ACTIVE",
        provenance: {},
        source_links: [{ source_id: firstSource.id, excerpt: firstSource.content }],
      },
      actor,
    );
    const merged = await nodeService.merge(
      "axelyn",
      sourceNode.id,
      targetNode.id,
      sourceNode.current_version,
      targetNode.current_version,
      actor,
      "Reviewed as duplicate phrasing",
    );
    expect(merged.current_version).toBe(2);
    expect(merged.aliases.some((alias) => alias.source_node_id === sourceNode.id)).toBe(true);
    expect(new Set(merged.provenance.map((reference) => reference.source_id)).size).toBe(2);
    const archived = await nodeService.get("axelyn", sourceNode.id);
    expect(archived.lifecycle_status).toBe("ARCHIVED");
    const edge = await query<{ source_node_id: string; current_version: number }>(
      `SELECT source_node_id, current_version FROM knowledge_edges WHERE id = $1`,
      [movedEdge.id],
    );
    expect(edge.rows[0].source_node_id).toBe(targetNode.id);
    expect(Number(edge.rows[0].current_version)).toBe(2);
    expect(
      (
        await query(
          `SELECT count(*)::int AS count FROM knowledge_edges
           WHERE workspace_id = 'axelyn' AND source_node_id = $1
             AND target_node_id = $2 AND type = 'SUPERSEDES'`,
          [targetNode.id, sourceNode.id],
        )
      ).rows[0].count,
    ).toBe(1);
  });
});

async function buildRetrievalFixture() {
  const signalSource = await ingest(
    "axelyn",
    "signal",
    "Regulated teams are asking for explainability they can show to reviewers.",
    { source_type: "signal" },
  );
  const observationSource = await ingest(
    "axelyn",
    "observation",
    "A user observed that evidence paths made regulated reviews easier to complete.",
    {
      source_type: "signal",
      verification_assertion: {
        level: "HUMAN_CONFIRMED",
        actor,
        reason: "The user confirmed this supplied observation.",
      },
    },
  );
  const positionSource = await ingest(
    "axelyn",
    "position",
    "Explainability in regulated systems should connect recommendations to evidence and accountable decisions.",
    { source_type: "approved_revision" },
  );
  const evidenceSource = await ingest(
    "axelyn",
    "evidence",
    "Traceable evidence helps reviewers reproduce automated decisions.",
    {
      verification_assertion: {
        level: "SOURCE_SUPPORTED",
        actor,
        reason: "Directly supported by the fixture source.",
      },
    },
  );
  const insightSource = await ingest(
    "axelyn",
    "insight",
    "Explainability may be organizational trust infrastructure.",
    { source_type: "generated_insight" },
  );
  const counterSource = await ingest(
    "axelyn",
    "counter",
    "Too much explanation can overwhelm regulated reviewers.",
  );
  const correctionSource = await ingest(
    "axelyn",
    "correction",
    "Explanation alone does not establish compliance or correctness.",
    { source_type: "correction" },
  );
  const restrictedSource = await ingest(
    "axelyn",
    "restricted",
    "Restricted explainability material for regulated systems.",
  );

  const signal = await createNode("axelyn", signalSource, {
    type: "SIGNAL",
    title: "Reviewable explainability signal",
    canonical_statement: signalSource.content,
    origin: "USER_SIGNAL",
    verification: "UNVERIFIED",
    importance: 0.8,
  });
  const observation = await createNode("axelyn", observationSource, {
    type: "OBSERVATION",
    title: "Evidence paths helped reviews",
    canonical_statement: observationSource.content,
    origin: "USER_SIGNAL",
    verification: "HUMAN_CONFIRMED",
    importance: 0.88,
  });
  const position = await createNode("axelyn", positionSource, {
    type: "POSITION",
    title: "Accountable decision chain",
    canonical_statement: positionSource.content,
    origin: "APPROVED_COPY",
    verification: "UNVERIFIED",
    importance: 0.9,
    salience: 0.9,
  });
  const evidence = await createNode("axelyn", evidenceSource, {
    type: "EVIDENCE",
    title: "Traceability supports reproduction",
    canonical_statement: evidenceSource.content,
    verification: "SOURCE_SUPPORTED",
    importance: 0.98,
    salience: 0.9,
  });
  const insight = await createNode("axelyn", insightSource, {
    type: "CLAIM",
    title: "Trust infrastructure",
    canonical_statement: insightSource.content,
    origin: "AI_DERIVED",
    verification: "UNVERIFIED",
    confidence: 0.55,
    importance: 0.6,
  });
  const counter = await createNode("axelyn", counterSource, {
    type: "COUNTERARGUMENT",
    title: "Explanation overload",
    canonical_statement: counterSource.content,
    verification: "SOURCE_SUPPORTED",
    importance: 0.92,
    salience: 0.95,
  });
  const correction = await createNode("axelyn", correctionSource, {
    type: "CONSTRAINT",
    title: "Explanation is not proof",
    canonical_statement: correctionSource.content,
    origin: "OPERATOR",
    verification: "HUMAN_CONFIRMED",
    importance: 1,
    salience: 1,
  });
  await createNode("axelyn", restrictedSource, {
    type: "EVIDENCE",
    title: "Restricted material",
    canonical_statement: restrictedSource.content,
    verification: "SOURCE_SUPPORTED",
    sensitivity: "RESTRICTED",
    importance: 1,
  });

  const edge = (
    from: { id: string },
    to: { id: string },
    type: "SUPPORTS" | "CONTRADICTS" | "RELATED_TO",
    source: Awaited<ReturnType<typeof ingest>>,
  ) =>
    nodeService.createEdge(
      {
        workspace_id: "axelyn",
        source_node_id: from.id,
        target_node_id: to.id,
        type,
        strength: 0.95,
        confidence: 0.95,
        lifecycle_status: "ACTIVE",
        provenance: {},
        source_links: [{ source_id: source.id, excerpt: source.content }],
      },
      actor,
    );
  await edge(evidence, position, "SUPPORTS", evidenceSource);
  await edge(signal, position, "RELATED_TO", signalSource);
  await edge(observation, position, "SUPPORTS", observationSource);
  await edge(counter, position, "CONTRADICTS", counterSource);
  await edge(insight, position, "RELATED_TO", insightSource);
  await edge(correction, insight, "CONTRADICTS", correctionSource);
  await edge(position, evidence, "RELATED_TO", positionSource);
  return { signal, observation, position, evidence, insight, counter, correction };
}

describe("bounded associative retrieval", () => {
  it("rejects a token budget that cannot hold the required context envelope", async () => {
    await expect(
      new RetrievalService(null).retrieve(
        {
          workspace_id: "axelyn",
          query: "explainability ".repeat(30),
          purpose: "budget boundary test",
          requesting_system: "integration-test",
          audience: "reviewers",
          desired_node_types: [],
          allowed_verification_levels: ["UNVERIFIED"],
          maximum_sensitivity: "INTERNAL",
          maximum_graph_depth: 0,
          result_limit: 5,
          token_budget: 64,
          pinned_node_ids: [],
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "CONTEXT_BUDGET_TOO_SMALL" });
  });

  it("uses pgvector and lexical seeds together when embeddings are available", async () => {
    const source = await ingest(
      "axelyn",
      "hybrid-seed",
      "Traceable semantic evidence supports regulated explainability.",
    );
    const embeddingNodes = new NodeService(new FakeEmbeddingGateway());
    const node = await createNode(
      "axelyn",
      source,
      {
        type: "EVIDENCE",
        title: "Hybrid seed",
        canonical_statement: source.content,
        verification: "SOURCE_SUPPORTED",
      },
      embeddingNodes,
    );
    const service = new RetrievalService(
      new FakeEmbeddingGateway(),
      () => new Date("2026-02-01T00:00:00.000Z"),
    );
    const result = await service.retrieve(
      {
        workspace_id: "axelyn",
        query: "semantic evidence",
        purpose: "hybrid retrieval test",
        requesting_system: "integration-test",
        audience: "reviewers",
        desired_node_types: [],
        allowed_verification_levels: ["SOURCE_SUPPORTED"],
        maximum_sensitivity: "INTERNAL",
        maximum_graph_depth: 0,
        result_limit: 5,
        token_budget: 600,
        pinned_node_ids: [],
      },
      actor,
    );
    expect(result.embedding_available).toBe(true);
    expect(result.items[0].node_id).toBe(node.id);
    expect(result.seed_results[0].semantic_score).toBeGreaterThan(0);
    expect(result.seed_results[0].lexical_score).toBeGreaterThan(0);
  });

  it("falls back without embeddings, preserves contradictions and trust, and obeys all bounds", async () => {
    await buildRetrievalFixture();
    const service = new RetrievalService(
      new FailingEmbeddingGateway(),
      () => new Date("2026-02-01T00:00:00.000Z"),
    );
    const input: RetrievalInput = {
      workspace_id: "axelyn",
      query: "explainability regulated systems evidence reviewers",
      purpose: "draft",
      requesting_system: "integration-test",
      audience: "regulated technology leaders",
      desired_node_types: [],
      allowed_verification_levels: [
        "UNVERIFIED",
        "HUMAN_CONFIRMED",
        "SOURCE_SUPPORTED",
        "DISPUTED",
      ],
      maximum_sensitivity: "INTERNAL",
      maximum_graph_depth: 2,
      result_limit: 10,
      token_budget: 1_800,
      pinned_node_ids: [],
    };
    const first = await service.retrieve(input, actor);
    const second = await service.retrieve(input, actor);
    expect(first.embedding_available).toBe(false);
    expect(first.context_pack.estimated_tokens).toBeLessThanOrEqual(1_800);
    expect(first.items.every((item) => item.graph_path.depth <= 2)).toBe(true);
    expect(
      first.items.every(
        (item) => new Set(item.graph_path.node_ids).size === item.graph_path.node_ids.length,
      ),
    ).toBe(true);
    expect(
      first.items.some(
        (item) => item.trust.origin === "AI_DERIVED" && item.trust.verification === "UNVERIFIED",
      ),
    ).toBe(true);
    expect(first.items.some((item) => item.contradicting_nodes.length > 0)).toBe(true);
    expect(first.items.every((item) => item.supporting_provenance.length > 0)).toBe(true);
    expect(first.items.some((item) => item.canonical_statement.includes("Restricted"))).toBe(false);
    expect(first.context_pack.sections.user_supplied_observations.length).toBeGreaterThan(0);
    expect(first.items.map((item) => [item.node_id, item.final_score])).toEqual(
      second.items.map((item) => [item.node_id, item.final_score]),
    );
    expect(
      first.items
        .slice(0, 3)
        .some((item) => ["SOURCE_SUPPORTED", "HUMAN_CONFIRMED"].includes(item.trust.verification)),
    ).toBe(true);
  });

  it("caps usefulness reinforcement without changing factual verification", async () => {
    await buildRetrievalFixture();
    const service = new RetrievalService(null, () => new Date("2026-02-01T00:00:00.000Z"));
    const result = await service.retrieve(
      {
        workspace_id: "axelyn",
        query: "explainability regulated systems",
        purpose: "draft",
        requesting_system: "integration-test",
        audience: "reviewers",
        desired_node_types: [],
        allowed_verification_levels: [
          "UNVERIFIED",
          "HUMAN_CONFIRMED",
          "SOURCE_SUPPORTED",
          "DISPUTED",
        ],
        maximum_sensitivity: "INTERNAL",
        maximum_graph_depth: 2,
        result_limit: 10,
        token_budget: 900,
        pinned_node_ids: [],
      },
      actor,
    );
    const item = result.items.find((candidate) => candidate.trust.verification === "UNVERIFIED")!;
    const before = await query<{ updated_at: Date; updated_by: string }>(
      `SELECT updated_at, updated_by FROM knowledge_nodes WHERE id = $1`,
      [item.node_id],
    );
    await query(`SELECT pg_sleep(0.02)`);
    for (let index = 0; index < 20; index += 1) {
      await service.reportUsage(
        "axelyn",
        result.retrieval_run_id,
        [item.node_id],
        "HELPED_APPROVAL",
        {},
        actor,
      );
    }
    const stored = await query<{
      usefulness_score: number;
      verification: string;
      updated_at: Date;
      updated_by: string;
    }>(
      `SELECT usefulness_score::float8, verification, updated_at, updated_by
       FROM knowledge_nodes WHERE id = $1`,
      [item.node_id],
    );
    expect(Number(stored.rows[0].usefulness_score)).toBe(0.9);
    expect(stored.rows[0].verification).toBe("UNVERIFIED");
    expect(new Date(stored.rows[0].updated_at).toISOString()).toBe(
      new Date(before.rows[0].updated_at).toISOString(),
    );
    expect(stored.rows[0].updated_by).toBe(before.rows[0].updated_by);
  });
});
