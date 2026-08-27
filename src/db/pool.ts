import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { databaseUrl } from "@/src/config";
import { logger } from "@/src/lib/logger";

const globalPool = globalThis as typeof globalThis & { axelynKnowledgePool?: Pool };

export function getPool(): Pool {
  if (!globalPool.axelynKnowledgePool) {
    globalPool.axelynKnowledgePool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "axelyn-knowledge",
    });
    globalPool.axelynKnowledgePool.on("error", (error) => {
      logger.error("database.pool_error", { message: error.message });
    });
  }
  return globalPool.axelynKnowledgePool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (globalPool.axelynKnowledgePool) {
    await globalPool.axelynKnowledgePool.end();
    delete globalPool.axelynKnowledgePool;
  }
}
