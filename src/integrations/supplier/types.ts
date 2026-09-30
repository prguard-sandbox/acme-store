import { z } from "zod";

/**
 * Wire types for the Northwind supplier API. Field names are snake_case
 * because that is what goes over the wire; src/integrations/supplier/mapper.ts
 * converts them into our own vocabulary.
 */

export const rawStockItemSchema = z.object({
  sku: z.string().min(1),
  status: z.enum(["active", "backordered", "discontinued"]),
  cases_available: z.number().int().min(0),
  /** Units per case. The supplier only ships whole cases. */
  case_size: z.number().int().min(1),
  /** Free text such as "2-4 business days". */
  lead_time: z.string(),
  updated_at: z.string().datetime(),
});
export type RawStockItem = z.infer<typeof rawStockItemSchema>;

/**
 * Items are validated one by one by the mapper so a single malformed row does
 * not take down a whole page of the feed.
 */
export const rawStockPageSchema = z.object({
  items: z.array(z.unknown()),
  next_cursor: z.string().nullable(),
});
export type RawStockPage = z.infer<typeof rawStockPageSchema>;

export const allocationResponseSchema = z.object({
  allocation_id: z.string(),
  sku: z.string(),
  /** May be lower than requested when the supplier is short. */
  cases_allocated: z.number().int().min(0),
  estimated_arrival: z.string().datetime().nullable(),
});
export type AllocationResponse = z.infer<typeof allocationResponseSchema>;

export interface AllocationRequest {
  supplierSku: string;
  cases: number;
  /** Replaying the same key returns the original allocation instead of creating a new one. */
  idempotencyKey: string;
}
