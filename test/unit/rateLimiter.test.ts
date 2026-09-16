import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../../src/rateLimiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the per-account limit', () => {
    const limiter = new RateLimiter({ perAccountPerMinute: 3, perIpPerMinute: 100 });
    expect(limiter.tryConsumeAccount('GA')).toBe(true);
    expect(limiter.tryConsumeAccount('GA')).toBe(true);
    expect(limiter.tryConsumeAccount('GA')).toBe(true);
    expect(limiter.tryConsumeAccount('GA')).toBe(false);
  });

  it('allows requests up to the per-IP limit independently of accounts', () => {
    const limiter = new RateLimiter({ perAccountPerMinute: 100, perIpPerMinute: 2 });
    expect(limiter.tryConsumeIp('1.2.3.4')).toBe(true);
    expect(limiter.tryConsumeIp('1.2.3.4')).toBe(true);
    expect(limiter.tryConsumeIp('1.2.3.4')).toBe(false);
  });

  it('tracks separate accounts independently', () => {
    const limiter = new RateLimiter({ perAccountPerMinute: 1, perIpPerMinute: 100 });
    expect(limiter.tryConsumeAccount('GA')).toBe(true);
    expect(limiter.tryConsumeAccount('GB')).toBe(true);
    expect(limiter.tryConsumeAccount('GA')).toBe(false);
  });

  it('resets the window after 60 seconds', () => {
    const limiter = new RateLimiter({ perAccountPerMinute: 1, perIpPerMinute: 100 });
    expect(limiter.tryConsumeAccount('GA')).toBe(true);
    expect(limiter.tryConsumeAccount('GA')).toBe(false);

    vi.advanceTimersByTime(60_000);

    expect(limiter.tryConsumeAccount('GA')).toBe(true);
  });

  it('does not reset just before the window elapses', () => {
    const limiter = new RateLimiter({ perAccountPerMinute: 1, perIpPerMinute: 100 });
    expect(limiter.tryConsumeAccount('GA')).toBe(true);

    vi.advanceTimersByTime(59_000);

    expect(limiter.tryConsumeAccount('GA')).toBe(false);
  });
});
