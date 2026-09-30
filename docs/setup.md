# Local setup guide

This walks through getting `acme-store` running on a fresh machine and making
your first authenticated request.

## Prerequisites

- Node.js 20 or newer (`node --version`)
- A C/C++ toolchain, because `better-sqlite3` compiles a native addon on
  install when no prebuilt binary matches your platform (Xcode command line
  tools on macOS, `build-essential` on Debian/Ubuntu, Visual Studio Build
  Tools on Windows)

## Install and configure

```bash
git clone https://github.com/prguard-sandbox/acme-store.git
cd acme-store
npm install

export STOREFRONT_API_KEY=dev-storefront-key
export ADMIN_API_KEY=dev-admin-key
export LOG_LEVEL=debug
```

The SQLite file is created on first boot at `DB_PATH` (default
`./acme-store.db`) and migrated automatically. Delete the file to start over.

## Run

```bash
npm run dev      # restarts on file changes
npm run typecheck
```

You should see an `acme-store listening` line on stdout, and this should
answer immediately:

```bash
curl localhost:3000/healthz
# {"status":"ok"}
```

## Try it out

Create a product with the admin key, then order it with the storefront key:

```bash
curl -X POST localhost:3000/products \
  -H "Authorization: Bearer dev-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"sku":"MUG-001","name":"Acme mug","priceCents":1800,"stock":25}'

curl -X POST localhost:3000/orders \
  -H "Authorization: Bearer dev-storefront-key" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"cust_123","items":[{"productId":1,"quantity":2}]}'
```

All prices are integer cents, so `1800` is $18.00.

## Troubleshooting

- `401 unauthorized` on every call: the `Authorization: Bearer ...` header is
  missing, or the env var was not exported in the shell that started the server.
- `403 forbidden` on `POST /products`: catalog writes need `ADMIN_API_KEY`.
- `409 conflict` when ordering: not enough stock for one of the items.
- `npm install` fails building `better-sqlite3`: install the toolchain above.
