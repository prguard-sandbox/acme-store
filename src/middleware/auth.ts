import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";

export type Role = "customer" | "admin";

declare global {
  namespace Express {
    interface Request {
      auth?: { role: Role };
    }
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bearerToken(req: Request): string | undefined {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
}

function roleFor(token: string): Role | undefined {
  const adminKey = process.env.ADMIN_API_KEY;
  const storefrontKey = process.env.STOREFRONT_API_KEY;
  if (adminKey && safeEqual(token, adminKey)) return "admin";
  if (storefrontKey && safeEqual(token, storefrontKey)) return "customer";
  return undefined;
}

/** Accepts either the storefront key or the admin key. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  const role = token ? roleFor(token) : undefined;
  if (!role) {
    next(new UnauthorizedError());
    return;
  }
  req.auth = { role };
  next();
}

/** Accepts the admin key only. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    if (req.auth?.role !== "admin") {
      next(new ForbiddenError("Admin API key required"));
      return;
    }
    next();
  });
}
