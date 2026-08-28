"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOperator } from "@/src/auth/operator-auth";
import { AppError } from "@/src/domain/errors";
import { WorkspaceIdSchema } from "@/src/domain/schemas";
import {
  ProviderModelChainSchema,
  providerSettingsService,
} from "@/src/services/provider-settings-service";

export interface ProviderSettingsActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Check the provider settings and try again.";
  }
  if (error instanceof AppError) return error.message;
  return "Provider settings could not be updated. Try again.";
}

export async function saveProviderSettingsAction(
  _previous: ProviderSettingsActionState,
  formData: FormData,
): Promise<ProviderSettingsActionState> {
  try {
    const operator = await requireOperator();
    const workspace = WorkspaceIdSchema.parse(formData.get("workspace_id"));
    const models = ProviderModelChainSchema.parse(formData.getAll("models"));
    const apiKey = String(formData.get("api_key") ?? "").trim();

    await providerSettingsService.save(
      workspace,
      { apiKey: apiKey || undefined, models },
      operator.email,
    );
    revalidatePath("/settings");
    return { status: "success", message: "OpenRouter settings saved and verified." };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function testProviderConnectionAction(
  _previous: ProviderSettingsActionState,
  formData: FormData,
): Promise<ProviderSettingsActionState> {
  try {
    const operator = await requireOperator();
    const workspace = WorkspaceIdSchema.parse(formData.get("workspace_id"));
    const details = await providerSettingsService.test(workspace, operator.email);
    revalidatePath("/settings");
    const remaining =
      details.limitRemaining === null ? "" : ` · $${details.limitRemaining.toFixed(2)} remaining`;
    return {
      status: "success",
      message: `OpenRouter connection verified${remaining}.`,
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function removeProviderCredentialAction(
  _previous: ProviderSettingsActionState,
  formData: FormData,
): Promise<ProviderSettingsActionState> {
  try {
    const operator = await requireOperator();
    const workspace = WorkspaceIdSchema.parse(formData.get("workspace_id"));
    await providerSettingsService.remove(workspace, operator.email);
    revalidatePath("/settings");
    return { status: "success", message: "Workspace OpenRouter key removed." };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
