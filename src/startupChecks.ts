import type { Logger } from './logger.js';

/** Per-request timeout for startup checks, so a hung Horizon can't stall them forever. */
const CHECK_TIMEOUT_MS = 5_000;

/** Result of looking up the sponsor account on Horizon. */
export type SponsorAccountLookup =
  { found: true; nativeBalance: string | undefined } | { found: false };

/** The Horizon calls the startup checks make. Injectable for tests. */
export interface HorizonProbe {
  /** Returns the `network_passphrase` Horizon reports at its root endpoint. */
  fetchNetworkPassphrase(): Promise<string | undefined>;
  /** Looks the account up; `found: false` means Horizon answered 404. */
  loadAccount(accountId: string): Promise<SponsorAccountLookup>;
}

/** Builds a `HorizonProbe` on top of `fetch`. */
export function createHorizonProbe(
  horizonUrl: string,
  fetchImpl: typeof fetch = fetch,
): HorizonProbe {
  const base = horizonUrl.endsWith('/') ? horizonUrl : `${horizonUrl}/`;

  const getJson = async (path: string): Promise<{ status: number; body: unknown }> => {
    const res = await fetchImpl(new URL(path, base), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (res.status === 404) {
      return { status: 404, body: undefined };
    }
    if (!res.ok) {
      throw new Error(`Horizon returned HTTP ${res.status} for ${new URL(path, base).href}`);
    }
    return { status: res.status, body: await res.json() };
  };

  return {
    async fetchNetworkPassphrase() {
      const { body } = await getJson('');
      const passphrase = (body as { network_passphrase?: unknown } | undefined)?.network_passphrase;
      return typeof passphrase === 'string' ? passphrase : undefined;
    },
    async loadAccount(accountId) {
      const { status, body } = await getJson(`accounts/${encodeURIComponent(accountId)}`);
      if (status === 404) {
        return { found: false };
      }
      const balances = (body as { balances?: unknown } | undefined)?.balances;
      const native = Array.isArray(balances)
        ? (balances as Array<{ asset_type?: unknown; balance?: unknown }>).find(
            (entry) => entry.asset_type === 'native',
          )
        : undefined;
      return {
        found: true,
        nativeBalance: typeof native?.balance === 'string' ? native.balance : undefined,
      };
    },
  };
}

export interface StartupCheckOptions {
  probe: HorizonProbe;
  logger: Logger;
  horizonUrl: string;
  networkPassphrase: string;
  sponsorPublicKey: string;
}

/**
 * Checks that the configuration can actually work: Horizon reports the
 * configured network passphrase, and the sponsor account exists on that
 * network. Problems are logged as warnings and never stop the relay (Horizon
 * may just be briefly unavailable). Never throws.
 *
 * @returns the warnings that were logged (empty if every check passed).
 */
export async function runStartupChecks(options: StartupCheckOptions): Promise<string[]> {
  const { probe, logger, horizonUrl, networkPassphrase, sponsorPublicKey } = options;
  const warnings: string[] = [];
  const warn = (detail: string, fields: Record<string, unknown> = {}) => {
    warnings.push(detail);
    logger.warn('startup_check_failed', { detail, horizonUrl, ...fields });
  };

  try {
    const horizonPassphrase = await probe.fetchNetworkPassphrase();
    if (horizonPassphrase === undefined) {
      warn('Horizon did not report a network_passphrase at its root endpoint.');
    } else if (horizonPassphrase !== networkPassphrase) {
      warn(
        'NETWORK_PASSPHRASE does not match the network HORIZON_URL points to. Sponsored ' +
          'transactions will fail; check both settings.',
        { configuredPassphrase: networkPassphrase, horizonPassphrase },
      );
    }
  } catch (err) {
    warn('Could not reach Horizon to check the network passphrase.', { error: errorMessage(err) });
  }

  try {
    const account = await probe.loadAccount(sponsorPublicKey);
    if (!account.found) {
      warn(
        'Sponsor account not found on Horizon. It is unfunded, or HORIZON_URL / ' +
          'NETWORK_PASSPHRASE point at the wrong network. Fee bumps it signs will fail.',
        { sponsorPublicKey },
      );
    } else {
      logger.info('sponsor_account_loaded', {
        sponsorPublicKey,
        nativeBalance: account.nativeBalance,
      });
    }
  } catch (err) {
    warn('Could not load the sponsor account from Horizon.', {
      sponsorPublicKey,
      error: errorMessage(err),
    });
  }

  if (warnings.length === 0) {
    logger.info('startup_checks_passed', { horizonUrl });
  }
  return warnings;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
