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
    <header className="border-b border-[#dce3ed] pb-8">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3557ff]">
        {eyebrow}
      </p>
      <h1 className="mt-4 max-w-[18ch] font-serif text-[clamp(2.9rem,6.6vw,5.35rem)] leading-[0.9] tracking-[-0.06em] text-slate-950">
        {title}
      </h1>
      <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <p className="max-w-3xl text-sm leading-7 text-slate-500 sm:text-[0.98rem]">
          {description}
        </p>
        {actions ? <div className="flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}
