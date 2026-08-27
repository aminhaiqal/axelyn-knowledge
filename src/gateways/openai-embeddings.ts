import { EMBEDDING_DIMENSION } from "@/src/config";
import type { EmbeddingGateway } from "@/src/gateways/types";

export function validateEmbedding(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Embedding must contain exactly ${EMBEDDING_DIMENSION} dimensions.`);
  }
  if (!value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new Error("Embedding contains a non-finite value.");
  }
  return value;
}

export class OpenAICompatibleEmbeddingGateway implements EmbeddingGateway {
  readonly name = "openai-compatible";

  constructor(
    private readonly apiKey: string,
    public readonly model: string,
    private readonly baseUrl: string,
  ) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, input: text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Embedding provider returned HTTP ${response.status}.`);
    const payload = (await response.json()) as { data?: Array<{ embedding?: unknown }> };
    return validateEmbedding(payload.data?.[0]?.embedding);
  }
}
