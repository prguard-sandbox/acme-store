import { db } from "./client";

/** Why a product's stock level changed outside of an order. */
export type MovementReason = "supplier_restock" | "manual_adjustment";

export interface StockMovement {
  id: number;
  productId: number;
  /** Positive when stock came in, negative when it went out. */
  delta: number;
  reason: MovementReason;
  /** Free-form pointer to whatever caused the movement, e.g. "sync-run-42". */
  reference: string | null;
  createdAt: string;
}

export interface NewMovement {
  productId: number;
  delta: number;
  reason: MovementReason;
  reference?: string;
}

interface MovementRow {
  id: number;
  product_id: number;
  delta: number;
  reason: MovementReason;
  reference: string | null;
  created_at: string;
}

function toMovement(row: MovementRow): StockMovement {
  return {
    id: row.id,
    productId: row.product_id,
    delta: row.delta,
    reason: row.reason,
    reference: row.reference,
    createdAt: row.created_at,
  };
}

export function record(input: NewMovement): void {
  db.prepare(
    `INSERT INTO stock_movements (product_id, delta, reason, reference)
     VALUES (@productId, @delta, @reason, @reference)`,
  ).run({ reference: null, ...input });
}

export function listForProduct(productId: number, limit: number): StockMovement[] {
  const rows = db
    .prepare("SELECT * FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT ?")
    .all(productId, limit) as MovementRow[];
  return rows.map(toMovement);
}
