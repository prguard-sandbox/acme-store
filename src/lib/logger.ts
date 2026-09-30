/**
 * Minimal structured logger. Writes one JSON object per line so the output can
 * be shipped straight to the log aggregator. Use this everywhere instead of
 * console.*.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveThreshold(): number {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  return configured && configured in LEVEL_ORDER ? LEVEL_ORDER[configured] : LEVEL_ORDER.info;
}

const threshold = resolveThreshold();

function write(level: LogLevel, msg: string, bindings: LogFields, fields?: LogFields): void {
  if (LEVEL_ORDER[level] < threshold) return;
  const entry = { ts: new Date().toISOString(), level, msg, ...bindings, ...fields };
  const line = `${JSON.stringify(entry)}\n`;
  (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line);
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Returns a logger that stamps `bindings` on every line it writes. */
  child(bindings: LogFields): Logger;
}

function create(bindings: LogFields): Logger {
  return {
    debug: (msg, fields) => write("debug", msg, bindings, fields),
    info: (msg, fields) => write("info", msg, bindings, fields),
    warn: (msg, fields) => write("warn", msg, bindings, fields),
    error: (msg, fields) => write("error", msg, bindings, fields),
    child: (extra) => create({ ...bindings, ...extra }),
  };
}

export const logger: Logger = create({ service: "acme-store" });

/** Turns an unknown thrown value into something that is safe to log. */
export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) {
    return { error: err.message, stack: err.stack };
  }
  return { error: String(err) };
}
