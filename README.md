# acme-store

Order and catalog service behind the Acme storefront.

## Configuration

- `PORT`: HTTP port (default 3000)
- `DATABASE_PATH`: SQLite file
- `API_TOKEN`: token checked by the auth middleware

## Request IDs

Every response carries an `X-Request-Id` header, and every log line for that request has the same
`requestId` field. Callers may send their own `X-Request-Id` (8 to 64 letters, digits or dashes) to
trace a request across services; anything else is replaced with a fresh UUID. Unexpected errors
return the ID in the error body so support can find the logs.
