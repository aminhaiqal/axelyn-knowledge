"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BrainCircuit,
  GitBranchPlus,
  Inbox,
  LibraryBig,
  Menu,
  Orbit,
  Sparkles,
} from "lucide-react";
import type { OperatorIdentity } from "@/src/auth/operator-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

const navigation = [
  {
    href: "/",
    label: "Register",
    detail: "Live system state",
    icon: Sparkles,
  },
  {
    href: "/add",
    label: "Add knowledge",
    detail: "Source intake",
    icon: GitBranchPlus,
  },
  {
    href: "/inbox",
    label: "Inbox",
    detail: "Human review queue",
    icon: Inbox,
  },
  {
    href: "/knowledge",
    label: "Library",
    detail: "Search and edit memory",
    icon: LibraryBig,
  },
  {
    href: "/memory-map",
    label: "Memory map",
    detail: "Bounded graph view",
    icon: Orbit,
  },
  {
    href: "/retrieval",
    label: "Retrieval lab",
    detail: "Inspect recalled context",
    icon: BrainCircuit,
  },
] as const;

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  onNavigate,
  pathname,
  workspace,
}: {
  onNavigate?: () => void;
  pathname: string;
  workspace: string;
}) {
  return (
    <nav aria-label="Primary navigation" className="space-y-2">
      {navigation.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-[22px] border px-4 py-3 transition-all",
              active
                ? "border-cyan-400/30 bg-cyan-400/10 text-white shadow-[0_18px_35px_rgba(8,145,178,0.18)]"
                : "border-transparent text-slate-200/88 hover:border-white/10 hover:bg-white/5 hover:text-white",
            )}
            href={`${item.href}?workspace=${workspace}`}
            key={item.href}
            onClick={onNavigate}
          >
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-2xl border transition-colors",
                active
                  ? "border-cyan-300/30 bg-cyan-300/12 text-cyan-100"
                  : "border-white/8 bg-white/6 text-slate-300 group-hover:border-white/14 group-hover:text-white",
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight">{item.label}</span>
              <span className="block truncate text-xs text-slate-400 group-hover:text-slate-300">
                {item.detail}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  children,
  operator,
  workspace,
}: {
  children: ReactNode;
  operator: OperatorIdentity;
  workspace: string;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const currentSurface =
    navigation.find((item) => isActivePath(pathname, item.href))?.label ?? "Knowledge";

  return (
    <div className="min-h-screen bg-transparent lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-80 shrink-0 border-r border-white/6 bg-[#0c1627] lg:flex lg:flex-col">
        <div className="flex h-full flex-col px-6 py-7 text-slate-100">
          <Link
            className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/4 px-4 py-4"
            href={`/?workspace=${workspace}`}
          >
            <span className="flex size-12 items-center justify-center rounded-2xl border border-cyan-300/24 bg-cyan-300/10 font-mono text-xs tracking-[0.24em] text-cyan-100">
              A/
            </span>
            <span className="min-w-0">
              <span className="block font-serif text-[1.6rem] leading-none tracking-tight">
                Axelyn
              </span>
              <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Knowledge
              </span>
            </span>
          </Link>

          <p className="mt-5 max-w-xs text-sm leading-6 text-slate-400">
            Trust-aware editorial memory for operator review, retrieval inspection, and durable
            source intake.
          </p>

          <div className="mt-8 flex-1">
            <NavLinks pathname={pathname} workspace={workspace} />
          </div>

          <Separator className="my-5 bg-white/8" />

          <div className="space-y-4 rounded-[28px] border border-white/8 bg-white/4 p-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                Workspace
              </p>
              <p className="truncate text-sm font-semibold text-slate-100">{workspace}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                Operator
              </p>
              <p className="truncate text-sm text-slate-300" title={operator.email}>
                {operator.email}
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            Approval activates knowledge. Verification remains explicit and separate.
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Sheet onOpenChange={setNavOpen} open={navOpen}>
          <div className="sticky top-0 z-30 border-b border-slate-200/70 bg-[color:var(--background)]/85 backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
              <Button
                className="lg:hidden"
                onClick={() => setNavOpen(true)}
                size="sm"
                variant="outline"
              >
                <Menu className="size-4" />
                Menu
              </Button>

              <div className="hidden min-w-0 items-center gap-3 md:flex">
                <div className="rounded-full border border-slate-200 bg-white/70 px-4 py-2 shadow-sm">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Current surface
                  </span>
                  <span className="block text-sm font-semibold tracking-tight text-slate-900">
                    {currentSurface}
                  </span>
                </div>
                <div className="hidden min-w-[220px] rounded-full border border-slate-200 bg-white/70 px-4 py-2 shadow-sm sm:block">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Workspace
                  </span>
                  <span className="block truncate text-sm font-semibold tracking-tight text-slate-900">
                    {workspace}
                  </span>
                </div>
              </div>

              <div className="ml-auto flex min-w-0 items-center gap-3 rounded-full border border-slate-200 bg-white/78 px-4 py-2 shadow-sm">
                <span className="hidden size-2 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.14)] sm:block" />
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Operator session
                  </span>
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {operator.email}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <SheetContent
            className="w-[320px] border-l-0 border-r border-white/10 bg-[#0c1627] p-0 text-slate-100"
            side="left"
          >
            <SheetHeader className="space-y-3 border-b border-white/8 px-6 py-6 text-left">
              <SheetTitle className="font-serif text-2xl text-white">Axelyn Knowledge</SheetTitle>
              <SheetDescription className="text-sm leading-6 text-slate-400">
                Trust-aware editorial memory for review, retrieval, and source intake.
              </SheetDescription>
            </SheetHeader>

            <div className="flex h-full flex-col px-6 py-6">
              <NavLinks
                onNavigate={() => setNavOpen(false)}
                pathname={pathname}
                workspace={workspace}
              />
              <Separator className="my-5 bg-white/8" />
              <div className="space-y-2 text-sm text-slate-400">
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                  Workspace
                </p>
                <p className="truncate text-slate-100">{workspace}</p>
                <p className="truncate">{operator.email}</p>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
