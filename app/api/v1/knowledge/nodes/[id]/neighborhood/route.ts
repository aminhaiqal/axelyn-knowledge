import { apiRoute, resolveWorkspace } from "@/src/api/http";
import { NeighborhoodQuerySchema } from "@/src/domain/schemas";
import { nodeService } from "@/src/services/node-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ identity }) => {
    const url = new URL(request.url);
    const workspaceId = resolveWorkspace(request, identity);
    const options = NeighborhoodQuerySchema.parse({
      workspace_id: workspaceId,
      depth: url.searchParams.get("depth") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const { id } = await context.params;
    return Response.json(
      await nodeService.neighborhood(workspaceId, id, options.depth, options.limit),
    );
  });
}
