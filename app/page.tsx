import Link from "next/link";
import { retryExtractionAction } from "@/app/actions";
import { requireOperator } from "@/src/auth/operator-auth";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";
import { TrustBadge } from "@/components/trust-badge";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const operator = await requireOperator();
  const workspace = workspaceFrom((await searchParams).workspace);
  const dashboard = await nodeService.dashboard(workspace);
  const totals = dashboard.totals as Record<string, unknown>;

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow="Memory register / live state"
        title="What the system currently remembers"
        description="A trust-aware register of reusable knowledge, pending judgment, and failed extraction work. Editorial approval and factual verification remain separate here."
        actions={
          <div className="header-actions">
            <Link className="button secondary" href={`/inbox?workspace=${workspace}`}>
              Review inbox
            </Link>
            <Link className="button" href={`/add?workspace=${workspace}`}>
              Add knowledge
            </Link>
          </div>
        }
      />
      <div className="content-width">
        <section className="stat-register" aria-label="Knowledge totals">
          <div>
            <span>Total nodes</span>
            <strong>{Number(totals.total ?? 0)}</strong>
          </div>
          <div>
            <span>Awaiting review</span>
            <strong>{Number(totals.proposed ?? 0)}</strong>
          </div>
          <div>
            <span>Active memory</span>
            <strong>{Number(totals.active ?? 0)}</strong>
          </div>
          <div>
            <span>Extraction failures</span>
            <strong>{dashboard.extraction_failures.length}</strong>
          </div>
        </section>

        <div className="split-grid">
          <section>
            <div className="section-heading">
              <div>
                <p className="section-label">Decision queue</p>
                <h2>Oldest proposals first</h2>
              </div>
              <Link className="muted" href={`/inbox?workspace=${workspace}`}>
                Open full inbox →
              </Link>
            </div>
            <div className="data-table-wrap">
              {dashboard.awaiting_review.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Knowledge</th>
                      <th>Origin</th>
                      <th>Verification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.awaiting_review.map((node) => (
                      <tr key={String(node.id)}>
                        <td>
                          <Link
                            className="statement-link"
                            href={`/knowledge/${node.id}?workspace=${workspace}`}
                          >
                            {String(node.title)}
                          </Link>
                          <span className="cell-meta">
                            {String(node.type).replaceAll("_", " ")}
                          </span>
                        </td>
                        <td>
                          <TrustBadge kind="origin" value={String(node.origin)} />
                        </td>
                        <td>
                          <TrustBadge kind="verification" value={String(node.verification)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <strong>The review queue is clear.</strong>
                  New extraction and manual proposals will appear here.
                </div>
              )}
            </div>
          </section>

          <aside>
            <section className="panel">
              <p className="section-label">Immutable intake</p>
              <h2>Recent sources</h2>
              {dashboard.recent_sources.length ? (
                <ul className="plain-list">
                  {dashboard.recent_sources.map((source) => (
                    <li key={String(source.id)}>
                      <strong>{String(source.title ?? source.external_id)}</strong>
                      <span className="cell-meta">
                        {String(source.source_system)} ·{" "}
                        {String(source.source_type).replaceAll("_", " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No sources have been ingested yet.</p>
              )}
            </section>
            <section className="panel">
              <p className="section-label">Needs attention</p>
              <h2>Extraction failures</h2>
              {dashboard.extraction_failures.length ? (
                <ul className="failure-list">
                  {dashboard.extraction_failures.map((failure) => (
                    <li key={String(failure.id)}>
                      <strong>{String(failure.title ?? failure.external_id)}</strong>
                      <span className="cell-meta">
                        {String(failure.error_code)} · {String(failure.error_message)}
                      </span>
                      <form action={retryExtractionAction} className="failure-action">
                        <input type="hidden" name="workspace_id" value={workspace} />
                        <input type="hidden" name="source_id" value={String(failure.source_id)} />
                        <button className="secondary" type="submit">
                          Retry extraction
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No failed extraction attempts.</p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </AdminShell>
  );
}
