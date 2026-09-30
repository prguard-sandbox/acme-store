# acme-store

Order and catalog service behind the Acme storefront. It exposes a small JSON
API for browsing products, placing orders and cancelling them, and keeps stock
levels in sync with the orders it accepts.

## Running it

```bash
npm install
npm run dev          # tsx watch, listens on :3000
# or
npm run build && npm start
```

Configuration is read from environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `acme-store.db` | SQLite database file |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |
| `STOREFRONT_API_KEY` | unset | Bearer token used by the storefront |
| `ADMIN_API_KEY` | unset | Bearer token for catalog administration |

Every route except `GET /healthz` needs an `Authorization: Bearer <key>`
header. Catalog writes (`POST /products`, `PATCH /products/:id/price`) need the
admin key.

## API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/healthz` | liveness probe |
| `GET` | `/products` | paginated catalog (`limit`, `offset`) |
| `GET` | `/products/:id` | one product |
| `POST` | `/products` | create a product (admin) |
| `PATCH` | `/products/:id/price` | change a price (admin) |
| `POST` | `/orders` | place an order, reserves stock |
| `GET` | `/orders` | list a customer's orders (`customerId`) |
| `GET` | `/orders/:id` | one order with its items |
| `POST` | `/orders/:id/cancel` | cancel a pending order, releases stock |
| `PUT` | `/products/:id/supplier` | link a product to a supplier SKU with a reorder point and target stock (admin) |
| `GET` | `/inventory-sync/status` | scheduler state and the latest run (admin) |
| `GET` | `/inventory-sync/runs` | recent sync runs (admin) |
| `GET` | `/inventory-sync/runs/:id` | one sync run (admin) |
| `GET` | `/inventory-sync/low-stock` | supplier-backed products below their reorder point (admin) |
| `GET` | `/inventory-sync/movements` | stock movement history for a product (`productId`, admin) |
| `POST` | `/inventory-sync/run` | run a sync now and wait for the result (admin) |

## Inventory sync

Products linked to a supplier SKU are restocked automatically. A sync run walks
the supplier's stock feed page by page. For each linked product whose stock is
below its reorder point it allocates whole cases from the supplier, up to the
product's target stock, and adds the received units to local stock. Every run is
recorded in the `sync_runs` table.

The integration is off until `SUPPLIER_API_KEY` is set. The background
scheduler additionally needs `INVENTORY_SYNC_ENABLED=true`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SUPPLIER_API_URL` | `https://api.northwind-supply.example/v2` | Supplier API base URL |
| `SUPPLIER_API_KEY` | unset | Supplier bearer token; enables the integration |
| `SUPPLIER_TIMEOUT_MS` | `10000` | Per-request timeout |
| `INVENTORY_SYNC_ENABLED` | `false` | Run the background scheduler |
| `INVENTORY_SYNC_INTERVAL_MS` | `900000` | Time between scheduled runs (minimum 60000) |
| `INVENTORY_SYNC_PAGE_SIZE` | `200` | Feed rows requested per page |
| `INVENTORY_SYNC_CONCURRENCY` | `5` | Products topped up in parallel per page |

## Project layout

```
src/
  index.ts          process entry point
  app.ts            express app, error handling
  lib/              logger, config, retry and error types
  db/               SQLite client and repositories
  integrations/     clients for third-party APIs (supplier)
  services/         pricing, inventory and inventory sync
  routes/           HTTP handlers
  middleware/       authentication
```

## Conventions

- Use `logger` from `src/lib/logger.ts`, never `console.log`.
- All DB access goes through the repositories in `src/db/*`. Routes and
  services never build SQL themselves.
- Money is integer cents everywhere (`price_cents`, `totalCents`, ...). Convert
  to a display string only at the very edge with `formatCents`.
- Validate input with zod at route boundaries, before it reaches a service or
  repository.
