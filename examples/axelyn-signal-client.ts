export type SignalKnowledgeEvent =
  | "signal.captured"
  | "brief.generated"
  | "operator_evidence.supplied"
  | "draft.approved"
  | "draft.published"
  | "knowledge.corrected";

const sourceTypes = {
  "signal.captured": "signal",
  "brief.generated": "generated_insight",
  "operator_evidence.supplied": "operator_evidence",
  "draft.approved": "approved_revision",
  "draft.published": "published_artifact",
  "knowledge.corrected": "correction",
} as const;

export interface SignalKnowledgeSource {
  event: SignalKnowledgeEvent;
  workspaceId: string;
  externalId: string;
  sourceVersion: number;
  content: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
  verificationAssertion?: {
    level: "HUMAN_CONFIRMED" | "SOURCE_SUPPORTED";
    actor: string;
    reason: string;
  };
}

export interface ContextRequest {
  workspaceId: string;
  query: string;
  purpose: string;
  audience: string;
  maximumSensitivity?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  tokenBudget?: number;
}

export class AxelynKnowledgeClient {
  constructor(
    private readonly baseUrl: string,
    private readonly bearerToken: string,
  ) {}

  async ingest(source: SignalKnowledgeSource) {
    return this.request("/api/v1/sources", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: source.workspaceId,
        source_system: "axelyn-signal",
        source_type: sourceTypes[source.event],
        external_id: source.externalId,
        source_version: source.sourceVersion,
        content: source.content,
        metadata: { ...source.metadata, event: source.event },
        occurred_at: source.occurredAt,
        verification_assertion: source.verificationAssertion,
        auto_extract: true,
      }),
    });
  }

  async retrieveContext(input: ContextRequest) {
    return this.request("/api/v1/context/retrieve", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: input.workspaceId,
        query: input.query,
        purpose: input.purpose,
        requesting_system: "axelyn-signal",
        audience: input.audience,
        desired_node_types: [],
        allowed_verification_levels: [
          "UNVERIFIED",
          "HUMAN_CONFIRMED",
          "SOURCE_SUPPORTED",
          "DISPUTED",
        ],
        maximum_sensitivity: input.maximumSensitivity ?? "INTERNAL",
        maximum_graph_depth: 2,
        result_limit: 12,
        token_budget: input.tokenBudget ?? 1800,
        pinned_node_ids: [],
      }),
    });
  }

  private async request(path: string, init: RequestInit) {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const body = (await response.json()) as unknown;
    if (!response.ok) throw new Error(`Axelyn Knowledge returned HTTP ${response.status}.`);
    return body;
  }
}
