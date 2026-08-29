import Link from "next/link";
import { retryExtractionAction } from "@/app/actions";
import { requireOperator } from "@/src/auth/operator-auth";
import { NodeListQuerySchema } from "@/src/domain/schemas";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import {
  DASHBOARD_VIEWS,
  DashboardTabs,
  dashboardHref,
  type DashboardView,
} from "@/components/dashboard-tabs";
import { KnowledgeIntake } from "@/components/knowledge-intake";
import { OperationTargetBrowser } from "@/components/operation-target-browser";
import { PageHeader } from "@/components/page-header";
import { TrustBadge } from "@/components/trust-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, SectionHeader, Surface } from "@/components/ui/workspace";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type DashboardData = Awaited<ReturnType<typeof nodeService.dashboard>>;

function valueFrom(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function viewFrom(value: string | string[] | undefined): DashboardView {
  const candidate = valueFrom(value);
  return DASHBOARD_VIEWS.includes(candidate as DashboardView)
    ? (candidate as DashboardView)
    : "register";
}

function ModeHeader({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="border-b border-[#dce3ed] pb-7">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3557ff]">
        {eyebrow}
      </p>
      <h2 className="mt-3 font-serif text-[clamp(2.4rem,5vw,4.5rem)] leading-[0.92] tracking-[-0.055em] text-slate-950">
        {title}
      </h2>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500 sm:text-[0.98rem]">
        {description}
      </p>
    </header>
  );
}

function RegisterView({ dashboard, workspace }: { dashboard: DashboardData; workspace: string }) {
  const totals = dashboard.totals as Record<string, unknown>;
  const metrics = [
    ["Total knowledge", Number(totals.total ?? 0)],
    ["Inserted", Number(totals.inserted_knowledge ?? 0)],
    ["Challenges", Number(totals.challenges ?? 0)],
    ["Extensions", Number(totals.extensions ?? 0)],
  ] as const;

  return (
    <div className="space-y-10">
      <ModeHeader
        description="The register is the live state of memory. Every active record keeps exactly one operation and an explicit verification state."
        eyebrow="REGISTER / live memory state"
        title="Recently changed knowledge"
      />

      <dl aria-label="Knowledge totals" className="grid border border-[#dce3ed] md:grid-cols-4">
        {metrics.map(([label, value], index) => (
          <div
            className={cn(
              "bg-white px-5 py-5",
              index > 0 && "border-t border-[#dce3ed] md:border-t-0 md:border-l",
            )}
            key={label}
          >
            <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {label}
            </dt>
            <dd className="mt-3 text-4xl leading-none font-semibold tracking-[-0.05em] text-slate-950 tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="space-y-4">
        <SectionHeader
          action={
            <Link
              className="text-sm font-semibold text-slate-600 transition-colors hover:text-[#3557ff]"
              href={`/knowledge?workspace=${workspace}`}
            >
              Open full library
            </Link>
          }
          eyebrow="Active memory / one operation each"
          title="Knowledge register"
        />

        {dashboard.recent_knowledge.length ? (
          <Surface className="overflow-hidden bg-white">
            <Table>
              <TableHeader>
                <TableRow className="border-[#dce3ed] bg-[#f7f9fc] hover:bg-[#f7f9fc]">
                  <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Knowledge
                  </TableHead>
                  <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Origin
                  </TableHead>
                  <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Verification
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.recent_knowledge.map((node) => (
                  <TableRow key={String(node.id)} className="border-slate-200/70">
                    <TableCell className="px-6 py-5 align-top whitespace-normal">
                      <Link
                        className="block text-base font-semibold tracking-tight text-slate-950 transition-colors hover:text-[#3557ff]"
                        href={`/knowledge/${node.id}?workspace=${workspace}`}
                      >
                        {String(node.title)}
                      </Link>
                      <span className="mt-2 block text-sm text-slate-500">
                        {String(node.operation)} · {String(node.type).replaceAll("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-5 align-top">
                      <TrustBadge kind="origin" value={String(node.origin)} />
                    </TableCell>
                    <TableCell className="px-6 py-5 align-top">
                      <TrustBadge kind="verification" value={String(node.verification)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Surface>
        ) : (
          <EmptyState
            action={
              <Link
                className={buttonVariants({ size: "lg" })}
                href={dashboardHref(workspace, "insert")}
              >
                Insert first knowledge
              </Link>
            }
            description="Use INSERT to add the first knowledge record."
            title="No active knowledge yet."
          />
        )}
      </section>

      {dashboard.extraction_failures.length ? (
        <section className="space-y-4">
          <SectionHeader
            description="Only the latest failed attempt for each source is shown."
            eyebrow="Needs attention"
            title="Extraction failures"
          />
          <Surface className="overflow-hidden border-rose-200 bg-white">
            <ul className="divide-y divide-rose-200">
              {dashboard.extraction_failures.map((failure) => (
                <li
                  className="grid gap-5 bg-rose-50/60 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                  key={String(failure.id)}
                >
                  <div>
                    <p className="font-semibold tracking-tight text-slate-950">
                      {String(failure.title ?? failure.external_id)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {String(failure.error_code)} · {String(failure.error_message)}
                    </p>
                  </div>
                  <form action={retryExtractionAction}>
                    <input type="hidden" name="workspace_id" value={workspace} />
                    <input type="hidden" name="source_id" value={String(failure.source_id)} />
                    <button
                      className={cn(
                        buttonVariants({ size: "sm", variant: "outline" }),
                        "border-rose-200 bg-white",
                      )}
                      type="submit"
                    >
                      Retry extraction
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Surface>
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionHeader
          description="Immutable inputs retained for provenance and future reprocessing."
          eyebrow="Source ledger"
          title="Recent sources"
        />
        {dashboard.recent_sources.length ? (
          <Surface className="overflow-hidden bg-white">
            <Table>
              <TableHeader>
                <TableRow className="border-[#dce3ed] bg-[#f7f9fc] hover:bg-[#f7f9fc]">
                  <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Source
                  </TableHead>
                  <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    System
                  </TableHead>
                  <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Type
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.recent_sources.map((source) => (
                  <TableRow className="border-slate-200/70" key={String(source.id)}>
                    <TableCell className="px-6 py-5 font-semibold text-slate-950 whitespace-normal">
                      {String(source.title ?? source.external_id)}
                    </TableCell>
                    <TableCell className="px-6 py-5 text-sm text-slate-600">
                      {String(source.source_system)}
                    </TableCell>
                    <TableCell className="px-6 py-5 text-sm text-slate-600">
                      {String(source.source_type).replaceAll("_", " ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Surface>
        ) : (
          <EmptyState
            description="Imported text, files, and websites will appear here."
            title="No sources ingested yet."
          />
        )}
      </section>
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const operator = await requireOperator();
  const params = await searchParams;
  const workspace = workspaceFrom(valueFrom(params.workspace));
  const view = viewFrom(params.view);
  const query = valueFrom(params.query) ?? "";

  const dashboard = view === "register" ? await nodeService.dashboard(workspace) : null;
  const operationResult =
    view === "challenge" || view === "extend"
      ? await nodeService.list(
          NodeListQuerySchema.parse({
            workspace_id: workspace,
            query,
            lifecycle_status: "ACTIVE",
            limit: 25,
          }),
        )
      : null;

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        actions={
          <Link
            className={cn(buttonVariants({ size: "lg", variant: "outline" }), "px-4")}
            href={`/knowledge?workspace=${workspace}`}
          >
            Open library
          </Link>
        }
        description="Register the current state, insert new source knowledge, challenge one existing record, or extend it. Each record belongs to one operation only."
        eyebrow="Knowledge workspace / one record, one operation"
        title="Knowledge dashboard"
      />

      <DashboardTabs activeView={view} workspace={workspace} />

      {view === "register" && dashboard ? (
        <RegisterView dashboard={dashboard} workspace={workspace} />
      ) : null}

      {view === "insert" ? (
        <div className="space-y-8">
          <ModeHeader
            description="Preserve the source, then classify each atomic record as a fact, observation, principle, decision, or procedure."
            eyebrow="INSERT / new knowledge"
            title="Add what is known"
          />
          <KnowledgeIntake workspace={workspace} />
        </div>
      ) : null}

      {view === "challenge" && operationResult ? (
        <div className="space-y-8">
          <ModeHeader
            description="Retrieve one target, test it against bounded context, and create one separate claim, evidence record, or hypothesis. The target remains intact."
            eyebrow="CHALLENGE / retrieve, test, judge"
            title="Challenge existing knowledge"
          />
          <OperationTargetBrowser
            items={operationResult.items}
            operation="CHALLENGE"
            query={query}
            workspace={workspace}
          />
        </div>
      ) : null}

      {view === "extend" && operationResult ? (
        <div className="space-y-8">
          <ModeHeader
            description="Retrieve one target and create one grounded argument or insight that adds a distinct implication instead of paraphrasing it."
            eyebrow="EXTEND / retrieve, connect, develop"
            title="Extend existing knowledge"
          />
          <OperationTargetBrowser
            items={operationResult.items}
            operation="EXTEND"
            query={query}
            workspace={workspace}
          />
        </div>
      ) : null}
    </AdminShell>
  );
}
