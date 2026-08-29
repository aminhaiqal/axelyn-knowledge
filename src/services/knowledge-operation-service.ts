import { randomUUID } from "node:crypto";
import { badRequest, unavailable } from "@/src/domain/errors";
import { SENSITIVITY_RANK, type EdgeType, type Sensitivity } from "@/src/domain/enums";
import type { KnowledgeNode } from "@/src/domain/models";
import {
  KnowledgeOperationRequestSchema,
  SourceIngestionSchema,
  type GeneratedOperationResult,
  type KnowledgeOperationRequest,
} from "@/src/domain/schemas";
import { createWorkspaceOperationGateway } from "@/src/gateways/factory";
import type { KnowledgeOperationGateway } from "@/src/gateways/types";
import { NodeService, nodeService } from "@/src/services/node-service";
import { RetrievalService, retrievalService } from "@/src/services/retrieval-service";
import { SourceService, sourceService } from "@/src/services/source-service";

interface RetrievedOperationContext {
  retrieval_run_id: string;
  items: Array<{
    node_id: string;
    type: string;
    canonical_statement: string;
    sensitivity: string;
    trust: Record<string, unknown>;
    why_recalled: string;
    supporting_provenance: Array<Record<string, unknown>>;
  }>;
}

function resultEdgeType(result: GeneratedOperationResult): EdgeType {
  if (result.operation === "EXTEND") return "REFINES";
  if (result.assessment === "SUPPORTED") return "SUPPORTS";
  if (["WEAKENED", "CONTRADICTED"].includes(result.assessment)) return "CONTRADICTS";
  return "RELATED_TO";
}

function maximumSensitivity(
  target: KnowledgeNode,
  context: RetrievedOperationContext,
): Sensitivity {
  const candidates = [
    target.sensitivity,
    ...context.items.map((item) => item.sensitivity as Sensitivity),
  ];
  return candidates.reduce((highest, current) =>
    SENSITIVITY_RANK[current] > SENSITIVITY_RANK[highest] ? current : highest,
  );
}

export function buildOperationGroundingRecord(
  request: KnowledgeOperationRequest,
  target: KnowledgeNode,
  context: RetrievedOperationContext,
): string {
  const recalled = context.items
    .map(
      (item, index) =>
        `RECALLED ${index + 1}\nID: ${item.node_id}\nTYPE: ${item.type}\nTRUST: ${JSON.stringify(item.trust)}\nSTATEMENT:\n${item.canonical_statement}\nWHY RECALLED: ${item.why_recalled}\nPROVENANCE: ${JSON.stringify(item.supporting_provenance)}`,
    )
    .join("\n\n");

  return `KNOWLEDGE OPERATION REQUEST\nOPERATION: ${request.operation}\nOPERATOR REQUEST:\n${request.instruction}\n\nTARGET KNOWLEDGE\nID: ${target.id}\nOPERATION: ${target.operation}\nTYPE: ${target.type}\nVERIFICATION: ${target.verification}\nSTATEMENT:\n${target.canonical_statement}\n\nRETRIEVAL RUN: ${context.retrieval_run_id}\n${recalled}`;
}

export class KnowledgeOperationService {
  constructor(
    private readonly gateway: KnowledgeOperationGateway | null | undefined = undefined,
    private readonly retrieval: RetrievalService = retrievalService,
    private readonly sources: SourceService = sourceService,
    private readonly nodes: NodeService = nodeService,
  ) {}

  async run(rawRequest: KnowledgeOperationRequest, actor: string) {
    const request = KnowledgeOperationRequestSchema.parse(rawRequest);
    const [target, configuredGateway] = await Promise.all([
      this.nodes.get(request.workspace_id, request.target_node_id),
      this.gateway === undefined
        ? createWorkspaceOperationGateway(request.workspace_id)
        : Promise.resolve(this.gateway),
    ]);
    if (!configuredGateway) {
      throw unavailable(
        "OPERATION_MODEL_UNAVAILABLE",
        "Configure an OpenRouter key in Settings before running CHALLENGE or EXTEND.",
      );
    }
    if (target.lifecycle_status !== "ACTIVE") {
      throw badRequest("TARGET_NOT_ACTIVE", "Only active knowledge can be challenged or extended.");
    }
    if (SENSITIVITY_RANK[target.sensitivity] > SENSITIVITY_RANK[request.maximum_sensitivity]) {
      throw badRequest(
        "TARGET_ABOVE_SENSITIVITY",
        "The target is above the operation's sensitivity ceiling.",
      );
    }

    const retrieval = await this.retrieval.retrieve(
      {
        workspace_id: request.workspace_id,
        query: `${target.canonical_statement}\n${request.instruction}`,
        purpose: `${request.operation} existing knowledge with balanced, source-grounded judgment`,
        requesting_system: "knowledge-operation",
        audience: "Axelyn knowledge operators",
        desired_node_types: [],
        allowed_verification_levels: [
          "UNVERIFIED",
          "HUMAN_CONFIRMED",
          "SOURCE_SUPPORTED",
          "DISPUTED",
        ],
        maximum_sensitivity: request.maximum_sensitivity,
        maximum_graph_depth: 2,
        result_limit: 10,
        token_budget: 4_000,
        pinned_node_ids: [target.id],
      },
      actor,
    );
    const context: RetrievedOperationContext = {
      retrieval_run_id: retrieval.retrieval_run_id,
      items: retrieval.items,
    };
    const groundingRecord = buildOperationGroundingRecord(request, target, context);
    const sourceResult = await this.sources.ingest(
      SourceIngestionSchema.parse({
        workspace_id: request.workspace_id,
        source_system: "axelyn-knowledge-operation",
        source_type: "operation_request",
        external_id: `${request.operation.toLowerCase()}-${randomUUID()}`,
        source_version: 1,
        content: groundingRecord,
        metadata: {
          operation: request.operation,
          target_node_id: target.id,
          retrieval_run_id: retrieval.retrieval_run_id,
          requested_by: actor,
        },
        occurred_at: new Date().toISOString(),
        auto_extract: false,
      }),
      actor,
    );
    const generated = await configuredGateway.generate(sourceResult.source, request);
    const sensitivity = maximumSensitivity(target, context);
    const created = await this.nodes.create(
      {
        workspace_id: request.workspace_id,
        operation: generated.output.operation,
        type: generated.output.type,
        title: generated.output.title,
        canonical_statement: generated.output.canonical_statement,
        metadata: {
          operation_result: {
            target_node_id: target.id,
            retrieval_run_id: retrieval.retrieval_run_id,
            model: generated.model,
            assessment: generated.output.assessment,
            supporting_analysis: generated.output.supporting_analysis,
            opposing_analysis: generated.output.opposing_analysis,
            uncertainty: generated.output.uncertainty,
            evidence_gaps: generated.output.evidence_gaps,
            rationale: generated.output.rationale,
          },
        },
        origin: "AI_DERIVED",
        verification: "UNVERIFIED",
        lifecycle_status: "ACTIVE",
        sensitivity,
        confidence: generated.output.confidence,
        importance: target.importance,
        salience: Math.max(target.salience, 0.65),
        source_links: [
          { source_id: sourceResult.source.id, excerpt: generated.output.source_excerpt },
        ],
      },
      actor,
    );
    const edge = await this.nodes.createEdge(
      {
        workspace_id: request.workspace_id,
        source_node_id: created.id,
        target_node_id: target.id,
        type: resultEdgeType(generated.output),
        strength: generated.output.confidence,
        confidence: generated.output.confidence,
        lifecycle_status: "ACTIVE",
        provenance: {
          operation: generated.output.operation,
          model: generated.model,
          assessment: generated.output.assessment,
          retrieval_run_id: retrieval.retrieval_run_id,
          rationale: generated.output.rationale,
        },
        source_links: [
          { source_id: sourceResult.source.id, excerpt: generated.output.source_excerpt },
        ],
      },
      actor,
    );

    return {
      node: created,
      edge,
      assessment: generated.output.assessment,
      model: generated.model,
      evidence_gaps: generated.output.evidence_gaps,
    };
  }
}

export const knowledgeOperationService = new KnowledgeOperationService();
