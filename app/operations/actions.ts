"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOperator } from "@/src/auth/operator-auth";
import { AppError } from "@/src/domain/errors";
import { KnowledgeOperationRequestSchema } from "@/src/domain/schemas";
import { knowledgeOperationService } from "@/src/services/knowledge-operation-service";

export interface KnowledgeOperationActionState {
  status: "idle" | "success" | "error";
  message?: string;
  nodeId?: string;
  title?: string;
  operation?: "CHALLENGE" | "EXTEND";
  type?: string;
  assessment?: string;
  model?: string;
  evidenceGaps?: string[];
}

export async function runKnowledgeOperationAction(
  _previous: KnowledgeOperationActionState,
  formData: FormData,
): Promise<KnowledgeOperationActionState> {
  try {
    const operator = await requireOperator();
    const request = KnowledgeOperationRequestSchema.parse(Object.fromEntries(formData));
    const result = await knowledgeOperationService.run(request, operator.email);

    revalidatePath("/");
    revalidatePath("/knowledge");
    revalidatePath(`/knowledge/${request.target_node_id}`);
    revalidatePath("/challenge");
    revalidatePath("/extend");

    return {
      status: "success",
      message: `${request.operation} created one ${result.node.type.toLowerCase()} with an explicit ${result.assessment.toLowerCase()} assessment.`,
      nodeId: result.node.id,
      title: result.node.title,
      operation: request.operation,
      type: result.node.type,
      assessment: result.assessment,
      model: result.model,
      evidenceGaps: result.evidence_gaps,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: "error",
        message: error.issues[0]?.message ?? "Check the operation request and try again.",
      };
    }
    if (error instanceof AppError) return { status: "error", message: error.message };
    return {
      status: "error",
      message: error instanceof Error ? error.message : "The knowledge operation failed.",
    };
  }
}
