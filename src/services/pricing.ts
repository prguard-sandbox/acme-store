import type { Product } from "../db/products";

/** Sales tax in basis points (825 = 8.25%). */
export const TAX_RATE_BPS = 825;
export const SHIPPING_CENTS = 599;
/** Orders at or above this subtotal ship for free. */
export const FREE_SHIPPING_THRESHOLD_CENTS = 7500;

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

export interface Quote {
  lines: PricedLine[];
  subtotalCents: number;
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

export function buildQuote(requests: LineRequest[]): Quote {
  const lines = priceLines(requests);
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const taxCents = applyBasisPoints(subtotalCents, TAX_RATE_BPS);
  const shippingCents = shippingFor(subtotalCents);
  return {
    lines,
    subtotalCents,
    taxCents,
    shippingCents,
    totalCents: subtotalCents + taxCents + shippingCents,
  };
}

/** Display helper for the edge of the system, e.g. emails. 1999 -> "$19.99". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
