import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-700/70">
            {eyebrow}
          </p>
          <div className="space-y-3">
            <h1 className="font-serif text-4xl leading-none tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">{description}</p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      <div className="h-px bg-gradient-to-r from-cyan-600/45 via-slate-300/80 to-transparent" />
    </header>
  );
}
