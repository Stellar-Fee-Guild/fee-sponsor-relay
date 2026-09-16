/**
 * Shared types for the fee-sponsor-relay service.
 */

/** A Stellar account public key, e.g. "GABC...". */
export type StellarPublicKey = string;

/** A base64-encoded transaction envelope XDR string. */
export type TransactionXdr = string;

/** Fee amount denominated in stroops (1 XLM = 10,000,000 stroops). */
export type Stroops = number;

export interface PolicyConfig {
  /** Source accounts explicitly allowed. Empty means "allow unless denied". */
  allowlist: StellarPublicKey[];
  /** Source accounts that are always rejected, regardless of allowlist. */
  denylist: StellarPublicKey[];
  /** Maximum fee (in stroops) the relay will sponsor for a single transaction. */
  maxFeeStroopsPerTx: Stroops;
  /** Maximum total stroops sponsored for a single source account per rolling hour. */
  hourlyCapStroopsPerAccount: Stroops;
  /** Maximum total stroops sponsored for a single source account per rolling day. */
  dailyCapStroopsPerAccount: Stroops;
}

export interface RateLimiterConfig {
  /** Max sponsorship requests allowed per source account per minute. */
  perAccountPerMinute: number;
  /** Max sponsorship requests allowed per source IP per minute. */
  perIpPerMinute: number;
}

export interface RelayConfig {
  horizonUrl: string;
  networkPassphrase: string;
  port: number;
  logLevel: LogLevel;
  policy: PolicyConfig;
  rateLimiter: RateLimiterConfig;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type SponsorshipRejectionReason =
  | 'DENYLISTED_ACCOUNT'
  | 'NOT_ALLOWLISTED'
  | 'FEE_EXCEEDS_MAX'
  | 'HOURLY_CAP_EXCEEDED'
  | 'DAILY_CAP_EXCEEDED'
  | 'ACCOUNT_RATE_LIMITED'
  | 'IP_RATE_LIMITED'
  | 'INVALID_TRANSACTION_XDR'
  | 'INVALID_INNER_TRANSACTION';

export interface PolicyEvaluation {
  approved: boolean;
  reason?: SponsorshipRejectionReason;
  detail?: string;
}

export interface SponsorshipRequest {
  /** Unsigned inner transaction XDR submitted by the client. */
  innerTransactionXdr: TransactionXdr;
  /** Source IP of the requester, used for IP-based rate limiting. */
  sourceIp: string;
}

export interface SponsorshipDecision {
  approved: boolean;
  reason?: SponsorshipRejectionReason;
  detail?: string;
  sourceAccount?: StellarPublicKey;
  innerFeeStroops?: Stroops;
  feeBumpTransactionXdr?: TransactionXdr;
}

/** A single audit log entry recording a sponsorship decision. */
export interface SponsorshipAuditLogEntry {
  timestamp: string;
  sourceAccount?: StellarPublicKey;
  sourceIp: string;
  approved: boolean;
  reason?: SponsorshipRejectionReason;
  detail?: string;
  innerFeeStroops?: Stroops;
}
