import {
  FeeBumpTransaction,
  Horizon,
  Keypair,
  MuxedAccount,
  StrKey,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import type { SponsorAccountManager } from './sponsor.js';
import type { Stroops, TransactionXdr } from './types.js';

/**
 * The submitted XDR can't be used at all: it doesn't parse, or it is already
 * a fee-bump transaction. Maps to the `INVALID_TRANSACTION_XDR` reason.
 */
export class InvalidTransactionError extends Error {
  override readonly name = 'InvalidTransactionError';
}

/**
 * The XDR parses as a plain transaction, but the relay won't sponsor it: it
 * has no operations, isn't signed, carries a source-account signature that
 * doesn't verify on this network, or has unsafe time bounds. Maps to the
 * `INVALID_INNER_TRANSACTION` reason.
 */
export class InvalidInnerTransactionError extends Error {
  override readonly name = 'InvalidInnerTransactionError';
}

/**
 * Parses and validates a client-submitted inner transaction XDR.
 *
 * Rejects anything that isn't a plain (non fee-bump) transaction, since only
 * those can be wrapped in a new FeeBumpTransaction. Also rejects inner
 * transactions that could never succeed once wrapped: ones with no
 * operations, and ones with no signatures (signatures can't be added to an
 * inner transaction after it has been wrapped, because the fee-bump commits
 * to the inner envelope as-is).
 *
 * @throws {InvalidTransactionError} if the XDR can't be parsed or is already
 *   a fee-bump transaction.
 * @throws {InvalidInnerTransactionError} if the transaction parses but can't
 *   be sponsored.
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
    throw new InvalidInnerTransactionError('Inner transaction has no operations.');
  }

  if (parsed.signatures.length === 0) {
    throw new InvalidInnerTransactionError(
      'Inner transaction is not signed. Sign it with its source account before requesting ' +
        'sponsorship; signatures cannot be added after it is wrapped in a fee-bump.',
    );
  }

  assertSourceSignatureValid(parsed);

  return parsed;
}

/**
 * If the envelope carries a signature whose hint matches the source
 * account's key, at least one such signature must verify against the
 * transaction hash for the configured network. A mismatch almost always
 * means the client signed for a different network passphrase.
 *
 * Signatures from other keys (multisig setups where the source account's
 * master key isn't a signer) can't be checked without loading the account
 * from Horizon, so they're left for the network to validate.
 */
function assertSourceSignatureValid(transaction: Transaction): void {
  const sourceKeypair = Keypair.fromPublicKey(baseAccountId(transaction.source));
  const hint = sourceKeypair.signatureHint();
  const hash = transaction.hash();

  const sourceSignatures = transaction.signatures.filter((signature) =>
    signature.hint().equals(hint),
  );
  if (sourceSignatures.length === 0) {
    return;
  }

  const verified = sourceSignatures.some((signature) =>
    sourceKeypair.verify(hash, signature.signature()),
  );
  if (!verified) {
    throw new InvalidInnerTransactionError(
      "The source account's signature does not verify for this relay's network. The " +
        'transaction was probably signed for a different network passphrase.',
    );
  }
}

/** Returns the underlying `G...` account ID for a `G...` or muxed `M...` address. */
function baseAccountId(address: string): string {
  if (StrKey.isValidMed25519PublicKey(address)) {
    return MuxedAccount.fromAddress(address, '0').baseAccount().accountId();
  }
  return address;
}

/** Default for `POLICY_MAX_TX_VALIDITY_SECONDS`. */
export const DEFAULT_MAX_TX_VALIDITY_SECONDS = 300;

/**
 * Rejects inner transactions that would stay valid for too long.
 *
 * The sponsor's fee-bump signature is valid for exactly as long as the inner
 * transaction's time bounds allow. Without an upper limit, a client (or
 * anyone who intercepts the response) could hold a sponsored fee bump and
 * submit it hours or months later, after the operator has tightened policy,
 * changed the allowlist or rotated budgets, and the sponsor would still pay.
 * Requiring a near-term `maxTime` bounds that window.
 *
 * @param maxValiditySeconds the furthest in the future `maxTime` may be.
 * @param nowMs the current time, injectable for tests.
 * @throws {InvalidInnerTransactionError} if `maxTime` is missing, `0`
 *   (no upper bound), or more than `maxValiditySeconds` from now.
 */
export function assertValidityWindow(
  innerTransaction: Transaction,
  maxValiditySeconds: number,
  nowMs: number = Date.now(),
): void {
  const maxTime = Number(innerTransaction.timeBounds?.maxTime ?? 0);
  if (maxTime === 0) {
    throw new InvalidInnerTransactionError(
      'Inner transaction has no upper time bound (maxTime). Set a timeout of at most ' +
        `${maxValiditySeconds} seconds (e.g. TransactionBuilder.setTimeout(${maxValiditySeconds})).`,
    );
  }

  const latestAllowed = Math.floor(nowMs / 1000) + maxValiditySeconds;
  if (maxTime > latestAllowed) {
    throw new InvalidInnerTransactionError(
      `Inner transaction maxTime ${maxTime} is more than ${maxValiditySeconds} seconds in the ` +
        'future. Use a shorter timeout.',
    );
  }
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
