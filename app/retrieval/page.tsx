import { requireOperator } from "@/src/auth/operator-auth";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";
import { RetrievalDebugger } from "@/components/retrieval-debugger";

export const dynamic = "force-dynamic";

export default async function RetrievalPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const operator = await requireOperator();
  const workspace = workspaceFrom((await searchParams).workspace);

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow="Working memory / transparent activation"
        title="Retrieval lab"
        description="Inspect semantic and lexical seeds, bounded graph activation, trust-aware reranking, contradictions, provenance, and the exact context pack consumers receive."
      />
      <RetrievalDebugger workspace={workspace} />
    </AdminShell>
  );
}
