import { ExtractionOutputSchema } from "@/src/domain/schemas";
import type { KnowledgeSource } from "@/src/domain/models";
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
            enum: [
              "EPISODE",
              "SIGNAL",
              "OBSERVATION",
              "CLAIM",
              "CONCEPT",
              "ENTITY",
              "EXPERIENCE",
              "EVIDENCE",
              "CONSTRAINT",
              "COUNTERARGUMENT",
              "POSITION",
              "AUDIENCE_INSIGHT",
              "VOICE_PATTERN",
              "ARTIFACT",
            ],
          },
          title: { type: "string" },
          canonical_statement: { type: "string" },
          metadata: { type: "object", additionalProperties: true },
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

export class OpenRouterExtractionGateway implements KnowledgeExtractionGateway {
  readonly name = "openrouter-compatible";

  constructor(
    private readonly apiKey: string,
    public readonly model: string,
    private readonly baseUrl: string,
  ) {}

  async extract(source: KnowledgeSource) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: buildExtractionMessages(source),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "knowledge_extraction",
            strict: true,
            schema: EXTRACTION_JSON_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`Extraction provider returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    };
    const raw = payload.choices?.[0]?.message?.content;
    const content = Array.isArray(raw) ? raw.map((part) => part.text ?? "").join("") : raw;
    if (!content) throw new Error("Extraction provider returned no structured content.");
    return ExtractionOutputSchema.parse(JSON.parse(content));
  }
}
