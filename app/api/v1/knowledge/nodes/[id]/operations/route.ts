import { apiRoute, parseJson, resolveWorkspace } from "@/src/api/http";
import { KnowledgeOperationRequestSchema } from "@/src/domain/schemas";
import { knowledgeOperationService } from "@/src/services/knowledge-operation-service";

const BodySchema = KnowledgeOperationRequestSchema.omit({ target_node_id: true });

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async ({ identity }) => {
    const body = await parseJson(request, BodySchema);
    const workspaceId = resolveWorkspace(request, identity, body.workspace_id);
    const { id } = await context.params;
    const input = KnowledgeOperationRequestSchema.parse({
      ...body,
      workspace_id: workspaceId,
      target_node_id: id,
    });
    return Response.json(await knowledgeOperationService.run(input, `service:${identity.id}`), {
      status: 201,
    });
  });
}
