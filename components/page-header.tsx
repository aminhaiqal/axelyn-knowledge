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
    <header className="grid gap-6 border-b border-[#dce3ed] pb-8 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-end">
      <div className="max-w-5xl space-y-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3557ff]">
          {eyebrow}
        </p>
        <h1 className="max-w-[18ch] font-serif text-[clamp(2.9rem,6.6vw,5.35rem)] leading-[0.9] tracking-[-0.06em] text-slate-950">
          {title}
        </h1>
      </div>

      <div className="space-y-5 xl:justify-self-end xl:max-w-[360px]">
        <p className="text-sm leading-7 text-slate-500 sm:text-[0.98rem]">{description}</p>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}
