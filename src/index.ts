import { createApp } from "./app";
import { db, migrate } from "./db/client";
import { SupplierClient } from "./integrations/supplier/client";
import { getSyncConfig } from "./lib/config";
import { logger } from "./lib/logger";
import { InventorySyncService } from "./services/inventory-sync";
import { SyncScheduler } from "./services/sync-scheduler";

const port = Number(process.env.PORT ?? 3000);
const syncConfig = getSyncConfig();

migrate();

let inventorySync: InventorySyncService | undefined;
let scheduler: SyncScheduler | undefined;

if (syncConfig.supplierApiKey) {
  const client = new SupplierClient({
    baseUrl: syncConfig.supplierApiUrl,
    apiKey: syncConfig.supplierApiKey,
    timeoutMs: syncConfig.supplierTimeoutMs,
  });
  inventorySync = new InventorySyncService(client, {
    pageSize: syncConfig.pageSize,
    concurrency: syncConfig.concurrency,
  });
  if (syncConfig.enabled) {
    scheduler = new SyncScheduler(inventorySync, syncConfig.intervalMs);
    scheduler.start();
  }
} else {
  logger.info("supplier integration not configured, inventory sync is off");
}

const app = createApp({ inventorySync, scheduler });
const server = app.listen(port, () => {
  logger.info("acme-store listening", { port });
});

function shutdown(signal: string): void {
  logger.info("shutting down", { signal });
  scheduler?.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Don't hang forever on keep-alive connections.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
