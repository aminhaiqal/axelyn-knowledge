import { z } from "zod";
import { apiRoute, resolveWorkspace } from "@/src/api/http";
import { nodeService } from "@/src/services/node-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, async ({ identity }) => {
    const workspaceId = resolveWorkspace(request, identity);
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50)
      .parse(new URL(request.url).searchParams.get("limit") ?? undefined);
    return Response.json(await nodeService.inbox(workspaceId, limit));
  });
}
