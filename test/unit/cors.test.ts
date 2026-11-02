import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { corsHeaders, corsPreflight, isCorsEnabled } from '../../src/cors.js';
import type { CorsAllowedOrigins } from '../../src/types.js';

function makeApp(allowed: CorsAllowedOrigins) {
  const app = express();
  app.use(corsHeaders(allowed));
  app.options('/sponsor', corsPreflight(allowed));
  app.post('/sponsor', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('isCorsEnabled', () => {
  it('is false only for an empty list', () => {
    expect(isCorsEnabled([])).toBe(false);
    expect(isCorsEnabled('*')).toBe(true);
    expect(isCorsEnabled(['https://a.example'])).toBe(true);
  });
});

describe('corsHeaders', () => {
  it('allows any origin with "*"', async () => {
    const res = await request(makeApp('*')).post('/sponsor').set('Origin', 'https://x.example');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('echoes an allowed origin and sets Vary: Origin', async () => {
    const res = await request(makeApp(['https://a.example', 'https://b.example']))
      .post('/sponsor')
      .set('Origin', 'https://b.example');
    expect(res.headers['access-control-allow-origin']).toBe('https://b.example');
    expect(res.headers.vary).toMatch(/Origin/);
  });

  it('sends no allow-origin header for an origin not on the list', async () => {
    const res = await request(makeApp(['https://a.example']))
      .post('/sponsor')
      .set('Origin', 'https://evil.example');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers.vary).toMatch(/Origin/);
  });

  it('does not affect requests without an Origin header', async () => {
    const res = await request(makeApp(['https://a.example'])).post('/sponsor');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('corsPreflight', () => {
  it('answers an allowed preflight with 204 and the allowed method and header', async () => {
    const res = await request(makeApp(['https://a.example']))
      .options('/sponsor')
      .set('Origin', 'https://a.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://a.example');
    expect(res.headers['access-control-allow-methods']).toBe('POST, OPTIONS');
    expect(res.headers['access-control-allow-headers']).toBe('Content-Type');
    expect(res.headers['access-control-max-age']).toBe('600');
  });

  it('answers a disallowed preflight with 204 and no CORS headers', async () => {
    const res = await request(makeApp(['https://a.example']))
      .options('/sponsor')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-methods']).toBeUndefined();
  });
});
