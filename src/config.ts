import { DEFAULT_MAX_TX_VALIDITY_SECONDS } from './relay.js';
import { isIP } from 'node:net';
import type { LogLevel, RelayConfig, TrustProxySetting } from './types.js';

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** Subnet names Express's `trust proxy` setting understands in addition to IPs and CIDRs. */
const TRUST_PROXY_NAMES = ['loopback', 'linklocal', 'uniquelocal'];

export class ConfigError extends Error {}

/** Loads and validates the relay's configuration from environment variables. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  return {
    horizonUrl: requireString(env, 'HORIZON_URL', 'https://horizon-testnet.stellar.org'),
    networkPassphrase: requireString(
      env,
      'NETWORK_PASSPHRASE',
      'Test SDF Network ; September 2015',
    ),
    port: parsePositiveInt(env.PORT, 3000, 'PORT'),
    logLevel: parseLogLevel(env.LOG_LEVEL),
    policy: {
      allowlist: parseList(env.POLICY_ALLOWLIST),
      denylist: parseList(env.POLICY_DENYLIST),
      maxFeeStroopsPerTx: parsePositiveInt(
        env.POLICY_MAX_FEE_STROOPS_PER_TX,
        1_000_000,
        'POLICY_MAX_FEE_STROOPS_PER_TX',
      ),
      hourlyCapStroopsPerAccount: parsePositiveInt(
        env.POLICY_HOURLY_CAP_STROOPS_PER_ACCOUNT,
        5_000_000,
        'POLICY_HOURLY_CAP_STROOPS_PER_ACCOUNT',
      ),
      dailyCapStroopsPerAccount: parsePositiveInt(
        env.POLICY_DAILY_CAP_STROOPS_PER_ACCOUNT,
        20_000_000,
        'POLICY_DAILY_CAP_STROOPS_PER_ACCOUNT',
      ),
    },
    maxTxValiditySeconds: parsePositiveInt(
      env.POLICY_MAX_TX_VALIDITY_SECONDS,
      DEFAULT_MAX_TX_VALIDITY_SECONDS,
      'POLICY_MAX_TX_VALIDITY_SECONDS',
    ),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    rateLimiter: {
      perAccountPerMinute: parsePositiveInt(
        env.RATE_LIMIT_PER_ACCOUNT_PER_MINUTE,
        10,
        'RATE_LIMIT_PER_ACCOUNT_PER_MINUTE',
      ),
      perIpPerMinute: parsePositiveInt(
        env.RATE_LIMIT_PER_IP_PER_MINUTE,
        30,
        'RATE_LIMIT_PER_IP_PER_MINUTE',
      ),
    },
  };
}

function requireString(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function parseList(value: string | undefined): string[] {
  if (!value || value.trim().length === 0) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parsePositiveInt(value: string | undefined, fallback: number, key: string): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${key} must be a positive integer, got: "${value}"`);
  }
  return parsed;
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (!value) {
    return 'info';
  }
  const normalized = value.trim().toLowerCase();
  if (!LOG_LEVELS.includes(normalized as LogLevel)) {
    throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got: "${value}"`);
  }
  return normalized as LogLevel;
}

/**
 * Parses `TRUST_PROXY` into a value for Express's `trust proxy` setting.
 * Unset or empty means "don't trust any proxy" (Express's default).
 */
export function parseTrustProxy(value: string | undefined): TrustProxySetting | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'true') {
    return true;
  }
  if (lower === 'false') {
    return false;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  const entries = parseList(trimmed);
  for (const entry of entries) {
    if (!isTrustProxyEntry(entry)) {
      throw new ConfigError(
        'TRUST_PROXY must be "true", a hop count, or a comma-separated list of IPs, CIDRs ' +
          `or ${TRUST_PROXY_NAMES.join('/')}; invalid entry: "${entry}"`,
      );
    }
  }
  return entries;
}

function isTrustProxyEntry(entry: string): boolean {
  if (TRUST_PROXY_NAMES.includes(entry)) {
    return true;
  }
  const [address, prefix, ...rest] = entry.split('/');
  if (rest.length > 0 || address === undefined) {
    return false;
  }
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  if (!/^\d+$/.test(prefix)) {
    return false;
  }
  return Number(prefix) <= (family === 4 ? 32 : 128);
}
