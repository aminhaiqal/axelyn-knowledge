import { redirect } from "next/navigation";
import { workspaceFrom } from "@/src/ui/workspace";

export const dynamic = "force-dynamic";

export default async function AddKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const workspace = workspaceFrom((await searchParams).workspace);
  redirect(`/?workspace=${encodeURIComponent(workspace)}&view=insert`);
}
