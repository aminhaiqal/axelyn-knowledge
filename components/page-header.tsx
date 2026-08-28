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
    <header className="space-y-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-4xl space-y-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8b6736]">
            {eyebrow}
          </p>
          <div className="space-y-3">
            <h1 className="max-w-4xl text-4xl leading-none font-semibold tracking-[-0.05em] text-slate-950 sm:text-5xl xl:text-[3.65rem]">
              {title}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-[0.98rem]">
              {description}
            </p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      <div className="h-px bg-gradient-to-r from-[#b78642]/70 via-[#d8d0c3] to-transparent" />
    </header>
  );
}
