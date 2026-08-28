import type { KnowledgeSource } from "@/src/domain/models";
import type { ExtractionOutput } from "@/src/domain/schemas";

export interface KnowledgeExtractionResult {
  output: ExtractionOutput;
  model: string;
}

export interface KnowledgeExtractionGateway {
  readonly name: string;
  readonly model: string;
  extract(source: KnowledgeSource): Promise<KnowledgeExtractionResult>;
}

export interface EmbeddingGateway {
  readonly name: string;
  readonly model: string;
  embed(text: string): Promise<number[]>;
}
