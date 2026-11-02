import { Keypair, Networks } from '@stellar/stellar-sdk';
import type { Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Logger } from '../../src/logger.js';
import { PolicyEngine } from '../../src/policy.js';
import { RateLimiter } from '../../src/rateLimiter.js';
import { RelayService } from '../../src/relay.js';
import { createServer } from '../../src/server.js';
import { SponsorAccountManager } from '../../src/sponsor.js';
import type { PolicyConfig } from '../../src/types.js';
import { buildInnerTransaction } from '../helpers/buildInnerTransaction.js';

const NETWORK_PASSPHRASE = Networks.TESTNET;

function makeApp(
  overrides: {
    maxTxValiditySeconds?: number;
    policy?: Partial<PolicyConfig>;
    rateLimiter?: { perAccountPerMinute: number; perIpPerMinute: number };
  } = {},
): { app: Express; sponsor: Keypair } {
  const sponsor = Keypair.random();
  const sponsorManager = new SponsorAccountManager(sponsor.secret());
  const policy = new PolicyEngine({
    allowlist: [],
    denylist: [],
    maxFeeStroopsPerTx: 1_000_000,
    hourlyCapStroopsPerAccount: 5_000_000,
    dailyCapStroopsPerAccount: 20_000_000,
    ...overrides.policy,
  });
  const rateLimiter = new RateLimiter(
    overrides.rateLimiter ?? { perAccountPerMinute: 100, perIpPerMinute: 100 },
  );
  const relay = new RelayService({
    sponsor: sponsorManager,
    networkPassphrase: NETWORK_PASSPHRASE,
    horizonUrl: 'https://horizon-testnet.stellar.org',
  });
  const logger = new Logger('error');

  const app = createServer({
    relay,
    policy,
    rateLimiter,
    logger,
    networkPassphrase: NETWORK_PASSPHRASE,
    sponsorPublicKey: sponsor.publicKey(),
    maxTxValiditySeconds: overrides.maxTxValiditySeconds,
  });

  return { app, sponsor };
}

describe('GET /health', () => {
  it('reports ok and the sponsor public key', async () => {
    const { app, sponsor } = makeApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', sponsorPublicKey: sponsor.publicKey() });
  });
});

describe('POST /sponsor', () => {
  it('returns a signed fee-bump transaction for a valid request', async () => {
    const { app } = makeApp();
    const source = Keypair.random();
    const inner = buildInnerTransaction({
      sourceKeypair: source,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const res = await request(app).post('/sponsor').send({ transaction: inner.toXDR() });

    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(true);
    expect(res.body.sourceAccount).toBe(source.publicKey());
    expect(typeof res.body.feeBumpTransactionXdr).toBe('string');
    expect(res.body.feeBumpTransactionXdr).not.toBe(inner.toXDR());
  });

  it('rejects a request with no transaction field', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/sponsor').send({});
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('INVALID_TRANSACTION_XDR');
  });

  it('rejects a request with malformed XDR', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/sponsor').send({ transaction: 'garbage' });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('INVALID_TRANSACTION_XDR');
  });

  it('rejects an unsigned inner transaction as INVALID_INNER_TRANSACTION', async () => {
    const { app } = makeApp();
    const inner = buildInnerTransaction({
      sourceKeypair: Keypair.random(),
      networkPassphrase: NETWORK_PASSPHRASE,
      sign: false,
    });

    const res = await request(app).post('/sponsor').send({ transaction: inner.toXDR() });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ approved: false, reason: 'INVALID_INNER_TRANSACTION' });
    expect(res.body.detail).toMatch(/not signed/);
  });

  it('rejects an inner transaction with no operations as INVALID_INNER_TRANSACTION', async () => {
    const { app } = makeApp();
    const inner = buildInnerTransaction({
      sourceKeypair: Keypair.random(),
      networkPassphrase: NETWORK_PASSPHRASE,
      numOperations: 0,
    });

    const res = await request(app).post('/sponsor').send({ transaction: inner.toXDR() });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('INVALID_INNER_TRANSACTION');
  });

  it('rejects an inner transaction signed for a different network', async () => {
    const { app } = makeApp();
    const inner = buildInnerTransaction({
      sourceKeypair: Keypair.random(),
      networkPassphrase: Networks.PUBLIC,
    });

    const res = await request(app).post('/sponsor').send({ transaction: inner.toXDR() });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('INVALID_INNER_TRANSACTION');
    expect(res.body.detail).toMatch(/different network/);
  });

  it('keeps INVALID_TRANSACTION_XDR for a fee-bump passed as the inner transaction', async () => {
    const { app } = makeApp();
    const inner = buildInnerTransaction({
      sourceKeypair: Keypair.random(),
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    const first = await request(app).post('/sponsor').send({ transaction: inner.toXDR() });
    expect(first.status).toBe(200);

    const res = await request(app)
      .post('/sponsor')
      .send({ transaction: first.body.feeBumpTransactionXdr });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('INVALID_TRANSACTION_XDR');
  });

  it('rejects an inner transaction with no maxTime as INVALID_INNER_TRANSACTION', async () => {
    const { app } = makeApp();
    const inner = buildInnerTransaction({
      sourceKeypair: Keypair.random(),
      networkPassphrase: NETWORK_PASSPHRASE,
      timeoutSeconds: 0,
    });

    const res = await request(app).post('/sponsor').send({ transaction: inner.toXDR() });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('INVALID_INNER_TRANSACTION');
    expect(res.body.detail).toMatch(/maxTime/);
  });

  it('rejects an inner transaction valid for longer than the configured window', async () => {
    const { app } = makeApp({ maxTxValiditySeconds: 30 });
    const inner = buildInnerTransaction({
      sourceKeypair: Keypair.random(),
      networkPassphrase: NETWORK_PASSPHRASE,
      timeoutSeconds: 60,
    });

    const res = await request(app).post('/sponsor').send({ transaction: inner.toXDR() });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('INVALID_INNER_TRANSACTION');
  });

  it('defaults the validity window to 300 seconds', async () => {
    const { app } = makeApp();
    const ok = buildInnerTransaction({
      sourceKeypair: Keypair.random(),
      networkPassphrase: NETWORK_PASSPHRASE,
      timeoutSeconds: 290,
    });
    const tooLong = buildInnerTransaction({
      sourceKeypair: Keypair.random(),
      networkPassphrase: NETWORK_PASSPHRASE,
      timeoutSeconds: 400,
    });

    expect((await request(app).post('/sponsor').send({ transaction: ok.toXDR() })).status).toBe(
      200,
    );
    expect(
      (await request(app).post('/sponsor').send({ transaction: tooLong.toXDR() })).status,
    ).toBe(400);
  });

  it('rejects a denylisted source account', async () => {
    const source = Keypair.random();
    const { app } = makeApp({ policy: { denylist: [source.publicKey()] } });
    const inner = buildInnerTransaction({
      sourceKeypair: source,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const res = await request(app).post('/sponsor').send({ transaction: inner.toXDR() });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('DENYLISTED_ACCOUNT');
  });

  it('rejects a transaction whose sponsor cost exceeds the per-tx max', async () => {
    const source = Keypair.random();
    const { app } = makeApp({ policy: { maxFeeStroopsPerTx: 1 } });
    const inner = buildInnerTransaction({
      sourceKeypair: source,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const res = await request(app).post('/sponsor').send({ transaction: inner.toXDR() });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('FEE_EXCEEDS_MAX');
  });

  it('rate limits repeated requests from the same source account', async () => {
    const source = Keypair.random();
    const { app } = makeApp({ rateLimiter: { perAccountPerMinute: 1, perIpPerMinute: 100 } });

    const first = buildInnerTransaction({
      sourceKeypair: source,
      networkPassphrase: NETWORK_PASSPHRASE,
      sequence: '1',
    });
    const second = buildInnerTransaction({
      sourceKeypair: source,
      networkPassphrase: NETWORK_PASSPHRASE,
      sequence: '2',
    });

    const res1 = await request(app).post('/sponsor').send({ transaction: first.toXDR() });
    expect(res1.status).toBe(200);

    const res2 = await request(app).post('/sponsor').send({ transaction: second.toXDR() });
    expect(res2.status).toBe(429);
    expect(res2.body.reason).toBe('ACCOUNT_RATE_LIMITED');
  });

  it('rate limits repeated requests from the same source IP regardless of account', async () => {
    const { app } = makeApp({ rateLimiter: { perAccountPerMinute: 100, perIpPerMinute: 1 } });

    const first = buildInnerTransaction({
      sourceKeypair: Keypair.random(),
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    const second = buildInnerTransaction({
      sourceKeypair: Keypair.random(),
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const res1 = await request(app).post('/sponsor').send({ transaction: first.toXDR() });
    expect(res1.status).toBe(200);

    const res2 = await request(app).post('/sponsor').send({ transaction: second.toXDR() });
    expect(res2.status).toBe(429);
    expect(res2.body.reason).toBe('IP_RATE_LIMITED');
  });
});
