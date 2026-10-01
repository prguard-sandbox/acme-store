import express, { type ErrorRequestHandler, type Express } from "express";
import { ZodError } from "zod";
import { isAppError } from "./lib/errors";
import { errorFields, logger } from "./lib/logger";
import { requestId } from "./middleware/request-id";
import { ordersRouter } from "./routes/orders";
import { productsRouter } from "./routes/products";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "validation_failed", message: "Invalid request", details: err.issues },
    });
    return;
  }

  if (isAppError(err)) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // body-parser and friends attach a 4xx status to client mistakes (bad JSON, too large, ...).
  const status = typeof err?.status === "number" ? err.status : undefined;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: { code: "bad_request", message: String(err.message) } });
    return;
  }

  (res.locals.log ?? logger).error("unhandled error", errorFields(err));
  res.status(500).json({
    error: { code: "internal_error", message: "Something went wrong", requestId: res.locals.requestId },
  });
};

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(express.json({ limit: "100kb" }));

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      res.locals.log.info("request", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - startedAt,
      });
    });
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/products", productsRouter);
  app.use("/orders", ordersRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
  });
  app.use(errorHandler);

  return app;
}
