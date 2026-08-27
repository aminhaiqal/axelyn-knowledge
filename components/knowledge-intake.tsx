"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { addKnowledgeSourceAction, type KnowledgeIntakeState } from "@/app/add/actions";
import { SENSITIVITY_LEVELS } from "@/src/domain/enums";
import { ACCEPTED_FILE_TYPES, MAX_UPLOAD_BYTES } from "@/src/domain/intake";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Surface } from "@/components/ui/workspace";
import { Textarea } from "@/components/ui/textarea";

type IntakeKind = "text" | "file" | "website";

const channels: Array<{
  id: IntakeKind;
  symbol: string;
  label: string;
  detail: string;
  actionLabel: string;
}> = [
  {
    id: "text",
    symbol: "T",
    label: "Paste text",
    detail: "Notes, transcripts, or drafts",
    actionLabel: "Import text",
  },
  {
    id: "file",
    symbol: "↑",
    label: "Upload a file",
    detail: "PDF and common text files",
    actionLabel: "Import file",
  },
  {
    id: "website",
    symbol: "↗",
    label: "Import a website",
    detail: "One public page or PDF link",
    actionLabel: "Import website",
  },
];

const initialState: KnowledgeIntakeState = { status: "idle" };

export function KnowledgeIntake({ workspace }: { workspace: string }) {
  const [kind, setKind] = useState<IntakeKind>("text");
  const [sensitivity, setSensitivity] = useState("INTERNAL");
  const [state, formAction, pending] = useActionState(addKnowledgeSourceAction, initialState);
  const selected = channels.find((channel) => channel.id === kind)!;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
      <Surface className="overflow-hidden">
        <div className="border-b border-slate-200/80 px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-700/70">
                Choose source material
              </p>
              <h2 className="font-serif text-3xl leading-none tracking-tight text-slate-950 sm:text-4xl">
                What do you want the system to learn from?
              </h2>
            </div>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
              Source 01
            </span>
          </div>
        </div>

        <div className="space-y-6 p-6 sm:p-8">
          <div className="grid gap-3 md:grid-cols-3" aria-label="Source type">
            {channels.map((channel) => (
              <Button
                aria-pressed={kind === channel.id}
                className={cn(
                  "h-auto min-h-28 w-full justify-start rounded-[26px] px-4 py-4 text-left shadow-none",
                  kind === channel.id
                    ? "border-cyan-400/30 bg-cyan-500/10 text-slate-950 hover:bg-cyan-500/12"
                    : "border-slate-200/80 bg-slate-50/80 text-slate-700 hover:bg-white",
                )}
                key={channel.id}
                onClick={() => setKind(channel.id)}
                type="button"
                variant={kind === channel.id ? "secondary" : "outline"}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white/90 font-mono text-xs tracking-[0.2em] text-cyan-700">
                  {channel.symbol}
                </span>
                <span className="space-y-2">
                  <span className="block text-sm font-semibold tracking-tight">
                    {channel.label}
                  </span>
                  <span className="block text-xs leading-5 text-slate-500">{channel.detail}</span>
                </span>
              </Button>
            ))}
          </div>

          <form action={formAction} className="space-y-6">
            <input name="workspace_id" type="hidden" value={workspace} />
            <input name="kind" type="hidden" value={kind} />
            <input name="sensitivity" type="hidden" value={sensitivity} />

            {state.status === "error" ? (
              <div
                aria-live="polite"
                className="rounded-[24px] border border-rose-200/80 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700"
              >
                <strong className="font-semibold">Import stopped.</strong> {state.message}
              </div>
            ) : null}

            {state.status === "success" ? (
              <div
                aria-live="polite"
                className={cn(
                  "grid gap-4 rounded-[28px] border px-5 py-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center",
                  state.extractionStatus === "SUCCEEDED"
                    ? "border-emerald-200/80 bg-emerald-50/80"
                    : "border-amber-200/80 bg-amber-50/85",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full text-sm font-bold text-white",
                    state.extractionStatus === "SUCCEEDED" ? "bg-emerald-600" : "bg-amber-600",
                  )}
                >
                  {state.extractionStatus === "SUCCEEDED" ? "✓" : "!"}
                </span>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                    Source receipt
                  </p>
                  <h3 className="font-serif text-2xl tracking-tight text-slate-950">
                    {state.sourceLabel}
                  </h3>
                  <p className="text-sm leading-6 text-slate-600">{state.message}</p>
                  {state.extractionStatus === "SUCCEEDED" ? (
                    <div className="flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      <span>{state.proposedNodes} knowledge proposals</span>
                      <span>{state.proposedEdges} relationship proposals</span>
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-amber-700">{state.extractionMessage}</p>
                  )}
                </div>
                <Link
                  className={cn(
                    buttonVariants({ size: "lg", variant: "outline" }),
                    "rounded-full border-white/70 bg-white/90",
                  )}
                  href={
                    state.extractionStatus === "SUCCEEDED"
                      ? `/inbox?workspace=${workspace}`
                      : `/?workspace=${workspace}`
                  }
                >
                  {state.extractionStatus === "SUCCEEDED" ? "Review proposals" : "View extraction"}
                </Link>
              </div>
            ) : null}

            <label className="block space-y-2 text-sm font-medium text-slate-800">
              <span>
                Source name <span className="text-slate-400">Optional</span>
              </span>
              <Input
                maxLength={240}
                name="label"
                placeholder={
                  kind === "text"
                    ? "e.g. Customer interview — August 2026"
                    : "Override the detected title"
                }
              />
            </label>

            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 p-5">
              {kind === "text" ? (
                <label className="block space-y-3 text-sm font-medium text-slate-800">
                  <span>Paste your material</span>
                  <Textarea
                    autoFocus
                    className="min-h-[260px] rounded-[24px] bg-white/90 p-4 leading-7"
                    minLength={1}
                    name="content"
                    placeholder="Paste notes, an article, a transcript, research, or any other source text here…"
                    required
                  />
                  <span className="block text-sm font-normal leading-6 text-slate-500">
                    The original text is preserved as provenance.
                  </span>
                </label>
              ) : null}

              {kind === "file" ? (
                <label className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-[24px] border border-slate-200/80 bg-white/90 p-6 text-center">
                  <span className="flex size-14 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 font-mono text-lg text-cyan-700">
                    ↑
                  </span>
                  <strong className="font-serif text-3xl leading-none tracking-tight text-slate-950">
                    Choose a document
                  </strong>
                  <span className="max-w-md text-sm leading-6 text-slate-600">
                    PDF, TXT, Markdown, CSV, JSON, or HTML
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Maximum {Math.floor(MAX_UPLOAD_BYTES / 1_000_000)} MB · text-based PDFs only
                  </span>
                  <input
                    accept={ACCEPTED_FILE_TYPES}
                    className="mt-2 block w-full max-w-md rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                    name="file"
                    required
                    type="file"
                  />
                </label>
              ) : null}

              {kind === "website" ? (
                <label className="block space-y-3 text-sm font-medium text-slate-800">
                  <span>Public website URL</span>
                  <div className="rounded-[24px] border border-slate-200 bg-white/90 p-3">
                    <div className="flex items-center gap-3 rounded-[18px] border border-slate-200 bg-white px-3">
                      <span aria-hidden="true" className="font-mono text-xs text-cyan-700">
                        ↗
                      </span>
                      <Input
                        autoFocus
                        className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        name="url"
                        placeholder="https://example.com/article"
                        required
                        type="url"
                      />
                    </div>
                  </div>
                  <span className="block text-sm font-normal leading-6 text-slate-500">
                    Imports one public page. Pages requiring login or browser rendering are not
                    supported.
                  </span>
                </label>
              ) : null}
            </div>

            <div className="flex flex-col gap-4 border-t border-slate-200/80 pt-5 md:flex-row md:items-center md:justify-between">
              <p className="max-w-2xl text-sm leading-7 text-slate-600">
                This creates review proposals. It does not publish knowledge or mark facts as
                verified.
              </p>
              <Button className="rounded-full px-5" disabled={pending} size="lg" type="submit">
                {pending ? "Reading source…" : selected.actionLabel}
              </Button>
            </div>
          </form>
        </div>
      </Surface>

      <Surface className="border-white/8 bg-[#0f1b2f] p-6 text-slate-100 shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200/70">
              Import settings
            </p>
            <h2 className="font-serif text-3xl leading-none tracking-tight">Receipt</h2>
          </div>
          <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
            Intake
          </span>
        </div>

        <dl className="mt-8 space-y-4">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Workspace
            </dt>
            <dd className="text-right font-mono text-xs text-slate-100">{workspace}</dd>
          </div>
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Source
            </dt>
            <dd className="text-right font-mono text-xs text-slate-100">{selected.label}</dd>
          </div>
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Verification
            </dt>
            <dd className="text-right font-mono text-xs text-slate-100">Unverified</dd>
          </div>
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Sensitivity
            </dt>
            <dd className="min-w-[150px]">
              <NativeSelect
                aria-label="Sensitivity"
                className="border-white/14 bg-white/8 text-xs text-slate-100 focus:border-cyan-300/60 focus:ring-cyan-300/12"
                onChange={(event) => setSensitivity(event.target.value)}
                value={sensitivity}
              >
                {SENSITIVITY_LEVELS.map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </NativeSelect>
            </dd>
          </div>
        </dl>

        <div className="mt-8 space-y-5">
          {[
            ["01", "Preserve the source", "Immutable text and provenance"],
            ["02", "Extract atomic ideas", "Claims, evidence, positions, and links"],
            ["03", "Review before activation", "You decide what enters memory"],
          ].map(([step, title, description], index) => (
            <div className="relative flex gap-4 pl-1" key={step}>
              {index < 2 ? (
                <span className="absolute left-[11px] top-8 h-[calc(100%-1rem)] w-px bg-white/12" />
              ) : null}
              <span
                className={cn(
                  "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]",
                  index === 0
                    ? "border-cyan-200/40 bg-cyan-200 text-slate-950"
                    : "border-white/14 bg-[#142033] text-slate-300",
                )}
              >
                {step}
              </span>
              <div className="space-y-1 pb-4">
                <p className="text-sm font-semibold text-slate-100">{title}</p>
                <p className="text-sm leading-6 text-slate-400">{description}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 border-t border-dashed border-white/12 pt-4 text-sm leading-6 text-slate-400">
          Website content is treated as untrusted source material. The importer never follows page
          instructions or crawls linked pages.
        </p>
      </Surface>
    </div>
  );
}
