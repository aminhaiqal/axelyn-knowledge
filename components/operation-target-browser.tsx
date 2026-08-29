import Link from "next/link";
import type { KnowledgeOperation } from "@/src/domain/enums";
import type { KnowledgeNode } from "@/src/domain/models";
import { cn } from "@/lib/utils";
import { TrustBadge } from "@/components/trust-badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Surface } from "@/components/ui/workspace";

export function OperationTargetBrowser({
  items,
  operation,
  query,
  workspace,
}: {
  items: KnowledgeNode[];
  operation: Exclude<KnowledgeOperation, "INSERT">;
  query: string;
  workspace: string;
}) {
  const verb = operation === "CHALLENGE" ? "Challenge" : "Extend";
  const view = operation === "CHALLENGE" ? "challenge" : "extend";
  return (
    <div className="space-y-6">
      <Surface className="bg-white p-5 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(240px,0.55fr)_minmax(0,1.45fr)] lg:items-end">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#3557ff]">
              01 / Retrieve a target
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
              Find existing knowledge.
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-500">
              The target stays intact. One separate {operation} record is created and linked back to
              it.
            </p>
          </div>
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" method="get">
            <input name="workspace" type="hidden" value={workspace} />
            <input name="view" type="hidden" value={view} />
            <label className="block space-y-2 text-sm font-medium text-slate-800">
              <span>Search statements</span>
              <Input defaultValue={query} name="query" placeholder="What should be tested?" />
            </label>
            <button className={cn(buttonVariants({ size: "lg" }), "shrink-0")} type="submit">
              Retrieve knowledge
            </button>
          </form>
        </div>
      </Surface>

      <section className="space-y-3">
        <div className="grid grid-cols-[112px_minmax(0,1fr)_auto] border border-[#dce3ed] bg-[#f7f9fc] px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>Operation</span>
          <span>Knowledge</span>
          <span>Action</span>
        </div>
        {items.length ? (
          items.map((node) => (
            <article
              className="grid gap-4 border border-[#dce3ed] bg-[#fcfcfd] p-5 md:grid-cols-[112px_minmax(0,1fr)_auto] md:items-center"
              key={node.id}
            >
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {node.operation}
              </span>
              <div>
                <p className="text-base font-semibold tracking-tight text-slate-950">
                  {node.canonical_statement}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#3557ff]">
                    {node.type}
                  </span>
                  <TrustBadge kind="verification" value={node.verification} />
                </div>
              </div>
              <Link
                className={cn(buttonVariants({ size: "sm", variant: "outline" }), "shrink-0")}
                href={`/knowledge/${node.id}?workspace=${workspace}&mode=${operation}#operation`}
              >
                {verb}
              </Link>
            </article>
          ))
        ) : (
          <EmptyState
            description="Try a broader phrase or insert source material first."
            title="No active knowledge matches."
          />
        )}
      </section>
    </div>
  );
}
