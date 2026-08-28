import { afterAll, beforeEach } from "vitest";
import { closePool, query } from "@/src/db/pool";

beforeEach(async () => {
  await query(`
    TRUNCATE TABLE
      provider_settings,
      outbox_events,
      knowledge_usage,
      retrieval_run_items,
      retrieval_runs,
      knowledge_node_aliases,
      knowledge_edge_sources,
      knowledge_node_sources,
      knowledge_edge_versions,
      knowledge_edges,
      knowledge_node_versions,
      knowledge_nodes,
      knowledge_extractions,
      knowledge_sources,
      workspaces
    RESTART IDENTITY CASCADE
  `);
});

afterAll(async () => {
  await closePool();
});
