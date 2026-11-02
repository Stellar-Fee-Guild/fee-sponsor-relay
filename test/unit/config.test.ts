import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('applies documented defaults when no env vars are set', () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.horizonUrl).toBe('https://horizon-testnet.stellar.org');
    expect(config.networkPassphrase).toBe('Test SDF Network ; September 2015');
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
    expect(config.policy.allowlist).toEqual([]);
    expect(config.policy.denylist).toEqual([]);
    expect(config.rateLimiter.perAccountPerMinute).toBe(10);
    expect(config.rateLimiter.perIpPerMinute).toBe(30);
    expect(config.maxTxValiditySeconds).toBe(300);
  });

  it('parses POLICY_MAX_TX_VALIDITY_SECONDS', () => {
    const config = loadConfig({ POLICY_MAX_TX_VALIDITY_SECONDS: '60' } as NodeJS.ProcessEnv);
    expect(config.maxTxValiditySeconds).toBe(60);
  });

  it('rejects a non-positive POLICY_MAX_TX_VALIDITY_SECONDS', () => {
    expect(() => loadConfig({ POLICY_MAX_TX_VALIDITY_SECONDS: '0' } as NodeJS.ProcessEnv)).toThrow(
      /POLICY_MAX_TX_VALIDITY_SECONDS must be a positive integer/,
    );
  });

  it('parses comma-separated allow/deny lists, trimming whitespace', () => {
    const config = loadConfig({
      POLICY_ALLOWLIST: ' GAAA, GBBB ,GCCC',
      POLICY_DENYLIST: 'GDDD',
    } as NodeJS.ProcessEnv);
    expect(config.policy.allowlist).toEqual(['GAAA', 'GBBB', 'GCCC']);
    expect(config.policy.denylist).toEqual(['GDDD']);
  });

  it('parses numeric overrides', () => {
    const config = loadConfig({
      PORT: '8080',
      POLICY_MAX_FEE_STROOPS_PER_TX: '42',
    } as NodeJS.ProcessEnv);
    expect(config.port).toBe(8080);
    expect(config.policy.maxFeeStroopsPerTx).toBe(42);
  });

  it('throws ConfigError for a non-integer numeric value', () => {
    expect(() => loadConfig({ PORT: 'not-a-number' } as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it('throws ConfigError for a non-positive numeric value', () => {
    expect(() => loadConfig({ PORT: '0' } as NodeJS.ProcessEnv)).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: '-5' } as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it('throws ConfigError for an unrecognized LOG_LEVEL', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'verbose' } as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it('accepts a valid LOG_LEVEL case-insensitively', () => {
    const config = loadConfig({ LOG_LEVEL: 'WARN' } as NodeJS.ProcessEnv);
    expect(config.logLevel).toBe('warn');
  });
});
