import { requireOperator } from "@/src/auth/operator-auth";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { KnowledgeIntake } from "@/components/knowledge-intake";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function AddKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const operator = await requireOperator();
  const workspace = workspaceFrom((await searchParams).workspace);

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow="Insert / new knowledge"
        title="Add what is known."
        description="Preserve the source, then classify each atomic record as a fact, observation, principle, decision, or procedure."
      />
      <KnowledgeIntake workspace={workspace} />
    </AdminShell>
  );
}
