import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const surfaceClassName =
  "rounded-[20px] border border-[#d8d0c3] bg-white/84 shadow-[0_18px_44px_rgba(15,23,42,0.06)]";

export const insetSurfaceClassName =
  "rounded-[16px] border border-[#e2dacd] bg-[#f6f1e8] shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]";

export function Surface({
  as: Component = "section",
  children,
  className,
  ...props
}: React.ComponentProps<"section"> & {
  as?: "article" | "section";
  children: ReactNode;
}) {
  return (
    <Component className={cn(surfaceClassName, className)} {...props}>
      {children}
    </Component>
  );
}

export function SectionHeader({
  action,
  description,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  description?: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b6736]">
          {eyebrow}
        </p>
        <div className="space-y-1">
          <h2 className="text-[1.8rem] leading-none font-semibold tracking-[-0.04em] text-slate-950">
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex items-center gap-3">{action}</div> : null}
    </div>
  );
}

export function MetricCard({
  description,
  label,
  value,
}: {
  description?: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <Surface className="p-5">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="text-4xl leading-none font-semibold tracking-[-0.05em] text-slate-950 tabular-nums">
          {value}
        </p>
      </div>
      {description ? <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p> : null}
    </Surface>
  );
}

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: ReactNode;
  title: string;
}) {
  return (
    <Surface className="flex min-h-[220px] flex-col items-start justify-center gap-4 px-8 py-10 text-left">
      <div className="space-y-3">
        <h3 className="text-3xl leading-none font-semibold tracking-[-0.04em] text-slate-950">
          {title}
        </h3>
        <p className="max-w-xl text-sm leading-7 text-slate-600">{description}</p>
      </div>
      {action}
    </Surface>
  );
}
