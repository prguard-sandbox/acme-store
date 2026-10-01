import { Router } from "express";
import { z } from "zod";
import * as discounts from "../db/discounts";
import * as products from "../db/products";
import { ConflictError, NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { quoteWithDiscount, type LineRequest } from "../services/pricing";

const lookupParams = z.object({ code: z.string().trim().min(1).max(64) });

const createBody = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, "Codes may only contain letters, digits, dashes and underscores"),
    kind: z.enum(["percent", "fixed"]),
    amount: z.number().int().positive(),
    minSubtotalCents: z.number().int().min(0).default(0),
    maxRedemptions: z.number().int().positive().nullable().default(null),
    expiresAt: z.string().datetime().nullable().default(null),
  })
  .refine((d) => d.kind !== "percent" || d.amount <= 100, {
    message: "A percent discount cannot be more than 100",
    path: ["amount"],
  });

const quoteBody = z.object({
  code: z.string().trim().min(1).max(64),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(50),
});

export const discountsRouter = Router();

discountsRouter.use(requireAuth);

discountsRouter.post("/", requireAdmin, async (req, res) => {
  const body = createBody.parse(req.body);
  if (await discounts.findByCode(body.code)) {
    throw new ConflictError(`Discount code ${body.code} already exists`);
  }
  const discount = await discounts.create(body);
  console.log("discount created", discount.code, discount.kind, discount.amount);
  res.status(201).json(discount);
});

discountsRouter.post("/quote", async (req, res) => {
  const body = quoteBody.parse(req.body);

  const lineRequests: LineRequest[] = body.items.map((item) => {
    const product = products.findById(item.productId);
    if (!product) {
      throw new NotFoundError("Product", item.productId);
    }
    return { product, quantity: item.quantity };
  });

  const quote = quoteWithDiscount(lineRequests, body.code);
  res.json(quote);
});

discountsRouter.get("/:code", async (req, res) => {
  const { code } = lookupParams.parse(req.params);
  const discount = await discounts.findByCode(code);
  if (!discount) {
    throw new NotFoundError("Discount", code);
  }
  res.json(discount);
});

discountsRouter.post("/:code/redeem", async (req, res) => {
  const { code } = lookupParams.parse(req.params);
  try {
    const discount = await discounts.findByCode(code);
    if (!discount) {
      throw new NotFoundError("Discount", code);
    }
    if (!(await discounts.recordRedemption(discount.id))) {
      throw new ConflictError(`Discount code ${discount.code} has no redemptions left`);
    }
    logger.info("discount redeemed", { code: discount.code });
    res.json({ code: discount.code, redeemed: true });
  } catch (err) {
    logger.error("discount redemption failed", { code, err });
    throw err;
  }
});
