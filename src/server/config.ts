/**
 * Startup configuration checks and CORS policy (kept free of Express so they can be unit-tested).
 */
type Env = Record<string, string | undefined>;

/** Origins allowed to call the API from a browser / the Capacitor Android shell. Never "*". */
export function corsOrigins(env: Env = process.env): Set<string> {
  const defaults = ['https://localhost', 'http://localhost', 'capacitor://localhost', 'http://localhost:3000', 'http://localhost:5173'];
  const extra = (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const app = env.APP_URL ? [env.APP_URL.replace(/\/$/, '')] : [];
  return new Set([...defaults, ...extra, ...app]);
}

/** Throws (refusing to start) when production is mis-configured in a way that would weaken security. */
export function assertProductionConfig(env: Env = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const problems: string[] = [];
  if (!env.LINK_SIGNING_SECRET || env.LINK_SIGNING_SECRET.length < 32) problems.push('LINK_SIGNING_SECRET (>= 32 chars) is required');
  if (!env.APP_URL) problems.push('APP_URL is required (used for CORS and links in e-mails)');
  if ((env.DATA_STORE || '').toLowerCase() === 'memory') problems.push('DATA_STORE=memory is not allowed in production');
  if (env.BANK_WEBHOOKS_ALLOW_UNSIGNED_DEV === 'true') problems.push('BANK_WEBHOOKS_ALLOW_UNSIGNED_DEV must not be set in production');
  if (env.ENABLE_DEMO_SEED === 'true') problems.push('ENABLE_DEMO_SEED must not be set in production');
  if (env.MPESA_CONSUMER_KEY && (!env.MPESA_CALLBACK_SECRET || env.MPESA_CALLBACK_SECRET.length < 16)) {
    problems.push('MPESA_CALLBACK_SECRET (>= 16 chars) is required when M-Pesa is configured');
  }
  if (problems.length) throw new Error(`Refusing to start - production configuration problems:\n - ${problems.join('\n - ')}`);
}
