import { describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSION } from "@/src/config";
import { validateEmbedding } from "@/src/gateways/openai-embeddings";

describe("embedding validation", () => {
  it("accepts exactly the configured finite dimension", () => {
    expect(validateEmbedding(Array(EMBEDDING_DIMENSION).fill(0))).toHaveLength(EMBEDDING_DIMENSION);
  });

  it("rejects the wrong dimension and non-finite values", () => {
    expect(() => validateEmbedding([1, 2])).toThrow(/exactly/);
    const invalid = Array(EMBEDDING_DIMENSION).fill(0);
    invalid[4] = Number.NaN;
    expect(() => validateEmbedding(invalid)).toThrow(/non-finite/);
  });
});
