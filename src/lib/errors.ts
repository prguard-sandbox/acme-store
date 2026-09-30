/**
 * Errors that carry an HTTP status and a stable machine-readable code. The
 * error handler in app.ts turns these into JSON responses; anything else is
 * treated as a 500.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string | number) {
    super(404, "not_found", `${resource} ${id} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "validation_failed", message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "conflict", message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Missing or invalid credentials") {
    super(401, "unauthorized", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not allowed") {
    super(403, "forbidden", message);
  }
}

/** A dependency we call (the supplier API, ...) failed or answered something unusable. */
export class UpstreamError extends AppError {
  public readonly retryAfterMs: number | undefined;

  constructor(
    message: string,
    public readonly retryable: boolean,
    options: { details?: unknown; retryAfterMs?: number } = {},
  ) {
    super(502, "upstream_error", message, options.details);
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
