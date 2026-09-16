/**
 * Integration test: builds and submits a real fee-bumped transaction on the
 * Stellar testnet. Requires network access to Horizon and Friendbot, so it
 * is run as a separate CI job (see .github/workflows/ci.yml) rather than in
 * the default unit-test run, and is skipped entirely when offline.
 */
import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { RelayService, requiredBaseFeeStroops, sponsorCostStroops } from '../../src/relay.js';
import { SponsorAccountManager } from '../../src/sponsor.js';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;
const FRIENDBOT_URL = 'https://friendbot.stellar.org';

async function fundTestnetAccount(publicKey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) {
    throw new Error(`Friendbot funding failed for ${publicKey}: ${res.status} ${await res.text()}`);
  }
}

describe('fee-bump submission against Stellar testnet', () => {
  it('builds, signs, and submits a fee-bumped payment transaction', async () => {
    const sponsor = Keypair.random();
    const source = Keypair.random();

    await fundTestnetAccount(sponsor.publicKey());
    await fundTestnetAccount(source.publicKey());

    const horizon = new Horizon.Server(HORIZON_URL);
    const sourceAccount = await horizon.loadAccount(source.publicKey());

    const innerTransaction = new TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: source.publicKey(),
          asset: Asset.native(),
          amount: '1',
        }),
      )
      .setTimeout(60)
      .build();
    innerTransaction.sign(source);

    const sponsorManager = new SponsorAccountManager(sponsor.secret());
    const relay = new RelayService({
      sponsor: sponsorManager,
      networkPassphrase: NETWORK_PASSPHRASE,
      horizonUrl: HORIZON_URL,
    });

    const baseFee = requiredBaseFeeStroops(innerTransaction);
    const feeBumpTransaction = relay.wrapAndSign(innerTransaction, baseFee);

    expect(sponsorCostStroops(innerTransaction, baseFee)).toBeGreaterThan(0);

    const response = await relay.submit(feeBumpTransaction);
    expect(response.successful).toBe(true);
  }, 30_000);
});
