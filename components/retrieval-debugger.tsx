"use client";

import { useActionState } from "react";
import { debugRetrievalAction, type RetrievalActionState } from "@/app/actions";
import { NODE_TYPES, VERIFICATION_LEVELS } from "@/src/domain/enums";
import { TrustBadge } from "@/components/trust-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState, SectionHeader, Surface } from "@/components/ui/workspace";
import { Textarea } from "@/components/ui/textarea";

const initialState: RetrievalActionState = {};

export function RetrievalDebugger({ workspace }: { workspace: string }) {
  const [state, action, pending] = useActionState(debugRetrievalAction, initialState);
  const result = state.result;

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Surface className="h-fit p-6 xl:sticky xl:top-24">
        <div className="space-y-6">
          <SectionHeader eyebrow="Retrieval constraints" title="Activate working memory" />

          <form action={action} className="space-y-5">
            <input type="hidden" name="workspace_id" value={workspace} />

            <label className="block space-y-2 text-sm font-medium text-slate-800">
              <span>Query</span>
              <Textarea
                className="min-h-[180px] bg-white/90 p-4 leading-7"
                defaultValue="How should we explain explainability in regulated systems?"
                name="query"
                required
              />
            </label>

            <label className="block space-y-2 text-sm font-medium text-slate-800">
              <span>Purpose</span>
              <Input defaultValue="Prepare a new LinkedIn draft" name="purpose" required />
            </label>

            <label className="block space-y-2 text-sm font-medium text-slate-800">
              <span>Audience</span>
              <Input defaultValue="Technology leaders in regulated industries" name="audience" />
            </label>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>Maximum sensitivity</span>
                <NativeSelect name="maximum_sensitivity" defaultValue="INTERNAL">
                  <option>PUBLIC</option>
                  <option>INTERNAL</option>
                  <option>CONFIDENTIAL</option>
                  <option>RESTRICTED</option>
                </NativeSelect>
              </label>

              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>Graph depth</span>
                <NativeSelect name="maximum_graph_depth" defaultValue="2">
                  <option value="0">0</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </NativeSelect>
              </label>

              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>Result limit</span>
                <Input defaultValue="12" max="50" min="1" name="result_limit" type="number" />
              </label>

              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>Token budget</span>
                <Input defaultValue="1800" max="32000" min="64" name="token_budget" type="number" />
              </label>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Allowed verification
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {VERIFICATION_LEVELS.map((value) => (
                  <label
                    className="flex items-center gap-3 border border-[#dce3ed] bg-white px-3 py-3 text-sm font-medium text-slate-700"
                    key={value}
                  >
                    <input
                      className="size-4 accent-[#3557ff]"
                      defaultChecked
                      name="allowed_verification_levels"
                      type="checkbox"
                      value={value}
                    />
                    {value.replaceAll("_", " ")}
                  </label>
                ))}
              </div>
            </div>

            <details className="border border-[#e1e7f0] bg-[#f7f9fc] p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                Limit node types
              </summary>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {NODE_TYPES.map((value) => (
                  <label
                    className="flex items-center gap-3 border border-[#dce3ed] bg-white px-3 py-3 text-sm font-medium text-slate-700"
                    key={value}
                  >
                    <input
                      className="size-4 accent-[#3557ff]"
                      name="desired_node_types"
                      type="checkbox"
                      value={value}
                    />
                    {value.replaceAll("_", " ")}
                  </label>
                ))}
              </div>
            </details>

            <Button className="w-full" disabled={pending} size="lg" type="submit">
              {pending ? "Activating…" : "Run retrieval"}
            </Button>
          </form>
        </div>
      </Surface>

      <section aria-live="polite" className="space-y-6">
        {state.error ? (
          <div className="border border-rose-200 bg-rose-50 px-4 py-4 text-sm leading-6 text-rose-700">
            {state.error}
          </div>
        ) : null}

        {!result ? (
          <EmptyState
            description="Submit a query to inspect fused seeds, graph paths, trust-aware scores, and the bounded context pack."
            title="No retrieval run yet."
          />
        ) : (
          <>
            <Surface className="p-6">
              <SectionHeader
                eyebrow={`Seed fusion / ${
                  result.embedding_available ? "semantic + lexical" : "lexical fallback"
                }`}
                title={`${result.seed_results.length} fused seeds`}
              />
              <ul className="mt-6 space-y-4">
                {result.seed_results.map((seed) => (
                  <li
                    className="border border-[#e1e7f0] bg-[#f7f9fc] px-4 py-4"
                    key={String(seed.node_id)}
                  >
                    <p className="font-mono text-sm text-slate-900">{String(seed.node_id)}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      fused {Number(seed.fused_score).toFixed(4)} · semantic{" "}
                      {Number(seed.semantic_score).toFixed(4)} · lexical{" "}
                      {Number(seed.lexical_score).toFixed(4)}
                    </p>
                  </li>
                ))}
              </ul>
            </Surface>

            <Surface className="p-6">
              <SectionHeader
                eyebrow="Selected context / inspectable scoring"
                title={`${result.items.length} recalled nodes`}
              />
              <ol className="mt-6 space-y-4">
                {result.items.map((item) => (
                  <li className="border border-[#e1e7f0] bg-[#f7f9fc] p-5" key={item.node_id}>
                    <div className="flex flex-wrap gap-2">
                      <TrustBadge kind="origin" value={item.trust.origin} />
                      <TrustBadge kind="verification" value={item.trust.verification} />
                      <TrustBadge kind="sensitivity" value={item.sensitivity} />
                    </div>
                    <p className="mt-4 font-serif text-2xl leading-tight tracking-tight text-slate-950">
                      {item.canonical_statement}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      Why: {item.why_recalled}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#3557ff]">
                      {item.graph_path.node_ids.map((id, index) => (
                        <span
                          className="border border-[#cfd9ee] bg-[#f3f6ff] px-3 py-1"
                          key={`${id}-${index}`}
                        >
                          {index ? `${item.graph_path.edge_types[index - 1]} → ` : ""}
                          {id.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                    <div className="mt-5 space-y-3">
                      {Object.entries(item.score_components).map(([key, value]) => (
                        <div
                          className="grid gap-2 text-sm text-slate-600 md:grid-cols-[180px_minmax(0,1fr)_60px] md:items-center"
                          key={key}
                        >
                          <span className="capitalize">{key.replaceAll("_", " ")}</span>
                          <span className="h-2 overflow-hidden bg-[#dce3ed]">
                            <span
                              className="block h-full bg-[#3557ff]"
                              style={{
                                width: `${Math.max(0, Math.min(100, Number(value) * 100))}%`,
                              }}
                            />
                          </span>
                          <span className="font-mono text-slate-900">
                            {Number(value).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {item.contradicting_nodes.length ? (
                      <p className="mt-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                        Contradiction retained:{" "}
                        {item.contradicting_nodes
                          .map((node) => node.canonical_statement)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </Surface>

            <Surface className="overflow-hidden border-[#242b37] bg-[#11151d] text-slate-100">
              <div className="border-b border-white/8 px-6 py-5">
                <SectionHeader eyebrow="Working-memory contract" title="Model-ready context pack" />
              </div>
              <pre className="max-h-[520px] overflow-auto px-6 py-6 text-[12px] leading-6 text-slate-200">
                {JSON.stringify(result.context_pack, null, 2)}
              </pre>
            </Surface>
          </>
        )}
      </section>
    </div>
  );
}
