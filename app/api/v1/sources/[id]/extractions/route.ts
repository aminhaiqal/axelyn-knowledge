import { z } from "zod";
import { apiRoute, parseJson, resolveWorkspace } from "@/src/api/http";
import { WorkspaceIdSchema } from "@/src/domain/schemas";
import { sourceService } from "@/src/services/source-service";

const BodySchema = z.object({ workspace_id: WorkspaceIdSchema });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ identity }) => {
    const body = await parseJson(request, BodySchema);
    const workspaceId = resolveWorkspace(request, identity, body.workspace_id);
    const { id } = await context.params;
    const extraction = await sourceService.requestExtraction(
      workspaceId,
      id,
      `service:${identity.id}`,
    );
    return Response.json(extraction, { status: 202 });
  });
}
