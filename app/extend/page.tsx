import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { workspaceFrom } from "@/src/ui/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Extend knowledge" };

export default async function ExtendPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; query?: string }>;
}) {
  const params = await searchParams;
  const workspace = workspaceFrom(params.workspace);
  const destination = new URLSearchParams({ workspace, view: "extend" });
  if (params.query) destination.set("query", params.query);
  redirect(`/?${destination.toString()}`);
}
