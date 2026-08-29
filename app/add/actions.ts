"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOperator } from "@/src/auth/operator-auth";
import { AppError } from "@/src/domain/errors";
import { SENSITIVITY_LEVELS } from "@/src/domain/enums";
import { SourceIngestionSchema, WorkspaceIdSchema } from "@/src/domain/schemas";
import {
  prepareUploadedFile,
  prepareWebsite,
  type PreparedIntakeSource,
} from "@/src/services/operator-intake";
import { sourceService } from "@/src/services/source-service";

const IntakeFieldsSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  kind: z.enum(["text", "file", "website"]),
  label: z.string().trim().max(240).default(""),
  sensitivity: z.enum(SENSITIVITY_LEVELS),
});

export interface KnowledgeIntakeState {
  status: "idle" | "success" | "error";
  message?: string;
  sourceId?: string;
  sourceLabel?: string;
  extractionStatus?: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  extractionMessage?: string;
  createdNodes?: number;
  createdEdges?: number;
}

function zodMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the source details and try again.";
}

function createdCount(result: Record<string, unknown> | null, key: string) {
  const value = result?.[key];
  return Array.isArray(value) ? value.length : 0;
}

export async function addKnowledgeSourceAction(
  _previous: KnowledgeIntakeState,
  formData: FormData,
): Promise<KnowledgeIntakeState> {
  try {
    const operator = await requireOperator();
    const fields = IntakeFieldsSchema.parse({
      workspace_id: formData.get("workspace_id"),
      kind: formData.get("kind"),
      label: formData.get("label") ?? "",
      sensitivity: formData.get("sensitivity"),
    });

    let prepared: PreparedIntakeSource;
    if (fields.kind === "text") {
      const content = String(formData.get("content") ?? "").trim();
      prepared = {
        content,
        label: fields.label || `Pasted notes · ${new Date().toLocaleDateString("en-CA")}`,
        metadata: {},
      };
    } else if (fields.kind === "file") {
      const file = formData.get("file");
      if (!(file instanceof File))
        throw new AppError("FILE_REQUIRED", "Choose a file to import.", 400);
      prepared = await prepareUploadedFile(file);
    } else {
      prepared = await prepareWebsite(String(formData.get("url") ?? ""));
    }

    const sourceLabel = (fields.label || prepared.label).slice(0, 240);
    const occurredAt = new Date().toISOString();
    const input = SourceIngestionSchema.parse({
      workspace_id: fields.workspace_id,
      source_system: "operator-console",
      source_type: fields.kind === "website" ? "external_source" : "operator_evidence",
      external_id: `intake-${fields.kind}-${randomUUID()}`,
      source_version: 1,
      content: prepared.content,
      metadata: {
        ...prepared.metadata,
        title: sourceLabel,
        operator_intake: {
          kind: fields.kind,
          sensitivity: fields.sensitivity,
          imported_by: operator.email,
          imported_at: occurredAt,
        },
      },
      occurred_at: occurredAt,
      auto_extract: true,
    });
    const result = await sourceService.ingest(input, operator.email);
    const extraction = result.extraction;

    revalidatePath("/");
    revalidatePath("/knowledge");

    return {
      status: "success",
      message:
        extraction?.status === "SUCCEEDED"
          ? "Source saved and extracted claims are active in the library."
          : "Source saved. Automatic extraction needs attention before claims can be activated.",
      sourceId: result.source.id,
      sourceLabel,
      extractionStatus: extraction?.status,
      extractionMessage: extraction?.error_message ?? undefined,
      createdNodes: createdCount(extraction?.proposals ?? null, "created_node_ids"),
      createdEdges: createdCount(extraction?.proposals ?? null, "created_edge_ids"),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "error", message: zodMessage(error) };
    }
    if (error instanceof AppError) {
      return { status: "error", message: error.message };
    }
    return {
      status: "error",
      message: "The source could not be imported. Check the input and try again.",
    };
  }
}
