import { apiRoute, parseJson, resolveWorkspace } from "@/src/api/http";
import { NodeCreateSchema, NodeListQuerySchema } from "@/src/domain/schemas";
import { nodeService } from "@/src/services/node-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, async ({ identity }) => {
    const raw = Object.fromEntries(new URL(request.url).searchParams.entries());
    const input = NodeListQuerySchema.parse(raw);
    resolveWorkspace(request, identity, input.workspace_id);
    return Response.json(await nodeService.list(input));
  });
}

export async function POST(request: Request) {
  return apiRoute(request, async ({ identity }) => {
    const input = await parseJson(request, NodeCreateSchema);
    resolveWorkspace(request, identity, input.workspace_id);
    const node = await nodeService.create(input, `service:${identity.id}`);
    return Response.json(node, { status: 201 });
  });
}
