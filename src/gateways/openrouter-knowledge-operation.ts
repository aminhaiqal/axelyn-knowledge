import { CHALLENGE_NODE_TYPES, EXTEND_NODE_TYPES } from "@/src/domain/enums";
import type { KnowledgeSource } from "@/src/domain/models";
import {
  GeneratedOperationResultSchema,
  type KnowledgeOperationRequest,
} from "@/src/domain/schemas";
import { buildKnowledgeOperationMessages } from "@/src/gateways/knowledge-operation-prompt";
import type { KnowledgeOperationGateway } from "@/src/gateways/types";

const OPERATION_TIMEOUT_MS = 75_000;

function resultJsonSchema(operation: "CHALLENGE" | "EXTEND") {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "operation",
      "type",
      "title",
      "canonical_statement",
      "assessment",
      "confidence",
      "supporting_analysis",
      "opposing_analysis",
      "uncertainty",
      "evidence_gaps",
      "source_excerpt",
      "rationale",
    ],
    properties: {
      operation: { type: "string", enum: [operation] },
      type: {
        type: "string",
        enum: operation === "CHALLENGE" ? CHALLENGE_NODE_TYPES : EXTEND_NODE_TYPES,
      },
      title: { type: "string" },
      canonical_statement: { type: "string" },
      assessment: {
        type: "string",
        enum:
          operation === "CHALLENGE"
            ? ["SUPPORTED", "WEAKENED", "CONTRADICTED", "INCONCLUSIVE"]
            : ["EXTENDED"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      supporting_analysis: { type: "string" },
      opposing_analysis: { type: "string" },
      uncertainty: { type: "string" },
      evidence_gaps: { type: "array", maxItems: 10, items: { type: "string" } },
      source_excerpt: { type: "string" },
      rationale: { type: "string" },
    },
  } as const;
}

function safeProviderErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return null;
  const error = payload.error;
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  if (typeof error.message !== "string") return null;
  return error.message
    .replace(/\bsk-[a-z0-9_-]{12,}\b/gi, "[redacted provider key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

async function providerFailure(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => null);
  const detail = safeProviderErrorMessage(payload);
  return new Error(
    detail
      ? `Knowledge operation provider returned HTTP ${response.status}: ${detail}`
      : `Knowledge operation provider returned HTTP ${response.status}.`,
  );
}

export class OpenRouterKnowledgeOperationGateway implements KnowledgeOperationGateway {
  readonly name = "openrouter-operation-cascade";
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    private readonly models: readonly string[],
    private readonly baseUrl: string,
  ) {
    if (!models.length) throw new Error("At least one operation model is required.");
    this.model = models.join(" -> ");
  }

  async generate(source: KnowledgeSource, request: KnowledgeOperationRequest) {
    const failures: string[] = [];
    for (const [index, requestedModel] of this.models.entries()) {
      try {
        const primary = await this.generateWithModel(source, request, requestedModel);
        if (request.operation !== "CHALLENGE") return primary;

        for (const reviewerModel of this.models.slice(index + 1)) {
          try {
            const reviewed = await this.generateWithModel(
              source,
              request,
              reviewerModel,
              primary.output,
            );
            return {
              output: reviewed.output,
              model: `${primary.model} -> ${reviewed.model}`,
            };
          } catch (error) {
            failures.push(
              `${reviewerModel} adjudication: ${error instanceof Error ? error.message : "Unknown provider failure."}`,
            );
          }
        }
        return primary;
      } catch (error) {
        failures.push(
          `${requestedModel}: ${error instanceof Error ? error.message : "Unknown provider failure."}`,
        );
      }
    }
    throw new Error(`All knowledge operation models failed. ${failures.join(" | ")}`);
  }

  private async generateWithModel(
    source: KnowledgeSource,
    request: KnowledgeOperationRequest,
    requestedModel: string,
    candidate?: ReturnType<typeof GeneratedOperationResultSchema.parse>,
  ) {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://knowledge.axelyn.com",
          "X-OpenRouter-Title": "Axelyn Knowledge",
        },
        body: JSON.stringify({
          model: requestedModel,
          messages: buildKnowledgeOperationMessages(source, request, candidate),
          provider: { require_parameters: true, data_collection: "deny" },
          response_format: {
            type: "json_schema",
            json_schema: {
              name: `knowledge_${request.operation.toLowerCase()}`,
              strict: true,
              schema: resultJsonSchema(request.operation),
            },
          },
        }),
        signal: AbortSignal.timeout(OPERATION_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new Error(`Knowledge operation timed out after ${OPERATION_TIMEOUT_MS / 1_000}s.`);
      }
      throw error;
    }

    if (!response.ok) throw await providerFailure(response);
    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    };
    const raw = payload.choices?.[0]?.message?.content;
    const content = Array.isArray(raw) ? raw.map((part) => part.text ?? "").join("") : raw;
    if (!content) throw new Error("Knowledge operation provider returned no structured content.");
    const output = GeneratedOperationResultSchema.parse(JSON.parse(content));
    if (output.operation !== request.operation) {
      throw new Error("Knowledge operation provider crossed the requested operation boundary.");
    }
    if (!source.content.includes(output.source_excerpt)) {
      throw new Error("Knowledge operation cited an excerpt outside the grounding record.");
    }
    return { output, model: payload.model ?? requestedModel };
  }
}
