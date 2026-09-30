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

## Project layout

```
src/
  index.ts          process entry point
  app.ts            express app, error handling
  lib/              logger and error types
  db/               SQLite client and repositories
  services/         pricing and inventory rules
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
