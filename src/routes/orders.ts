import { Router } from "express";
import { z } from "zod";
import { inTransaction } from "../db/client";
import * as orders from "../db/orders";
import * as products from "../db/products";
import { ConflictError, NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import * as inventory from "../services/inventory";
import { buildQuote, type LineRequest } from "../services/pricing";

const idParams = z.object({ id: z.coerce.number().int().positive() });

const createOrderBody = z.object({
  customerId: z.string().min(1).max(64),
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

const listQuery = z.object({
  customerId: z.string().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

ordersRouter.post("/", (req, res) => {
  const body = createOrderBody.parse(req.body);

  // Collapse repeated product lines so each product is reserved once.
  const requested = new Map<number, number>();
  for (const item of body.items) {
    requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
  }

  const order = inTransaction(() => {
    const lineRequests: LineRequest[] = [];
    for (const [productId, quantity] of requested) {
      const product = products.findById(productId);
      if (!product) {
        throw new NotFoundError("Product", productId);
      }
      lineRequests.push({ product, quantity });
    }

    const quote = buildQuote(lineRequests);
    inventory.reserve(lineRequests.map(({ product, quantity }) => ({ productId: product.id, quantity })));

    return orders.create({
      customerId: body.customerId,
      subtotalCents: quote.subtotalCents,
      taxCents: quote.taxCents,
      shippingCents: quote.shippingCents,
      totalCents: quote.totalCents,
      items: quote.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      })),
    });
  });

  logger.info("order created", {
    orderId: order.id,
    customerId: order.customerId,
    totalCents: order.totalCents,
  });
  res.status(201).json({ ...order, items: orders.listItems(order.id) });
});

ordersRouter.get("/", (req, res) => {
  const { customerId, limit, offset } = listQuery.parse(req.query);
  res.json({ items: orders.listByCustomer(customerId, limit, offset), limit, offset });
});

ordersRouter.get("/:id", (req, res) => {
  const { id } = idParams.parse(req.params);
  const order = orders.findById(id);
  if (!order) {
    throw new NotFoundError("Order", id);
  }
  res.json({ ...order, items: orders.listItems(id) });
});

ordersRouter.post("/:id/cancel", (req, res) => {
  const { id } = idParams.parse(req.params);

  const cancelled = inTransaction(() => {
    const order = orders.findById(id);
    if (!order) {
      throw new NotFoundError("Order", id);
    }
    if (order.status !== "pending") {
      throw new ConflictError(`Order ${id} is ${order.status} and can no longer be cancelled`);
    }
    orders.setStatus(id, "cancelled");
    inventory.release(
      orders.listItems(id).map((item) => ({ productId: item.productId, quantity: item.quantity })),
    );
    return orders.findById(id);
  });

  logger.info("order cancelled", { orderId: id });
  res.json(cancelled);
});
