/**
 * Retry helper with exponential backoff and full jitter. Used for calls to
 * third parties where transient failures (timeouts, 429s, 5xx) are expected.
 */

export interface RetryOptions {
  /** Total number of attempts, including the first one. */
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Return false to stop retrying and rethrow immediately. Defaults to retrying everything. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Lets the failure ask for a minimum wait, e.g. from a Retry-After header. */
  delayHintMs?: (err: unknown) => number | undefined;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  signal?: AbortSignal;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Full-jitter backoff: a random delay between 0 and
 * min(maxDelayMs, baseDelayMs * 2^(attempt - 1)). `attempt` starts at 1.
 */
export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(Math.random() * ceiling);
}

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { attempts, baseDelayMs, maxDelayMs, shouldRetry, delayHintMs, onRetry, signal } = options;
  if (attempts < 1) {
    throw new RangeError("retry needs at least one attempt");
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt === attempts || (shouldRetry && !shouldRetry(err, attempt))) {
        throw err;
      }
      const hint = delayHintMs?.(err) ?? 0;
      const delayMs = Math.min(maxDelayMs, Math.max(hint, backoffDelay(attempt, baseDelayMs, maxDelayMs)));
      onRetry?.(err, attempt, delayMs);
      await sleep(delayMs, signal);
    }
  }
  // Unreachable: the last attempt either returns or throws above.
  throw lastError;
}
