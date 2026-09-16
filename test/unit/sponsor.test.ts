import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveSponsorSecretKey, SponsorAccountManager } from '../../src/sponsor.js';

describe('resolveSponsorSecretKey', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('reads the secret key from SPONSOR_SECRET_KEY', () => {
    const keypair = Keypair.random();
    const key = resolveSponsorSecretKey({
      SPONSOR_SECRET_KEY: keypair.secret(),
    } as NodeJS.ProcessEnv);
    expect(key).toBe(keypair.secret());
  });

  it('prefers SPONSOR_SECRET_KEY_FILE over SPONSOR_SECRET_KEY', () => {
    const fileKeypair = Keypair.random();
    const envKeypair = Keypair.random();
    tempDir = mkdtempSync(join(tmpdir(), 'fee-sponsor-relay-test-'));
    const secretFile = join(tempDir, 'sponsor.secret');
    writeFileSync(secretFile, `${fileKeypair.secret()}\n`);

    const key = resolveSponsorSecretKey({
      SPONSOR_SECRET_KEY_FILE: secretFile,
      SPONSOR_SECRET_KEY: envKeypair.secret(),
    } as NodeJS.ProcessEnv);

    expect(key).toBe(fileKeypair.secret());
  });

  it('throws a clear error when neither is set', () => {
    expect(() => resolveSponsorSecretKey({} as NodeJS.ProcessEnv)).toThrow(
      /No sponsor secret key configured/,
    );
  });

  it('throws when SPONSOR_SECRET_KEY_FILE points at an empty file', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'fee-sponsor-relay-test-'));
    const secretFile = join(tempDir, 'empty.secret');
    writeFileSync(secretFile, '   \n');

    expect(() =>
      resolveSponsorSecretKey({ SPONSOR_SECRET_KEY_FILE: secretFile } as NodeJS.ProcessEnv),
    ).toThrow(/is empty/);
  });
});

describe('SponsorAccountManager', () => {
  it('exposes the public key derived from the secret key', () => {
    const keypair = Keypair.random();
    const manager = new SponsorAccountManager(keypair.secret());
    expect(manager.publicKey).toBe(keypair.publicKey());
  });

  it('rejects an invalid secret key with a clear error', () => {
    expect(() => new SponsorAccountManager('not-a-real-secret')).toThrow(
      /Invalid sponsor secret key/,
    );
  });
});
