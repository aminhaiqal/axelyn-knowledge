import { afterEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeSource } from "@/src/domain/models";
import { OpenRouterExtractionGateway } from "@/src/gateways/openrouter-extraction";

const source: KnowledgeSource = {
  id: "00000000-0000-4000-8000-000000000001",
  workspace_id: "axelyn",
  source_system: "unit-test",
  source_type: "operator_evidence",
  external_id: "cascade-test",
  source_version: 1,
  content: "Exact evidence from the immutable source.",
  metadata: {},
  content_hash: "a".repeat(64),
  occurred_at: "2026-01-01T00:00:00.000Z",
  verification_assertion: null,
  created_by: "tester",
  created_at: "2026-01-01T00:00:00.000Z",
};

function providerResponse(model: string, sourceExcerpt: string) {
  return new Response(
    JSON.stringify({
      model,
      choices: [
        {
          message: {
            content: JSON.stringify({
              nodes: [
                {
                  temp_id: "evidence",
                  type: "EVIDENCE",
                  title: "Immutable evidence",
                  canonical_statement: "The immutable source contains exact evidence.",
                  metadata: {},
                  confidence: 0.9,
                  importance: 0.7,
                  salience: 0.8,
                  sensitivity: "INTERNAL",
                  source_excerpt: sourceExcerpt,
                  suggested_duplicate_candidates: [],
                  potential_contradictions: [],
                  rationale: "The statement is directly grounded in the source.",
                },
              ],
              edges: [],
              audit_summary: "One grounded proposal.",
            }),
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("OpenRouter extraction cascade", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("escalates invalid provenance to the next model and reports the model used", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse("cheap/model", "Invented excerpt."))
      .mockResolvedValueOnce(
        providerResponse("strong/model", "Exact evidence from the immutable source."),
      );
    vi.stubGlobal("fetch", fetchMock);

    const gateway = new OpenRouterExtractionGateway(
      "secret",
      ["cheap/model", "strong/model", "premium/model"],
      "https://openrouter.ai/api/v1",
    );
    const result = await gateway.extract(source);

    expect(result.model).toBe("strong/model");
    expect(result.output.nodes).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstRequest.model).toBe("cheap/model");
    expect(secondRequest.model).toBe("strong/model");
    expect(firstRequest.provider).toEqual({
      require_parameters: true,
      data_collection: "deny",
    });
    expect(firstRequest.response_format.type).toBe("json_schema");
    expect(firstRequest).not.toHaveProperty("temperature");
  });

  it("uses a later model when the primary provider request fails", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        providerResponse("fallback/model", "Exact evidence from the immutable source."),
      );
    vi.stubGlobal("fetch", fetchMock);

    const gateway = new OpenRouterExtractionGateway(
      "secret",
      ["offline/model", "fallback/model"],
      "https://openrouter.ai/api/v1",
    );

    await expect(gateway.extract(source)).resolves.toMatchObject({ model: "fallback/model" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
