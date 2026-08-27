import Link from "next/link";
import { createNodeAction } from "@/app/actions";
import { requireOperator } from "@/src/auth/operator-auth";
import {
  NODE_TYPES,
  ORIGINS,
  SENSITIVITY_LEVELS,
  VERIFICATION_LEVELS,
  LIFECYCLE_STATUSES,
} from "@/src/domain/enums";
import { NodeListQuerySchema } from "@/src/domain/schemas";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";
import { TrustBadge } from "@/components/trust-badge";

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
      />
      <div className="content-width">
        <form className="filter-bar" method="get">
          <input type="hidden" name="workspace" value={workspace} />
          <label className="search-wide">
            Search statements
            <input
              name="query"
              defaultValue={String(params.query ?? "")}
              placeholder="Explainability in regulated systems"
            />
          </label>
          <label>
            Type
            <select name="type" defaultValue={String(params.type ?? "")}>
              <option value="">All types</option>
              {NODE_TYPES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Verification
            <select name="verification" defaultValue={String(params.verification ?? "")}>
              <option value="">All verification</option>
              {VERIFICATION_LEVELS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Lifecycle
            <select name="lifecycle_status" defaultValue={String(params.lifecycle_status ?? "")}>
              <option value="">All lifecycle states</option>
              {LIFECYCLE_STATUSES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Origin
            <select name="origin" defaultValue={String(params.origin ?? "")}>
              <option value="">All origins</option>
              {ORIGINS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Sensitivity
            <select name="sensitivity" defaultValue={String(params.sensitivity ?? "")}>
              <option value="">All sensitivity</option>
              {SENSITIVITY_LEVELS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button type="submit">Apply filters</button>
        </form>

        <div className="data-table-wrap">
          {result.items.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Atomic knowledge</th>
                  <th>Type</th>
                  <th>Trust</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((node) => (
                  <tr key={node.id}>
                    <td>
                      <Link
                        className="statement-link"
                        href={`/knowledge/${node.id}?workspace=${workspace}`}
                      >
                        {node.canonical_statement}
                      </Link>
                      <span className="cell-meta">{node.title}</span>
                    </td>
                    <td className="mono">{node.type}</td>
                    <td>
                      <div className="trust-stack">
                        <TrustBadge kind="verification" value={node.verification} />
                        <TrustBadge kind="lifecycle" value={node.lifecycle_status} />
                        <TrustBadge kind="origin" value={node.origin} />
                      </div>
                    </td>
                    <td className="mono">v{node.current_version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <strong>No knowledge matches these filters.</strong>
              Clear a filter or create a manual proposal below.
            </div>
          )}
        </div>
        {result.next_cursor ? (
          <div className="pagination">
            <Link
              className="button secondary"
              href={`/knowledge?${preserved.toString()}&cursor=${encodeURIComponent(result.next_cursor)}`}
            >
              Next page
            </Link>
          </div>
        ) : null}

        <section className="panel" style={{ marginTop: 36 }}>
          <p className="section-label">Operator-authored proposal</p>
          <h2>Create one atomic idea</h2>
          <p className="muted">
            This enters the inbox as OPERATOR / PROPOSED. It is not verified by creation.
          </p>
          <form action={createNodeAction} className="form-grid">
            <input type="hidden" name="workspace_id" value={workspace} />
            <label>
              Type
              <select name="type" defaultValue="OBSERVATION">
                {NODE_TYPES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Verification
              <select name="verification" defaultValue="UNVERIFIED">
                {VERIFICATION_LEVELS.map((value) => (
                  <option key={value} disabled={value === "SOURCE_SUPPORTED"}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sensitivity
              <select name="sensitivity" defaultValue="INTERNAL">
                {SENSITIVITY_LEVELS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Confidence
              <input
                name="confidence"
                type="number"
                min="0"
                max="1"
                step="0.05"
                defaultValue="0.7"
              />
            </label>
            <label className="wide">
              Short title
              <input name="title" required maxLength={240} />
            </label>
            <label className="wide">
              Atomic canonical statement
              <textarea name="canonical_statement" required maxLength={4000} />
            </label>
            <button type="submit">Create proposal</button>
          </form>
        </section>
      </div>
    </AdminShell>
  );
}
