import { db } from "./client";

export interface Product {
  id: number;
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
  /** The SKU this product goes by in the supplier's catalog, if it is sourced from them. */
  supplierSku: string | null;
  /** Restock when stock drops below this many units. */
  reorderPoint: number;
  /** Restock up to this many units. */
  targetStock: number;
  createdAt: string;
}

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  price_cents: number;
  stock: number;
  supplier_sku: string | null;
  reorder_point: number;
  target_stock: number;
  created_at: string;
}

export interface NewProduct {
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
}

export interface SupplierLink {
  supplierSku: string;
  reorderPoint: number;
  targetStock: number;
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    priceCents: row.price_cents,
    stock: row.stock,
    supplierSku: row.supplier_sku,
    reorderPoint: row.reorder_point,
    targetStock: row.target_stock,
    createdAt: row.created_at,
  };
}

export function findById(id: number): Product | undefined {
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
  return row ? toProduct(row) : undefined;
}

export function findBySku(sku: string): Product | undefined {
  const row = db.prepare("SELECT * FROM products WHERE sku = ?").get(sku) as ProductRow | undefined;
  return row ? toProduct(row) : undefined;
}

export function findBySupplierSku(supplierSku: string): Product | undefined {
  const row = db
    .prepare("SELECT * FROM products WHERE supplier_sku = ?")
    .get(supplierSku) as ProductRow | undefined;
  return row ? toProduct(row) : undefined;
}

export function list(limit: number, offset: number): Product[] {
  const rows = db
    .prepare("SELECT * FROM products ORDER BY id LIMIT ? OFFSET ?")
    .all(limit, offset) as ProductRow[];
  return rows.map(toProduct);
}

/** Supplier-backed products that have fallen below their reorder point. */
export function listBelowReorderPoint(): Product[] {
  const rows = db
    .prepare(
      `SELECT * FROM products
       WHERE supplier_sku IS NOT NULL AND stock < reorder_point
       ORDER BY id`,
    )
    .all() as ProductRow[];
  return rows.map(toProduct);
}

export function count(): number {
  const row = db.prepare("SELECT COUNT(*) AS total FROM products").get() as { total: number };
  return row.total;
}

export function create(input: NewProduct): Product {
  const info = db
    .prepare(
      "INSERT INTO products (sku, name, price_cents, stock) VALUES (@sku, @name, @priceCents, @stock)",
    )
    .run(input);
  const created = findById(Number(info.lastInsertRowid));
  if (!created) {
    throw new Error(`product ${info.lastInsertRowid} missing right after insert`);
  }
  return created;
}

export function updatePrice(id: number, priceCents: number): Product | undefined {
  db.prepare("UPDATE products SET price_cents = ? WHERE id = ?").run(priceCents, id);
  return findById(id);
}

export function linkSupplier(id: number, link: SupplierLink): Product | undefined {
  db.prepare(
    `UPDATE products
     SET supplier_sku = @supplierSku, reorder_point = @reorderPoint, target_stock = @targetStock
     WHERE id = @id`,
  ).run({ id, ...link });
  return findById(id);
}

/**
 * Moves stock by `delta` (negative to take stock out) in a single statement.
 * Returns false when the product does not exist or the change would push stock
 * below zero, in which case nothing is written.
 */
export function adjustStock(id: number, delta: number): boolean {
  const info = db
    .prepare("UPDATE products SET stock = stock + ? WHERE id = ? AND stock + ? >= 0")
    .run(delta, id, delta);
  return info.changes === 1;
}

/** Overwrites the stock level with an absolute value. */
export function setStock(id: number, stock: number): void {
  db.prepare("UPDATE products SET stock = ? WHERE id = ?").run(stock, id);
}
