import type { LogLevel, SponsorshipAuditLogEntry } from './types.js';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Minimal structured (JSON-lines) logger. Kept dependency-free so the
 * relay's only runtime dependencies are the Stellar SDK and an HTTP
 * framework; swap in pino/winston if you need log shipping.
 */
export class Logger {
  private readonly minLevel: number;

  constructor(level: LogLevel = 'info') {
    this.minLevel = LEVEL_ORDER[level];
  }

  debug(message: string, fields: Record<string, unknown> = {}): void {
    this.write('debug', message, fields);
  }

  info(message: string, fields: Record<string, unknown> = {}): void {
    this.write('info', message, fields);
  }

  warn(message: string, fields: Record<string, unknown> = {}): void {
    this.write('warn', message, fields);
  }

  error(message: string, fields: Record<string, unknown> = {}): void {
    this.write('error', message, fields);
  }

  /** Emits a structured, auditable record of a single sponsorship decision. */
  sponsorshipDecision(entry: SponsorshipAuditLogEntry): void {
    this.write(entry.approved ? 'info' : 'warn', 'sponsorship_decision', { ...entry });
  }

  private write(level: LogLevel, message: string, fields: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < this.minLevel) {
      return;
    }
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...fields,
    });
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}
