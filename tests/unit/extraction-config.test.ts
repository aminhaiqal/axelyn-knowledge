import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_EXTRACTION_MODELS, extractionProvider } from "@/src/config";

const originalEnvironment = {
  EXTRACTION_API_KEY: process.env.EXTRACTION_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  EXTRACTION_MODEL: process.env.EXTRACTION_MODEL,
  EXTRACTION_MODELS: process.env.EXTRACTION_MODELS,
  EXTRACTION_BASE_URL: process.env.EXTRACTION_BASE_URL,
};

function restore(name: keyof typeof originalEnvironment) {
  const value = originalEnvironment[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe.sequential("extraction provider configuration", () => {
  afterEach(() => {
    for (const name of Object.keys(originalEnvironment) as Array<
      keyof typeof originalEnvironment
    >) {
      restore(name);
    }
  });

  it("uses the cost-aware default cascade when only an OpenRouter key is configured", () => {
    delete process.env.EXTRACTION_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    delete process.env.EXTRACTION_MODEL;
    delete process.env.EXTRACTION_MODELS;

    expect(extractionProvider()).toMatchObject({
      apiKey: "test-openrouter-key",
      models: [...DEFAULT_EXTRACTION_MODELS],
      baseUrl: "https://openrouter.ai/api/v1",
    });
  });

  it("accepts an ordered comma-separated cascade without duplicate models", () => {
    process.env.EXTRACTION_API_KEY = "test-extraction-key";
    process.env.EXTRACTION_MODELS = " cheap/model, strong/model, cheap/model ";

    expect(extractionProvider()?.models).toEqual(["cheap/model", "strong/model"]);
  });

  it("preserves the legacy single-model setting", () => {
    process.env.EXTRACTION_API_KEY = "test-extraction-key";
    process.env.EXTRACTION_MODEL = "legacy/model";
    delete process.env.EXTRACTION_MODELS;

    expect(extractionProvider()?.models).toEqual(["legacy/model"]);
  });
});
