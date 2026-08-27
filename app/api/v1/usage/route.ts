import { apiRoute, parseJson, resolveWorkspace } from "@/src/api/http";
import { UsageSchema } from "@/src/domain/schemas";
import { retrievalService } from "@/src/services/retrieval-service";

export async function POST(request: Request) {
  return apiRoute(request, async ({ identity }) => {
    const input = await parseJson(request, UsageSchema);
    resolveWorkspace(request, identity, input.workspace_id);
    return Response.json(
      await retrievalService.reportUsage(
        input.workspace_id,
        input.retrieval_run_id,
        input.node_ids,
        input.outcome,
        input.metadata,
        `service:${identity.id}`,
      ),
      { status: 201 },
    );
  });
}
