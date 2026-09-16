import { BASE_FEE, FeeBumpTransaction, Keypair, Networks } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  InvalidTransactionError,
  parseInnerTransaction,
  RelayService,
  requiredBaseFeeStroops,
  sponsorCostStroops,
} from '../../src/relay.js';
import { SponsorAccountManager } from '../../src/sponsor.js';
import { buildInnerTransaction } from '../helpers/buildInnerTransaction.js';

const NETWORK_PASSPHRASE = Networks.TESTNET;

describe('parseInnerTransaction', () => {
  it('parses a valid signed transaction XDR', () => {
    const source = Keypair.random();
    const inner = buildInnerTransaction({
      sourceKeypair: source,
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    const parsed = parseInnerTransaction(inner.toXDR(), NETWORK_PASSPHRASE);
    expect(parsed.source).toBe(source.publicKey());
  });

  it('throws InvalidTransactionError for garbage input', () => {
    expect(() => parseInnerTransaction('not-valid-xdr', NETWORK_PASSPHRASE)).toThrow(
      InvalidTransactionError,
    );
  });

  it('throws InvalidTransactionError if the XDR is already a fee-bump transaction', () => {
    const source = Keypair.random();
    const sponsor = Keypair.random();
    const inner = buildInnerTransaction({
      sourceKeypair: source,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const sponsorManager = new SponsorAccountManager(sponsor.secret());
    const relay = new RelayService({
      sponsor: sponsorManager,
      networkPassphrase: NETWORK_PASSPHRASE,
      horizonUrl: 'https://horizon-testnet.stellar.org',
    });
    const feeBump = relay.wrapAndSign(inner, Number(BASE_FEE));

    expect(() => parseInnerTransaction(feeBump.toXDR(), NETWORK_PASSPHRASE)).toThrow(
      InvalidTransactionError,
    );
  });
});

describe('requiredBaseFeeStroops / sponsorCostStroops', () => {
  it('computes the per-operation rate and total sponsor cost for a single-op tx', () => {
    const source = Keypair.random();
    const inner = buildInnerTransaction({
      sourceKeypair: source,
      networkPassphrase: NETWORK_PASSPHRASE,
      feeStroops: '100',
      numOperations: 1,
    });

    expect(requiredBaseFeeStroops(inner)).toBe(100);
    expect(sponsorCostStroops(inner, 100)).toBe(200); // (numOps + 1) * baseFee
  });

  it('computes the per-operation rate for a multi-op tx', () => {
    const source = Keypair.random();
    const inner = buildInnerTransaction({
      sourceKeypair: source,
      networkPassphrase: NETWORK_PASSPHRASE,
      feeStroops: '100',
      numOperations: 3,
    });

    expect(requiredBaseFeeStroops(inner)).toBe(100);
    expect(sponsorCostStroops(inner, 100)).toBe(400); // (3 + 1) * 100
  });
});

describe('RelayService.wrapAndSign', () => {
  it('builds a FeeBumpTransaction signed by the sponsor with the sponsor as fee source', () => {
    const source = Keypair.random();
    const sponsor = Keypair.random();
    const inner = buildInnerTransaction({
      sourceKeypair: source,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const sponsorManager = new SponsorAccountManager(sponsor.secret());
    const relay = new RelayService({
      sponsor: sponsorManager,
      networkPassphrase: NETWORK_PASSPHRASE,
      horizonUrl: 'https://horizon-testnet.stellar.org',
    });

    const baseFee = requiredBaseFeeStroops(inner);
    const feeBump = relay.wrapAndSign(inner, baseFee);

    expect(feeBump).toBeInstanceOf(FeeBumpTransaction);
    expect(feeBump.feeSource).toBe(sponsor.publicKey());
    expect(feeBump.innerTransaction.source).toBe(source.publicKey());
    expect(feeBump.signatures).toHaveLength(1);

    // Re-parsing round-trips cleanly and preserves the fee source / signature.
    const roundTripped = new FeeBumpTransaction(feeBump.toEnvelope(), NETWORK_PASSPHRASE);
    expect(roundTripped.feeSource).toBe(sponsor.publicKey());
    expect(roundTripped.signatures).toHaveLength(1);
  });
});
