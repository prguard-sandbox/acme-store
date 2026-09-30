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
