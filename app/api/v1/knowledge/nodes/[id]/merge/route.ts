import { apiRoute, parseJson, resolveWorkspace } from "@/src/api/http";
import { MergeSchema } from "@/src/domain/schemas";
import { nodeService } from "@/src/services/node-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ identity }) => {
    const input = await parseJson(request, MergeSchema);
    const workspaceId = resolveWorkspace(request, identity, input.workspace_id);
    const { id } = await context.params;
    return Response.json(
      await nodeService.merge(
        workspaceId,
        id,
        input.target_node_id,
        input.expected_source_version,
        input.expected_target_version,
        `service:${identity.id}`,
        input.reason,
      ),
    );
  });
}
