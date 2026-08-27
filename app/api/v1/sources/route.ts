import { apiRoute, parseJson, resolveWorkspace } from "@/src/api/http";
import { SourceIngestionSchema } from "@/src/domain/schemas";
import { sourceService } from "@/src/services/source-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return apiRoute(request, async ({ identity }) => {
    const input = await parseJson(request, SourceIngestionSchema);
    resolveWorkspace(request, identity, input.workspace_id);
    const result = await sourceService.ingest(input, `service:${identity.id}`);
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  });
}
