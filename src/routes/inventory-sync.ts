import { Router } from "express";
import { z } from "zod";
import * as products from "../db/products";
import * as stockMovements from "../db/stock-movements";
import * as syncRuns from "../db/sync-runs";
import { NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import { requireAdmin } from "../middleware/auth";
import type { InventorySyncService } from "../services/inventory-sync";
import type { SyncScheduler } from "../services/sync-scheduler";

const idParams = z.object({ id: z.coerce.number().int().positive() });

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const movementsQuery = z.object({
  productId: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export interface InventorySyncRouteDeps {
  sync: InventorySyncService;
  scheduler?: SyncScheduler;
}

/** Admin endpoints for inspecting and triggering the supplier inventory sync. */
export function createInventorySyncRouter({ sync, scheduler }: InventorySyncRouteDeps): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get("/status", (_req, res) => {
    res.json({
      scheduled: scheduler?.isStarted() ?? false,
      running: sync.isRunning(),
      lastTickAt: scheduler?.getLastTickAt()?.toISOString() ?? null,
      lastRun: syncRuns.latest() ?? null,
    });
  });

  router.get("/runs", (req, res) => {
    const { limit } = listQuery.parse(req.query);
    res.json({ items: syncRuns.listRecent(limit), limit });
  });

  router.get("/runs/:id", (req, res) => {
    const { id } = idParams.parse(req.params);
    const run = syncRuns.findById(id);
    if (!run) {
      throw new NotFoundError("Sync run", id);
    }
    res.json(run);
  });

  router.get("/low-stock", (_req, res) => {
    const items = products.listBelowReorderPoint().map((product) => ({
      productId: product.id,
      sku: product.sku,
      supplierSku: product.supplierSku,
      stock: product.stock,
      reorderPoint: product.reorderPoint,
      targetStock: product.targetStock,
      shortfall: Math.max(0, product.targetStock - product.stock),
    }));
    res.json({ items, total: items.length });
  });

  router.get("/movements", (req, res) => {
    const { productId, limit } = movementsQuery.parse(req.query);
    if (!products.findById(productId)) {
      throw new NotFoundError("Product", productId);
    }
    res.json({ items: stockMovements.listForProduct(productId, limit), limit });
  });

  router.post("/run", async (_req, res) => {
    logger.info("manual inventory sync requested");
    const summary = await sync.run("manual");
    res.json(summary);
  });

  return router;
}
