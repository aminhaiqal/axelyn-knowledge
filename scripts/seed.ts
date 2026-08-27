import { query, closePool } from "@/src/db/pool";
import type { EdgeCreateInput, NodeCreateInput, SourceIngestionInput } from "@/src/domain/schemas";
import { NodeService } from "@/src/services/node-service";
import { SourceService } from "@/src/services/source-service";

const workspace = process.env.DEFAULT_WORKSPACE ?? "axelyn";
const actor = "seed:explainability-evaluation-v1";
const sources = new SourceService(null, null);
const nodes = new NodeService(null);

const fixtureSources = {
  signal: {
    source_type: "signal",
    external_id: "eval-signal-explainability",
    content:
      "Regulated technology teams are asking for explanations they can show to reviewers, not only model-accuracy scores.",
  },
  observation: {
    source_type: "operator_evidence",
    external_id: "eval-observation-reviewers",
    content:
      "In three internal design reviews, teams moved faster when each automated recommendation included its source and decision path.",
    verification_assertion: {
      level: "HUMAN_CONFIRMED",
      actor,
      reason: "Operator confirmed the observation against the internal review notes.",
    },
  },
  insight: {
    source_type: "generated_insight",
    external_id: "eval-ai-insight-trust",
    content:
      "A possible interpretation is that explainability functions as organizational trust infrastructure, not merely a model feature.",
  },
  evidence: {
    source_type: "external_source",
    external_id: "eval-evidence-auditability",
    content:
      "The supplied audit report states that traceable source evidence reduced the time needed to reproduce contested automated decisions.",
    verification_assertion: {
      level: "SOURCE_SUPPORTED",
      actor,
      reason: "The statement is directly supported by the supplied audit report snapshot.",
    },
  },
  counterargument: {
    source_type: "external_source",
    external_id: "eval-counterargument-complexity",
    content:
      "The review panel cautioned that more explanation can overwhelm decision-makers when it is not tailored to the decision and audience.",
    verification_assertion: {
      level: "SOURCE_SUPPORTED",
      actor,
      reason: "The caution appears explicitly in the supplied panel record.",
    },
  },
  approved: {
    source_type: "approved_revision",
    external_id: "eval-approved-linkedin-proof",
    content:
      "Explainability is not a wall of model telemetry. For regulated teams, it is a usable chain from recommendation to evidence to accountable decision. Show the path, name the uncertainty, and give the reviewer somewhere to intervene.",
  },
  correction: {
    source_type: "correction",
    external_id: "eval-correction-not-sufficient",
    content:
      "Correction: explainability can support trust, but explanation alone does not establish that a system is fair, compliant, or correct.",
    verification_assertion: {
      level: "HUMAN_CONFIRMED",
      actor,
      reason: "An operator approved this correction as a required product constraint.",
    },
  },
} as const;

async function ingestFixtureSource(key: keyof typeof fixtureSources) {
  const source = fixtureSources[key];
  const input = {
    workspace_id: workspace,
    source_system: "axelyn-evaluation",
    source_type: source.source_type,
    external_id: source.external_id,
    source_version: 1,
    content: source.content,
    metadata: { fixture: "explainability-v1", fixture_key: key },
    occurred_at: "2026-01-15T10:00:00.000Z",
    verification_assertion:
      "verification_assertion" in source ? source.verification_assertion : undefined,
    auto_extract: false,
  } satisfies SourceIngestionInput;
  return (await sources.ingest(input, actor)).source;
}

async function getOrCreateNode(
  seedKey: string,
  source: Awaited<ReturnType<typeof ingestFixtureSource>>,
  excerpt: string,
  input: Omit<NodeCreateInput, "workspace_id" | "metadata" | "source_links">,
) {
  const existing = await query(
    `SELECT * FROM knowledge_nodes WHERE workspace_id = $1 AND metadata->>'seed_key' = $2 LIMIT 1`,
    [workspace, seedKey],
  );
  if (existing.rowCount) return existing.rows[0] as { id: string; current_version: number };
  return nodes.create(
    {
      ...input,
      workspace_id: workspace,
      metadata: { fixture: "explainability-v1", seed_key: seedKey },
      source_links: [{ source_id: source.id, excerpt }],
    },
    actor,
  );
}

async function getOrCreateEdge(seedKey: string, input: EdgeCreateInput) {
  const existing = await query(
    `SELECT id FROM knowledge_edges WHERE workspace_id = $1 AND provenance->>'seed_key' = $2 LIMIT 1`,
    [workspace, seedKey],
  );
  if (existing.rowCount) return existing.rows[0];
  return nodes.createEdge(
    {
      ...input,
      provenance: { ...input.provenance, fixture: "explainability-v1", seed_key: seedKey },
    },
    actor,
  );
}

async function main() {
  const source = {
    signal: await ingestFixtureSource("signal"),
    observation: await ingestFixtureSource("observation"),
    insight: await ingestFixtureSource("insight"),
    evidence: await ingestFixtureSource("evidence"),
    counterargument: await ingestFixtureSource("counterargument"),
    approved: await ingestFixtureSource("approved"),
    correction: await ingestFixtureSource("correction"),
  };

  const node = {
    signal: await getOrCreateNode("signal", source.signal, source.signal.content, {
      type: "SIGNAL",
      title: "Reviewers need usable explanations",
      canonical_statement:
        "Regulated technology teams want explanations they can show to reviewers, not only accuracy scores.",
      origin: "USER_SIGNAL",
      verification: "UNVERIFIED",
      lifecycle_status: "ACTIVE",
      sensitivity: "INTERNAL",
      confidence: 0.8,
      importance: 0.8,
      salience: 0.75,
    }),
    observation: await getOrCreateNode(
      "observation",
      source.observation,
      source.observation.content,
      {
        type: "OBSERVATION",
        title: "Traceability accelerated design reviews",
        canonical_statement:
          "Teams moved faster in three internal design reviews when recommendations included their source and decision path.",
        origin: "OPERATOR",
        verification: "HUMAN_CONFIRMED",
        lifecycle_status: "ACTIVE",
        sensitivity: "INTERNAL",
        confidence: 0.9,
        importance: 0.75,
        salience: 0.7,
      },
    ),
    insight: await getOrCreateNode("insight", source.insight, source.insight.content, {
      type: "CLAIM",
      title: "Explainability as trust infrastructure",
      canonical_statement:
        "Explainability may function as organizational trust infrastructure rather than merely as a model feature.",
      origin: "AI_DERIVED",
      verification: "UNVERIFIED",
      lifecycle_status: "ACTIVE",
      sensitivity: "INTERNAL",
      confidence: 0.58,
      importance: 0.72,
      salience: 0.7,
    }),
    evidence: await getOrCreateNode("evidence", source.evidence, source.evidence.content, {
      type: "EVIDENCE",
      title: "Traceable evidence reduced reproduction time",
      canonical_statement:
        "A supplied audit report states that traceable source evidence reduced the time needed to reproduce contested automated decisions.",
      origin: "EXTERNAL_SOURCE",
      verification: "SOURCE_SUPPORTED",
      lifecycle_status: "ACTIVE",
      sensitivity: "INTERNAL",
      confidence: 0.96,
      importance: 0.86,
      salience: 0.77,
    }),
    counterargument: await getOrCreateNode(
      "counterargument",
      source.counterargument,
      source.counterargument.content,
      {
        type: "COUNTERARGUMENT",
        title: "Explanations can overwhelm reviewers",
        canonical_statement:
          "More explanation can overwhelm decision-makers when it is not tailored to the decision and audience.",
        origin: "EXTERNAL_SOURCE",
        verification: "SOURCE_SUPPORTED",
        lifecycle_status: "ACTIVE",
        sensitivity: "INTERNAL",
        confidence: 0.93,
        importance: 0.8,
        salience: 0.82,
      },
    ),
    position: await getOrCreateNode(
      "position",
      source.approved,
      "For regulated teams, it is a usable chain from recommendation to evidence to accountable decision.",
      {
        type: "POSITION",
        title: "Explainability is an accountable decision chain",
        canonical_statement:
          "For regulated teams, explainability should form a usable chain from recommendation to evidence to accountable decision.",
        origin: "APPROVED_COPY",
        verification: "UNVERIFIED",
        lifecycle_status: "ACTIVE",
        sensitivity: "PUBLIC",
        confidence: 0.8,
        importance: 0.9,
        salience: 0.9,
      },
    ),
    voice: await getOrCreateNode(
      "voice",
      source.approved,
      "Show the path, name the uncertainty, and give the reviewer somewhere to intervene.",
      {
        type: "VOICE_PATTERN",
        title: "Path, uncertainty, intervention",
        canonical_statement:
          "Explain a system by showing the path, naming uncertainty, and identifying where a reviewer can intervene.",
        origin: "APPROVED_COPY",
        verification: "UNVERIFIED",
        lifecycle_status: "ACTIVE",
        sensitivity: "PUBLIC",
        confidence: 0.9,
        importance: 0.75,
        salience: 0.85,
      },
    ),
    correction: await getOrCreateNode("correction", source.correction, source.correction.content, {
      type: "CONSTRAINT",
      title: "Explanation does not prove compliance",
      canonical_statement:
        "Explanation alone does not establish that an automated system is fair, compliant, or correct.",
      origin: "OPERATOR",
      verification: "HUMAN_CONFIRMED",
      lifecycle_status: "ACTIVE",
      sensitivity: "PUBLIC",
      confidence: 0.98,
      importance: 0.98,
      salience: 0.95,
    }),
  };

  const edge = async (
    seedKey: string,
    from: { id: string },
    to: { id: string },
    type: EdgeCreateInput["type"],
    supportingSource: (typeof source)[keyof typeof source],
    excerpt: string,
    strength = 0.85,
  ) =>
    getOrCreateEdge(seedKey, {
      workspace_id: workspace,
      source_node_id: from.id,
      target_node_id: to.id,
      type,
      strength,
      confidence: 0.9,
      lifecycle_status: "ACTIVE",
      provenance: {},
      source_links: [{ source_id: supportingSource.id, excerpt }],
    });

  await edge(
    "observation-supports-insight",
    node.observation,
    node.insight,
    "SUPPORTS",
    source.observation,
    source.observation.content,
  );
  await edge(
    "evidence-supports-insight",
    node.evidence,
    node.insight,
    "SUPPORTS",
    source.evidence,
    source.evidence.content,
    0.95,
  );
  await edge(
    "signal-about-position",
    node.signal,
    node.position,
    "ABOUT",
    source.signal,
    source.signal.content,
    0.72,
  );
  await edge(
    "position-refines-insight",
    node.position,
    node.insight,
    "REFINES",
    source.approved,
    "For regulated teams, it is a usable chain from recommendation to evidence to accountable decision.",
  );
  await edge(
    "voice-applies-position",
    node.voice,
    node.position,
    "APPLIES_TO",
    source.approved,
    "Show the path, name the uncertainty, and give the reviewer somewhere to intervene.",
  );
  await edge(
    "counterargument-contradicts-position",
    node.counterargument,
    node.position,
    "CONTRADICTS",
    source.counterargument,
    source.counterargument.content,
    0.92,
  );
  await edge(
    "correction-contradicts-insight",
    node.correction,
    node.insight,
    "CONTRADICTS",
    source.correction,
    source.correction.content,
    1,
  );

  console.info(`Seeded explainability evaluation graph in workspace ${workspace}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
