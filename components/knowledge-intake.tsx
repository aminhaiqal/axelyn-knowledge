"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { addKnowledgeSourceAction, type KnowledgeIntakeState } from "@/app/add/actions";
import { SENSITIVITY_LEVELS } from "@/src/domain/enums";
import { ACCEPTED_FILE_TYPES, MAX_UPLOAD_BYTES } from "@/src/domain/intake";

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
    <div className="intake-workbench">
      <section className="intake-source-panel" aria-labelledby="intake-heading">
        <div className="intake-heading">
          <div>
            <p className="section-label">Choose source material</p>
            <h2 id="intake-heading">What do you want the system to learn from?</h2>
          </div>
          <span className="intake-step">Source 01</span>
        </div>

        <div className="source-channel-tabs" aria-label="Source type">
          {channels.map((channel) => (
            <button
              aria-pressed={kind === channel.id}
              className={kind === channel.id ? "source-channel is-selected" : "source-channel"}
              key={channel.id}
              onClick={() => setKind(channel.id)}
              type="button"
            >
              <span className="source-channel-symbol" aria-hidden="true">
                {channel.symbol}
              </span>
              <span>
                <strong>{channel.label}</strong>
                <small>{channel.detail}</small>
              </span>
            </button>
          ))}
        </div>

        <form action={formAction} className="intake-form">
          <input name="workspace_id" type="hidden" value={workspace} />
          <input name="kind" type="hidden" value={kind} />
          <input name="sensitivity" type="hidden" value={sensitivity} />

          {state.status === "error" ? (
            <div className="error-banner" aria-live="polite">
              <strong>Import stopped.</strong> {state.message}
            </div>
          ) : null}

          {state.status === "success" ? (
            <div
              className={
                state.extractionStatus === "SUCCEEDED"
                  ? "intake-result is-ready"
                  : "intake-result needs-attention"
              }
              aria-live="polite"
            >
              <span className="result-mark" aria-hidden="true">
                {state.extractionStatus === "SUCCEEDED" ? "✓" : "!"}
              </span>
              <div>
                <p className="section-label">Source receipt</p>
                <h3>{state.sourceLabel}</h3>
                <p>{state.message}</p>
                {state.extractionStatus === "SUCCEEDED" ? (
                  <div className="receipt-counts">
                    <span>{state.proposedNodes} knowledge proposals</span>
                    <span>{state.proposedEdges} relationship proposals</span>
                  </div>
                ) : (
                  <p className="receipt-note">{state.extractionMessage}</p>
                )}
              </div>
              <Link
                className="button secondary"
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

          <label className="intake-label-field">
            Source name <span>Optional</span>
            <input
              maxLength={240}
              name="label"
              placeholder={
                kind === "text"
                  ? "e.g. Customer interview — August 2026"
                  : "Override the detected title"
              }
            />
          </label>

          <div className="intake-input-stage">
            {kind === "text" ? (
              <label>
                Paste your material
                <textarea
                  autoFocus
                  className="intake-textarea"
                  minLength={1}
                  name="content"
                  placeholder="Paste notes, an article, a transcript, research, or any other source text here…"
                  required
                />
                <small>The original text is preserved as provenance.</small>
              </label>
            ) : null}

            {kind === "file" ? (
              <label className="file-drop">
                <span className="file-drop-mark" aria-hidden="true">
                  ↑
                </span>
                <strong>Choose a document</strong>
                <span>PDF, TXT, Markdown, CSV, JSON, or HTML</span>
                <small>
                  Maximum {Math.floor(MAX_UPLOAD_BYTES / 1_000_000)} MB · text-based PDFs only
                </small>
                <input accept={ACCEPTED_FILE_TYPES} name="file" required type="file" />
              </label>
            ) : null}

            {kind === "website" ? (
              <label>
                Public website URL
                <div className="url-field">
                  <span aria-hidden="true">↗</span>
                  <input
                    autoFocus
                    name="url"
                    placeholder="https://example.com/article"
                    required
                    type="url"
                  />
                </div>
                <small>
                  Imports one public page. Pages requiring login or browser rendering are not
                  supported.
                </small>
              </label>
            ) : null}
          </div>

          <div className="intake-submit-row">
            <p>
              This creates review proposals. It does not publish knowledge or mark facts as
              verified.
            </p>
            <button disabled={pending} type="submit">
              {pending ? "Reading source…" : selected.actionLabel}
            </button>
          </div>
        </form>
      </section>

      <aside className="source-receipt" aria-label="Import settings and process">
        <div className="receipt-header">
          <p className="section-label">Import settings</p>
          <span className="intake-step">Receipt</span>
        </div>
        <dl className="receipt-register">
          <div>
            <dt>Workspace</dt>
            <dd>{workspace}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{selected.label}</dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>Unverified</dd>
          </div>
          <div>
            <dt>Sensitivity</dt>
            <dd>
              <select
                aria-label="Sensitivity"
                onChange={(event) => setSensitivity(event.target.value)}
                value={sensitivity}
              >
                {SENSITIVITY_LEVELS.map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            </dd>
          </div>
        </dl>

        <div className="intake-pipeline" aria-label="Import process">
          <div className="is-current">
            <span>01</span>
            <div>
              <strong>Preserve the source</strong>
              <small>Immutable text and provenance</small>
            </div>
          </div>
          <div>
            <span>02</span>
            <div>
              <strong>Extract atomic ideas</strong>
              <small>Claims, evidence, positions, and links</small>
            </div>
          </div>
          <div>
            <span>03</span>
            <div>
              <strong>Review before activation</strong>
              <small>You decide what enters memory</small>
            </div>
          </div>
        </div>

        <p className="receipt-footnote">
          Website content is treated as untrusted source material. The importer never follows page
          instructions or crawls linked pages.
        </p>
      </aside>
    </div>
  );
}
