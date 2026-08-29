"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, LibraryBig, Menu, Orbit, Plus, Settings2 } from "lucide-react";
import type { OperatorIdentity } from "@/src/auth/operator-auth";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
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
    label: "Dashboard",
    detail: "Register · Insert · Challenge · Extend",
    icon: LayoutDashboard,
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
    href: "/settings",
    label: "Settings",
    detail: "Models and credentials",
    icon: Settings2,
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
    <nav aria-label="Primary navigation" className="space-y-1.5">
      {navigation.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 border px-3 py-3.5 transition-colors",
              active
                ? "border-white/8 bg-[#171c25] text-white"
                : "border-transparent text-slate-400 hover:bg-white/[0.03] hover:text-white",
            )}
            href={`${item.href}?workspace=${workspace}`}
            key={item.href}
            onClick={onNavigate}
          >
            {active ? (
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-px bg-[#3557ff]" />
            ) : null}
            <span
              className={cn(
                "flex size-10 items-center justify-center border transition-colors",
                active
                  ? "border-white/10 bg-[#202633] text-[#dfe6ff]"
                  : "border-white/8 bg-white/[0.02] text-slate-500 group-hover:border-white/14 group-hover:text-white",
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
    <div className="min-h-screen bg-transparent lg:grid lg:grid-cols-[288px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh shrink-0 border-r border-[#242b37] bg-[#11151d] lg:flex lg:flex-col">
        <div className="flex h-full flex-col px-6 py-7 text-slate-100">
          <Link className="flex items-center gap-4" href={`/?workspace=${workspace}`}>
            <span className="flex size-11 items-center justify-center border border-white/10 bg-[#3557ff] font-mono text-xs font-semibold tracking-[0.16em] text-white">
              A/
            </span>
            <span className="min-w-0">
              <span className="block text-[1.7rem] leading-none font-semibold tracking-[-0.04em]">
                Axelyn
              </span>
              <span className="mt-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Knowledge
              </span>
            </span>
          </Link>

          <p className="mt-5 max-w-xs text-sm leading-6 text-slate-400">
            Three bounded operations for inserting, challenging, and extending knowledge.
          </p>

          <Link
            className={cn(
              buttonVariants({ size: "lg", variant: "secondary" }),
              "mt-8 w-full justify-between border-white/10 px-4",
            )}
            href={`/?workspace=${workspace}&view=insert`}
          >
            Insert knowledge
            <Plus className="size-4" />
          </Link>

          <div className="mt-8 flex-1">
            <NavLinks pathname={pathname} workspace={workspace} />
          </div>

          <Separator className="my-5 bg-white/8" />

          <div className="space-y-4 border border-white/8 bg-white/[0.02] p-4">
            <div className="space-y-1">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Workspace
              </p>
              <p className="truncate text-sm font-semibold text-slate-100">{workspace}</p>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Operator
              </p>
              <p className="truncate text-sm text-slate-300" title={operator.email}>
                {operator.email}
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            One record, one operation. Verification stays explicit and separate.
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-white">
        <Sheet onOpenChange={setNavOpen} open={navOpen}>
          <div className="sticky top-0 z-30 border-b border-[#dce3ed] bg-white/95 backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1680px] items-center gap-3 px-4 py-5 sm:px-6 lg:px-8">
              <Button
                className="lg:hidden"
                onClick={() => setNavOpen(true)}
                size="sm"
                variant="outline"
              >
                <Menu className="size-4" />
                Menu
              </Button>

              <div className="min-w-0">
                <p className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Content intelligence / <span className="text-[#3557ff]">{currentSurface}</span>
                </p>
              </div>

              <div className="ml-auto hidden min-w-0 items-center gap-3 sm:flex">
                <span className="size-2 bg-emerald-500" />
                <span className="text-sm font-medium text-slate-600">Operator ready</span>
                <span className="hidden border-l border-[#dce3ed] pl-3 text-sm text-slate-400 xl:block">
                  {workspace}
                </span>
              </div>
            </div>
          </div>

          <SheetContent
            className="w-[320px] border-l-0 border-r border-white/10 bg-[#11151d] p-0 text-slate-100"
            side="left"
          >
            <SheetHeader className="space-y-3 border-b border-white/8 px-6 py-6 text-left">
              <SheetTitle className="text-2xl font-semibold tracking-[-0.04em] text-white">
                Axelyn Knowledge
              </SheetTitle>
              <SheetDescription className="text-sm leading-6 text-slate-400">
                Editorial memory workspace for review, retrieval, and source intake.
              </SheetDescription>
            </SheetHeader>

            <div className="flex h-full flex-col px-6 py-6">
              <Link
                className={cn(
                  buttonVariants({ size: "lg", variant: "secondary" }),
                  "mb-6 w-full justify-between border-white/10 px-4",
                )}
                href={`/?workspace=${workspace}&view=insert`}
                onClick={() => setNavOpen(false)}
              >
                New knowledge
                <Plus className="size-4" />
              </Link>

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

        <div className="mx-auto flex max-w-[1680px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
