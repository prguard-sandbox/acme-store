import Database from "better-sqlite3";
import { logger } from "../lib/logger";

const DB_PATH = process.env.DB_PATH ?? "acme-store.db";

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/**
 * Ordered schema migrations. Never edit an existing entry, append a new one.
 * The number of applied migrations is tracked in PRAGMA user_version.
 */
const MIGRATIONS: string[] = [
  `CREATE TABLE products (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     sku TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
     stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE orders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     customer_id TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     subtotal_cents INTEGER NOT NULL,
     tax_cents INTEGER NOT NULL,
     shipping_cents INTEGER NOT NULL,
     total_cents INTEGER NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX idx_orders_customer ON orders (customer_id);
   CREATE TABLE order_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
     product_id INTEGER NOT NULL REFERENCES products (id),
     quantity INTEGER NOT NULL CHECK (quantity > 0),
     unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
   );
   CREATE INDEX idx_order_items_order ON order_items (order_id);`,
  `ALTER TABLE products ADD COLUMN supplier_sku TEXT;
   ALTER TABLE products ADD COLUMN reorder_point INTEGER NOT NULL DEFAULT 0 CHECK (reorder_point >= 0);
   ALTER TABLE products ADD COLUMN target_stock INTEGER NOT NULL DEFAULT 0 CHECK (target_stock >= 0);
   CREATE UNIQUE INDEX idx_products_supplier_sku ON products (supplier_sku)
     WHERE supplier_sku IS NOT NULL;`,
  `CREATE TABLE sync_runs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     triggered_by TEXT NOT NULL CHECK (triggered_by IN ('schedule', 'manual')),
     status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
     started_at TEXT NOT NULL DEFAULT (datetime('now')),
     finished_at TEXT,
     items_seen INTEGER NOT NULL DEFAULT 0,
     items_updated INTEGER NOT NULL DEFAULT 0,
     items_failed INTEGER NOT NULL DEFAULT 0,
     error TEXT
   );
   CREATE INDEX idx_sync_runs_started ON sync_runs (started_at);`,
  `CREATE TABLE stock_movements (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     product_id INTEGER NOT NULL REFERENCES products (id),
     delta INTEGER NOT NULL,
     reason TEXT NOT NULL,
     reference TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX idx_stock_movements_product ON stock_movements (product_id, id);`,
];

/** Brings the database schema up to date. Safe to call on every boot. */
export function migrate(): void {
  const applied = db.pragma("user_version", { simple: true }) as number;
  for (let version = applied; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
    })();
    logger.info("applied migration", { version: version + 1 });
  }
}

/** Runs `fn` inside a transaction; throwing rolls everything back. */
export function inTransaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}
