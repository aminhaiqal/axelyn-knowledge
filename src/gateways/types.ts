import type { KnowledgeSource } from "@/src/domain/models";
import type {
  ExtractionOutput,
  GeneratedOperationResult,
  KnowledgeOperationRequest,
} from "@/src/domain/schemas";

export interface KnowledgeExtractionResult {
  output: ExtractionOutput;
  model: string;
}

export interface KnowledgeExtractionGateway {
  readonly name: string;
  readonly model: string;
  extract(source: KnowledgeSource): Promise<KnowledgeExtractionResult>;
}

export interface KnowledgeOperationGateway {
  readonly name: string;
  readonly model: string;
  generate(
    source: KnowledgeSource,
    request: KnowledgeOperationRequest,
  ): Promise<{ output: GeneratedOperationResult; model: string }>;
}

export interface EmbeddingGateway {
  readonly name: string;
  readonly model: string;
  embed(text: string): Promise<number[]>;
}
