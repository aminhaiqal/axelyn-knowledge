import type { Metadata } from "next";
import { requireOperator } from "@/src/auth/operator-auth";
import { NodeListQuerySchema } from "@/src/domain/schemas";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { OperationTargetBrowser } from "@/components/operation-target-browser";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Extend knowledge" };

export default async function ExtendPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; query?: string }>;
}) {
  const operator = await requireOperator();
  const params = await searchParams;
  const workspace = workspaceFrom(params.workspace);
  const query = params.query ?? "";
  const result = await nodeService.list(
    NodeListQuerySchema.parse({
      workspace_id: workspace,
      query,
      lifecycle_status: "ACTIVE",
      limit: 25,
    }),
  );

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow="EXTEND / retrieve, connect, develop"
        title="Extend existing knowledge"
        description="Retrieve one target and create one grounded ARGUMENT or INSIGHT that adds a distinct implication instead of paraphrasing it."
      />
      <OperationTargetBrowser
        items={result.items}
        operation="EXTEND"
        query={query}
        workspace={workspace}
      />
    </AdminShell>
  );
}
