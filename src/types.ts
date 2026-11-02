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
  /**
   * Furthest in the future (in seconds) an inner transaction's `maxTime` may
   * be. Bounds how long a sponsored fee bump stays submittable.
   */
  maxTxValiditySeconds: number;
  rateLimiter: RateLimiterConfig;
  /** Express `trust proxy` setting, or `undefined` to leave it unset (don't trust). */
  trustProxy: TrustProxySetting | undefined;
  /** Origins allowed to call the relay from a browser. Empty disables CORS. */
  corsAllowedOrigins: CorsAllowedOrigins;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Value passed to Express's `trust proxy` setting: `true` (trust every hop),
 * a hop count, or a list of trusted proxy IPs / CIDRs / Express subnet names
 * (`loopback`, `linklocal`, `uniquelocal`). `undefined` leaves it unset, so
 * `req.ip` is the TCP peer address.
 */
export type TrustProxySetting = boolean | number | string[];

/** `'*'` allows any origin; a list allows exactly those origins; `[]` disables CORS. */
export type CorsAllowedOrigins = '*' | string[];

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
  /** Inner transaction XDR submitted by the client, signed by its source account. */
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
