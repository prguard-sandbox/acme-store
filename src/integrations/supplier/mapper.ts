import { logger } from "../../lib/logger";
import { rawStockItemSchema, type RawStockItem } from "./types";

const log = logger.child({ component: "supplier-mapper" });

/** Lead time to assume when the supplier's free-text value makes no sense. */
const DEFAULT_LEAD_TIME_DAYS = 14;

/** A supplier SKU as we understand it: quantities are in units, not cases. */
export interface SupplierOffer {
  supplierSku: string;
  caseSize: number;
  availableCases: number;
  /** Units we could buy right now. Zero while the item is backordered. */
  availableUnits: number;
  leadTimeDays: number;
  updatedAt: Date;
}

export function casesToUnits(cases: number, caseSize: number): number {
  return cases * caseSize;
}

/**
 * The supplier only ships whole cases, so a request for `units` has to be
 * rounded up to the next full case.
 */
export function unitsToCases(units: number, caseSize: number): number {
  return Math.floor(units / caseSize);
}

/**
 * Pulls the longest wait out of free text: "2-4 business days" -> 4,
 * "5 days" -> 5. Returns null when there is no number at all.
 */
export function parseLeadTimeDays(text: string): number | null {
  const numbers = text.match(/\d+/g);
  if (!numbers) return null;
  return Math.max(...numbers.map(Number));
}

/** Converts one validated feed row. Discontinued items are not offers. */
export function toOffer(raw: RawStockItem): SupplierOffer | null {
  if (raw.status === "discontinued") {
    return null;
  }
  const availableCases = raw.status === "backordered" ? 0 : raw.cases_available;
  return {
    supplierSku: raw.sku,
    caseSize: raw.case_size,
    availableCases,
    availableUnits: casesToUnits(availableCases, raw.case_size),
    leadTimeDays: parseLeadTimeDays(raw.lead_time) ?? DEFAULT_LEAD_TIME_DAYS,
    updatedAt: new Date(raw.updated_at),
  };
}

export interface MappedPage {
  offers: SupplierOffer[];
  /** Rows that were malformed or discontinued. */
  skipped: number;
}

/** Validates and converts a page of raw feed rows, dropping the ones we cannot use. */
export function mapStockItems(items: readonly unknown[]): MappedPage {
  const offers: SupplierOffer[] = [];
  let skipped = 0;

  for (const item of items) {
    const parsed = rawStockItemSchema.safeParse(item);
    if (!parsed.success) {
      skipped++;
      log.warn("skipping malformed stock row", { issues: parsed.error.issues.slice(0, 3) });
      continue;
    }
    const offer = toOffer(parsed.data);
    if (offer) {
      offers.push(offer);
    } else {
      skipped++;
    }
  }

  return { offers, skipped };
}
