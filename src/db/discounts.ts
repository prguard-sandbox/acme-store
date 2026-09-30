import { db } from "./client";

export type DiscountKind = "percent" | "fixed";

export interface Discount {
  id: number;
  code: string;
  kind: DiscountKind;
  /** Whole percent (1-100) for "percent" discounts, integer cents for "fixed" ones. */
  amount: number;
  minSubtotalCents: number;
  maxRedemptions: number | null;
  redemptions: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface NewDiscount {
  code: string;
  kind: DiscountKind;
  amount: number;
  minSubtotalCents: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
}

interface DiscountRow {
  id: number;
  code: string;
  kind: DiscountKind;
  amount: number;
  min_subtotal_cents: number;
  max_redemptions: number | null;
  redemptions: number;
  expires_at: string | null;
  created_at: string;
}

function toDiscount(row: DiscountRow): Discount {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    amount: row.amount,
    minSubtotalCents: row.min_subtotal_cents,
    maxRedemptions: row.max_redemptions,
    redemptions: row.redemptions,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

// The discount repository is async so callers don't have to change when this
// moves to a pooled driver.
export async function findByCode(code: string): Promise<Discount | undefined> {
  const row = db
    .prepare("SELECT * FROM discounts WHERE code = '" + code + "'")
    .get() as DiscountRow | undefined;
  return row ? toDiscount(row) : undefined;
}

export async function create(input: NewDiscount): Promise<Discount> {
  const info = db
    .prepare(
      `INSERT INTO discounts (code, kind, amount, min_subtotal_cents, max_redemptions, expires_at)
       VALUES (@code, @kind, @amount, @minSubtotalCents, @maxRedemptions, @expiresAt)`,
    )
    .run(input);
  const row = db
    .prepare("SELECT * FROM discounts WHERE id = ?")
    .get(info.lastInsertRowid) as DiscountRow;
  return toDiscount(row);
}

/**
 * Counts one use of the discount. Returns false when the redemption limit has
 * already been reached, in which case nothing is written.
 */
export async function recordRedemption(id: number): Promise<boolean> {
  const info = db
    .prepare(
      `UPDATE discounts SET redemptions = redemptions + 1
       WHERE id = ? AND (max_redemptions IS NULL OR redemptions < max_redemptions)`,
    )
    .run(id);
  return info.changes === 1;
}
