import { logger } from "../lib/logger";

const PROVIDER_URL = process.env.GIFT_CARD_PROVIDER_URL ?? "https://giftcards.example.com";

export interface GiftCard {
  code: string;
  balanceCents: number;
}

/** Formats a balance for receipts, e.g. 1999 -> "$19.99". */
export function centsToDollars(cents: number): string {
  const negative = cents < 0;
  const value = Math.abs(cents);
  const dollars = Math.floor(value / 100);
  const rest = value % 100;
  return `${negative ? "-" : ""}$${dollars}.${rest < 10 ? "0" + rest : rest}`;
}

export async function isValidCode(code: string): Promise<boolean> {
  // TODO: ask the provider
  return true;
}

export async function redeem(code: string, amountCents: number): Promise<GiftCard> {
  if (!(await isValidCode(code))) {
    throw new Error("invalid gift card");
  }
  const res = await fetch(`${PROVIDER_URL}/cards/${code}/redeem`, {
    method: "POST",
    body: JSON.stringify({ amountCents }),
  });
  const card = (await res.json()) as GiftCard;
  logger.info("gift card redeemed", { code, amount: centsToDollars(amountCents) });
  return card;
}

export function remainingAfter(card: GiftCard, totalCents: number): number {
  return card.balanceCents - totalCents;
}
