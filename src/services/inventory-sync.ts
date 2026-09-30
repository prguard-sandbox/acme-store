import * as products from "../db/products";
import * as stockMovements from "../db/stock-movements";
import * as syncRuns from "../db/sync-runs";
import type { SupplierClient } from "../integrations/supplier/client";
import {
  casesToUnits,
  mapStockItems,
  unitsToCases,
  type SupplierOffer,
} from "../integrations/supplier/mapper";
import { mapLimit } from "../lib/concurrency";
import { ConflictError } from "../lib/errors";
import { errorFields, logger } from "../lib/logger";

export interface InventorySyncOptions {
  /** Rows requested per page of the supplier feed. */
  pageSize: number;
  /** Products topped up in parallel within a page. */
  concurrency: number;
}

export interface SyncSummary {
  runId: number;
  /** Feed rows looked at, including the ones we could not use. */
  seen: number;
  toppedUp: number;
  skipped: number;
  failed: number;
}

type TopUpOutcome = "topped_up" | "skipped";

interface WorkItem {
  product: products.Product;
  offer: SupplierOffer;
}

/**
 * Keeps supplier-backed products stocked. A run walks the supplier's stock
 * feed and, for every product that has dropped below its reorder point,
 * allocates whole cases from the supplier and adds the units to local stock.
 *
 * Only one run can be active at a time; a second call fails with a
 * ConflictError rather than queueing up behind the first.
 */
export class InventorySyncService {
  private running = false;
  private readonly log = logger.child({ component: "inventory-sync" });

  constructor(
    private readonly client: SupplierClient,
    private readonly options: InventorySyncOptions,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  async run(trigger: syncRuns.SyncTrigger): Promise<SyncSummary> {
    if (this.running) {
      throw new ConflictError("An inventory sync is already running");
    }

    const run = syncRuns.start(trigger);
    this.running = true;
    const summary: SyncSummary = { runId: run.id, seen: 0, toppedUp: 0, skipped: 0, failed: 0 };
    this.log.info("sync started", { runId: run.id, trigger });

    try {
      // Look up the products that need stock once, instead of once per feed row.
      const needsStock = new Map<string, products.Product>();
      for (const product of products.listBelowReorderPoint()) {
        if (product.supplierSku) {
          needsStock.set(product.supplierSku, product);
        }
      }
      this.log.info("products below reorder point", { runId: run.id, count: needsStock.size });

      for await (const page of this.client.stockPages(this.options.pageSize)) {
        const { offers, skipped } = mapStockItems(page.items);
        summary.seen += page.items.length;
        summary.skipped += skipped;

        const work: WorkItem[] = [];
        for (const offer of offers) {
          const product = needsStock.get(offer.supplierSku);
          if (product) {
            work.push({ product, offer });
          } else {
            summary.skipped++;
          }
        }

        await mapLimit(work, this.options.concurrency, (item) => this.processItem(run.id, item, summary));
      }

      syncRuns.finish(run.id, countsOf(summary));
      this.log.info("sync finished", { ...summary });
      return summary;
    } catch (err) {
      syncRuns.fail(run.id, err instanceof Error ? err.message : String(err), countsOf(summary));
      this.log.error("sync failed", { runId: run.id, ...errorFields(err) });
      throw err;
    } finally {
      this.running = false;
    }
  }

  private async processItem(runId: number, item: WorkItem, summary: SyncSummary): Promise<void> {
    const { product, offer } = item;
    try {
      const outcome = await this.topUp(runId, product, offer);
      if (outcome === "topped_up") {
        summary.toppedUp++;
      } else {
        summary.skipped++;
      }
    } catch (err) {
      // One bad product must not abort the rest of the run.
      summary.failed++;
      this.log.warn("could not top up product", {
        runId,
        productId: product.id,
        sku: product.sku,
        ...errorFields(err),
      });
    }
  }

  /**
   * Buys enough whole cases to bring `product` back up to its target stock,
   * limited by what the supplier has on hand.
   */
  private async topUp(runId: number, product: products.Product, offer: SupplierOffer): Promise<TopUpOutcome> {
    if (product.stock >= product.reorderPoint) {
      return "skipped";
    }
    if (offer.availableUnits <= 0) {
      return "skipped";
    }

    const wantedUnits = product.targetStock - product.stock;
    const grantUnits = Math.min(wantedUnits, offer.availableUnits);
    const cases = unitsToCases(grantUnits, offer.caseSize);
    if (cases <= 0) {
      return "skipped";
    }

    const allocation = await this.client.allocate({
      supplierSku: offer.supplierSku,
      cases,
      idempotencyKey: `sync-${runId}-${offer.supplierSku}`,
    });

    const receivedUnits = casesToUnits(allocation.cases_allocated, offer.caseSize);
    if (receivedUnits <= 0) {
      return "skipped";
    }

    products.setStock(product.id, product.stock + receivedUnits);
    stockMovements.record({
      productId: product.id,
      delta: receivedUnits,
      reason: "supplier_restock",
      reference: `sync-run-${runId}`,
    });
    this.log.info("topped up stock", {
      runId,
      productId: product.id,
      sku: product.sku,
      cases: allocation.cases_allocated,
      units: receivedUnits,
      leadTimeDays: offer.leadTimeDays,
    });
    return "topped_up";
  }
}

function countsOf(summary: SyncSummary): syncRuns.SyncCounts {
  return { seen: summary.seen, updated: summary.toppedUp, failed: summary.failed };
}
