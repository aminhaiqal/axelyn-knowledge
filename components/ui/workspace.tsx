import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const surfaceClassName =
  "rounded-[28px] border border-slate-200/80 bg-white/78 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm";

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
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-700/70">
          {eyebrow}
        </p>
        <div className="space-y-1">
          <h2 className="font-serif text-3xl leading-none tracking-tight text-slate-950">
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="font-serif text-4xl leading-none tracking-tight text-slate-950">{value}</p>
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
    <Surface className="flex min-h-[220px] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="space-y-3">
        <h3 className="font-serif text-3xl leading-none tracking-tight text-slate-950">{title}</h3>
        <p className="max-w-xl text-sm leading-7 text-slate-600">{description}</p>
      </div>
      {action}
    </Surface>
  );
}
