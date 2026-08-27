import Link from "next/link";
import { requireOperator } from "@/src/auth/operator-auth";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function MemoryMap({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; node_id?: string; depth?: string }>;
}) {
  const operator = await requireOperator();
  const params = await searchParams;
  const workspace = workspaceFrom(params.workspace);
  let rootId = params.node_id;
  if (!rootId) {
    const first = await nodeService.list({
      workspace_id: workspace,
      lifecycle_status: "ACTIVE",
      limit: 1,
    });
    rootId = first.items[0]?.id;
  }
  const depth = Math.min(3, Math.max(1, Number(params.depth ?? 1)));
  const graph = rootId ? await nodeService.neighborhood(workspace, rootId, depth, 50) : null;
  const positions = new Map<string, { x: number; y: number }>();
  if (graph && rootId) {
    positions.set(rootId, { x: 400, y: 260 });
    const surrounding = graph.nodes.filter((node) => node.id !== rootId);
    surrounding.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, surrounding.length) - Math.PI / 2;
      const ring = 165 + Number(node.depth) * 35;
      positions.set(node.id, { x: 400 + Math.cos(angle) * ring, y: 260 + Math.sin(angle) * ring });
    });
  }

  return (
    <AdminShell operator={operator} workspace={workspace}>
      <PageHeader
        eyebrow="Associative view / bounded neighborhood"
        title="Memory map"
        description={`A cycle-safe ${depth}-hop view. Select a node to recenter; the service never attempts to render the entire graph.`}
      />
      <div className="content-width">
        {!graph || !rootId ? (
          <div className="panel empty-state">
            <strong>No active graph exists yet.</strong>
            Approve nodes and relationships in the inbox to form a neighborhood.
          </div>
        ) : (
          <>
            <div className="memory-map">
              <svg viewBox="0 0 800 520" role="img" aria-labelledby="map-title map-description">
                <title id="map-title">Bounded knowledge neighborhood</title>
                <desc id="map-description">
                  Directed relationships around{" "}
                  {graph.nodes.find((node) => node.id === rootId)?.title}. A textual relationship
                  list follows the visualization.
                </desc>
                <defs>
                  <marker
                    id="arrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#66868b" />
                  </marker>
                </defs>
                {graph.edges.map((edge) => {
                  const from = positions.get(String(edge.source_node_id));
                  const to = positions.get(String(edge.target_node_id));
                  if (!from || !to) return null;
                  return (
                    <g key={String(edge.id)}>
                      <line
                        className="map-edge"
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        markerEnd="url(#arrow)"
                      />
                      <text
                        className="map-edge-label"
                        x={(from.x + to.x) / 2}
                        y={(from.y + to.y) / 2 - 6}
                      >
                        {String(edge.type)}
                      </text>
                    </g>
                  );
                })}
                {graph.nodes.map((node) => {
                  const position = positions.get(node.id)!;
                  const label = node.title.length > 22 ? `${node.title.slice(0, 20)}…` : node.title;
                  return (
                    <a
                      href={`/memory-map?workspace=${workspace}&node_id=${node.id}&depth=1`}
                      key={node.id}
                      aria-label={`Recenter map on ${node.title}`}
                    >
                      <g className={`map-node ${node.id === rootId ? "is-root" : ""}`}>
                        <circle cx={position.x} cy={position.y} r={node.id === rootId ? 52 : 40} />
                        <text x={position.x} y={position.y + 4}>
                          {label}
                        </text>
                      </g>
                    </a>
                  );
                })}
              </svg>
            </div>
            <div className="section-heading" style={{ marginTop: 28 }}>
              <div>
                <p className="section-label">Accessible graph transcript</p>
                <h2>Directed relationships</h2>
              </div>
              {depth < 3 ? (
                <Link
                  className="button secondary"
                  href={`/memory-map?workspace=${workspace}&node_id=${rootId}&depth=${depth + 1}`}
                >
                  Expand to {depth + 1} hops
                </Link>
              ) : null}
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Direction and type</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {graph.edges.map((edge) => {
                    const source = graph.nodes.find(
                      (node) => node.id === String(edge.source_node_id),
                    );
                    const target = graph.nodes.find(
                      (node) => node.id === String(edge.target_node_id),
                    );
                    return (
                      <tr key={String(edge.id)}>
                        <td>{source?.title ?? String(edge.source_node_id)}</td>
                        <td className="mono">→ {String(edge.type)}</td>
                        <td>{target?.title ?? String(edge.target_node_id)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
