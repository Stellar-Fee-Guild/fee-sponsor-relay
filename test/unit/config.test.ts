import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseTrustProxy } from '../../src/config.js';

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
    expect(config.trustProxy).toBeUndefined();
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

describe('TRUST_PROXY', () => {
  it('is undefined (do not trust) when unset or blank', () => {
    expect(parseTrustProxy(undefined)).toBeUndefined();
    expect(parseTrustProxy('   ')).toBeUndefined();
  });

  it('parses true / false case-insensitively', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('TRUE')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('parses a hop count', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('0')).toBe(0);
  });

  it('parses a comma-separated list of IPs, CIDRs and subnet names', () => {
    expect(parseTrustProxy('10.0.0.1, 10.0.0.0/8 ,fd00::/8,::1,loopback')).toEqual([
      '10.0.0.1',
      '10.0.0.0/8',
      'fd00::/8',
      '::1',
      'loopback',
    ]);
  });

  it.each(['yes', '10.0.0.0/33', 'fd00::/129', '10.0.0.1/abc', '10.0.0.1/8/8', '1.2.3', '-1'])(
    'rejects invalid value %s with a ConfigError naming TRUST_PROXY',
    (value) => {
      expect(() => parseTrustProxy(value)).toThrow(ConfigError);
      expect(() => parseTrustProxy(value)).toThrow(/TRUST_PROXY/);
    },
  );

  it('is wired through loadConfig', () => {
    expect(loadConfig({ TRUST_PROXY: '2' } as NodeJS.ProcessEnv).trustProxy).toBe(2);
  });
});
