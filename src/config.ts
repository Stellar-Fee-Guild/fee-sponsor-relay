import type { LogLevel, RelayConfig } from './types.js';

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

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
