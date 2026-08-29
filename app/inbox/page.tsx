import { redirect } from "next/navigation";
import { workspaceFrom } from "@/src/ui/workspace";

export default async function InboxRedirect({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const workspace = workspaceFrom((await searchParams).workspace);
  redirect(`/knowledge?workspace=${encodeURIComponent(workspace)}`);
}
