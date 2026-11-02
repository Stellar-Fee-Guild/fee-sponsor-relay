import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

export interface BuildInnerTransactionOptions {
  sourceKeypair: Keypair;
  networkPassphrase: string;
  sequence?: string;
  feeStroops?: string;
  numOperations?: number;
  sign?: boolean;
  /** Passed to `setTimeout`. `0` means no upper time bound (`maxTime: 0`). Default 60. */
  timeoutSeconds?: number;
  /** Strip time bounds entirely (no preconditions), so `timeBounds` is undefined. */
  omitTimeBounds?: boolean;
}

/**
 * Builds a minimal, self-payment transaction signed by its source account,
 * suitable as the "inner" transaction of a fee-bump. Never touches the
 * network - the sequence number is supplied directly.
 */
export function buildInnerTransaction({
  sourceKeypair,
  networkPassphrase,
  sequence = '1',
  feeStroops = BASE_FEE,
  numOperations = 1,
  sign = true,
  timeoutSeconds = 60,
  omitTimeBounds = false,
}: BuildInnerTransactionOptions): Transaction {
  const account = new Account(sourceKeypair.publicKey(), sequence);
  const builder = new TransactionBuilder(account, {
    fee: String(feeStroops),
    networkPassphrase,
  });

  for (let i = 0; i < numOperations; i += 1) {
    builder.addOperation(
      Operation.payment({
        destination: sourceKeypair.publicKey(),
        asset: Asset.native(),
        amount: '1',
      }),
    );
  }

  let transaction = builder.setTimeout(timeoutSeconds).build();
  if (omitTimeBounds) {
    const envelope = transaction.toEnvelope();
    envelope.v1().tx().cond(xdr.Preconditions.precondNone());
    transaction = new Transaction(envelope, networkPassphrase);
  }
  if (sign) {
    transaction.sign(sourceKeypair);
  }
  return transaction;
}
