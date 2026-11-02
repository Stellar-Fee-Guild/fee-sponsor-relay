import express, { type Request, type Response } from 'express';
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
import type { SponsorshipDecision } from './types.js';

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
}

export function createServer(deps: ServerDependencies): express.Express {
  const { relay, policy, rateLimiter, logger, networkPassphrase, sponsorPublicKey } = deps;
  const maxTxValiditySeconds = deps.maxTxValiditySeconds ?? DEFAULT_MAX_TX_VALIDITY_SECONDS;
  const app = express();
  app.use(express.json({ limit: '64kb' }));

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

  return app;
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
