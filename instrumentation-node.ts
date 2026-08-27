import { closePool } from "@/src/db/pool";
import { logger } from "@/src/lib/logger";

const instrumentationState = globalThis as typeof globalThis & {
  axelynShutdownHandlersInstalled?: boolean;
};

if (!instrumentationState.axelynShutdownHandlersInstalled) {
  const shutdown = async (signal: string) => {
    logger.info("application.shutdown", { signal });
    try {
      await closePool();
      process.exit(0);
    } catch (error) {
      logger.error("application.shutdown_failed", {
        signal,
        message: error instanceof Error ? error.message : "Unknown shutdown failure",
      });
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  instrumentationState.axelynShutdownHandlersInstalled = true;
}
