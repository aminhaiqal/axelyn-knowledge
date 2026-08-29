"use client";

import { useActionState, useState } from "react";
import { KeyRound, Plus, Route, ShieldCheck, Trash2, X } from "lucide-react";
import {
  removeProviderCredentialAction,
  saveProviderSettingsAction,
  testProviderConnectionAction,
  type ProviderSettingsActionState,
} from "@/app/settings/actions";
import type { ProviderSettingsView } from "@/src/services/provider-settings-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader, Surface } from "@/components/ui/workspace";

const initialState: ProviderSettingsActionState = { status: "idle" };

const tierCopy = [
  ["Routine", "Classifies INSERT records and attempts grounded judgments first."],
  ["Adjudicator", "Reviews CHALLENGE judgments; otherwise runs only after invalid output."],
  ["Final fallback", "Reviews unresolved challenges or handles the last quality attempt."],
] as const;

function ActionMessage({ state }: { state: ProviderSettingsActionState }) {
  if (!state.message) return null;
  return (
    <p
      aria-live="polite"
      className={
        state.status === "success"
          ? "border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          : "border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
      }
    >
      {state.message}
    </p>
  );
}

function dateLabel(value: string | null) {
  if (!value) return "Not yet";
  const formatted = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
  return `${formatted} UTC`;
}

function sourceLabel(source: ProviderSettingsView["source"]) {
  if (source === "workspace") return "Workspace managed";
  if (source === "environment") return "Server managed";
  return "Not configured";
}

export function ProviderSettingsForm({
  settings,
  workspace,
}: {
  settings: ProviderSettingsView;
  workspace: string;
}) {
  const [models, setModels] = useState(settings.models);
  const [saveState, saveAction, savePending] = useActionState(
    saveProviderSettingsAction,
    initialState,
  );
  const [testState, testAction, testPending] = useActionState(
    testProviderConnectionAction,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeProviderCredentialAction,
    initialState,
  );
  const connected = settings.credentialStatus === "VALID";

  function updateModel(index: number, value: string) {
    setModels((current) =>
      current.map((model, modelIndex) => (modelIndex === index ? value : model)),
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Surface className="overflow-hidden">
        <div className="border-b border-[#dce3ed] px-6 py-6 sm:px-8">
          <SectionHeader
            eyebrow="OpenRouter / workspace credential"
            title={connected ? "Connected." : "Connect model access."}
            description="The key is validated before it is encrypted. Once saved, the plaintext value cannot be viewed again."
          />
        </div>

        <form action={saveAction} className="divide-y divide-[#dce3ed]">
          <input name="workspace_id" type="hidden" value={workspace} />

          <section className="grid gap-5 px-6 py-7 sm:px-8 2xl:grid-cols-[190px_minmax(0,1fr)]">
            <div>
              <div className="flex size-10 items-center justify-center border border-[#cfd8e6] bg-white text-[#3557ff]">
                <KeyRound className="size-4" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-950">API credential</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Replace the key at any time. Leave the field empty to keep the current key.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block space-y-2 text-sm font-medium text-slate-800">
                <span>OpenRouter API key</span>
                <Input
                  autoComplete="new-password"
                  disabled={!settings.encryptionReady}
                  name="api_key"
                  placeholder={settings.configured ? "Keep current encrypted key" : "sk-or-v1-…"}
                  spellCheck={false}
                  type="password"
                />
              </label>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className={connected ? "size-2 bg-emerald-500" : "size-2 bg-slate-300"} />
                <span>{settings.keyHint ?? "No key saved"}</span>
                {settings.keyLabel ? <span>· {settings.keyLabel}</span> : null}
                <span>· {sourceLabel(settings.source)}</span>
              </div>
              {!settings.encryptionReady ? (
                <p className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  Encrypted credential storage is not ready on this server. Run the deployment
                  activation before saving a key.
                </p>
              ) : null}
            </div>
          </section>

          <section className="grid gap-5 px-6 py-7 sm:px-8 2xl:grid-cols-[190px_minmax(0,1fr)]">
            <div>
              <div className="flex size-10 items-center justify-center border border-[#cfd8e6] bg-white text-[#3557ff]">
                <Route className="size-4" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-950">Routing ledger</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Models run in order. A valid result stops the route immediately.
              </p>
            </div>

            <div className="border border-[#dce3ed] bg-white">
              <div className="border-b border-[#dce3ed] bg-[#f7f9fc] px-4 py-3 text-xs leading-5 text-slate-600">
                <strong className="font-semibold text-slate-950">Recommended routine model:</strong>{" "}
                google/gemini-2.5-flash-lite for low-cost structured classification. CHALLENGE sends
                its first valid judgment to the next configured model for adjudication; routine
                INSERT and EXTEND stop at the first valid result.
              </div>
              {models.map((model, index) => {
                const copy = tierCopy[index] ?? [
                  `Fallback ${index + 1}`,
                  "Runs only after every earlier model fails.",
                ];
                return (
                  <div
                    className="grid grid-cols-[28px_minmax(0,1fr)_28px] items-start gap-3 border-b border-[#e3e8f0] px-4 py-4 last:border-b-0 sm:grid-cols-[40px_minmax(0,1fr)_36px] sm:gap-4"
                    key={`${index}-${settings.updatedAt ?? "initial"}`}
                  >
                    <span className="font-mono text-[11px] font-semibold tracking-[0.2em] text-[#3557ff]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{copy[0]}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{copy[1]}</p>
                      <Input
                        aria-label={`${copy[0]} model`}
                        className="mt-3"
                        name="models"
                        onChange={(event) => updateModel(index, event.target.value)}
                        required
                        spellCheck={false}
                        value={model}
                      />
                    </div>
                    <Button
                      aria-label={`Remove ${copy[0]} model`}
                      disabled={models.length === 1}
                      onClick={() => setModels((current) => current.filter((_, i) => i !== index))}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                );
              })}

              {models.length < 5 ? (
                <button
                  className="flex w-full items-center gap-2 border-t border-[#e3e8f0] px-4 py-3 text-left text-sm font-semibold text-slate-600 transition-colors hover:bg-[#f7f9fc] hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#3557ff]"
                  onClick={() => setModels((current) => [...current, ""])}
                  type="button"
                >
                  <Plus className="size-4" />
                  Add fallback model
                </button>
              ) : null}
            </div>
          </section>

          <div className="space-y-4 bg-[#f7f9fc] px-6 py-5 sm:px-8">
            <ActionMessage state={saveState} />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-xl text-xs leading-5 text-slate-500">
                Saving tests the key and verifies that every model supports structured output.
              </p>
              <Button disabled={savePending || !settings.encryptionReady} size="lg" type="submit">
                {savePending ? "Verifying…" : "Save model access"}
              </Button>
            </div>
          </div>
        </form>
      </Surface>

      <div className="space-y-6">
        <Surface className="p-6">
          <div className="flex items-center justify-between gap-4 border-b border-[#dce3ed] pb-5">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#3557ff]">
                Connection
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                {settings.credentialStatus === "VALID"
                  ? "Verified"
                  : settings.credentialStatus === "INVALID"
                    ? "Needs attention"
                    : settings.configured
                      ? "Not yet tested"
                      : "Not configured"}
              </h2>
            </div>
            <span
              className={
                settings.credentialStatus === "VALID"
                  ? "size-3 bg-emerald-500"
                  : settings.credentialStatus === "INVALID"
                    ? "size-3 bg-rose-500"
                    : "size-3 bg-slate-300"
              }
            />
          </div>

          <dl className="divide-y divide-[#e3e8f0] text-sm">
            <div className="flex justify-between gap-4 py-4">
              <dt className="text-slate-500">Last verified</dt>
              <dd className="text-right font-medium text-slate-900">
                {dateLabel(settings.validatedAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-4">
              <dt className="text-slate-500">Credit remaining</dt>
              <dd className="text-right font-medium text-slate-900">
                {settings.limitRemaining === null
                  ? "Not reported"
                  : `$${settings.limitRemaining.toFixed(2)}`}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-4">
              <dt className="text-slate-500">Key expires</dt>
              <dd className="text-right font-medium text-slate-900">
                {settings.expiresAt ? dateLabel(settings.expiresAt) : "No expiry reported"}
              </dd>
            </div>
          </dl>

          <form action={testAction} className="space-y-3 pt-2">
            <input name="workspace_id" type="hidden" value={workspace} />
            <Button
              className="w-full"
              disabled={!settings.configured || testPending}
              type="submit"
              variant="outline"
            >
              {testPending ? "Testing…" : "Test connection"}
            </Button>
            <ActionMessage state={testState} />
          </form>
        </Surface>

        <Surface className="p-6">
          <div className="flex items-start gap-4">
            <ShieldCheck className="mt-0.5 size-5 text-[#3557ff]" />
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Credential boundary</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-500">
                <li>Encrypted with AES-256-GCM before database storage.</li>
                <li>Never returned by a page, action, or API response.</li>
                <li>Provider routes must support strict structured output.</li>
              </ul>
            </div>
          </div>
        </Surface>

        <Surface className="border-rose-200 p-6">
          <h2 className="text-sm font-semibold text-slate-950">Remove workspace credential</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            New sources will stop extracting unless a server-managed fallback key exists.
          </p>
          <form
            action={removeAction}
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              if (!window.confirm("Remove this workspace OpenRouter key?")) event.preventDefault();
            }}
          >
            <input name="workspace_id" type="hidden" value={workspace} />
            <Button
              disabled={settings.source !== "workspace" || removePending}
              type="submit"
              variant="destructive"
            >
              <Trash2 className="size-4" />
              {removePending ? "Removing…" : "Remove key"}
            </Button>
            <ActionMessage state={removeState} />
          </form>
        </Surface>
      </div>
    </div>
  );
}
