import { embeddingProvider, extractionProvider } from "@/src/config";
import { OpenAICompatibleEmbeddingGateway } from "@/src/gateways/openai-embeddings";
import { OpenRouterExtractionGateway } from "@/src/gateways/openrouter-extraction";

export function createExtractionGateway() {
  const provider = extractionProvider();
  return provider
    ? new OpenRouterExtractionGateway(provider.apiKey, provider.model, provider.baseUrl)
    : null;
}

export function createEmbeddingGateway() {
  const provider = embeddingProvider();
  return provider
    ? new OpenAICompatibleEmbeddingGateway(provider.apiKey, provider.model, provider.baseUrl)
    : null;
}
