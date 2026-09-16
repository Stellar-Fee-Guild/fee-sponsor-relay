import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

export interface BuildInnerTransactionOptions {
  sourceKeypair: Keypair;
  networkPassphrase: string;
  sequence?: string;
  feeStroops?: string;
  numOperations?: number;
  sign?: boolean;
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
}: BuildInnerTransactionOptions) {
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

  const transaction = builder.setTimeout(60).build();
  if (sign) {
    transaction.sign(sourceKeypair);
  }
  return transaction;
}
