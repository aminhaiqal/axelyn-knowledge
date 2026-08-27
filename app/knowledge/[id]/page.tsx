import Link from "next/link";
import { archiveNodeAction, editNodeAction, mergeNodeAction } from "@/app/actions";
import { requireOperator } from "@/src/auth/operator-auth";
import { SENSITIVITY_LEVELS, VERIFICATION_LEVELS } from "@/src/domain/enums";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";
import { TrustBadge } from "@/components/trust-badge";

export const dynamic = "force-dynamic";

export default async function NodeDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const operator = await requireOperator();
  const workspace = workspaceFrom((await searchParams).workspace);
  const { id } = await params;
  const node = await nodeService.get(workspace, id);

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow={`${node.type.replaceAll("_", " ")} / version ${node.current_version}`}
        title={node.title}
        description="One atomic memory with its trust state, immutable provenance, revision trail, graph neighborhood, and usage history."
        actions={
          <Link
            className="button secondary"
            href={`/memory-map?workspace=${workspace}&node_id=${node.id}`}
          >
            Open neighborhood
          </Link>
        }
      />
      <div className="content-width detail-grid">
        <div>
          <article className="statement-sheet">
            <div className="inline-badges">
              <TrustBadge kind="origin" value={node.origin} />
              <TrustBadge kind="verification" value={node.verification} />
              <TrustBadge kind="lifecycle" value={node.lifecycle_status} />
              <TrustBadge kind="sensitivity" value={node.sensitivity} />
            </div>
            <blockquote>{node.canonical_statement}</blockquote>
            <div className="metric-line">
              <div>
                <span>Confidence</span>
                <strong>{node.confidence.toFixed(2)}</strong>
              </div>
              <div>
                <span>Importance</span>
                <strong>{node.importance.toFixed(2)}</strong>
              </div>
              <div>
                <span>Salience</span>
                <strong>{node.salience.toFixed(2)}</strong>
              </div>
              <div>
                <span>Usefulness</span>
                <strong>{node.usefulness_score.toFixed(2)}</strong>
              </div>
            </div>
            <p className="cell-meta">
              Created by {node.created_by} · last changed by {node.updated_by} · {node.updated_at}
            </p>

            <div className="accordion">
              <details open>
                <summary>Provenance ({node.provenance.length})</summary>
                {node.provenance.length ? (
                  node.provenance.map((reference) => (
                    <div
                      className="provenance-rail"
                      key={`${String(reference.source_id)}-${String(reference.excerpt)}`}
                    >
                      <strong>
                        {String(reference.source_system)}:{String(reference.external_id)}:v
                        {String(reference.source_version)}
                      </strong>
                      <p className="excerpt">“{String(reference.excerpt)}”</p>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    No immutable source is linked to this operator-authored node.
                  </p>
                )}
              </details>
              <details>
                <summary>Version history ({node.versions.length})</summary>
                <ol className="version-list">
                  {node.versions.map((version) => (
                    <li key={String(version.id)}>
                      <strong>
                        v{String(version.version)} · {String(version.change_reason)}
                      </strong>
                      <div>{String(version.canonical_statement)}</div>
                      <span className="cell-meta">
                        {String(version.changed_by)} ·{" "}
                        {new Date(String(version.changed_at)).toISOString()}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
              <details>
                <summary>Relationships ({node.relationships.length})</summary>
                <ul className="relationship-list">
                  {node.relationships.map((edge) => (
                    <li key={String(edge.id)}>
                      <span className="mono">
                        {String(edge.direction)} · {String(edge.type)}
                      </span>
                      <div>
                        {String(edge.source_title)} → {String(edge.target_title)}
                      </div>
                      <span className="cell-meta">
                        strength {Number(edge.strength).toFixed(2)} · confidence{" "}
                        {Number(edge.confidence).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
              <details>
                <summary>Contradictions ({node.contradictions.length})</summary>
                <ul className="relationship-list">
                  {node.contradictions.map((edge) => (
                    <li key={String(edge.id)}>
                      {String(edge.source_title)} contradicts {String(edge.target_title)}
                    </li>
                  ))}
                </ul>
              </details>
              <details>
                <summary>Usage history ({node.usage.length})</summary>
                <ul className="plain-list">
                  {node.usage.slice(0, 30).map((usage) => (
                    <li key={String(usage.id)}>
                      <strong>{String(usage.outcome)}</strong>
                      <span className="cell-meta">
                        {String(usage.reported_by)} · reinforcement{" "}
                        {Number(usage.reinforcement_delta).toFixed(3)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </article>
        </div>

        <aside>
          <section className="panel">
            <p className="section-label">Correction creates v{node.current_version + 1}</p>
            <h2>Edit current knowledge</h2>
            <form
              action={editNodeAction}
              className="form-grid"
              style={{ gridTemplateColumns: "1fr" }}
            >
              <input type="hidden" name="workspace_id" value={workspace} />
              <input type="hidden" name="node_id" value={node.id} />
              <input type="hidden" name="expected_version" value={node.current_version} />
              <label>
                Title
                <input name="title" defaultValue={node.title} required />
              </label>
              <label>
                Atomic statement
                <textarea
                  name="canonical_statement"
                  defaultValue={node.canonical_statement}
                  required
                />
              </label>
              <label>
                Verification
                <select name="verification" defaultValue={node.verification}>
                  {VERIFICATION_LEVELS.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Sensitivity
                <select name="sensitivity" defaultValue={node.sensitivity}>
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
                  step="0.01"
                  defaultValue={node.confidence}
                />
              </label>
              <label>
                Importance
                <input
                  name="importance"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  defaultValue={node.importance}
                />
              </label>
              <label>
                Salience
                <input
                  name="salience"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  defaultValue={node.salience}
                />
              </label>
              <label>
                Change reason
                <input
                  name="change_reason"
                  required
                  minLength={3}
                  placeholder="Correction or review rationale"
                />
              </label>
              <button type="submit">Save new version</button>
            </form>
          </section>

          <section className="panel">
            <p className="section-label">Conservative consolidation</p>
            <h2>Merge into another node</h2>
            <p className="muted">
              Contradictory nodes are blocked. Provenance, aliases, and edges are retained.
            </p>
            <form
              action={mergeNodeAction}
              className="form-grid"
              style={{ gridTemplateColumns: "1fr" }}
            >
              <input type="hidden" name="workspace_id" value={workspace} />
              <input type="hidden" name="source_node_id" value={node.id} />
              <input type="hidden" name="expected_source_version" value={node.current_version} />
              <label>
                Target node UUID
                <input name="target_node_id" required pattern="[0-9a-fA-F-]{36}" />
              </label>
              <label>
                Target version
                <input name="expected_target_version" type="number" min="1" required />
              </label>
              <label>
                Merge rationale
                <input name="reason" required minLength={3} />
              </label>
              <button className="secondary" type="submit">
                Merge after review
              </button>
            </form>
          </section>

          <section className="panel">
            <p className="section-label">Lifecycle only</p>
            <h2>Archive knowledge</h2>
            <p className="muted">
              Archival removes the node from active retrieval without erasing history.
            </p>
            <form action={archiveNodeAction}>
              <input type="hidden" name="workspace_id" value={workspace} />
              <input type="hidden" name="node_id" value={node.id} />
              <input type="hidden" name="reason" value="Archived by operator from node detail" />
              <button className="danger" type="submit">
                Archive node
              </button>
            </form>
          </section>
        </aside>
      </div>
    </AdminShell>
  );
}
