import { Networks } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../../src/logger.js';
import {
  createHorizonProbe,
  runStartupChecks,
  type HorizonProbe,
} from '../../src/startupChecks.js';

const SPONSOR = 'GA2PT543MCWN7JHVJIBDJUKKXDNPYDAP3MPC2I5R7HB447SCZBY5LVHE';
const HORIZON_URL = 'https://horizon.example';

let logs: Array<Record<string, unknown>>;

beforeEach(() => {
  logs = [];
  const capture = (line: string) => logs.push(JSON.parse(line) as Record<string, unknown>);
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'warn').mockImplementation(capture);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function probe(overrides: Partial<HorizonProbe> = {}): HorizonProbe {
  return {
    fetchNetworkPassphrase: async () => Networks.TESTNET,
    loadAccount: async () => ({ found: true, nativeBalance: '10000.0000000' }),
    ...overrides,
  };
}

function run(p: HorizonProbe) {
  return runStartupChecks({
    probe: p,
    logger: new Logger('debug'),
    horizonUrl: HORIZON_URL,
    networkPassphrase: Networks.TESTNET,
    sponsorPublicKey: SPONSOR,
  });
}

describe('runStartupChecks', () => {
  it('logs success and returns no warnings when everything matches', async () => {
    expect(await run(probe())).toEqual([]);
    expect(logs.map((l) => l.message)).toEqual(['sponsor_account_loaded', 'startup_checks_passed']);
    expect(logs[0]).toMatchObject({ nativeBalance: '10000.0000000', sponsorPublicKey: SPONSOR });
  });

  it('warns when Horizon reports a different network passphrase', async () => {
    const warnings = await run(probe({ fetchNetworkPassphrase: async () => Networks.PUBLIC }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/NETWORK_PASSPHRASE does not match/);
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: 'startup_check_failed',
        horizonPassphrase: Networks.PUBLIC,
      }),
    );
  });

  it('warns when Horizon reports no passphrase', async () => {
    const warnings = await run(probe({ fetchNetworkPassphrase: async () => undefined }));
    expect(warnings[0]).toMatch(/did not report a network_passphrase/);
  });

  it('warns when the sponsor account does not exist', async () => {
    const warnings = await run(probe({ loadAccount: async () => ({ found: false }) }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/unfunded/);
  });

  it('warns and never throws when Horizon is unreachable', async () => {
    const down = async () => {
      throw new Error('ECONNREFUSED');
    };
    const warnings = await run(probe({ fetchNetworkPassphrase: down, loadAccount: down }));
    expect(warnings).toHaveLength(2);
    expect(logs.every((l) => l.level === 'warn')).toBe(true);
    expect(logs[0]).toMatchObject({ error: 'ECONNREFUSED' });
  });
});

describe('createHorizonProbe', () => {
  function fakeFetch(routes: Record<string, { status: number; body?: unknown }>) {
    const calls: string[] = [];
    const impl = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      const route = routes[url];
      if (!route) {
        throw new Error(`unexpected fetch ${url}`);
      }
      return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
        status: route.status,
      });
    }) as typeof fetch;
    return { impl, calls };
  }

  it('reads network_passphrase from the root endpoint', async () => {
    const { impl } = fakeFetch({
      'https://horizon.example/': { status: 200, body: { network_passphrase: Networks.TESTNET } },
    });
    expect(await createHorizonProbe(HORIZON_URL, impl).fetchNetworkPassphrase()).toBe(
      Networks.TESTNET,
    );
  });

  it('returns undefined when the root has no passphrase', async () => {
    const { impl } = fakeFetch({ 'https://horizon.example/': { status: 200, body: {} } });
    expect(await createHorizonProbe(HORIZON_URL, impl).fetchNetworkPassphrase()).toBeUndefined();
  });

  it('keeps a path prefix in HORIZON_URL', async () => {
    const { impl, calls } = fakeFetch({
      [`https://gw.example/horizon/accounts/${SPONSOR}`]: { status: 404 },
    });
    await createHorizonProbe('https://gw.example/horizon', impl).loadAccount(SPONSOR);
    expect(calls).toEqual([`https://gw.example/horizon/accounts/${SPONSOR}`]);
  });

  it('loads an account and its native balance', async () => {
    const { impl } = fakeFetch({
      [`https://horizon.example/accounts/${SPONSOR}`]: {
        status: 200,
        body: {
          balances: [
            { asset_type: 'credit_alphanum4', balance: '5.0000000' },
            { asset_type: 'native', balance: '42.0000000' },
          ],
        },
      },
    });
    expect(await createHorizonProbe(HORIZON_URL, impl).loadAccount(SPONSOR)).toEqual({
      found: true,
      nativeBalance: '42.0000000',
    });
  });

  it('handles an account response without balances', async () => {
    const { impl } = fakeFetch({
      [`https://horizon.example/accounts/${SPONSOR}`]: { status: 200, body: {} },
    });
    expect(await createHorizonProbe(HORIZON_URL, impl).loadAccount(SPONSOR)).toEqual({
      found: true,
      nativeBalance: undefined,
    });
  });

  it('reports a missing account as found: false', async () => {
    const { impl } = fakeFetch({
      [`https://horizon.example/accounts/${SPONSOR}`]: { status: 404 },
    });
    expect(await createHorizonProbe(HORIZON_URL, impl).loadAccount(SPONSOR)).toEqual({
      found: false,
    });
  });

  it('throws on other HTTP errors', async () => {
    const { impl } = fakeFetch({ 'https://horizon.example/': { status: 503 } });
    await expect(createHorizonProbe(HORIZON_URL, impl).fetchNetworkPassphrase()).rejects.toThrow(
      /HTTP 503/,
    );
  });
});
