import type { Metadata } from "next";
import { requireOperator } from "@/src/auth/operator-auth";
import { NodeListQuerySchema } from "@/src/domain/schemas";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { OperationTargetBrowser } from "@/components/operation-target-browser";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Challenge knowledge" };

export default async function ChallengePage({
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
        eyebrow="CHALLENGE / retrieve, test, judge"
        title="Challenge existing knowledge"
        description="Retrieve one target, test it against bounded context, and create one separate CLAIM, EVIDENCE, or HYPOTHESIS. The target remains intact."
      />
      <OperationTargetBrowser
        items={result.items}
        operation="CHALLENGE"
        query={query}
        workspace={workspace}
      />
    </AdminShell>
  );
}
