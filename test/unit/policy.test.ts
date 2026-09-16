import { beforeEach, describe, expect, it } from 'vitest';
import { PolicyEngine } from '../../src/policy.js';
import type { PolicyConfig } from '../../src/types.js';

const ACCOUNT_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJEQ';
const ACCOUNT_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK6I';

function baseConfig(overrides: Partial<PolicyConfig> = {}): PolicyConfig {
  return {
    allowlist: [],
    denylist: [],
    maxFeeStroopsPerTx: 1_000_000,
    hourlyCapStroopsPerAccount: 5_000_000,
    dailyCapStroopsPerAccount: 20_000_000,
    ...overrides,
  };
}

describe('PolicyEngine', () => {
  it('approves a transaction with no allow/deny lists and fee under the cap', () => {
    const policy = new PolicyEngine(baseConfig());
    const result = policy.evaluate(ACCOUNT_A, 500);
    expect(result).toEqual({ approved: true });
  });

  it('rejects a denylisted account even if it would also be allowlisted', () => {
    const policy = new PolicyEngine(baseConfig({ allowlist: [ACCOUNT_A], denylist: [ACCOUNT_A] }));
    const result = policy.evaluate(ACCOUNT_A, 100);
    expect(result.approved).toBe(false);
    expect(result.reason).toBe('DENYLISTED_ACCOUNT');
  });

  it('rejects an account not on a non-empty allowlist', () => {
    const policy = new PolicyEngine(baseConfig({ allowlist: [ACCOUNT_A] }));
    const result = policy.evaluate(ACCOUNT_B, 100);
    expect(result.approved).toBe(false);
    expect(result.reason).toBe('NOT_ALLOWLISTED');
  });

  it('approves an allowlisted account', () => {
    const policy = new PolicyEngine(baseConfig({ allowlist: [ACCOUNT_A] }));
    const result = policy.evaluate(ACCOUNT_A, 100);
    expect(result.approved).toBe(true);
  });

  it('rejects a transaction whose fee exceeds the per-tx max', () => {
    const policy = new PolicyEngine(baseConfig({ maxFeeStroopsPerTx: 1000 }));
    const result = policy.evaluate(ACCOUNT_A, 1001);
    expect(result.approved).toBe(false);
    expect(result.reason).toBe('FEE_EXCEEDS_MAX');
  });

  it('allows a fee exactly at the per-tx max', () => {
    const policy = new PolicyEngine(baseConfig({ maxFeeStroopsPerTx: 1000 }));
    const result = policy.evaluate(ACCOUNT_A, 1000);
    expect(result.approved).toBe(true);
  });

  describe('hourly and daily caps', () => {
    let policy: PolicyEngine;

    beforeEach(() => {
      policy = new PolicyEngine(
        baseConfig({
          maxFeeStroopsPerTx: 10_000,
          hourlyCapStroopsPerAccount: 1_000,
          dailyCapStroopsPerAccount: 3_000,
        }),
      );
    });

    it('rejects once the hourly cap would be exceeded', () => {
      policy.recordSponsorship(ACCOUNT_A, 900);
      const result = policy.evaluate(ACCOUNT_A, 200);
      expect(result.approved).toBe(false);
      expect(result.reason).toBe('HOURLY_CAP_EXCEEDED');
    });

    it('approves right up to the hourly cap', () => {
      policy.recordSponsorship(ACCOUNT_A, 900);
      const result = policy.evaluate(ACCOUNT_A, 100);
      expect(result.approved).toBe(true);
    });

    it('rejects once the daily cap would be exceeded even under the hourly cap', () => {
      const dailyOnlyPolicy = new PolicyEngine(
        baseConfig({
          maxFeeStroopsPerTx: 10_000,
          hourlyCapStroopsPerAccount: 100_000,
          dailyCapStroopsPerAccount: 3_000,
        }),
      );
      dailyOnlyPolicy.recordSponsorship(ACCOUNT_A, 1000);
      dailyOnlyPolicy.recordSponsorship(ACCOUNT_A, 1000);
      dailyOnlyPolicy.recordSponsorship(ACCOUNT_A, 900);
      // Daily total so far is 2900; a new 200 would push it past the 3000
      // daily cap, while the 100,000 hourly cap has plenty of headroom.
      const result = dailyOnlyPolicy.evaluate(ACCOUNT_A, 200);
      expect(result.approved).toBe(false);
      expect(result.reason).toBe('DAILY_CAP_EXCEEDED');
    });

    it('tracks caps independently per account', () => {
      policy.recordSponsorship(ACCOUNT_A, 1000);
      const result = policy.evaluate(ACCOUNT_B, 1000);
      expect(result.approved).toBe(true);
    });
  });
});
