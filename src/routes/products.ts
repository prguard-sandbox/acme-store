import { Router } from "express";
import { z } from "zod";
import * as products from "../db/products";
import { ConflictError, NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import { requireAdmin, requireAuth } from "../middleware/auth";

const idParams = z.object({ id: z.coerce.number().int().positive() });

const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const createProductBody = z.object({
  sku: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[A-Z0-9-]+$/, "SKU may only contain A-Z, 0-9 and dashes"),
  name: z.string().min(1).max(120),
  priceCents: z.number().int().min(0).max(100_000_00),
  stock: z.number().int().min(0).max(1_000_000).default(0),
});

const updatePriceBody = z.object({
  priceCents: z.number().int().min(0).max(100_000_00),
});

export const productsRouter = Router();

productsRouter.use(requireAuth);

productsRouter.get("/", (req, res) => {
  const { limit, offset } = pageQuery.parse(req.query);
  res.json({
    items: products.list(limit, offset),
    total: products.count(),
    limit,
    offset,
  });
});

productsRouter.get("/:id", (req, res) => {
  const { id } = idParams.parse(req.params);
  const product = products.findById(id);
  if (!product) {
    throw new NotFoundError("Product", id);
  }
  res.json(product);
});

productsRouter.post("/", requireAdmin, (req, res) => {
  const body = createProductBody.parse(req.body);
  if (products.findBySku(body.sku)) {
    throw new ConflictError(`SKU ${body.sku} already exists`);
  }
  const product = products.create(body);
  logger.info("product created", { productId: product.id, sku: product.sku });
  res.status(201).json(product);
});

productsRouter.patch("/:id/price", requireAdmin, (req, res) => {
  const { id } = idParams.parse(req.params);
  const { priceCents } = updatePriceBody.parse(req.body);
  const product = products.updatePrice(id, priceCents);
  if (!product) {
    throw new NotFoundError("Product", id);
  }
  logger.info("product price changed", { productId: id, priceCents });
  res.json(product);
});
