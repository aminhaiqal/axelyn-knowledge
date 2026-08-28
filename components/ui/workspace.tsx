import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const surfaceClassName = "border border-[#dce3ed] bg-[#fcfcfd]";

export const insetSurfaceClassName = "border border-[#e1e7f0] bg-[#f7f9fc]";

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
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#3557ff]">
          {eyebrow}
        </p>
        <div className="space-y-1">
          <h2 className="font-serif text-[clamp(1.9rem,4vw,3.6rem)] leading-[0.92] tracking-[-0.05em] text-slate-950">
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
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
    <div className="border border-[#dce3ed] border-t-2 border-t-[#3557ff] bg-[#fbfcfe] p-5">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="text-4xl leading-none font-semibold tracking-[-0.05em] text-slate-950 tabular-nums">
          {value}
        </p>
      </div>
      {description ? <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p> : null}
    </div>
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
        <h3 className="font-serif text-3xl leading-none tracking-[-0.04em] text-slate-950">
          {title}
        </h3>
        <p className="max-w-xl text-sm leading-7 text-slate-500">{description}</p>
      </div>
      {action}
    </Surface>
  );
}
