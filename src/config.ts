import { z } from "zod";

export const EMBEDDING_DIMENSION = 1536;
export const MAX_SOURCE_BYTES = 1_000_000;
export const MAX_JSON_BODY_BYTES = 6_500_000;

const ProviderSchema = z.object({
  apiKey: z.string().min(1),
  model: z.string().min(1),
  baseUrl: z.string().url(),
});

export interface ServiceCredential {
  id: string;
  secret: string;
  workspaces: string[];
}

export function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production.");
  }
  return "postgresql://axelyn_knowledge:axelyn_knowledge@127.0.0.1:5432/axelyn_knowledge";
}

export function extractionProvider() {
  const candidate = {
    apiKey: process.env.EXTRACTION_API_KEY,
    model: process.env.EXTRACTION_MODEL,
    baseUrl: process.env.EXTRACTION_BASE_URL ?? "https://openrouter.ai/api/v1",
  };
  const parsed = ProviderSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function embeddingProvider() {
  const candidate = {
    apiKey: process.env.EMBEDDING_API_KEY,
    model: process.env.EMBEDDING_MODEL,
    baseUrl: process.env.EMBEDDING_BASE_URL ?? "https://api.openai.com/v1",
  };
  const parsed = ProviderSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function serviceCredentials(): ServiceCredential[] {
  if (!process.env.SERVICE_TOKENS) return [];
  const schema = z.array(
    z.object({
      id: z.string().min(1),
      secret: z.string().min(32),
      workspaces: z.array(z.string().min(1)).min(1),
    }),
  );
  try {
    return schema.parse(JSON.parse(process.env.SERVICE_TOKENS));
  } catch {
    throw new Error("SERVICE_TOKENS must be valid JSON with secrets of at least 32 characters.");
  }
}
