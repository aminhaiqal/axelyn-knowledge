import Link from "next/link";
import { archiveNodeAction, editNodeAction, mergeNodeAction } from "@/app/actions";
import { requireOperator } from "@/src/auth/operator-auth";
import { SENSITIVITY_LEVELS, VERIFICATION_LEVELS } from "@/src/domain/enums";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";
import { TrustBadge } from "@/components/trust-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader, Surface } from "@/components/ui/workspace";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NodeDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const operator = await requireOperator();
  const workspace = workspaceFrom((await searchParams).workspace);
  const { id } = await params;
  const node = await nodeService.get(workspace, id);

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow={`${node.type.replaceAll("_", " ")} / version ${node.current_version}`}
        title={node.title}
        description="One atomic memory with its trust state, immutable provenance, revision trail, graph neighborhood, and usage history."
        actions={
          <Link
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "rounded-full border-slate-200 bg-white/80 px-4",
            )}
            href={`/memory-map?workspace=${workspace}&node_id=${node.id}`}
          >
            Open neighborhood
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
        <Surface className="p-6 sm:p-8">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <TrustBadge kind="origin" value={node.origin} />
              <TrustBadge kind="verification" value={node.verification} />
              <TrustBadge kind="lifecycle" value={node.lifecycle_status} />
              <TrustBadge kind="sensitivity" value={node.sensitivity} />
            </div>

            <blockquote className="border-l-4 border-cyan-200 pl-6 font-serif text-3xl leading-tight tracking-tight text-slate-950 sm:text-4xl">
              {node.canonical_statement}
            </blockquote>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Confidence", node.confidence.toFixed(2)],
                ["Importance", node.importance.toFixed(2)],
                ["Salience", node.salience.toFixed(2)],
                ["Usefulness", node.usefulness_score.toFixed(2)],
              ].map(([label, value]) => (
                <div
                  className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4"
                  key={label}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    {label}
                  </p>
                  <p className="mt-3 font-mono text-xl text-slate-950">{value}</p>
                </div>
              ))}
            </div>

            <p className="text-sm leading-7 text-slate-600">
              Created by {node.created_by} · last changed by {node.updated_by} · {node.updated_at}
            </p>

            <div className="space-y-3">
              <details
                className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4"
                open
              >
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Provenance ({node.provenance.length})
                </summary>
                {node.provenance.length ? (
                  <div className="mt-4 space-y-3">
                    {node.provenance.map((reference) => (
                      <div
                        className="rounded-[20px] border border-slate-200/80 bg-white/85 p-4"
                        key={`${String(reference.source_id)}-${String(reference.excerpt)}`}
                      >
                        <strong className="block text-sm text-slate-900">
                          {String(reference.source_system)}:{String(reference.external_id)}:v
                          {String(reference.source_version)}
                        </strong>
                        <p className="mt-3 border-l-2 border-cyan-200 pl-4 text-sm leading-6 text-slate-700">
                          “{String(reference.excerpt)}”
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    No immutable source is linked to this operator-authored node.
                  </p>
                )}
              </details>

              <details className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Version history ({node.versions.length})
                </summary>
                <ol className="mt-4 space-y-3">
                  {node.versions.map((version) => (
                    <li
                      className="rounded-[20px] border border-slate-200/80 bg-white/85 p-4"
                      key={String(version.id)}
                    >
                      <strong className="block text-sm text-slate-900">
                        v{String(version.version)} · {String(version.change_reason)}
                      </strong>
                      <div className="mt-2 text-sm leading-6 text-slate-700">
                        {String(version.canonical_statement)}
                      </div>
                      <span className="mt-2 block text-sm text-slate-500">
                        {String(version.changed_by)} ·{" "}
                        {new Date(String(version.changed_at)).toISOString()}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>

              <details className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Relationships ({node.relationships.length})
                </summary>
                <ul className="mt-4 space-y-3">
                  {node.relationships.map((edge) => (
                    <li
                      className="rounded-[20px] border border-slate-200/80 bg-white/85 p-4"
                      key={String(edge.id)}
                    >
                      <span className="font-mono text-xs uppercase tracking-[0.16em] text-cyan-700">
                        {String(edge.direction)} · {String(edge.type)}
                      </span>
                      <div className="mt-2 text-sm leading-6 text-slate-700">
                        {String(edge.source_title)} → {String(edge.target_title)}
                      </div>
                      <span className="mt-2 block text-sm text-slate-500">
                        strength {Number(edge.strength).toFixed(2)} · confidence{" "}
                        {Number(edge.confidence).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>

              <details className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Contradictions ({node.contradictions.length})
                </summary>
                <ul className="mt-4 space-y-3">
                  {node.contradictions.map((edge) => (
                    <li
                      className="rounded-[20px] border border-rose-200/80 bg-rose-50/80 p-4 text-sm leading-6 text-rose-700"
                      key={String(edge.id)}
                    >
                      {String(edge.source_title)} contradicts {String(edge.target_title)}
                    </li>
                  ))}
                </ul>
              </details>

              <details className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Usage history ({node.usage.length})
                </summary>
                <ul className="mt-4 space-y-3">
                  {node.usage.slice(0, 30).map((usage) => (
                    <li
                      className="rounded-[20px] border border-slate-200/80 bg-white/85 p-4"
                      key={String(usage.id)}
                    >
                      <strong className="block text-sm text-slate-900">
                        {String(usage.outcome)}
                      </strong>
                      <span className="mt-2 block text-sm text-slate-500">
                        {String(usage.reported_by)} · reinforcement{" "}
                        {Number(usage.reinforcement_delta).toFixed(3)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
        </Surface>

        <aside className="space-y-6">
          <Surface className="p-6">
            <SectionHeader
              eyebrow={`Correction creates v${node.current_version + 1}`}
              title="Edit current knowledge"
            />

            <form action={editNodeAction} className="mt-6 space-y-4">
              <input type="hidden" name="workspace_id" value={workspace} />
              <input type="hidden" name="node_id" value={node.id} />
              <input type="hidden" name="expected_version" value={node.current_version} />

              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>Title</span>
                <Input defaultValue={node.title} name="title" required />
              </label>

              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>Atomic statement</span>
                <Textarea
                  className="min-h-[220px] rounded-[24px]"
                  defaultValue={node.canonical_statement}
                  name="canonical_statement"
                  required
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>Verification</span>
                <NativeSelect name="verification" defaultValue={node.verification}>
                  {VERIFICATION_LEVELS.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </NativeSelect>
              </label>

              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>Sensitivity</span>
                <NativeSelect name="sensitivity" defaultValue={node.sensitivity}>
                  {SENSITIVITY_LEVELS.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </NativeSelect>
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block space-y-2 text-sm font-medium text-slate-800">
                  <span>Confidence</span>
                  <Input
                    defaultValue={node.confidence}
                    max="1"
                    min="0"
                    name="confidence"
                    step="0.01"
                    type="number"
                  />
                </label>

                <label className="block space-y-2 text-sm font-medium text-slate-800">
                  <span>Importance</span>
                  <Input
                    defaultValue={node.importance}
                    max="1"
                    min="0"
                    name="importance"
                    step="0.01"
                    type="number"
                  />
                </label>

                <label className="block space-y-2 text-sm font-medium text-slate-800">
                  <span>Salience</span>
                  <Input
                    defaultValue={node.salience}
                    max="1"
                    min="0"
                    name="salience"
                    step="0.01"
                    type="number"
                  />
                </label>
              </div>

              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>Change reason</span>
                <Input
                  minLength={3}
                  name="change_reason"
                  placeholder="Correction or review rationale"
                  required
                />
              </label>

              <Button className="w-full rounded-full" size="lg" type="submit">
                Save new version
              </Button>
            </form>
          </Surface>

          <Surface className="p-6">
            <SectionHeader
              eyebrow="Conservative consolidation"
              title="Merge into another node"
              description="Contradictory nodes are blocked. Provenance, aliases, and edges are retained."
            />

            <form action={mergeNodeAction} className="mt-6 space-y-4">
              <input type="hidden" name="workspace_id" value={workspace} />
              <input type="hidden" name="source_node_id" value={node.id} />
              <input type="hidden" name="expected_source_version" value={node.current_version} />

              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>Target node UUID</span>
                <Input name="target_node_id" pattern="[0-9a-fA-F-]{36}" required />
              </label>

              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>Target version</span>
                <Input min="1" name="expected_target_version" required type="number" />
              </label>

              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>Merge rationale</span>
                <Input minLength={3} name="reason" required />
              </label>

              <Button className="w-full rounded-full" size="lg" type="submit" variant="outline">
                Merge after review
              </Button>
            </form>
          </Surface>

          <Surface className="p-6">
            <SectionHeader
              eyebrow="Lifecycle only"
              title="Archive knowledge"
              description="Archival removes the node from active retrieval without erasing history."
            />

            <form action={archiveNodeAction} className="mt-6">
              <input type="hidden" name="workspace_id" value={workspace} />
              <input type="hidden" name="node_id" value={node.id} />
              <input type="hidden" name="reason" value="Archived by operator from node detail" />
              <Button className="w-full rounded-full" size="lg" type="submit" variant="destructive">
                Archive node
              </Button>
            </form>
          </Surface>
        </aside>
      </div>
    </AdminShell>
  );
}
