import Link from "next/link";
import { approveNodeAction, rejectNodeAction, reviewEdgeAction } from "@/app/actions";
import { requireOperator } from "@/src/auth/operator-auth";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";
import { TrustBadge } from "@/components/trust-badge";

export const dynamic = "force-dynamic";

export default async function Inbox({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const operator = await requireOperator();
  const workspace = workspaceFrom((await searchParams).workspace);
  const inbox = await nodeService.inbox(workspace);

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow="Human review / provenance required"
        title="Knowledge inbox"
        description="Approve editorial usefulness, edit atomic statements, or reject weak proposals. Approval activates knowledge; it never upgrades factual verification."
      />
      <div className="content-width">
        <div className="section-heading">
          <div>
            <p className="section-label">Node proposals</p>
            <h2>{inbox.nodes.length} awaiting judgment</h2>
          </div>
        </div>
        {inbox.nodes.length ? (
          inbox.nodes.map((node) => {
            const provenance = (node.provenance ?? []) as Array<Record<string, unknown>>;
            const extraction = (node.metadata.extraction ?? {}) as Record<string, unknown>;
            const duplicates = (extraction.duplicate_candidates ?? []) as string[];
            const contradictions = (extraction.potential_contradictions ?? []) as string[];
            return (
              <article className="review-item" key={node.id}>
                <div>
                  <div className="inline-badges">
                    <TrustBadge kind="origin" value={node.origin} />
                    <TrustBadge kind="verification" value={node.verification} />
                    <TrustBadge kind="lifecycle" value={node.lifecycle_status} />
                    <TrustBadge kind="sensitivity" value={node.sensitivity} />
                  </div>
                  <h2>{node.title}</h2>
                  <p className="canonical">{node.canonical_statement}</p>
                  <div className="cell-meta">
                    {node.type.replaceAll("_", " ")} · confidence {node.confidence.toFixed(2)} ·
                    version {node.current_version}
                  </div>
                  {duplicates.length || contradictions.length ? (
                    <p className="muted">
                      {duplicates.length ? `${duplicates.length} possible duplicate(s). ` : ""}
                      {contradictions.length
                        ? `${contradictions.length} potential contradiction(s).`
                        : ""}
                    </p>
                  ) : null}
                  {provenance.map((reference, index) => (
                    <details
                      className="provenance-rail"
                      key={`${String(reference.source_id)}-${index}`}
                    >
                      <summary>
                        {String(reference.source_system)}:{String(reference.external_id)}:v
                        {String(reference.source_version)}
                      </summary>
                      <p className="excerpt">“{String(reference.excerpt)}”</p>
                      <div className="source-content">{String(reference.content)}</div>
                    </details>
                  ))}
                </div>
                <aside className="review-actions" aria-label={`Review ${node.title}`}>
                  <Link
                    className="button secondary"
                    href={`/knowledge/${node.id}?workspace=${workspace}`}
                  >
                    Inspect and edit
                  </Link>
                  <form action={approveNodeAction}>
                    <input type="hidden" name="workspace_id" value={workspace} />
                    <input type="hidden" name="node_id" value={node.id} />
                    <input
                      type="hidden"
                      name="reason"
                      value="Approved after reviewing source provenance"
                    />
                    <button type="submit">Approve knowledge</button>
                  </form>
                  <form action={rejectNodeAction}>
                    <input type="hidden" name="workspace_id" value={workspace} />
                    <input type="hidden" name="node_id" value={node.id} />
                    <label>
                      Rejection reason
                      <input
                        name="reason"
                        required
                        minLength={3}
                        placeholder="Why this should not enter memory"
                      />
                    </label>
                    <button className="danger" type="submit">
                      Reject proposal
                    </button>
                  </form>
                </aside>
              </article>
            );
          })
        ) : (
          <div className="panel empty-state">
            <strong>No node proposals are waiting.</strong>
            Ingest a source with extraction enabled or create a manual proposal in the library.
          </div>
        )}

        <div className="section-heading" style={{ marginTop: 42 }}>
          <div>
            <p className="section-label">Relationship proposals</p>
            <h2>{inbox.edges.length} typed edges awaiting judgment</h2>
          </div>
        </div>
        <div className="data-table-wrap">
          {inbox.edges.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Relationship</th>
                  <th>To</th>
                  <th>Supporting provenance</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {inbox.edges.map((edge) => {
                  const sources = (edge.sources ?? []) as Array<Record<string, unknown>>;
                  return (
                    <tr key={String(edge.id)}>
                      <td>{String(edge.source_title)}</td>
                      <td>
                        <span className="mono">{String(edge.type)}</span>
                      </td>
                      <td>{String(edge.target_title)}</td>
                      <td>
                        {sources.map((source, index) => (
                          <details
                            className="provenance-rail"
                            key={`${String(source.source_id)}-${index}`}
                          >
                            <summary>
                              {String(source.source_system)}:{String(source.external_id)}:v
                              {String(source.source_version)}
                            </summary>
                            <p className="excerpt">“{String(source.excerpt)}”</p>
                            <div className="source-content">{String(source.content)}</div>
                          </details>
                        ))}
                      </td>
                      <td>
                        <div className="inline-badges">
                          <form action={reviewEdgeAction}>
                            <input type="hidden" name="workspace_id" value={workspace} />
                            <input type="hidden" name="edge_id" value={String(edge.id)} />
                            <input type="hidden" name="decision" value="ACTIVE" />
                            <input
                              type="hidden"
                              name="reason"
                              value="Relationship provenance reviewed"
                            />
                            <button type="submit">Approve</button>
                          </form>
                          <form action={reviewEdgeAction}>
                            <input type="hidden" name="workspace_id" value={workspace} />
                            <input type="hidden" name="edge_id" value={String(edge.id)} />
                            <input type="hidden" name="decision" value="REJECTED" />
                            <input
                              type="hidden"
                              name="reason"
                              value="Relationship rejected during review"
                            />
                            <button className="danger" type="submit">
                              Reject
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <strong>No relationship proposals.</strong>
              Proposed edges appear after structured extraction.
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
