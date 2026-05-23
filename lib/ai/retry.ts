import { ProviderError } from "./types";

const DEFAULT_DELAYS_MS = [1000, 3000, 9000] as const;

export interface RetryOptions {
  /** Backoff schedule (ms). Default: 1s, 3s, 9s — 3 retries after the first try. */
  delays?: ReadonlyArray<number>;
  /** Called with each attempt + error for logging into translation_jobs. */
  onAttemptError?: (info: { attempt: number; error: unknown; nextDelayMs: number | null }) => void;
  /** Optional cancellation. If aborted, propagates the abort error without further retries. */
  signal?: AbortSignal;
}

/**
 * Run `fn`, retrying with exponential backoff on retryable ProviderErrors
 * and on plain network errors. Non-retryable ProviderErrors (bad key,
 * 400 invalid request) abort immediately.
 *
 * Total attempts = delays.length + 1. Default = 4 attempts max.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const delays = options.delays ?? DEFAULT_DELAYS_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const retryable =
        err instanceof ProviderError ? err.isRetryable : isPlainNetworkError(err);

      const isLastAttempt = attempt === delays.length;
      const nextDelayMs = retryable && !isLastAttempt ? delays[attempt] : null;

      options.onAttemptError?.({ attempt: attempt + 1, error: err, nextDelayMs });

      if (!retryable || isLastAttempt) throw err;

      await sleep(nextDelayMs ?? 0, options.signal);
    }
  }

  // Unreachable — the loop either returns or throws — but TS needs it.
  throw lastError;
}

function isPlainNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; name?: string; message?: string };
  const code = (e.code ?? "").toUpperCase();
  if (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENETUNREACH" ||
    code === "EAI_AGAIN" ||
    code === "UND_ERR_SOCKET" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  ) {
    return true;
  }
  // Undici/AbortError? Not retryable — user gave up.
  if (e.name === "AbortError") return false;
  // Generic fetch failure messages.
  if (typeof e.message === "string" && /fetch failed|network/i.test(e.message)) return true;
  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
