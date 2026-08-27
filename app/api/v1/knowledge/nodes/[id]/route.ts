import { z } from "zod";
import { apiRoute, parseJson, resolveWorkspace } from "@/src/api/http";
import { NodePatchSchema, WorkspaceIdSchema } from "@/src/domain/schemas";
import { nodeService } from "@/src/services/node-service";

const PatchBodySchema = z.intersection(
  z.object({ workspace_id: WorkspaceIdSchema }),
  NodePatchSchema,
);
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ identity }) => {
    const workspaceId = resolveWorkspace(request, identity);
    const { id } = await context.params;
    return Response.json(await nodeService.get(workspaceId, id));
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ identity }) => {
    const input = await parseJson(request, PatchBodySchema);
    const workspaceId = resolveWorkspace(request, identity, input.workspace_id);
    const { id } = await context.params;
    const patch = NodePatchSchema.parse(input);
    return Response.json(await nodeService.patch(workspaceId, id, patch, `service:${identity.id}`));
  });
}
