import { EventEmitter } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../../src/logger.js';
import {
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  installGracefulShutdown,
  type ClosableServer,
} from '../../src/shutdown.js';

const logger = new Logger('error');

afterEach(() => {
  vi.useRealTimers();
});

describe('installGracefulShutdown', () => {
  async function startSlowServer() {
    let release: () => void = () => undefined;
    let markArrived: () => void = () => undefined;
    const arrived = new Promise<void>((resolve) => {
      markArrived = resolve;
    });
    const app = express();
    app.get('/slow', (_req, res) => {
      release = () => res.json({ done: true });
      markArrived();
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/slow`;
    return { server, url, arrived, release: () => release() };
  }

  function shutDown(server: ClosableServer): { exited: Promise<number> } {
    let exitWith: (code: number) => void = () => undefined;
    const exited = new Promise<number>((resolve) => {
      exitWith = resolve;
    });
    installGracefulShutdown({ server, logger, signals: [], exit: exitWith })('SIGTERM');
    return { exited };
  }

  it('lets an in-flight request finish before exiting 0', async () => {
    const { server, url, arrived, release } = await startSlowServer();
    const inFlight = fetch(url);
    await arrived;

    let exitCode: number | undefined;
    const { exited } = shutDown(server);
    void exited.then((code) => {
      exitCode = code;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(exitCode).toBeUndefined();

    release();
    expect(await (await inFlight).json()).toEqual({ done: true });
    expect(await exited).toBe(0);
  });

  it('stops accepting new connections', async () => {
    const { server, url } = await startSlowServer();
    const { exited } = shutDown(server);
    expect(await exited).toBe(0);
    await expect(fetch(url)).rejects.toThrow();
  });

  it('force-closes connections and exits 1 after the timeout', () => {
    vi.useFakeTimers();
    const closeIdleConnections = vi.fn();
    const server: ClosableServer = {
      close: vi.fn(), // never calls back: a request is stuck
      closeIdleConnections,
      closeAllConnections: vi.fn(),
    };
    const exit = vi.fn();
    installGracefulShutdown({ server, logger, signals: [], exit })('SIGINT');

    expect(closeIdleConnections).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(DEFAULT_SHUTDOWN_TIMEOUT_MS - 1);
    expect(closeIdleConnections.mock.calls.length).toBeGreaterThan(1);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(server.closeAllConnections).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits 1 if closing the server fails', () => {
    const server: ClosableServer = {
      close: (callback) => callback?.(new Error('not running')),
    };
    const exit = vi.fn();
    installGracefulShutdown({ server, logger, signals: [], exit })('SIGTERM');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('registers SIGTERM and SIGINT and ignores repeated signals', () => {
    const fakeProcess = new EventEmitter();
    const server: ClosableServer = { close: vi.fn() };
    const exit = vi.fn();
    installGracefulShutdown({
      server,
      logger,
      exit,
      processRef: fakeProcess as unknown as Pick<NodeJS.Process, 'on'>,
    });

    expect(fakeProcess.listenerCount('SIGTERM')).toBe(1);
    expect(fakeProcess.listenerCount('SIGINT')).toBe(1);

    fakeProcess.emit('SIGTERM');
    fakeProcess.emit('SIGTERM');
    fakeProcess.emit('SIGINT');
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(fakeProcess.listenerCount('SIGTERM')).toBe(1);
  });
});
