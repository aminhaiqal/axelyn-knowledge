import Link from "next/link";
import { retryExtractionAction } from "@/app/actions";
import { requireOperator } from "@/src/auth/operator-auth";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";
import { TrustBadge } from "@/components/trust-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, MetricCard, SectionHeader, Surface } from "@/components/ui/workspace";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const operator = await requireOperator();
  const workspace = workspaceFrom((await searchParams).workspace);
  const dashboard = await nodeService.dashboard(workspace);
  const totals = dashboard.totals as Record<string, unknown>;

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow="Memory register / live state"
        title="What the system currently remembers"
        description="A trust-aware register of reusable knowledge, pending judgment, and failed extraction work. Editorial approval and factual verification remain separate here."
        actions={
          <>
            <Link
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "px-4")}
              href={`/inbox?workspace=${workspace}`}
            >
              Review inbox
            </Link>
            <Link
              className={cn(buttonVariants({ size: "lg" }), "px-4")}
              href={`/add?workspace=${workspace}`}
            >
              Add knowledge
            </Link>
          </>
        }
      />

      <section aria-label="Knowledge totals" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total nodes" value={Number(totals.total ?? 0)} />
        <MetricCard label="Awaiting review" value={Number(totals.proposed ?? 0)} />
        <MetricCard label="Active memory" value={Number(totals.active ?? 0)} />
        <MetricCard
          description="Failed extraction attempts still preserved at the source layer."
          label="Extraction failures"
          value={dashboard.extraction_failures.length}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <section className="space-y-4">
          <SectionHeader
            action={
              <Link
                className="text-sm font-medium text-slate-600 transition-colors hover:text-[#3557ff]"
                href={`/inbox?workspace=${workspace}`}
              >
                Open full inbox
              </Link>
            }
            eyebrow="Decision queue"
            title="Oldest proposals first"
          />

          {dashboard.awaiting_review.length ? (
            <Surface className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#dce3ed] bg-[#f7f9fc] hover:bg-[#f7f9fc]">
                    <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Knowledge
                    </TableHead>
                    <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Origin
                    </TableHead>
                    <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Verification
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.awaiting_review.map((node) => (
                    <TableRow key={String(node.id)} className="border-slate-200/70">
                      <TableCell className="px-6 py-5 align-top whitespace-normal">
                        <Link
                          className="block text-base font-semibold tracking-tight text-slate-950 transition-colors hover:text-[#3557ff]"
                          href={`/knowledge/${node.id}?workspace=${workspace}`}
                        >
                          {String(node.title)}
                        </Link>
                        <span className="mt-2 block text-sm text-slate-500">
                          {String(node.type).replaceAll("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-5 align-top">
                        <TrustBadge kind="origin" value={String(node.origin)} />
                      </TableCell>
                      <TableCell className="px-6 py-5 align-top">
                        <TrustBadge kind="verification" value={String(node.verification)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Surface>
          ) : (
            <EmptyState
              description="New extraction and manual proposals will appear here."
              title="The review queue is clear."
            />
          )}
        </section>

        <aside className="space-y-6">
          <Surface className="p-6">
            <SectionHeader eyebrow="Immutable intake" title="Recent sources" />
            {dashboard.recent_sources.length ? (
              <ul className="mt-6 space-y-4">
                {dashboard.recent_sources.map((source) => (
                  <li
                    className="border-t border-[#e1e7f0] pt-4 first:border-t-0 first:pt-0"
                    key={String(source.id)}
                  >
                    <p className="font-semibold tracking-tight text-slate-950">
                      {String(source.title ?? source.external_id)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {String(source.source_system)} ·{" "}
                      {String(source.source_type).replaceAll("_", " ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 text-sm leading-7 text-slate-600">
                No sources have been ingested yet.
              </p>
            )}
          </Surface>

          <Surface className="p-6">
            <SectionHeader eyebrow="Needs attention" title="Extraction failures" />
            {dashboard.extraction_failures.length ? (
              <ul className="mt-6 space-y-4">
                {dashboard.extraction_failures.map((failure) => (
                  <li className="border border-rose-200 bg-rose-50/80 p-4" key={String(failure.id)}>
                    <p className="font-semibold tracking-tight text-slate-950">
                      {String(failure.title ?? failure.external_id)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {String(failure.error_code)} · {String(failure.error_message)}
                    </p>
                    <form action={retryExtractionAction} className="mt-4">
                      <input type="hidden" name="workspace_id" value={workspace} />
                      <input type="hidden" name="source_id" value={String(failure.source_id)} />
                      <button
                        className={cn(
                          buttonVariants({ size: "sm", variant: "outline" }),
                          "border-rose-200 bg-white",
                        )}
                        type="submit"
                      >
                        Retry extraction
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 text-sm leading-7 text-slate-600">
                No failed extraction attempts.
              </p>
            )}
          </Surface>
        </aside>
      </div>
    </AdminShell>
  );
}
