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
        eyebrow="Source intake / provenance first"
        title="Add knowledge from what you already have"
        description="Paste material, upload a document, or bring in one public web page. Axelyn preserves the source, extracts reusable ideas, and puts every proposal in your review queue."
      />
      <KnowledgeIntake workspace={workspace} />
    </AdminShell>
  );
}
