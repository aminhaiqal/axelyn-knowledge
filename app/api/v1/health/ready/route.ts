import { apiError } from "@/src/api/http";
import { query } from "@/src/db/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await query<{ vector_version: string }>(
      `SELECT extversion AS vector_version FROM pg_extension WHERE extname = 'vector'`,
    );
    if (!result.rowCount) throw new Error("pgvector is not enabled");
    return Response.json({
      status: "ready",
      database: "connected",
      pgvector: result.rows[0].vector_version,
    });
  } catch (error) {
    const response = apiError(error);
    return Response.json(
      {
        status: "not_ready",
        error: { code: "DEPENDENCY_UNAVAILABLE", message: "Database or pgvector is unavailable." },
      },
      { status: 503, headers: response.headers },
    );
  }
}
