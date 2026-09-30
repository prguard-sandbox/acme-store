import type { z } from "zod";
import { UpstreamError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { retry } from "../../lib/retry";
import {
  allocationResponseSchema,
  rawStockPageSchema,
  type AllocationRequest,
  type AllocationResponse,
  type RawStockPage,
} from "./types";

export interface SupplierClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Per-request timeout. */
  timeoutMs: number;
  /** Attempts per request, including the first. Defaults to 4. */
  maxAttempts?: number;
}

interface RequestInitLite {
  body?: unknown;
  headers?: Record<string, string>;
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
/** Safety net against a feed that never reports its last page. */
const MAX_PAGES = 1_000;

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** Thin, retrying client for the supplier's stock feed and allocation endpoints. */
export class SupplierClient {
  private readonly log = logger.child({ component: "supplier-client" });
  private readonly maxAttempts: number;

  constructor(private readonly options: SupplierClientOptions) {
    this.maxAttempts = options.maxAttempts ?? 4;
  }

  fetchStockPage(cursor: string | null, limit: number): Promise<RawStockPage> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) {
      query.set("cursor", cursor);
    }
    return this.request("GET", `/stock?${query.toString()}`, rawStockPageSchema);
  }

  /** Walks the whole stock feed, one page at a time. */
  async *stockPages(limit: number): AsyncGenerator<RawStockPage> {
    let cursor: string | null = null;
    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
      const page: RawStockPage = await this.fetchStockPage(cursor, limit);
      this.log.debug("fetched stock page", { pageNumber, items: page.items.length });
      yield page;
      if (!page.next_cursor || page.next_cursor === cursor) {
        return;
      }
      cursor = page.next_cursor;
    }
    throw new UpstreamError(`Supplier stock feed did not end after ${MAX_PAGES} pages`, false);
  }

  /** Asks the supplier to set aside `cases` whole cases of a SKU for us. */
  allocate(request: AllocationRequest): Promise<AllocationResponse> {
    return this.request("POST", "/allocations", allocationResponseSchema, {
      body: { sku: request.supplierSku, cases: request.cases },
      headers: { "Idempotency-Key": request.idempotencyKey },
    });
  }

  private request<T>(
    method: "GET" | "POST",
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    init: RequestInitLite = {},
  ): Promise<T> {
    return retry(() => this.requestOnce(method, path, schema, init), {
      attempts: this.maxAttempts,
      baseDelayMs: 500,
      maxDelayMs: 15_000,
      shouldRetry: (err) => err instanceof UpstreamError && err.retryable,
      delayHintMs: (err) => (err instanceof UpstreamError ? err.retryAfterMs : undefined),
      onRetry: (err, attempt, delayMs) => {
        this.log.warn("supplier request failed, retrying", {
          method,
          path: path.split("?")[0],
          attempt,
          delayMs,
          error: err instanceof Error ? err.message : String(err),
        });
      },
    });
  }

  private async requestOnce<T>(
    method: "GET" | "POST",
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    init: RequestInitLite,
  ): Promise<T> {
    const url = `${this.options.baseUrl.replace(/\/+$/, "")}${path}`;
    const hasBody = init.body !== undefined;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          Accept: "application/json",
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        body: hasBody ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (err) {
      // Network errors and timeouts are worth another try.
      throw new UpstreamError(
        `Supplier request failed: ${err instanceof Error ? err.message : String(err)}`,
        true,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new UpstreamError(
        `Supplier answered ${response.status} to ${method} ${path.split("?")[0]}`,
        RETRYABLE_STATUSES.has(response.status),
        {
          details: { status: response.status, body: body.slice(0, 500) },
          retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
        },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new UpstreamError("Supplier answered with a body that is not valid JSON", false);
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new UpstreamError("Supplier response did not match the expected shape", false, {
        details: parsed.error.issues,
      });
    }
    return parsed.data;
  }
}
