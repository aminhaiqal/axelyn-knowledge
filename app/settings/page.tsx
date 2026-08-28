import type { Metadata } from "next";
import { requireOperator } from "@/src/auth/operator-auth";
import { providerSettingsService } from "@/src/services/provider-settings-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";
import { ProviderSettingsForm } from "@/components/provider-settings-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Model access",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const operator = await requireOperator();
  const workspace = workspaceFrom((await searchParams).workspace);
  const settings = await providerSettingsService.view(workspace);

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow="Settings / secure provider access"
        title="Model access"
        description="Control the credential and model route Axelyn uses to turn source material into reviewable knowledge. Keys stay encrypted and write-only."
      />
      <ProviderSettingsForm settings={settings} workspace={workspace} />
    </AdminShell>
  );
}
