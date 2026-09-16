import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../../src/logger.js';

describe('Logger', () => {
  let logSpy: ReturnType<typeof spyOnConsole>;
  let warnSpy: ReturnType<typeof spyOnConsole>;
  let errorSpy: ReturnType<typeof spyOnConsole>;

  function spyOnConsole(method: 'log' | 'warn' | 'error') {
    return vi.spyOn(console, method).mockImplementation(() => undefined);
  }

  beforeEach(() => {
    logSpy = spyOnConsole('log');
    warnSpy = spyOnConsole('warn');
    errorSpy = spyOnConsole('error');
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('emits debug/info via console.log, warn via console.warn, error via console.error', () => {
    const logger = new Logger('debug');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('suppresses messages below the configured minimum level', () => {
    const logger = new Logger('warn');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('includes structured fields as JSON', () => {
    const logger = new Logger('info');
    logger.info('hello', { foo: 'bar' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(payload).toMatchObject({ level: 'info', message: 'hello', foo: 'bar' });
    expect(typeof payload.timestamp).toBe('string');
  });

  it('logs an approved sponsorship decision at info level', () => {
    const logger = new Logger('info');
    logger.sponsorshipDecision({
      timestamp: new Date().toISOString(),
      sourceIp: '1.2.3.4',
      sourceAccount: 'GA',
      approved: true,
      innerFeeStroops: 200,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(payload.message).toBe('sponsorship_decision');
    expect(payload.approved).toBe(true);
  });

  it('logs a rejected sponsorship decision at warn level', () => {
    const logger = new Logger('info');
    logger.sponsorshipDecision({
      timestamp: new Date().toISOString(),
      sourceIp: '1.2.3.4',
      approved: false,
      reason: 'DENYLISTED_ACCOUNT',
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
