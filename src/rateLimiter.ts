import type { RateLimiterConfig } from './types.js';

const WINDOW_MS = 60 * 1000;

/**
 * Fixed-window, in-memory rate limiter keyed independently by source
 * account and source IP. Each key gets its own counter that resets one
 * minute after its first request in the current window.
 *
 * This is intentionally simple and process-local; for multi-instance
 * deployments swap in a shared backend (see issue tracker: Redis-backed
 * rate limiter).
 */
export class RateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly accountWindows = new Map<string, Window>();
  private readonly ipWindows = new Map<string, Window>();

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  /** Returns true and consumes one request if the account is under its per-minute limit. */
  tryConsumeAccount(sourceAccount: string): boolean {
    return tryConsume(this.accountWindows, sourceAccount, this.config.perAccountPerMinute);
  }

  /** Returns true and consumes one request if the IP is under its per-minute limit. */
  tryConsumeIp(sourceIp: string): boolean {
    return tryConsume(this.ipWindows, sourceIp, this.config.perIpPerMinute);
  }
}

interface Window {
  windowStart: number;
  count: number;
}

function tryConsume(windows: Map<string, Window>, key: string, limit: number): boolean {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    windows.set(key, { windowStart: now, count: 1 });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
}
