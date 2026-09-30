import { z } from "zod";

const syncEnvSchema = z.object({
  SUPPLIER_API_URL: z.string().url().default("https://api.northwind-supply.example/v2"),
  SUPPLIER_API_KEY: z.string().min(1).optional(),
  SUPPLIER_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
  INVENTORY_SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  INVENTORY_SYNC_INTERVAL_MS: z.coerce.number().int().min(60_000).default(15 * 60_000),
  INVENTORY_SYNC_PAGE_SIZE: z.coerce.number().int().min(10).max(500).default(200),
  INVENTORY_SYNC_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
});

export interface SyncConfig {
  /** True when the background scheduler should run. */
  enabled: boolean;
  supplierApiUrl: string;
  /** Undefined means the supplier integration is not configured at all. */
  supplierApiKey: string | undefined;
  supplierTimeoutMs: number;
  intervalMs: number;
  pageSize: number;
  concurrency: number;
}

let cached: SyncConfig | undefined;

/**
 * Reads and validates the inventory sync settings once. Throws at boot on bad
 * values so a typo in an env var never turns into a silent default.
 */
export function getSyncConfig(): SyncConfig {
  if (cached) return cached;

  const env = syncEnvSchema.parse(process.env);
  if (env.INVENTORY_SYNC_ENABLED && !env.SUPPLIER_API_KEY) {
    throw new Error("SUPPLIER_API_KEY is required when INVENTORY_SYNC_ENABLED=true");
  }

  cached = {
    enabled: env.INVENTORY_SYNC_ENABLED,
    supplierApiUrl: env.SUPPLIER_API_URL,
    supplierApiKey: env.SUPPLIER_API_KEY,
    supplierTimeoutMs: env.SUPPLIER_TIMEOUT_MS,
    intervalMs: env.INVENTORY_SYNC_INTERVAL_MS,
    pageSize: env.INVENTORY_SYNC_PAGE_SIZE,
    concurrency: env.INVENTORY_SYNC_CONCURRENCY,
  };
  return cached;
}
