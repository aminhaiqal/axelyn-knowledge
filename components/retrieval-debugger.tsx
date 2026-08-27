"use client";

import { useActionState } from "react";
import { debugRetrievalAction, type RetrievalActionState } from "@/app/actions";
import { NODE_TYPES, VERIFICATION_LEVELS } from "@/src/domain/enums";
import { TrustBadge } from "@/components/trust-badge";

const initialState: RetrievalActionState = {};

export function RetrievalDebugger({ workspace }: { workspace: string }) {
  const [state, action, pending] = useActionState(debugRetrievalAction, initialState);
  const result = state.result;

  return (
    <div className="debug-layout">
      <form action={action} className="panel debug-form">
        <p className="section-label">Retrieval constraints</p>
        <h2>Activate working memory</h2>
        <input type="hidden" name="workspace_id" value={workspace} />
        <label>
          Query
          <textarea
            name="query"
            required
            defaultValue="How should we explain explainability in regulated systems?"
          />
        </label>
        <label>
          Purpose
          <input name="purpose" required defaultValue="Prepare a new LinkedIn draft" />
        </label>
        <label>
          Audience
          <input name="audience" defaultValue="Technology leaders in regulated industries" />
        </label>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label>
            Maximum sensitivity
            <select name="maximum_sensitivity" defaultValue="INTERNAL">
              <option>PUBLIC</option>
              <option>INTERNAL</option>
              <option>CONFIDENTIAL</option>
              <option>RESTRICTED</option>
            </select>
          </label>
          <label>
            Graph depth
            <select name="maximum_graph_depth" defaultValue="2">
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>
          <label>
            Result limit
            <input name="result_limit" type="number" min="1" max="50" defaultValue="12" />
          </label>
          <label>
            Token budget
            <input name="token_budget" type="number" min="64" max="32000" defaultValue="1800" />
          </label>
        </div>
        <p className="section-label">Allowed verification</p>
        <div className="checkbox-grid">
          {VERIFICATION_LEVELS.map((value) => (
            <label key={value}>
              <input
                type="checkbox"
                name="allowed_verification_levels"
                value={value}
                defaultChecked
              />
              {value.replaceAll("_", " ")}
            </label>
          ))}
        </div>
        <details>
          <summary>Limit node types</summary>
          <div className="checkbox-grid">
            {NODE_TYPES.map((value) => (
              <label key={value}>
                <input type="checkbox" name="desired_node_types" value={value} />
                {value.replaceAll("_", " ")}
              </label>
            ))}
          </div>
        </details>
        <button type="submit" disabled={pending} style={{ marginTop: 16 }}>
          {pending ? "Activating…" : "Run retrieval"}
        </button>
      </form>

      <section aria-live="polite">
        {state.error ? <div className="error-banner">{state.error}</div> : null}
        {!result ? (
          <div className="panel empty-state">
            <strong>No retrieval run yet.</strong>
            Submit a query to inspect fused seeds, graph paths, trust-aware scores, and the bounded
            context pack.
          </div>
        ) : (
          <>
            <section className="panel">
              <p className="section-label">
                Seed fusion /{" "}
                {result.embedding_available ? "semantic + lexical" : "lexical fallback"}
              </p>
              <h2>{result.seed_results.length} fused seeds</h2>
              <ul className="plain-list">
                {result.seed_results.map((seed) => (
                  <li key={String(seed.node_id)}>
                    <span className="mono">{String(seed.node_id)}</span>
                    <div className="cell-meta">
                      fused {Number(seed.fused_score).toFixed(4)} · semantic{" "}
                      {Number(seed.semantic_score).toFixed(4)} · lexical{" "}
                      {Number(seed.lexical_score).toFixed(4)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel">
              <p className="section-label">Selected context / inspectable scoring</p>
              <h2>{result.items.length} recalled nodes</h2>
              <ol className="result-list">
                {result.items.map((item) => (
                  <li key={item.node_id}>
                    <div className="inline-badges">
                      <TrustBadge kind="origin" value={item.trust.origin} />
                      <TrustBadge kind="verification" value={item.trust.verification} />
                      <TrustBadge kind="sensitivity" value={item.sensitivity} />
                    </div>
                    <p className="canonical">{item.canonical_statement}</p>
                    <p className="muted">Why: {item.why_recalled}</p>
                    <div className="path-trace">
                      {item.graph_path.node_ids.map((id, index) => (
                        <span key={`${id}-${index}`}>
                          {index ? `—${item.graph_path.edge_types[index - 1]}→ ` : ""}
                          {id.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                    <div className="score-bars">
                      {Object.entries(item.score_components).map(([key, value]) => (
                        <div className="score-row" key={key}>
                          <span>{key.replaceAll("_", " ")}</span>
                          <span className="score-track">
                            <span
                              style={{
                                width: `${Math.max(0, Math.min(100, Number(value) * 100))}%`,
                              }}
                            />
                          </span>
                          <span className="mono">{Number(value).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    {item.contradicting_nodes.length ? (
                      <p className="error-banner" style={{ marginTop: 12 }}>
                        Contradiction retained:{" "}
                        {item.contradicting_nodes
                          .map((node) => node.canonical_statement)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
            <section className="panel">
              <p className="section-label">Working-memory contract</p>
              <h2>Model-ready context pack</h2>
              <pre className="context-pack">{JSON.stringify(result.context_pack, null, 2)}</pre>
            </section>
          </>
        )}
      </section>
    </div>
  );
}
