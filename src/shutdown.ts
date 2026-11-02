import type { Logger } from './logger.js';

/** Default time allowed for in-flight requests to finish after a shutdown signal. */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

/** How often idle keep-alive connections are closed while shutting down. */
const IDLE_SWEEP_INTERVAL_MS = 250;

/** The parts of `http.Server` graceful shutdown needs. */
export interface ClosableServer {
  close(callback?: (err?: Error) => void): unknown;
  closeIdleConnections?(): void;
  closeAllConnections?(): void;
}

export interface GracefulShutdownOptions {
  server: ClosableServer;
  logger: Logger;
  /** Default `DEFAULT_SHUTDOWN_TIMEOUT_MS` (10 seconds). */
  timeoutMs?: number;
  /** Default `['SIGTERM', 'SIGINT']`. */
  signals?: NodeJS.Signals[];
  /** Injectable for tests. Default `process`. */
  processRef?: Pick<NodeJS.Process, 'on'>;
  /** Injectable for tests. Default `process.exit`. */
  exit?: (code: number) => void;
}

/**
 * Shuts the HTTP server down cleanly on `SIGTERM`/`SIGINT`, which Docker and
 * Kubernetes send on every deploy: stop accepting connections, let in-flight
 * requests finish, then exit 0. If they haven't finished within the timeout,
 * remaining connections are destroyed and the process exits 1.
 *
 * Returns the shutdown function so it can be triggered directly in tests.
 */
export function installGracefulShutdown(
  options: GracefulShutdownOptions,
): (signal: NodeJS.Signals) => void {
  const {
    server,
    logger,
    timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
    signals = ['SIGTERM', 'SIGINT'],
    processRef = process,
    exit = (code: number) => process.exit(code),
  } = options;

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      logger.warn('shutdown_already_in_progress', { signal });
      return;
    }
    shuttingDown = true;
    logger.info('shutdown_started', { signal, timeoutMs });

    // Keep-alive connections hold the server open until they time out.
    // Close the ones that are idle now, and keep closing connections as
    // their in-flight request finishes and they go idle.
    const idleSweep = setInterval(() => server.closeIdleConnections?.(), IDLE_SWEEP_INTERVAL_MS);
    idleSweep.unref?.();

    const timer = setTimeout(() => {
      clearInterval(idleSweep);
      logger.warn('shutdown_timeout', {
        timeoutMs,
        detail: 'In-flight requests did not finish in time; closing remaining connections.',
      });
      server.closeAllConnections?.();
      exit(1);
    }, timeoutMs);
    timer.unref?.();

    server.close((err) => {
      clearTimeout(timer);
      clearInterval(idleSweep);
      if (err) {
        logger.error('shutdown_failed', { error: err.message });
        exit(1);
        return;
      }
      logger.info('shutdown_complete');
      exit(0);
    });
    server.closeIdleConnections?.();
  };

  // `on`, not `once`: a repeated signal is logged and ignored rather than
  // falling through to Node's default handler and killing in-flight requests.
  // The timeout above bounds how long shutdown can take.
  for (const signal of signals) {
    processRef.on(signal, () => shutdown(signal));
  }

  return shutdown;
}
