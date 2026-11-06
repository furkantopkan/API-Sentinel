import express, { type Express } from 'express';
import { setTimeout as sleep } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';

/**
 * A fake API with predictable behaviour. Used as the target for manual tests
 * (`npm run mock`) and imported by the server's integration tests.
 *
 * WARNING: intentionally unsafe (open redirect, echoes headers). Test use only.
 */

export const MOCK_BEARER_TOKEN = 'test-token';
export const MOCK_BASIC_USER = { username: 'qa', password: 'secret' };

export const SAMPLE_JSON = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  roles: ['qa', 'admin'],
  active: true,
  score: 9.5,
  manager: null,
};

/** Parses a numeric path parameter and clamps it into [min, max]; NaN → undefined. */
function clampInt(raw: string | undefined, min: number, max: number): number | undefined {
  const value = Number(raw);
  if (!Number.isInteger(value)) return undefined;
  return Math.min(Math.max(value, min), max);
}

export function createMockTargetApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/', (_req, res) => {
    res.json({
      endpoints: [
        'GET /json',
        'GET /text',
        'GET /html',
        'GET /empty',
        'ANY /echo',
        'GET /status/:code',
        'GET /delay/:ms',
        'GET /large/:kb',
        'GET /redirect/:n',
        'GET /redirect-to?url=',
        'GET /auth/bearer',
        'GET /auth/basic',
        'GET /malformed-json',
        'GET /binary',
        'GET /gzip',
        'GET /headers',
      ],
    });
  });

  app.get('/json', (_req, res) => {
    res.json(SAMPLE_JSON);
  });

  app.get('/text', (_req, res) => {
    res.type('text/plain').send('Hello from the mock target.\nThis is plain text.');
  });

  // Contains a script tag: the UI must show it as text, never execute it.
  app.get('/html', (_req, res) => {
    res.type('html').send('<h1>Mock page</h1><script>alert("xss")</script>');
  });

  app.get('/empty', (_req, res) => {
    res.status(204).end();
  });

  // Returns exactly what it received, so tests can verify method, query, headers and body.
  app.all('/echo', express.text({ type: () => true, limit: '2mb' }), (req, res) => {
    res.json({
      method: req.method,
      path: req.path,
      query: req.query,
      headers: req.headers,
      body: typeof req.body === 'string' ? req.body : '',
    });
  });

  app.get('/status/:code', (req, res) => {
    const code = Number(req.params.code);
    if (!Number.isInteger(code) || code < 200 || code > 599) {
      res.status(400).json({ error: 'code must be an integer between 200 and 599' });
      return;
    }
    res.status(code).json({ status: code });
  });

  app.get('/delay/:ms', async (req, res) => {
    const ms = clampInt(req.params.ms, 0, 120_000) ?? 0;
    await sleep(ms);
    res.json({ delayedMs: ms });
  });

  app.get('/large/:kb', (req, res) => {
    const kb = clampInt(req.params.kb, 1, 20_480) ?? 1;
    res.type('text/plain').send('a'.repeat(kb * 1024));
  });

  app.get('/redirect/:n', (req, res) => {
    const n = clampInt(req.params.n, 0, 20) ?? 0;
    if (n === 0) {
      res.json({ redirected: true });
      return;
    }
    res.redirect(302, `/redirect/${n - 1}`);
  });

  // Open redirect on purpose: used to test that the SSRF guard re-checks every hop.
  app.get('/redirect-to', (req, res) => {
    const target = req.query.url;
    if (typeof target !== 'string') {
      res.status(400).json({ error: 'url query parameter is required' });
      return;
    }
    res.redirect(302, target);
  });

  app.get('/auth/bearer', (req, res) => {
    if (req.headers.authorization === `Bearer ${MOCK_BEARER_TOKEN}`) {
      res.json({ authenticated: true, scheme: 'bearer' });
      return;
    }
    res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'Unauthorized' });
  });

  app.get('/auth/basic', (req, res) => {
    const expected = Buffer.from(
      `${MOCK_BASIC_USER.username}:${MOCK_BASIC_USER.password}`,
      'utf8',
    ).toString('base64');
    if (req.headers.authorization === `Basic ${expected}`) {
      res.json({ authenticated: true, scheme: 'basic', user: MOCK_BASIC_USER.username });
      return;
    }
    res.status(401).set('WWW-Authenticate', 'Basic realm="mock"').json({ error: 'Unauthorized' });
  });

  app.get('/malformed-json', (_req, res) => {
    res.type('application/json').send('{"id": 1, "name": "broken",');
  });

  app.get('/binary', (_req, res) => {
    res.type('application/octet-stream').send(Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00]));
  });

  app.get('/gzip', (_req, res) => {
    res
      .type('application/json')
      .set('Content-Encoding', 'gzip')
      .send(gzipSync(JSON.stringify({ compressed: true, ...SAMPLE_JSON })));
  });

  app.get('/headers', (_req, res) => {
    res.append('Set-Cookie', 'session=abc; HttpOnly');
    res.append('Set-Cookie', 'theme=dark');
    res.set('X-Custom-Header', 'custom-value');
    res.json({ headers: 'see response headers' });
  });

  return app;
}
