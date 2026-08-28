import Link from "next/link";
import { approveNodeAction, rejectNodeAction, reviewEdgeAction } from "@/app/actions";
import { requireOperator } from "@/src/auth/operator-auth";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";
import { TrustBadge } from "@/components/trust-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, SectionHeader, Surface } from "@/components/ui/workspace";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Inbox({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const operator = await requireOperator();
  const workspace = workspaceFrom((await searchParams).workspace);
  const inbox = await nodeService.inbox(workspace);

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow="Human review / provenance required"
        title="Knowledge inbox"
        description="Approve editorial usefulness, edit atomic statements, or reject weak proposals. Approval activates knowledge; it never upgrades factual verification."
      />

      <section className="space-y-4">
        <SectionHeader eyebrow="Node proposals" title={`${inbox.nodes.length} awaiting judgment`} />

        {inbox.nodes.length ? (
          <div className="space-y-5">
            {inbox.nodes.map((node) => {
              const provenance = (node.provenance ?? []) as Array<Record<string, unknown>>;
              const extraction = (node.metadata.extraction ?? {}) as Record<string, unknown>;
              const duplicates = (extraction.duplicate_candidates ?? []) as string[];
              const contradictions = (extraction.potential_contradictions ?? []) as string[];

              return (
                <Surface
                  as="article"
                  className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_300px]"
                  key={node.id}
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <TrustBadge kind="origin" value={node.origin} />
                      <TrustBadge kind="verification" value={node.verification} />
                      <TrustBadge kind="lifecycle" value={node.lifecycle_status} />
                      <TrustBadge kind="sensitivity" value={node.sensitivity} />
                    </div>

                    <div className="space-y-3">
                      <h2 className="font-serif text-3xl leading-none tracking-tight text-slate-950">
                        {node.title}
                      </h2>
                      <p className="font-serif text-2xl leading-tight tracking-tight text-slate-900">
                        {node.canonical_statement}
                      </p>
                      <p className="text-sm leading-6 text-slate-600">
                        {node.type.replaceAll("_", " ")} · confidence {node.confidence.toFixed(2)} ·
                        version {node.current_version}
                      </p>
                    </div>

                    {duplicates.length || contradictions.length ? (
                      <p className="rounded-[14px] border border-amber-200/90 bg-amber-50/75 px-4 py-3 text-sm leading-6 text-amber-800">
                        {duplicates.length ? `${duplicates.length} possible duplicate(s). ` : ""}
                        {contradictions.length
                          ? `${contradictions.length} potential contradiction(s).`
                          : ""}
                      </p>
                    ) : null}

                    <div className="space-y-3">
                      {provenance.map((reference, index) => (
                        <details
                          className="rounded-[16px] border border-[#e2dacd] bg-[#f6f1e8] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]"
                          key={`${String(reference.source_id)}-${index}`}
                        >
                          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                            {String(reference.source_system)}:{String(reference.external_id)}:v
                            {String(reference.source_version)}
                          </summary>
                          <p className="mt-3 border-l-2 border-[#ccb287] pl-4 text-sm leading-6 text-slate-700">
                            “{String(reference.excerpt)}”
                          </p>
                          <div className="mt-3 max-h-48 overflow-auto border-t border-[#ddd5c9] pt-3 text-sm leading-6 text-slate-600 whitespace-pre-wrap">
                            {String(reference.content)}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>

                  <aside
                    aria-label={`Review ${node.title}`}
                    className="space-y-4 border-t border-[#ddd5c9] pt-6 xl:border-t-0 xl:border-l xl:border-[#ddd5c9] xl:pl-6 xl:pt-0"
                  >
                    <Link
                      className={cn(
                        buttonVariants({ size: "lg", variant: "outline" }),
                        "w-full border-[#d7d0c5] bg-[#fffdf8]",
                      )}
                      href={`/knowledge/${node.id}?workspace=${workspace}`}
                    >
                      Inspect and edit
                    </Link>

                    <form action={approveNodeAction} className="space-y-3">
                      <input type="hidden" name="workspace_id" value={workspace} />
                      <input type="hidden" name="node_id" value={node.id} />
                      <input
                        type="hidden"
                        name="reason"
                        value="Approved after reviewing source provenance"
                      />
                      <Button className="w-full" size="lg" type="submit">
                        Approve knowledge
                      </Button>
                    </form>

                    <form action={rejectNodeAction} className="space-y-3">
                      <input type="hidden" name="workspace_id" value={workspace} />
                      <input type="hidden" name="node_id" value={node.id} />
                      <label className="block space-y-2 text-sm font-medium text-slate-800">
                        <span>Rejection reason</span>
                        <Input
                          minLength={3}
                          name="reason"
                          placeholder="Why this should not enter memory"
                          required
                        />
                      </label>
                      <Button className="w-full" size="lg" type="submit" variant="destructive">
                        Reject proposal
                      </Button>
                    </form>
                  </aside>
                </Surface>
              );
            })}
          </div>
        ) : (
          <EmptyState
            action={
              <Link
                className={cn(buttonVariants({ size: "lg" }), "px-4")}
                href={`/add?workspace=${workspace}`}
              >
                Add source material
              </Link>
            }
            description="Add source material to create new proposals."
            title="No node proposals are waiting."
          />
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Relationship proposals"
          title={`${inbox.edges.length} typed edges awaiting judgment`}
        />

        {inbox.edges.length ? (
          <Surface className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-[#ddd5c9] bg-[#f5f1e8] hover:bg-[#f5f1e8]">
                  <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    From
                  </TableHead>
                  <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Relationship
                  </TableHead>
                  <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    To
                  </TableHead>
                  <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Supporting provenance
                  </TableHead>
                  <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Review
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inbox.edges.map((edge) => {
                  const sources = (edge.sources ?? []) as Array<Record<string, unknown>>;

                  return (
                    <TableRow className="border-slate-200/70" key={String(edge.id)}>
                      <TableCell className="px-6 py-5 align-top whitespace-normal">
                        {String(edge.source_title)}
                      </TableCell>
                      <TableCell className="px-6 py-5 align-top font-mono text-xs uppercase tracking-[0.16em] whitespace-normal text-[#8b6736]">
                        {String(edge.type)}
                      </TableCell>
                      <TableCell className="px-6 py-5 align-top whitespace-normal">
                        {String(edge.target_title)}
                      </TableCell>
                      <TableCell className="px-6 py-5 align-top whitespace-normal">
                        <div className="space-y-3">
                          {sources.map((source, index) => (
                            <details
                              className="rounded-[16px] border border-[#e2dacd] bg-[#f6f1e8] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]"
                              key={`${String(source.source_id)}-${index}`}
                            >
                              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                                {String(source.source_system)}:{String(source.external_id)}:v
                                {String(source.source_version)}
                              </summary>
                              <p className="mt-3 border-l-2 border-[#ccb287] pl-4 text-sm leading-6 text-slate-700">
                                “{String(source.excerpt)}”
                              </p>
                              <div className="mt-3 max-h-40 overflow-auto border-t border-[#ddd5c9] pt-3 text-sm leading-6 text-slate-600 whitespace-pre-wrap">
                                {String(source.content)}
                              </div>
                            </details>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-5 align-top">
                        <div className="flex flex-col gap-3">
                          <form action={reviewEdgeAction}>
                            <input type="hidden" name="workspace_id" value={workspace} />
                            <input type="hidden" name="edge_id" value={String(edge.id)} />
                            <input type="hidden" name="decision" value="ACTIVE" />
                            <input
                              type="hidden"
                              name="reason"
                              value="Relationship provenance reviewed"
                            />
                            <Button className="w-full" size="sm" type="submit">
                              Approve
                            </Button>
                          </form>
                          <form action={reviewEdgeAction}>
                            <input type="hidden" name="workspace_id" value={workspace} />
                            <input type="hidden" name="edge_id" value={String(edge.id)} />
                            <input type="hidden" name="decision" value="REJECTED" />
                            <input
                              type="hidden"
                              name="reason"
                              value="Relationship rejected during review"
                            />
                            <Button
                              className="w-full"
                              size="sm"
                              type="submit"
                              variant="destructive"
                            >
                              Reject
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Surface>
        ) : (
          <EmptyState
            description="Proposed edges appear after structured extraction."
            title="No relationship proposals."
          />
        )}
      </section>
    </AdminShell>
  );
}
