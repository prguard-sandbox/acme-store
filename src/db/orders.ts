import { db } from "./client";

export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled";

export interface Order {
  id: number;
  customerId: string;
  status: OrderStatus;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: string;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  unitPriceCents: number;
}

export interface NewOrderItem {
  productId: number;
  quantity: number;
  unitPriceCents: number;
}

export interface NewOrder {
  customerId: string;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  items: NewOrderItem[];
}

interface OrderRow {
  id: number;
  customer_id: string;
  status: OrderStatus;
  subtotal_cents: number;
  tax_cents: number;
  shipping_cents: number;
  total_cents: number;
  created_at: string;
}

interface OrderItemRow {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price_cents: number;
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    status: row.status,
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    shippingCents: row.shipping_cents,
    totalCents: row.total_cents,
    createdAt: row.created_at,
  };
}

function toOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
  };
}

export function findById(id: number): Order | undefined {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
  return row ? toOrder(row) : undefined;
}

export function listItems(orderId: number): OrderItem[] {
  const rows = db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id")
    .all(orderId) as OrderItemRow[];
  return rows.map(toOrderItem);
}

export function listByCustomer(customerId: string, limit: number, offset: number): Order[] {
  const rows = db
    .prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT ? OFFSET ?")
    .all(customerId, limit, offset) as OrderRow[];
  return rows.map(toOrder);
}

/** Inserts the order and its items atomically (nests safely inside a caller's transaction). */
export const create = db.transaction((input: NewOrder): Order => {
  const info = db
    .prepare(
      `INSERT INTO orders (customer_id, subtotal_cents, tax_cents, shipping_cents, total_cents)
       VALUES (@customerId, @subtotalCents, @taxCents, @shippingCents, @totalCents)`,
    )
    .run(input);
  const orderId = Number(info.lastInsertRowid);

  const insertItem = db.prepare(
    `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
     VALUES (?, ?, ?, ?)`,
  );
  for (const item of input.items) {
    insertItem.run(orderId, item.productId, item.quantity, item.unitPriceCents);
  }

  const created = findById(orderId);
  if (!created) {
    throw new Error(`order ${orderId} missing right after insert`);
  }
  return created;
});

export function setStatus(id: number, status: OrderStatus): boolean {
  const info = db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
  return info.changes === 1;
}
