import { createApp } from "./app";
import { db, migrate } from "./db/client";
import { logger } from "./lib/logger";

const port = Number(process.env.PORT ?? 3000);

migrate();

const app = createApp();
const server = app.listen(port, () => {
  logger.info("acme-store listening", { port });
});

function shutdown(signal: string): void {
  logger.info("shutting down", { signal });
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Don't hang forever on keep-alive connections.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
