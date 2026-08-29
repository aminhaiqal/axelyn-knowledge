"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  runKnowledgeOperationAction,
  type KnowledgeOperationActionState,
} from "@/app/operations/actions";
import type { Sensitivity } from "@/src/domain/enums";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initialState: KnowledgeOperationActionState = { status: "idle" };

export function KnowledgeOperationPanel({
  initialOperation,
  target,
  workspace,
}: {
  initialOperation: "CHALLENGE" | "EXTEND";
  target: {
    id: string;
    title: string;
    operation: string;
    type: string;
    sensitivity: Sensitivity;
  };
  workspace: string;
}) {
  const [operation, setOperation] = useState<"CHALLENGE" | "EXTEND">(initialOperation);
  const [state, action, pending] = useActionState(runKnowledgeOperationAction, initialState);
  const isChallenge = operation === "CHALLENGE";

  return (
    <section className="border border-[#242b37] bg-[#11151d] text-slate-100" id="operation">
      <div className="border-b border-white/10 px-6 py-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6f87ff]">
          One target / one generated operation
        </p>
        <h2 className="mt-3 font-serif text-3xl leading-none tracking-tight">
          Work on this knowledge.
        </h2>
      </div>

      <div className="grid grid-cols-3 border-b border-white/10">
        <Link
          className="border-r border-white/10 px-3 py-4 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-white"
          href={`/?workspace=${workspace}&view=insert`}
        >
          Insert
        </Link>
        {(["CHALLENGE", "EXTEND"] as const).map((value) => (
          <button
            aria-pressed={operation === value}
            className={cn(
              "border-r border-white/10 px-3 py-4 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors last:border-r-0",
              operation === value
                ? "bg-[#3557ff] text-white"
                : "text-slate-400 hover:bg-white/[0.04] hover:text-white",
            )}
            key={value}
            onClick={() => setOperation(value)}
            type="button"
          >
            {value}
          </button>
        ))}
      </div>

      <form action={action} className="space-y-5 p-6">
        <input name="workspace_id" type="hidden" value={workspace} />
        <input name="target_node_id" type="hidden" value={target.id} />
        <input name="operation" type="hidden" value={operation} />
        <input name="maximum_sensitivity" type="hidden" value={target.sensitivity} />

        <div className="border border-white/10 bg-white/[0.03] px-4 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Target · {target.operation} / {target.type}
          </p>
          <p className="mt-2 text-sm font-semibold text-white">{target.title}</p>
        </div>

        <label className="block space-y-2 text-sm font-medium text-slate-200">
          <span>{isChallenge ? "What should be tested?" : "How should this be extended?"}</span>
          <Textarea
            className="min-h-[170px] border-white/14 bg-[#171c25] p-4 text-slate-100 placeholder:text-slate-600 focus-visible:border-[#6f87ff] focus-visible:ring-[#3557ff]/20"
            key={operation}
            maxLength={2000}
            minLength={3}
            name="instruction"
            placeholder={
              isChallenge
                ? "Test the assumptions, look for counterevidence, and state what would change the conclusion."
                : "Find a useful implication, connection, or argument that is not already stated."
            }
            required
          />
        </label>

        <p className="text-xs leading-6 text-slate-500">
          The system retrieves bounded context first. The model must show support, opposition,
          uncertainty, and evidence gaps. The result remains unverified.
        </p>

        {state.message ? (
          <div
            aria-live="polite"
            className={cn(
              "border px-4 py-4 text-sm leading-6",
              state.status === "success"
                ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-200"
                : "border-rose-700/60 bg-rose-950/30 text-rose-200",
            )}
          >
            <p>{state.message}</p>
            {state.status === "success" && state.nodeId ? (
              <div className="mt-3 space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400">
                  {state.operation} / {state.type} · {state.assessment} · {state.model}
                </p>
                <Link
                  className={cn(
                    buttonVariants({ size: "sm", variant: "outline" }),
                    "border-emerald-700/60 bg-transparent text-emerald-100 hover:bg-emerald-950/40 hover:text-white",
                  )}
                  href={`/knowledge/${state.nodeId}?workspace=${workspace}`}
                >
                  Open result
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        <Button className="w-full" disabled={pending} size="lg" type="submit">
          {pending ? `Running ${operation.toLowerCase()}…` : `Run ${operation.toLowerCase()}`}
        </Button>
      </form>
    </section>
  );
}
