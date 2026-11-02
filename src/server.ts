import express, { type NextFunction, type Request, type Response } from 'express';
import { corsHeaders, corsPreflight, isCorsEnabled } from './cors.js';
import type { Logger } from './logger.js';
import type { PolicyEngine } from './policy.js';
import type { RateLimiter } from './rateLimiter.js';
import {
  assertValidityWindow,
  DEFAULT_MAX_TX_VALIDITY_SECONDS,
  InvalidInnerTransactionError,
  InvalidTransactionError,
  parseInnerTransaction,
  requiredBaseFeeStroops,
  sponsorCostStroops,
  type RelayService,
} from './relay.js';
import type { CorsAllowedOrigins, SponsorshipDecision, TrustProxySetting } from './types.js';

export interface ServerDependencies {
  relay: RelayService;
  policy: PolicyEngine;
  rateLimiter: RateLimiter;
  logger: Logger;
  networkPassphrase: string;
  sponsorPublicKey: string;
  /**
   * Furthest in the future an inner transaction's `maxTime` may be, in
   * seconds. Defaults to `DEFAULT_MAX_TX_VALIDITY_SECONDS` (300).
   */
  maxTxValiditySeconds?: number;
  /**
   * Express `trust proxy` setting. Leave undefined unless the relay runs
   * behind a reverse proxy or load balancer; otherwise clients can spoof
   * their IP with `X-Forwarded-For`.
   */
  trustProxy?: TrustProxySetting;
  /** Origins allowed to call the relay from a browser. Default `[]` (no CORS headers). */
  corsAllowedOrigins?: CorsAllowedOrigins;
}

export function createServer(deps: ServerDependencies): express.Express {
  const { relay, policy, rateLimiter, logger, networkPassphrase, sponsorPublicKey } = deps;
  const maxTxValiditySeconds = deps.maxTxValiditySeconds ?? DEFAULT_MAX_TX_VALIDITY_SECONDS;
  const app = express();
  app.disable('x-powered-by');
  if (deps.trustProxy !== undefined) {
    app.set('trust proxy', deps.trustProxy);
  }

  // CORS runs before body parsing so error responses also carry the headers
  // and browsers can read them.
  const corsAllowedOrigins = deps.corsAllowedOrigins ?? [];
  if (isCorsEnabled(corsAllowedOrigins)) {
    app.use(corsHeaders(corsAllowedOrigins));
    app.options('/sponsor', corsPreflight(corsAllowedOrigins));
  }

  app.use(express.json({ limit: `${MAX_BODY_BYTES / 1024}kb` }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', sponsorPublicKey });
  });

  app.post('/sponsor', (req: Request, res: Response) => {
    const sourceIp = req.ip ?? 'unknown';

    if (!rateLimiter.tryConsumeIp(sourceIp)) {
      return reject(
        res,
        logger,
        {
          approved: false,
          reason: 'IP_RATE_LIMITED',
          detail: 'Too many requests from this IP address.',
        },
        sourceIp,
        429,
      );
    }

    const { transaction } = req.body ?? {};
    if (typeof transaction !== 'string' || transaction.length === 0) {
      return reject(
        res,
        logger,
        {
          approved: false,
          reason: 'INVALID_TRANSACTION_XDR',
          detail: 'Request body must include a "transaction" field with a base64 XDR string.',
        },
        sourceIp,
        400,
      );
    }

    let innerTransaction;
    try {
      innerTransaction = parseInnerTransaction(transaction, networkPassphrase);
      assertValidityWindow(innerTransaction, maxTxValiditySeconds);
    } catch (err) {
      if (err instanceof InvalidInnerTransactionError) {
        return reject(
          res,
          logger,
          { approved: false, reason: 'INVALID_INNER_TRANSACTION', detail: err.message },
          sourceIp,
          400,
        );
      }
      const detail = err instanceof InvalidTransactionError ? err.message : 'Invalid transaction.';
      return reject(
        res,
        logger,
        {
          approved: false,
          reason: 'INVALID_TRANSACTION_XDR',
          detail,
        },
        sourceIp,
        400,
      );
    }

    const sourceAccount = innerTransaction.source;

    if (!rateLimiter.tryConsumeAccount(sourceAccount)) {
      return reject(
        res,
        logger,
        {
          approved: false,
          reason: 'ACCOUNT_RATE_LIMITED',
          sourceAccount,
          detail: 'Too many sponsorship requests from this account.',
        },
        sourceIp,
        429,
      );
    }

    const baseFeeStroops = requiredBaseFeeStroops(innerTransaction);
    const totalCostStroops = sponsorCostStroops(innerTransaction, baseFeeStroops);

    const evaluation = policy.evaluate(sourceAccount, totalCostStroops);
    if (!evaluation.approved) {
      return reject(
        res,
        logger,
        {
          approved: false,
          reason: evaluation.reason,
          detail: evaluation.detail,
          sourceAccount,
          innerFeeStroops: totalCostStroops,
        },
        sourceIp,
        403,
      );
    }

    const feeBumpTransaction = relay.wrapAndSign(innerTransaction, baseFeeStroops);
    policy.recordSponsorship(sourceAccount, totalCostStroops);

    const decision: SponsorshipDecision = {
      approved: true,
      sourceAccount,
      innerFeeStroops: totalCostStroops,
      feeBumpTransactionXdr: feeBumpTransaction.toXDR(),
    };

    logger.sponsorshipDecision({
      timestamp: new Date().toISOString(),
      sourceAccount,
      sourceIp,
      approved: true,
      innerFeeStroops: totalCostStroops,
    });

    return res.status(200).json(decision);
  });

  app.use((req: Request, res: Response) => {
    // Keep Express's automatic OPTIONS answer for known routes, which a
    // catch-all handler would otherwise turn into a 404.
    const allow = req.method === 'OPTIONS' ? ROUTE_METHODS[req.path] : undefined;
    if (allow) {
      res.setHeader('Allow', allow);
      res.status(200).send(allow);
      return;
    }
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: unknown, req: Request, res: Response, next: NextFunction): Response | void => {
    if (res.headersSent) {
      return next(err);
    }
    const bodyError = asBodyParserError(err);
    if (bodyError) {
      return reject(
        res,
        logger,
        { approved: false, reason: 'INVALID_TRANSACTION_XDR', detail: bodyError.detail },
        req.ip ?? 'unknown',
        bodyError.status,
      );
    }
    logger.error('unhandled_error', {
      method: req.method,
      path: req.path,
      error: err instanceof Error ? err.name : typeof err,
      errorMessage: err instanceof Error ? err.message : undefined,
    });
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/** Methods served per route, as Express reports them in an automatic `Allow` header. */
const ROUTE_METHODS: Record<string, string> = {
  '/health': 'GET,HEAD',
  '/sponsor': 'POST',
};

/** Maximum accepted request body size, in bytes. */
export const MAX_BODY_BYTES = 64 * 1024;

/**
 * Maps errors raised by `express.json()` (body-parser) to a status and a
 * client-safe message. Returns `undefined` for anything else.
 */
function asBodyParserError(err: unknown): { status: number; detail: string } | undefined {
  if (typeof err !== 'object' || err === null || !('type' in err)) {
    return undefined;
  }
  const { type, status, expose, message } = err as {
    type?: unknown;
    status?: unknown;
    expose?: unknown;
    message?: unknown;
  };
  if (type === 'entity.parse.failed') {
    return { status: 400, detail: 'Request body is not valid JSON.' };
  }
  if (type === 'entity.too.large') {
    return {
      status: 413,
      detail: `Request body exceeds the ${MAX_BODY_BYTES / 1024} KB limit.`,
    };
  }
  if (
    expose === true &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    typeof message === 'string'
  ) {
    return { status, detail: message };
  }
  return undefined;
}

function reject(
  res: Response,
  logger: Logger,
  decision: SponsorshipDecision,
  sourceIp: string,
  statusCode: number,
): Response {
  logger.sponsorshipDecision({
    timestamp: new Date().toISOString(),
    sourceAccount: decision.sourceAccount,
    sourceIp,
    approved: false,
    reason: decision.reason,
    detail: decision.detail,
    innerFeeStroops: decision.innerFeeStroops,
  });
  return res.status(statusCode).json(decision);
}
