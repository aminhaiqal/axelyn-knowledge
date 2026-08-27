"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOperator } from "@/src/auth/operator-auth";
import {
  NodeCreateSchema,
  NodePatchSchema,
  RetrievalSchema,
  UuidSchema,
  WorkspaceIdSchema,
} from "@/src/domain/schemas";
import { nodeService } from "@/src/services/node-service";
import { retrievalService } from "@/src/services/retrieval-service";

const ActionSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  node_id: UuidSchema,
  reason: z.string().trim().min(3).max(1_000),
});

export async function approveNodeAction(formData: FormData) {
  const operator = await requireOperator();
  const input = ActionSchema.parse(Object.fromEntries(formData));
  await nodeService.transition(
    input.workspace_id,
    input.node_id,
    "ACTIVE",
    operator.email,
    input.reason,
  );
  revalidatePath("/inbox");
  revalidatePath("/knowledge");
}

export async function rejectNodeAction(formData: FormData) {
  const operator = await requireOperator();
  const input = ActionSchema.parse(Object.fromEntries(formData));
  await nodeService.transition(
    input.workspace_id,
    input.node_id,
    "REJECTED",
    operator.email,
    input.reason,
  );
  revalidatePath("/inbox");
}

export async function archiveNodeAction(formData: FormData) {
  const operator = await requireOperator();
  const input = ActionSchema.parse(Object.fromEntries(formData));
  await nodeService.transition(
    input.workspace_id,
    input.node_id,
    "ARCHIVED",
    operator.email,
    input.reason,
  );
  revalidatePath("/knowledge");
}

export async function reviewEdgeAction(formData: FormData) {
  const operator = await requireOperator();
  const input = z
    .object({
      workspace_id: WorkspaceIdSchema,
      edge_id: UuidSchema,
      decision: z.enum(["ACTIVE", "REJECTED"]),
      reason: z.string().min(3).max(1_000),
    })
    .parse(Object.fromEntries(formData));
  await nodeService.reviewEdge(
    input.workspace_id,
    input.edge_id,
    input.decision,
    operator.email,
    input.reason,
  );
  revalidatePath("/inbox");
}

export async function editNodeAction(formData: FormData) {
  const operator = await requireOperator();
  const raw = Object.fromEntries(formData);
  const workspaceId = WorkspaceIdSchema.parse(raw.workspace_id);
  const nodeId = UuidSchema.parse(raw.node_id);
  const input = NodePatchSchema.parse({
    expected_version: Number(raw.expected_version),
    title: raw.title,
    canonical_statement: raw.canonical_statement,
    verification: raw.verification,
    sensitivity: raw.sensitivity,
    confidence: Number(raw.confidence),
    importance: Number(raw.importance),
    salience: Number(raw.salience),
    change_reason: raw.change_reason,
  });
  await nodeService.patch(workspaceId, nodeId, input, operator.email);
  revalidatePath(`/knowledge/${nodeId}`);
  revalidatePath("/knowledge");
}

export async function mergeNodeAction(formData: FormData) {
  const operator = await requireOperator();
  const raw = Object.fromEntries(formData);
  const input = z
    .object({
      workspace_id: WorkspaceIdSchema,
      source_node_id: UuidSchema,
      target_node_id: UuidSchema,
      expected_source_version: z.coerce.number().int().positive(),
      expected_target_version: z.coerce.number().int().positive(),
      reason: z.string().min(3).max(1_000),
    })
    .parse(raw);
  await nodeService.merge(
    input.workspace_id,
    input.source_node_id,
    input.target_node_id,
    input.expected_source_version,
    input.expected_target_version,
    operator.email,
    input.reason,
  );
  revalidatePath("/knowledge");
}

export async function createNodeAction(formData: FormData) {
  const operator = await requireOperator();
  const raw = Object.fromEntries(formData);
  const input = NodeCreateSchema.parse({
    workspace_id: raw.workspace_id,
    type: raw.type,
    title: raw.title,
    canonical_statement: raw.canonical_statement,
    origin: "OPERATOR",
    verification: raw.verification,
    lifecycle_status: "PROPOSED",
    sensitivity: raw.sensitivity,
    confidence: Number(raw.confidence ?? 0.7),
    importance: Number(raw.importance ?? 0.5),
    salience: Number(raw.salience ?? 0.5),
    metadata: {},
    source_links: [],
  });
  await nodeService.create(input, operator.email);
  revalidatePath("/knowledge");
  revalidatePath("/inbox");
}

export interface RetrievalActionState {
  result?: Awaited<ReturnType<typeof retrievalService.retrieve>>;
  error?: string;
}

export async function debugRetrievalAction(
  _previous: RetrievalActionState,
  formData: FormData,
): Promise<RetrievalActionState> {
  try {
    const operator = await requireOperator();
    const raw = Object.fromEntries(formData);
    const input = RetrievalSchema.parse({
      workspace_id: raw.workspace_id,
      query: raw.query,
      purpose: raw.purpose,
      requesting_system: "admin-retrieval-debugger",
      audience: raw.audience,
      desired_node_types: formData.getAll("desired_node_types"),
      allowed_verification_levels: formData.getAll("allowed_verification_levels"),
      maximum_sensitivity: raw.maximum_sensitivity,
      maximum_graph_depth: Number(raw.maximum_graph_depth),
      result_limit: Number(raw.result_limit),
      token_budget: Number(raw.token_budget),
      pinned_node_ids: [],
    });
    return { result: await retrievalService.retrieve(input, operator.email) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Retrieval failed." };
  }
}
