import { apiRoute, parseJson, resolveWorkspace } from "@/src/api/http";
import { RetrievalSchema } from "@/src/domain/schemas";
import { retrievalService } from "@/src/services/retrieval-service";

export async function POST(request: Request) {
  return apiRoute(request, async ({ identity }) => {
    const input = await parseJson(request, RetrievalSchema);
    resolveWorkspace(request, identity, input.workspace_id);
    return Response.json(await retrievalService.retrieve(input, `service:${identity.id}`));
  });
}
