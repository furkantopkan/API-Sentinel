/**
 * Fixed-window rate limiter: at most `limit` calls per window.
 * AI calls cost money, so a stuck loop or a script must not be able to fire
 * hundreds of them. In-memory and per process is enough for a local app.
 * `now` is injectable so tests do not need to wait.
 */
export interface RateLimiter {
  /** Returns true and counts the call if allowed; false when the limit is reached. */
  tryAcquire(): boolean;
  /** Milliseconds until the current window ends. */
  retryAfterMs(): number;
}

export function createRateLimiter(
  limit: number,
  windowMs = 60_000,
  now: () => number = Date.now,
): RateLimiter {
  let windowStart = now();
  let used = 0;

  const roll = () => {
    if (now() - windowStart >= windowMs) {
      windowStart = now();
      used = 0;
    }
  };

  return {
    tryAcquire() {
      roll();
      if (used >= limit) return false;
      used++;
      return true;
    },
    retryAfterMs() {
      roll();
      return Math.max(0, windowStart + windowMs - now());
    },
  };
}
