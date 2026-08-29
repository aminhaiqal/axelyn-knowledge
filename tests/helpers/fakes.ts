import { EMBEDDING_DIMENSION } from "@/src/config";
import type { KnowledgeSource } from "@/src/domain/models";
import type {
  ExtractionOutput,
  GeneratedOperationResult,
  KnowledgeOperationRequest,
} from "@/src/domain/schemas";
import type {
  EmbeddingGateway,
  KnowledgeExtractionGateway,
  KnowledgeExtractionResult,
  KnowledgeOperationGateway,
} from "@/src/gateways/types";

export class FakeExtractionGateway implements KnowledgeExtractionGateway {
  readonly name = "fake-extraction";
  readonly model = "fixture-model";

  constructor(
    private readonly output: ExtractionOutput | ((source: KnowledgeSource) => ExtractionOutput),
  ) {}

  async extract(source: KnowledgeSource): Promise<KnowledgeExtractionResult> {
    return {
      output: typeof this.output === "function" ? this.output(source) : this.output,
      model: this.model,
    };
  }
}

export class FakeOperationGateway implements KnowledgeOperationGateway {
  readonly name = "fake-operation";
  readonly model = "fixture-operation-model";

  constructor(
    private readonly output:
      | GeneratedOperationResult
      | ((source: KnowledgeSource, request: KnowledgeOperationRequest) => GeneratedOperationResult),
  ) {}

  async generate(source: KnowledgeSource, request: KnowledgeOperationRequest) {
    return {
      output: typeof this.output === "function" ? this.output(source, request) : this.output,
      model: this.model,
    };
  }
}

export class FakeEmbeddingGateway implements EmbeddingGateway {
  readonly name = "fake-embedding";
  readonly model = "fixture-embedding";

  async embed(text: string): Promise<number[]> {
    const value = Array<number>(EMBEDDING_DIMENSION).fill(0);
    value[0] = 1;
    value[1] = text.toLocaleLowerCase("en").includes("counter") ? 0.2 : 0.8;
    return value;
  }
}

export class FailingEmbeddingGateway implements EmbeddingGateway {
  readonly name = "failing-embedding";
  readonly model = "offline";

  async embed(): Promise<number[]> {
    throw new Error("Embedding provider is offline.");
  }
}
