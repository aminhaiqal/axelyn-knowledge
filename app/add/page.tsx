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
        eyebrow="Raw input / editorial workspace"
        title="What did you notice?"
        description="Capture the observation as it is. Axelyn preserves the source, extracts reusable ideas, and routes every decision to review."
      />
      <KnowledgeIntake workspace={workspace} />
    </AdminShell>
  );
}
