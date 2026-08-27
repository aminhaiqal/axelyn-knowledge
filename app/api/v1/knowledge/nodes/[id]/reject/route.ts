import { z } from "zod";
import { apiRoute, parseJson, resolveWorkspace } from "@/src/api/http";
import { WorkspaceIdSchema } from "@/src/domain/schemas";
import { nodeService } from "@/src/services/node-service";

const BodySchema = z.object({
  workspace_id: WorkspaceIdSchema,
  reason: z.string().trim().min(3).max(1_000),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ identity }) => {
    const input = await parseJson(request, BodySchema);
    const workspaceId = resolveWorkspace(request, identity, input.workspace_id);
    const { id } = await context.params;
    return Response.json(
      await nodeService.transition(
        workspaceId,
        id,
        "REJECTED",
        `service:${identity.id}`,
        input.reason,
      ),
    );
  });
}
