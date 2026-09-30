import { inTransaction } from "../db/client";
import * as products from "../db/products";
import { ConflictError, NotFoundError } from "../lib/errors";

export interface StockRequest {
  productId: number;
  quantity: number;
}

/**
 * Takes stock for every requested line, or for none of them. Throws a
 * ConflictError when any line is short, which rolls back the lines already
 * taken when the caller is inside a transaction.
 */
export function reserve(requests: StockRequest[]): void {
  inTransaction(() => {
    for (const { productId, quantity } of requests) {
      if (!products.adjustStock(productId, -quantity)) {
        throw new ConflictError(`Insufficient stock for product ${productId}`);
      }
    }
  });
}

/** Puts previously reserved stock back, e.g. when an order is cancelled. */
export function release(requests: StockRequest[]): void {
  inTransaction(() => {
    for (const { productId, quantity } of requests) {
      products.adjustStock(productId, quantity);
    }
  });
}

export function availableQuantity(productId: number): number {
  const product = products.findById(productId);
  if (!product) {
    throw new NotFoundError("Product", productId);
  }
  return product.stock;
}
