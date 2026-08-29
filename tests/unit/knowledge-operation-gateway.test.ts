import { afterEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeSource } from "@/src/domain/models";
import { OpenRouterKnowledgeOperationGateway } from "@/src/gateways/openrouter-knowledge-operation";

const targetStatement = "Traceable decisions help reviewers reproduce outcomes.";
const source: KnowledgeSource = {
  id: "00000000-0000-4000-8000-000000000001",
  workspace_id: "axelyn",
  source_system: "unit-test",
  source_type: "operation_request",
  external_id: "challenge-test",
  source_version: 1,
  content: `TARGET KNOWLEDGE\nSTATEMENT:\n${targetStatement}`,
  metadata: {},
  content_hash: "a".repeat(64),
  occurred_at: "2026-01-01T00:00:00.000Z",
  verification_assertion: null,
  created_by: "tester",
  created_at: "2026-01-01T00:00:00.000Z",
};

function providerResponse(model: string, excerpt = targetStatement) {
  return Response.json({
    model,
    choices: [
      {
        message: {
          content: JSON.stringify({
            operation: "CHALLENGE",
            type: "CLAIM",
            title: "Traceability claim remains plausible",
            canonical_statement:
              "The supplied record supports traceability as useful, but does not establish a general causal effect.",
            assessment: "INCONCLUSIVE",
            confidence: 0.62,
            supporting_analysis: "The target describes a concrete review benefit.",
            opposing_analysis: "No comparison or broader outcome data is supplied.",
            uncertainty: "The scope and causal contribution remain uncertain.",
            evidence_gaps: ["A controlled or longitudinal comparison"],
            source_excerpt: excerpt,
            rationale: "The bounded record supports a cautious judgment.",
          }),
        },
      },
    ],
  });
}

describe("OpenRouter knowledge operation gateway", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses strict operation-specific output and reports the successful fallback", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse("routine/model", "Invented excerpt"))
      .mockResolvedValueOnce(providerResponse("fallback/model"));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new OpenRouterKnowledgeOperationGateway(
      "secret",
      ["routine/model", "fallback/model"],
      "https://openrouter.ai/api/v1",
    );

    await expect(
      gateway.generate(source, {
        workspace_id: "axelyn",
        target_node_id: "00000000-0000-4000-8000-000000000002",
        operation: "CHALLENGE",
        instruction: "Test this claim fairly.",
        maximum_sensitivity: "INTERNAL",
      }),
    ).resolves.toMatchObject({ model: "fallback/model", output: { operation: "CHALLENGE" } });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.provider).toEqual({ require_parameters: true, data_collection: "deny" });
    expect(request.response_format.json_schema.strict).toBe(true);
    expect(request.response_format.json_schema.schema.properties.type.enum).toEqual([
      "CLAIM",
      "EVIDENCE",
      "HYPOTHESIS",
    ]);
    expect(request.messages[0].content).toContain("support and opposition separately");
  });

  it("uses the next model to adjudicate a valid CHALLENGE judgment", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse("routine/model"))
      .mockResolvedValueOnce(providerResponse("review/model"));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new OpenRouterKnowledgeOperationGateway(
      "secret",
      ["routine/model", "review/model"],
      "https://openrouter.ai/api/v1",
    );

    const result = await gateway.generate(source, {
      workspace_id: "axelyn",
      target_node_id: "00000000-0000-4000-8000-000000000002",
      operation: "CHALLENGE",
      instruction: "Test this claim fairly.",
      maximum_sensitivity: "INTERNAL",
    });

    expect(result.model).toBe("routine/model -> review/model");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const reviewRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(reviewRequest.messages[0].content).toContain("final adjudicator");
    expect(reviewRequest.messages[1].content).toContain("CANDIDATE_JUDGMENT_START");
  });
});
