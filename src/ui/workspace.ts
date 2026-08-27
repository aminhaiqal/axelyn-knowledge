import { WorkspaceIdSchema } from "@/src/domain/schemas";

export function workspaceFrom(value?: string | string[] | null) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return WorkspaceIdSchema.parse(candidate ?? process.env.DEFAULT_WORKSPACE ?? "axelyn");
}
