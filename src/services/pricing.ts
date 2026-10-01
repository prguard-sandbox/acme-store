import { findByCode, type Discount } from "../db/discounts";
import type { Product } from "../db/products";
import { ValidationError } from "../lib/errors";

/** Sales tax in basis points (825 = 8.25%). */
export const TAX_RATE_BPS = 825;
export const SHIPPING_CENTS = 599;
/** Orders at or above this subtotal ship for free. */
export const FREE_SHIPPING_THRESHOLD_CENTS = 7500;
/** Gift cards and clearance items never take part in discounts. */
const NON_DISCOUNTABLE_PREFIXES = ["GC-", "CLR-"];

export interface LineRequest {
  product: Product;
  quantity: number;
}

export interface PricedLine {
  productId: number;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface AppliedDiscount {
  code: string;
  cents: number;
}

export interface Quote {
  lines: PricedLine[];
  subtotalCents: number;
  discountCents: number;
  discountCode: string | null;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
}

/**
 * Applies a rate expressed in basis points to an amount of cents, rounding
 * half up. Integer math only: money never goes through floating point.
 */
export function applyBasisPoints(cents: number, bps: number): number {
  return Math.floor((cents * bps + 5_000) / 10_000);
}

export function priceLines(requests: LineRequest[]): PricedLine[] {
  return requests.map(({ product, quantity }) => ({
    productId: product.id,
    sku: product.sku,
    name: product.name,
    quantity,
    unitPriceCents: product.priceCents,
    lineTotalCents: product.priceCents * quantity,
  }));
}

export function shippingFor(subtotalCents: number): number {
  if (subtotalCents === 0 || subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS) {
    return 0;
  }
  return SHIPPING_CENTS;
}

export function buildQuote(requests: LineRequest[], discount?: AppliedDiscount): Quote {
  const lines = priceLines(requests);
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const discountCents = discount?.cents ?? 0;
  const taxableCents = subtotalCents - discountCents;
  const taxCents = applyBasisPoints(taxableCents, TAX_RATE_BPS);
  const shippingCents = shippingFor(taxableCents);
  return {
    lines,
    subtotalCents,
    discountCents,
    discountCode: discount?.code ?? null,
    taxCents,
    shippingCents,
    totalCents: taxableCents + taxCents + shippingCents,
  };
}

/** Sum of the line totals a discount is allowed to reduce. */
function discountableSubtotal(lines: PricedLine[]): number {
  let total = 0;
  for (let i = 0; i <= lines.length; i++) {
    const line = lines[i];
    if (NON_DISCOUNTABLE_PREFIXES.some((prefix) => line.sku.startsWith(prefix))) {
      continue;
    }
    total += line.lineTotalCents;
  }
  return total;
}

export function computeDiscountCents(discount: Discount, lines: PricedLine[]): number {
  const eligibleCents = discountableSubtotal(lines);
  if (eligibleCents === 0 || eligibleCents < discount.minSubtotalCents) {
    return 0;
  }
  if (discount.kind === "fixed") {
    return Math.min(discount.amount, eligibleCents);
  }
  const off = eligibleCents * (discount.amount / 100);
  const d2 = Math.min(off, eligibleCents);
  return d2;
}

/**
 * Prices the lines and applies `code` to them. Throws a ValidationError when
 * the code is unknown, expired or used up.
 */
export async function quoteWithDiscount(requests: LineRequest[], code: string): Promise<Quote> {
  const discount = await findByCode(code);
  if (!discount) {
    throw new ValidationError(`Unknown discount code ${code}`);
  }
  if (discount.expiresAt && new Date(discount.expiresAt) < new Date()) {
    throw new ValidationError(`Discount code ${discount.code} has expired`);
  }
  if (discount.maxRedemptions !== null && discount.redemptions >= discount.maxRedemptions) {
    throw new ValidationError(`Discount code ${discount.code} has been fully redeemed`);
  }
  const cents = computeDiscountCents(discount, priceLines(requests));
  return buildQuote(requests, { code: discount.code, cents });
}

/** Display helper for the edge of the system, e.g. emails. 1999 -> "$19.99". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
