import type { PolicyConfig, PolicyEvaluation, Stroops } from './types.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface SponsorshipRecord {
  timestamp: number;
  feeStroops: Stroops;
}

/**
 * Configurable sponsorship policy: allow/deny lists, a per-transaction fee
 * ceiling, and rolling hourly/daily sponsorship caps per source account.
 *
 * Caps are enforced with a rolling window (not a fixed calendar hour/day) so
 * an account can't burst its cap right at a window boundary and again right
 * after it resets.
 */
export class PolicyEngine {
  private readonly config: PolicyConfig;
  private readonly history = new Map<string, SponsorshipRecord[]>();

  constructor(config: PolicyConfig) {
    this.config = config;
  }

  /**
   * Evaluates whether a transaction from `sourceAccount` with the given
   * inner fee should be sponsored. Does not mutate any state - call
   * `recordSponsorship` after the transaction is actually sponsored.
   */
  evaluate(sourceAccount: string, innerFeeStroops: Stroops): PolicyEvaluation {
    if (this.config.denylist.includes(sourceAccount)) {
      return {
        approved: false,
        reason: 'DENYLISTED_ACCOUNT',
        detail: `Account ${sourceAccount} is on the denylist.`,
      };
    }

    if (this.config.allowlist.length > 0 && !this.config.allowlist.includes(sourceAccount)) {
      return {
        approved: false,
        reason: 'NOT_ALLOWLISTED',
        detail: `Account ${sourceAccount} is not on the allowlist.`,
      };
    }

    if (innerFeeStroops > this.config.maxFeeStroopsPerTx) {
      return {
        approved: false,
        reason: 'FEE_EXCEEDS_MAX',
        detail: `Inner fee ${innerFeeStroops} stroops exceeds the max of ${this.config.maxFeeStroopsPerTx} stroops per transaction.`,
      };
    }

    const now = Date.now();
    const records = this.history.get(sourceAccount) ?? [];

    const hourlyUsed = sumWithin(records, now, HOUR_MS);
    if (hourlyUsed + innerFeeStroops > this.config.hourlyCapStroopsPerAccount) {
      return {
        approved: false,
        reason: 'HOURLY_CAP_EXCEEDED',
        detail: `Account ${sourceAccount} would exceed its hourly cap of ${this.config.hourlyCapStroopsPerAccount} stroops (already used ${hourlyUsed}).`,
      };
    }

    const dailyUsed = sumWithin(records, now, DAY_MS);
    if (dailyUsed + innerFeeStroops > this.config.dailyCapStroopsPerAccount) {
      return {
        approved: false,
        reason: 'DAILY_CAP_EXCEEDED',
        detail: `Account ${sourceAccount} would exceed its daily cap of ${this.config.dailyCapStroopsPerAccount} stroops (already used ${dailyUsed}).`,
      };
    }

    return { approved: true };
  }

  /** Records a sponsorship that was actually approved and submitted. */
  recordSponsorship(sourceAccount: string, feeStroops: Stroops): void {
    const now = Date.now();
    const records = this.history.get(sourceAccount) ?? [];
    records.push({ timestamp: now, feeStroops });
    this.history.set(sourceAccount, pruneOlderThan(records, now, DAY_MS));
  }
}

function sumWithin(records: SponsorshipRecord[], now: number, windowMs: number): Stroops {
  const cutoff = now - windowMs;
  let total = 0;
  for (const record of records) {
    if (record.timestamp > cutoff) {
      total += record.feeStroops;
    }
  }
  return total;
}

function pruneOlderThan(
  records: SponsorshipRecord[],
  now: number,
  windowMs: number,
): SponsorshipRecord[] {
  const cutoff = now - windowMs;
  return records.filter((record) => record.timestamp > cutoff);
}
