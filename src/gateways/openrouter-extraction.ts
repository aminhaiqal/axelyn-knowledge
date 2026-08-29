import { ExtractionOutputSchema } from "@/src/domain/schemas";
import type { KnowledgeSource } from "@/src/domain/models";
import { validateGroundedExtraction } from "@/src/domain/extraction-quality";
import type { KnowledgeExtractionGateway } from "@/src/gateways/types";
import { buildExtractionMessages } from "@/src/gateways/extraction-prompt";

const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nodes", "edges", "audit_summary"],
  properties: {
    nodes: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "temp_id",
          "type",
          "title",
          "canonical_statement",
          "metadata",
          "confidence",
          "importance",
          "salience",
          "sensitivity",
          "source_excerpt",
          "suggested_duplicate_candidates",
          "potential_contradictions",
          "rationale",
        ],
        properties: {
          temp_id: { type: "string" },
          type: {
            type: "string",
            enum: ["CLAIM"],
          },
          title: { type: "string" },
          canonical_statement: { type: "string" },
          metadata: { type: "object", properties: {}, additionalProperties: false },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          importance: { type: "number", minimum: 0, maximum: 1 },
          salience: { type: "number", minimum: 0, maximum: 1 },
          sensitivity: {
            type: "string",
            enum: ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"],
          },
          source_excerpt: { type: "string" },
          suggested_duplicate_candidates: { type: "array", items: { type: "string" } },
          potential_contradictions: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
        },
      },
    },
    edges: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "source_temp_id",
          "target_temp_id",
          "type",
          "strength",
          "confidence",
          "source_excerpt",
          "rationale",
        ],
        properties: {
          source_temp_id: { type: "string" },
          target_temp_id: { type: "string" },
          type: {
            type: "string",
            enum: [
              "DERIVED_FROM",
              "SUPPORTS",
              "CONTRADICTS",
              "REFINES",
              "SUPERSEDES",
              "CAUSES",
              "APPLIES_TO",
              "EXAMPLE_OF",
              "ABOUT",
              "USED_IN",
              "EXPRESSED_IN",
              "RELATED_TO",
            ],
          },
          strength: { type: "number", minimum: 0, maximum: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          source_excerpt: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
    audit_summary: { type: "string" },
  },
} as const;

const EXTRACTION_TIMEOUT_MS = 75_000;

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
      ? `Extraction provider returned HTTP ${response.status}: ${detail}`
      : `Extraction provider returned HTTP ${response.status}.`,
  );
}

export class OpenRouterExtractionGateway implements KnowledgeExtractionGateway {
  readonly name = "openrouter-cascade";
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    private readonly models: readonly string[],
    private readonly baseUrl: string,
  ) {
    if (models.length === 0) throw new Error("At least one extraction model is required.");
    this.model = models.join(" -> ");
  }

  async extract(source: KnowledgeSource) {
    const failures: string[] = [];

    for (const [index, requestedModel] of this.models.entries()) {
      try {
        const result = await this.extractWithModel(source, requestedModel);
        validateGroundedExtraction(source, result.output, {
          requireProposal: index < this.models.length - 1,
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown provider failure.";
        failures.push(`${requestedModel}: ${message}`);
      }
    }

    throw new Error(`All extraction models failed. ${failures.join(" | ")}`);
  }

  private async extractWithModel(source: KnowledgeSource, requestedModel: string) {
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
          messages: buildExtractionMessages(source),
          provider: {
            require_parameters: true,
            data_collection: "deny",
          },
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "knowledge_extraction",
              strict: true,
              schema: EXTRACTION_JSON_SCHEMA,
            },
          },
        }),
        signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new Error(`Extraction provider timed out after ${EXTRACTION_TIMEOUT_MS / 1_000}s.`);
      }
      throw error;
    }

    if (!response.ok) {
      throw await providerFailure(response);
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    };
    const raw = payload.choices?.[0]?.message?.content;
    const content = Array.isArray(raw) ? raw.map((part) => part.text ?? "").join("") : raw;
    if (!content) throw new Error("Extraction provider returned no structured content.");
    return {
      output: ExtractionOutputSchema.parse(JSON.parse(content)),
      model: payload.model ?? requestedModel,
    };
  }
}
