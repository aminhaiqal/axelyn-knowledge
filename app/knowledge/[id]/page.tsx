import Link from "next/link";
import { archiveNodeAction, editNodeAction, mergeNodeAction } from "@/app/actions";
import { requireOperator } from "@/src/auth/operator-auth";
import { SENSITIVITY_LEVELS, VERIFICATION_LEVELS } from "@/src/domain/enums";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { KnowledgeOperationPanel } from "@/components/knowledge-operation-panel";
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
  searchParams: Promise<{ workspace?: string; mode?: string }>;
}) {
  const operator = await requireOperator();
  const resolvedSearchParams = await searchParams;
  const workspace = workspaceFrom(resolvedSearchParams.workspace);
  const { id } = await params;
  const node = await nodeService.get(workspace, id);
  const initialOperation = resolvedSearchParams.mode === "EXTEND" ? "EXTEND" : "CHALLENGE";
  const operationResult =
    node.metadata.operation_result && typeof node.metadata.operation_result === "object"
      ? (node.metadata.operation_result as Record<string, unknown>)
      : null;
  const evidenceGaps =
    operationResult && Array.isArray(operationResult.evidence_gaps)
      ? operationResult.evidence_gaps.map(String)
      : [];

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow={`${node.operation} / ${node.type.replaceAll("_", " ")} / version ${node.current_version}`}
        title={node.title}
        description="One atomic memory with its trust state, immutable provenance, revision trail, graph neighborhood, and usage history."
        actions={
          <Link
            className={cn(buttonVariants({ size: "lg", variant: "outline" }), "px-4")}
            href={`/memory-map?workspace=${workspace}&node_id=${node.id}`}
          >
            Open neighborhood
          </Link>
        }
      />

      <div className="space-y-6">
        <Surface className="p-6 sm:p-8">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <span className="border border-[#cfd9ee] bg-[#f3f6ff] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#3557ff]">
                {node.operation}
              </span>
              <TrustBadge kind="origin" value={node.origin} />
              <TrustBadge kind="verification" value={node.verification} />
              <TrustBadge kind="lifecycle" value={node.lifecycle_status} />
              <TrustBadge kind="sensitivity" value={node.sensitivity} />
            </div>

            <blockquote className="border-l-[3px] border-[#3557ff] pl-6 font-serif text-3xl leading-tight tracking-tight text-slate-950 sm:text-4xl">
              {node.canonical_statement}
            </blockquote>

            {operationResult ? (
              <section className="border border-[#dce3ed] bg-[#f7f9fc] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce3ed] pb-4">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#3557ff]">
                      Generated judgment
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                      {String(operationResult.assessment ?? "Assessment unavailable")}
                    </h2>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    {String(operationResult.model ?? "Unknown model")}
                  </span>
                </div>
                <dl className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="border border-[#dce3ed] bg-white p-4">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Supporting case
                    </dt>
                    <dd className="mt-2 text-sm leading-6 text-slate-700">
                      {String(operationResult.supporting_analysis ?? "Not supplied")}
                    </dd>
                  </div>
                  <div className="border border-[#dce3ed] bg-white p-4">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Opposing case
                    </dt>
                    <dd className="mt-2 text-sm leading-6 text-slate-700">
                      {String(operationResult.opposing_analysis ?? "Not supplied")}
                    </dd>
                  </div>
                  <div className="border border-[#dce3ed] bg-white p-4 md:col-span-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Uncertainty
                    </dt>
                    <dd className="mt-2 text-sm leading-6 text-slate-700">
                      {String(operationResult.uncertainty ?? "Not supplied")}
                    </dd>
                  </div>
                  <div className="border border-[#dce3ed] bg-white p-4 md:col-span-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Evidence gaps
                    </dt>
                    <dd className="mt-2 text-sm leading-6 text-slate-700">
                      {evidenceGaps.length ? (
                        <ul className="list-disc space-y-1 pl-5">
                          {evidenceGaps.map((gap) => (
                            <li key={gap}>{gap}</li>
                          ))}
                        </ul>
                      ) : (
                        "No evidence gaps supplied."
                      )}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Confidence", node.confidence.toFixed(2)],
                ["Importance", node.importance.toFixed(2)],
                ["Salience", node.salience.toFixed(2)],
                ["Usefulness", node.usefulness_score.toFixed(2)],
              ].map(([label, value]) => (
                <div className="border border-[#e1e7f0] bg-[#f7f9fc] p-4" key={label}>
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
              <details className="border border-[#e1e7f0] bg-[#f7f9fc] p-4" open>
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Provenance ({node.provenance.length})
                </summary>
                {node.provenance.length ? (
                  <div className="mt-4 space-y-3">
                    {node.provenance.map((reference) => (
                      <div
                        className="border border-[#dce3ed] bg-white p-4"
                        key={`${String(reference.source_id)}-${String(reference.excerpt)}`}
                      >
                        <strong className="block text-sm text-slate-900">
                          {String(reference.source_system)}:{String(reference.external_id)}:v
                          {String(reference.source_version)}
                        </strong>
                        <p className="mt-3 border-l-2 border-[#3557ff] pl-4 text-sm leading-6 text-slate-700">
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

              <details className="border border-[#e1e7f0] bg-[#f7f9fc] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Version history ({node.versions.length})
                </summary>
                <ol className="mt-4 space-y-3">
                  {node.versions.map((version) => (
                    <li className="border border-[#dce3ed] bg-white p-4" key={String(version.id)}>
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

              <details className="border border-[#e1e7f0] bg-[#f7f9fc] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Relationships ({node.relationships.length})
                </summary>
                <ul className="mt-4 space-y-3">
                  {node.relationships.map((edge) => (
                    <li className="border border-[#dce3ed] bg-white p-4" key={String(edge.id)}>
                      <span className="font-mono text-xs uppercase tracking-[0.16em] text-[#3557ff]">
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

              <details className="border border-[#e1e7f0] bg-[#f7f9fc] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Contradictions ({node.contradictions.length})
                </summary>
                <ul className="mt-4 space-y-3">
                  {node.contradictions.map((edge) => (
                    <li
                      className="border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700"
                      key={String(edge.id)}
                    >
                      {String(edge.source_title)} contradicts {String(edge.target_title)}
                    </li>
                  ))}
                </ul>
              </details>

              <details className="border border-[#e1e7f0] bg-[#f7f9fc] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Usage history ({node.usage.length})
                </summary>
                <ul className="mt-4 space-y-3">
                  {node.usage.slice(0, 30).map((usage) => (
                    <li className="border border-[#dce3ed] bg-white p-4" key={String(usage.id)}>
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

        <section aria-label="Knowledge actions" className="space-y-6">
          <KnowledgeOperationPanel
            initialOperation={initialOperation}
            target={{
              id: node.id,
              title: node.title,
              operation: node.operation,
              type: node.type,
              sensitivity: node.sensitivity,
            }}
            workspace={workspace}
          />

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
                  className="min-h-[220px]"
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

              <Button className="w-full" size="lg" type="submit">
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

              <Button className="w-full" size="lg" type="submit" variant="outline">
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
              <Button className="w-full" size="lg" type="submit" variant="destructive">
                Archive node
              </Button>
            </form>
          </Surface>
        </section>
      </div>
    </AdminShell>
  );
}
