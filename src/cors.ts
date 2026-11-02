import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { CorsAllowedOrigins } from './types.js';

/** How long browsers may cache a preflight response, in seconds. */
const PREFLIGHT_MAX_AGE_SECONDS = 600;

/**
 * Returns `true` when CORS is enabled, i.e. the relay should send CORS
 * headers at all.
 */
export function isCorsEnabled(allowed: CorsAllowedOrigins): boolean {
  return allowed === '*' || allowed.length > 0;
}

/**
 * Adds `Access-Control-Allow-Origin` to responses for allowed origins.
 *
 * With an explicit list, the request's `Origin` is echoed back only if it is
 * on the list, and `Vary: Origin` is always set so shared caches don't serve
 * one origin's response to another. Requests from other origins get no CORS
 * headers, so the browser blocks them; server-to-server callers (no
 * `Origin` header) are unaffected.
 */
export function corsHeaders(allowed: CorsAllowedOrigins): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    applyAllowOrigin(allowed, req, res);
    next();
  };
}

/**
 * Answers a CORS preflight (`OPTIONS`) request for `POST` with a JSON body.
 * Disallowed origins get a 204 with no CORS headers, which the browser
 * treats as a refusal.
 */
export function corsPreflight(allowed: CorsAllowedOrigins): RequestHandler {
  return (req: Request, res: Response) => {
    if (applyAllowOrigin(allowed, req, res)) {
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', String(PREFLIGHT_MAX_AGE_SECONDS));
    }
    res.status(204).end();
  };
}

function applyAllowOrigin(allowed: CorsAllowedOrigins, req: Request, res: Response): boolean {
  if (allowed === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return true;
  }
  res.vary('Origin');
  const origin = req.headers.origin;
  if (origin !== undefined && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    return true;
  }
  return false;
}
