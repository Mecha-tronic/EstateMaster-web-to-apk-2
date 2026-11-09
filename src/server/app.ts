/**
 * Express application assembly: security headers, CORS allow-list, body limits + raw-body capture for
 * webhook signatures, the authentication gate, routes, error handling and static/Vite serving.
 */
import express from 'express';
import path from 'path';
import { apiGate, rateLimit } from './auth.js';
import { registerAllRoutes } from './routes.js';
import { corsOrigins } from './config.js';

export { assertProductionConfig } from './config.js';

export async function createApp(): Promise<express.Express> {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  app.disable('x-powered-by');
  // Number of reverse proxies in front of the app (Cloud Run / nginx = 1). Needed for correct client IPs.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? (isProd ? 1 : 0)));

  // ---- security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      if (process.env.CSP_DISABLED !== 'true') {
        res.setHeader('Content-Security-Policy',
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; " +
          "img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      }
    }
    next();
  });

  // ---- CORS allow-list (the API uses bearer tokens, never cookies)
  const allowed = corsOrigins();
  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    if (origin) {
      res.setHeader('Vary', 'Origin');
      if (allowed.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
        res.setHeader('Access-Control-Max-Age', '600');
      }
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ---- body parsing: small limit; RAW body kept for webhook signature verification
  app.use(express.json({
    limit: '1mb',
    verify: (req: any, _res, buf) => { req.rawBody = Buffer.from(buf); }
  }));

  // ---- API protection
  app.use('/api', rateLimit({ name: 'api-global', max: 600, windowMs: 60_000 }) as any);
  app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', apiGate as any);
  registerAllRoutes(app as any);

  app.get('/.well-known/assetlinks.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(path.join(process.cwd(), 'public', '.well-known', 'assetlinks.json'));
  });

  app.all('/api/*', (req, res) => res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` }));

  // ---- errors (never leak internals)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.path.startsWith('/api')) return next(err);
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (err instanceof SyntaxError || err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body.' });
    console.error('[api] unhandled error:', err?.stack || err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  // ---- frontend
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  return app;
}
