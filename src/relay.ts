import { FeeBumpTransaction, Horizon, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import type { SponsorAccountManager } from './sponsor.js';
import type { Stroops, TransactionXdr } from './types.js';

export class InvalidTransactionError extends Error {}

/**
 * Parses and validates a client-submitted inner transaction XDR.
 *
 * Rejects anything that isn't a plain (non fee-bump) transaction, since only
 * those can be wrapped in a new FeeBumpTransaction.
 */
export function parseInnerTransaction(xdr: TransactionXdr, networkPassphrase: string): Transaction {
  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  } catch (err) {
    throw new InvalidTransactionError(
      `Could not parse transaction XDR: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (parsed instanceof FeeBumpTransaction) {
    throw new InvalidTransactionError(
      'Inner transaction must not already be a fee-bump transaction.',
    );
  }

  if (parsed.operations.length === 0) {
    throw new InvalidTransactionError('Inner transaction has no operations.');
  }

  return parsed;
}

/**
 * The minimum per-operation base fee the fee-bump transaction may use,
 * i.e. the inner transaction's own effective fee rate. The Stellar
 * protocol requires the fee-bump's base fee to be at least this much.
 */
export function requiredBaseFeeStroops(innerTransaction: Transaction): Stroops {
  const numOps = innerTransaction.operations.length;
  return Math.ceil(Number(innerTransaction.fee) / numOps);
}

/**
 * Total amount (in stroops) the sponsor actually pays for a fee-bump built
 * with the given per-operation base fee: `baseFee * (innerOps + 1)`, the
 * "+1" accounting for the fee-bump wrapper operation itself.
 */
export function sponsorCostStroops(
  innerTransaction: Transaction,
  baseFeeStroops: Stroops,
): Stroops {
  return baseFeeStroops * (innerTransaction.operations.length + 1);
}

export interface RelayDependencies {
  sponsor: SponsorAccountManager;
  networkPassphrase: string;
  horizonUrl: string;
}

/**
 * Core fee-bump wrapping logic: takes a validated inner transaction and a
 * sponsor-paid base fee, and produces a signed, submission-ready
 * FeeBumpTransaction XDR.
 */
export class RelayService {
  private readonly sponsor: SponsorAccountManager;
  private readonly networkPassphrase: string;
  private readonly horizonServer: Horizon.Server;

  constructor({ sponsor, networkPassphrase, horizonUrl }: RelayDependencies) {
    this.sponsor = sponsor;
    this.networkPassphrase = networkPassphrase;
    this.horizonServer = new Horizon.Server(horizonUrl);
  }

  /** Builds and signs a FeeBumpTransaction for the given inner transaction. */
  wrapAndSign(innerTransaction: Transaction, baseFeeStroops: Stroops): FeeBumpTransaction {
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      this.sponsor.publicKey,
      String(baseFeeStroops),
      innerTransaction,
      this.networkPassphrase,
    );
    return this.sponsor.sign(feeBump);
  }

  /** Submits a signed fee-bump transaction to Horizon and returns the response. */
  async submit(
    feeBumpTransaction: FeeBumpTransaction,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    return this.horizonServer.submitTransaction(feeBumpTransaction);
  }
}
