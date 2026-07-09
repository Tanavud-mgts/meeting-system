export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
}

export class RetryableHttpError extends Error {
  retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "RetryableHttpError";
    this.retryAfterMs = retryAfterMs;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 500;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts) {
        break;
      }

      const delay =
        err instanceof RetryableHttpError && err.retryAfterMs != null
          ? err.retryAfterMs
          : initialDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
