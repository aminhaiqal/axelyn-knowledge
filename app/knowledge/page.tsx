import Link from "next/link";
import { createNodeAction } from "@/app/actions";
import { requireOperator } from "@/src/auth/operator-auth";
import {
  LIFECYCLE_STATUSES,
  NODE_TYPES,
  ORIGINS,
  SENSITIVITY_LEVELS,
  VERIFICATION_LEVELS,
} from "@/src/domain/enums";
import { NodeListQuerySchema } from "@/src/domain/schemas";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";
import { TrustBadge } from "@/components/trust-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, SectionHeader, Surface } from "@/components/ui/workspace";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function KnowledgeLibrary({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const operator = await requireOperator();
  const params = await searchParams;
  const workspace = workspaceFrom(params.workspace);
  const parsed = NodeListQuerySchema.parse({
    workspace_id: workspace,
    query: params.query,
    type: params.type,
    origin: params.origin,
    verification: params.verification,
    lifecycle_status: params.lifecycle_status,
    sensitivity: params.sensitivity,
    cursor: params.cursor,
    limit: 25,
  });
  const result = await nodeService.list(parsed);
  const preserved = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (key !== "cursor" && typeof value === "string" && value) preserved.set(key, value);
  });
  preserved.set("workspace", workspace);

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow="Semantic memory / bounded and inspectable"
        title="Knowledge library"
        description="Search atomic statements and inspect their trust, provenance, revisions, relationships, and use. Filters are workspace-scoped at the query boundary."
        actions={
          <Link
            className={cn(buttonVariants({ size: "lg" }), "px-4")}
            href={`/add?workspace=${workspace}`}
          >
            Add knowledge
          </Link>
        }
      />

      <Surface className="p-6">
        <SectionHeader
          eyebrow="Filters"
          title="Search atomic memory"
          description="Keep the query narrow and trust-aware. Every filter is scoped to the current workspace."
        />

        <form className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4" method="get">
          <input type="hidden" name="workspace" value={workspace} />

          <label className="block space-y-2 text-sm font-medium text-slate-800 md:col-span-2 xl:col-span-2">
            <span>Search statements</span>
            <Input
              defaultValue={String(params.query ?? "")}
              name="query"
              placeholder="Explainability in regulated systems"
            />
          </label>

          <label className="block space-y-2 text-sm font-medium text-slate-800">
            <span>Type</span>
            <NativeSelect name="type" defaultValue={String(params.type ?? "")}>
              <option value="">All types</option>
              {NODE_TYPES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </NativeSelect>
          </label>

          <label className="block space-y-2 text-sm font-medium text-slate-800">
            <span>Verification</span>
            <NativeSelect name="verification" defaultValue={String(params.verification ?? "")}>
              <option value="">All verification</option>
              {VERIFICATION_LEVELS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </NativeSelect>
          </label>

          <label className="block space-y-2 text-sm font-medium text-slate-800">
            <span>Lifecycle</span>
            <NativeSelect
              name="lifecycle_status"
              defaultValue={String(params.lifecycle_status ?? "")}
            >
              <option value="">All lifecycle states</option>
              {LIFECYCLE_STATUSES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </NativeSelect>
          </label>

          <label className="block space-y-2 text-sm font-medium text-slate-800">
            <span>Origin</span>
            <NativeSelect name="origin" defaultValue={String(params.origin ?? "")}>
              <option value="">All origins</option>
              {ORIGINS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </NativeSelect>
          </label>

          <label className="block space-y-2 text-sm font-medium text-slate-800">
            <span>Sensitivity</span>
            <NativeSelect name="sensitivity" defaultValue={String(params.sensitivity ?? "")}>
              <option value="">All sensitivity</option>
              {SENSITIVITY_LEVELS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </NativeSelect>
          </label>

          <div className="flex items-end">
            <Button className="w-full xl:w-auto" size="lg" type="submit">
              Apply filters
            </Button>
          </div>
        </form>
      </Surface>

      {result.items.length ? (
        <Surface className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-[#dce3ed] bg-[#f7f9fc] hover:bg-[#f7f9fc]">
                <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Atomic knowledge
                </TableHead>
                <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Type
                </TableHead>
                <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Trust
                </TableHead>
                <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Version
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((node) => (
                <TableRow className="border-slate-200/70" key={node.id}>
                  <TableCell className="px-6 py-5 align-top whitespace-normal">
                    <Link
                      className="block text-base font-semibold tracking-tight text-slate-950 transition-colors hover:text-[#3557ff]"
                      href={`/knowledge/${node.id}?workspace=${workspace}`}
                    >
                      {node.canonical_statement}
                    </Link>
                    <span className="mt-2 block text-sm text-slate-500">{node.title}</span>
                  </TableCell>
                  <TableCell className="px-6 py-5 align-top font-mono text-xs uppercase tracking-[0.16em] whitespace-normal text-[#3557ff]">
                    {node.type}
                  </TableCell>
                  <TableCell className="px-6 py-5 align-top whitespace-normal">
                    <div className="flex flex-wrap gap-2">
                      <TrustBadge kind="verification" value={node.verification} />
                      <TrustBadge kind="lifecycle" value={node.lifecycle_status} />
                      <TrustBadge kind="origin" value={node.origin} />
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-5 align-top font-mono text-sm text-slate-700">
                    v{node.current_version}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      ) : (
        <EmptyState
          description="Clear a filter or add new source material."
          title="No knowledge matches these filters."
        />
      )}

      {result.next_cursor ? (
        <div className="flex justify-end">
          <Link
            className={cn(buttonVariants({ size: "lg", variant: "outline" }), "px-4")}
            href={`/knowledge?${preserved.toString()}&cursor=${encodeURIComponent(result.next_cursor)}`}
          >
            Next page
          </Link>
        </div>
      ) : null}

      <details className="border border-[#dce3ed] bg-[#fcfcfd]">
        <summary className="cursor-pointer px-6 py-5 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
          Add one exact atomic statement instead
        </summary>
        <div className="border-t border-[#dce3ed] px-6 py-6">
          <SectionHeader
            eyebrow="Operator-authored proposal"
            title="Create one atomic idea"
            description="This enters the inbox as OPERATOR / PROPOSED. It is not verified by creation."
          />

          <form action={createNodeAction} className="mt-6 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="workspace_id" value={workspace} />

            <label className="block space-y-2 text-sm font-medium text-slate-800">
              <span>Type</span>
              <NativeSelect name="type" defaultValue="OBSERVATION">
                {NODE_TYPES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </NativeSelect>
            </label>

            <label className="block space-y-2 text-sm font-medium text-slate-800">
              <span>Verification</span>
              <NativeSelect name="verification" defaultValue="UNVERIFIED">
                {VERIFICATION_LEVELS.map((value) => (
                  <option key={value} disabled={value === "SOURCE_SUPPORTED"}>
                    {value}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="block space-y-2 text-sm font-medium text-slate-800">
              <span>Sensitivity</span>
              <NativeSelect name="sensitivity" defaultValue="INTERNAL">
                {SENSITIVITY_LEVELS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </NativeSelect>
            </label>

            <label className="block space-y-2 text-sm font-medium text-slate-800">
              <span>Confidence</span>
              <Input
                defaultValue="0.7"
                max="1"
                min="0"
                name="confidence"
                step="0.05"
                type="number"
              />
            </label>

            <label className="block space-y-2 text-sm font-medium text-slate-800 md:col-span-2">
              <span>Short title</span>
              <Input maxLength={240} name="title" required />
            </label>

            <label className="block space-y-2 text-sm font-medium text-slate-800 md:col-span-2">
              <span>Atomic canonical statement</span>
              <Textarea
                className="min-h-[200px]"
                maxLength={4000}
                name="canonical_statement"
                required
              />
            </label>

            <div className="md:col-span-2">
              <Button className="px-5" size="lg" type="submit">
                Create proposal
              </Button>
            </div>
          </form>
        </div>
      </details>
    </AdminShell>
  );
}
