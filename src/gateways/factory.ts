import { embeddingProvider, extractionProvider } from "@/src/config";
import { OpenAICompatibleEmbeddingGateway } from "@/src/gateways/openai-embeddings";
import { OpenRouterExtractionGateway } from "@/src/gateways/openrouter-extraction";
import { providerSettingsService } from "@/src/services/provider-settings-service";

export function createExtractionGateway() {
  const provider = extractionProvider();
  return provider
    ? new OpenRouterExtractionGateway(provider.apiKey, provider.models, provider.baseUrl)
    : null;
}

export async function createWorkspaceExtractionGateway(workspaceId: string) {
  const provider = await providerSettingsService.resolve(workspaceId);
  return provider
    ? new OpenRouterExtractionGateway(provider.apiKey, provider.models, provider.baseUrl)
    : null;
}

export function createEmbeddingGateway() {
  const provider = embeddingProvider();
  return provider
    ? new OpenAICompatibleEmbeddingGateway(provider.apiKey, provider.model, provider.baseUrl)
    : null;
}
