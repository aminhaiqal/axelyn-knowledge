import Link from "next/link";
import { requireOperator } from "@/src/auth/operator-auth";
import { nodeService } from "@/src/services/node-service";
import { workspaceFrom } from "@/src/ui/workspace";
import { AdminShell } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";
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

      {!graph || !rootId ? (
        <EmptyState
          description="Approve nodes and relationships in the inbox to form a neighborhood."
          title="No active graph exists yet."
        />
      ) : (
        <>
          <Surface className="overflow-hidden p-4 sm:p-6">
            <div className="overflow-hidden rounded-[18px] border border-[#ddd6ca] bg-[#f7f2ea] [background-image:radial-gradient(#d3cbc0_0.8px,transparent_0.8px)] [background-size:16px_16px]">
              <svg
                aria-labelledby="map-title map-description"
                className="block min-h-[540px] w-full"
                role="img"
                viewBox="0 0 800 520"
              >
                <title id="map-title">Bounded knowledge neighborhood</title>
                <desc id="map-description">
                  Directed relationships around{" "}
                  {graph.nodes.find((node) => node.id === rootId)?.title}. A textual relationship
                  list follows the visualization.
                </desc>
                <defs>
                  <marker
                    id="arrow"
                    markerHeight="5"
                    markerWidth="5"
                    orient="auto-start-reverse"
                    refX="8"
                    refY="5"
                    viewBox="0 0 10 10"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b6736" />
                  </marker>
                </defs>
                {graph.edges.map((edge) => {
                  const from = positions.get(String(edge.source_node_id));
                  const to = positions.get(String(edge.target_node_id));
                  if (!from || !to) return null;

                  return (
                    <g key={String(edge.id)}>
                      <line
                        markerEnd="url(#arrow)"
                        stroke="#9f978a"
                        strokeWidth="1.5"
                        x1={from.x}
                        x2={to.x}
                        y1={from.y}
                        y2={to.y}
                      />
                      <text
                        fill="#8b6736"
                        fontFamily="monospace"
                        fontSize="8"
                        textAnchor="middle"
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
                      aria-label={`Recenter map on ${node.title}`}
                      href={`/memory-map?workspace=${workspace}&node_id=${node.id}&depth=1`}
                      key={node.id}
                    >
                      <g>
                        <circle
                          cx={position.x}
                          cy={position.y}
                          fill={node.id === rootId ? "#0f1b2f" : "rgba(255,255,255,0.96)"}
                          r={node.id === rootId ? 52 : 40}
                          stroke={node.id === rootId ? "#0f1b2f" : "#8b6736"}
                          strokeWidth="2"
                        />
                        <text
                          fill={node.id === rootId ? "#ffffff" : "#152033"}
                          fontFamily="Public Sans Variable, sans-serif"
                          fontSize="11"
                          fontWeight="700"
                          textAnchor="middle"
                          x={position.x}
                          y={position.y + 4}
                        >
                          {label}
                        </text>
                      </g>
                    </a>
                  );
                })}
              </svg>
            </div>
          </Surface>

          <section className="space-y-4">
            <SectionHeader
              action={
                depth < 3 ? (
                  <Link
                    className={cn(
                      buttonVariants({ size: "lg", variant: "outline" }),
                      "border-[#d7d0c5] bg-[#fffdf8] px-4",
                    )}
                    href={`/memory-map?workspace=${workspace}&node_id=${rootId}&depth=${depth + 1}`}
                  >
                    Expand to {depth + 1} hops
                  </Link>
                ) : null
              }
              eyebrow="Accessible graph transcript"
              title="Directed relationships"
            />

            <Surface className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#ddd5c9] bg-[#f5f1e8] hover:bg-[#f5f1e8]">
                    <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Source
                    </TableHead>
                    <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Direction and type
                    </TableHead>
                    <TableHead className="px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Target
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {graph.edges.map((edge) => {
                    const source = graph.nodes.find(
                      (node) => node.id === String(edge.source_node_id),
                    );
                    const target = graph.nodes.find(
                      (node) => node.id === String(edge.target_node_id),
                    );

                    return (
                      <TableRow className="border-slate-200/70" key={String(edge.id)}>
                        <TableCell className="px-6 py-5 align-top whitespace-normal">
                          {source?.title ?? String(edge.source_node_id)}
                        </TableCell>
                        <TableCell className="px-6 py-5 align-top font-mono text-xs uppercase tracking-[0.16em] whitespace-normal text-[#8b6736]">
                          → {String(edge.type)}
                        </TableCell>
                        <TableCell className="px-6 py-5 align-top whitespace-normal">
                          {target?.title ?? String(edge.target_node_id)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Surface>
          </section>
        </>
      )}
    </AdminShell>
  );
}
