import { readFileSync } from 'node:fs';
import { FeeBumpTransaction, Keypair } from '@stellar/stellar-sdk';

/**
 * Resolves the sponsor account's secret key from the environment.
 *
 * `SPONSOR_SECRET_KEY_FILE` takes precedence over `SPONSOR_SECRET_KEY` so
 * operators can inject the key via a mounted secret (Docker/Kubernetes
 * secret, Vault agent template, etc.) instead of a plaintext env var. The
 * key is never logged.
 */
export function resolveSponsorSecretKey(env: NodeJS.ProcessEnv = process.env): string {
  const secretKeyFile = env.SPONSOR_SECRET_KEY_FILE?.trim();
  if (secretKeyFile) {
    const contents = readFileSync(secretKeyFile, 'utf8').trim();
    if (!contents) {
      throw new Error(`SPONSOR_SECRET_KEY_FILE (${secretKeyFile}) is empty`);
    }
    return contents;
  }

  const secretKey = env.SPONSOR_SECRET_KEY?.trim();
  if (secretKey) {
    return secretKey;
  }

  throw new Error(
    'No sponsor secret key configured. Set SPONSOR_SECRET_KEY_FILE (recommended) or ' +
      'SPONSOR_SECRET_KEY.',
  );
}

/**
 * Wraps the sponsor account's keypair and provides the only code path that
 * touches the secret key: signing a fee-bump transaction that has already
 * passed policy checks.
 */
export class SponsorAccountManager {
  private readonly keypair: Keypair;

  constructor(secretKey: string) {
    try {
      this.keypair = Keypair.fromSecret(secretKey);
    } catch {
      throw new Error(
        'Invalid sponsor secret key: expected a valid Stellar secret seed (starts with "S").',
      );
    }
  }

  get publicKey(): string {
    return this.keypair.publicKey();
  }

  /** Signs a fee-bump transaction in place and returns it for convenience. */
  sign(feeBumpTransaction: FeeBumpTransaction): FeeBumpTransaction {
    feeBumpTransaction.sign(this.keypair);
    return feeBumpTransaction;
  }
}
