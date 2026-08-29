import Link from "next/link";
import { cn } from "@/lib/utils";

export const DASHBOARD_VIEWS = ["register", "insert", "challenge", "extend"] as const;

export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

const tabs: Array<{
  id: DashboardView;
  index: string;
  label: string;
  detail: string;
}> = [
  { id: "register", index: "01", label: "Register", detail: "Live memory state" },
  { id: "insert", index: "02", label: "Insert", detail: "Add source knowledge" },
  { id: "challenge", index: "03", label: "Challenge", detail: "Test one target" },
  { id: "extend", index: "04", label: "Extend", detail: "Develop one target" },
];

export function dashboardHref(workspace: string, view: DashboardView) {
  const params = new URLSearchParams({ workspace, view });
  return `/?${params.toString()}`;
}

export function DashboardTabs({
  activeView,
  workspace,
}: {
  activeView: DashboardView;
  workspace: string;
}) {
  return (
    <nav aria-label="Knowledge operations" className="overflow-x-auto border-y border-[#dce3ed]">
      <div className="grid min-w-[720px] grid-cols-4">
        {tabs.map((tab) => {
          const active = tab.id === activeView;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative min-h-24 border-r border-[#dce3ed] px-5 py-4 transition-colors last:border-r-0",
                active
                  ? "bg-[#11151d] text-white"
                  : "bg-white text-slate-600 hover:bg-[#f7f9fc] hover:text-slate-950",
              )}
              href={dashboardHref(workspace, tab.id)}
              key={tab.id}
            >
              <span
                className={cn(
                  "font-mono text-[10px] font-semibold tracking-[0.2em]",
                  active ? "text-[#6f87ff]" : "text-slate-400",
                )}
              >
                {tab.index}
              </span>
              <span
                className={cn(
                  "mt-3 block text-base font-semibold tracking-[-0.02em]",
                  active ? "text-white" : "text-slate-950",
                )}
              >
                {tab.label}
              </span>
              <span
                className={cn("mt-1 block text-xs", active ? "text-slate-400" : "text-slate-500")}
              >
                {tab.detail}
              </span>
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-[#3557ff]"
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
