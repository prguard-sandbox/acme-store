import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger, type Logger } from "../lib/logger";

// An incoming ID is reused only when it looks like one, so callers cannot inject log content.
const INCOMING_ID = /^[A-Za-z0-9-]{8,64}$/;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      requestId: string;
      log: Logger;
    }
  }
}

/**
 * Gives every request an ID (reusing a well-formed `X-Request-Id` from the caller), echoes it
 * back in the response, and hands routes a logger that stamps it on every line.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get("x-request-id");
  const id = incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.locals.log = logger.child({ requestId: id });
  res.setHeader("X-Request-Id", id);
  next();
};
