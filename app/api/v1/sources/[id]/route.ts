import { apiRoute, resolveWorkspace } from "@/src/api/http";
import { sourceService } from "@/src/services/source-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ identity }) => {
    const workspaceId = resolveWorkspace(request, identity);
    const { id } = await context.params;
    return Response.json(await sourceService.getSource(workspaceId, id));
  });
}
