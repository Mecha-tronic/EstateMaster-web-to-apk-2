/**
 * Authentication & authorisation core (server-side).
 *
 *  - Opaque 256-bit bearer session tokens; only the SHA-256 of a token is stored.
 *  - Idle timeout + absolute lifetime; individually revocable.
 *  - OTP / step-up challenges: hashed OTP, bounded attempts, one-time use.
 *  - Route gate: every /api route requires a valid session unless explicitly public.
 *  - Small in-process rate limiter (per instance).
 *
 * Framework-agnostic: request/response objects are typed structurally so this module
 * has no dependency on Express and can be unit-tested with fakes.
 */
import crypto from 'crypto';
import { getStore } from './store.js';
import { COLLECTIONS } from './db.js';
import { generateSessionId, sha256Hex, timingSafeEqualStrings, generateSecurityOtp } from '../lib/security.js';
import type { Landlord, Tenant, UserSession } from '../types.js';

export type Role = 'landlord' | 'tenant';

/** Value used to clear a lockout timestamp (Firestore/Memory stores drop `undefined`). */
export const LOCKOUT_PLACEHOLDER = '1970-01-01T00:00:00.000Z';

export const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_MINUTES || 30) * 60 * 1000;
export const SESSION_ABSOLUTE_MS = Number(process.env.SESSION_MAX_HOURS || 12) * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

export interface AuthContext {
  role: Role;
  userId: string;
  user: Landlord | Tenant;
  sessionId: string; // public id (safe to show in the sessions list)
  tokenHash: string;
  /** Account must change a weak/legacy password before doing anything else. */
  mustChangePassword: boolean;
}

export interface ReqLike {
  method: string;
  path: string;
  originalUrl?: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  auth?: AuthContext;
  [k: string]: any;
}
export interface ResLike {
  status(code: number): ResLike;
  json(body: any): any;
  setHeader(name: string, value: string): any;
  [k: string]: any;
}
export type NextLike = (err?: any) => void;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
interface SessionRecord {
  tokenHash: string; // doc id
  sessionId: string; // public id
  userId: string;
  userEmail: string;
  role: Role;
  ipAddress: string;
  device: string;
  deviceType: 'mobile' | 'desktop';
  browser: string;
  createdAt: string;
  lastActive: string;
  expiresAt: number; // absolute
  revoked?: boolean;
}

export function clientIp(req: ReqLike): string {
  // `req.ip` honours Express's "trust proxy" setting; never trust raw X-Forwarded-For directly.
  return String(req.ip || (req.socket && req.socket.remoteAddress) || '0.0.0.0');
}

export async function createSession(req: ReqLike, user: Landlord | Tenant, role: Role): Promise<{ token: string; session: UserSession }> {
  const token = generateSessionId();
  const tokenHash = sha256Hex(token);
  const ua = String(req.headers['user-agent'] || 'EstateMaster Client');
  const isMobile = /Mobile|Android|iPhone/i.test(ua);
  const now = new Date().toISOString();
  const rec: SessionRecord = {
    tokenHash,
    sessionId: crypto.randomBytes(9).toString('hex'),
    userId: user.id,
    userEmail: (user.email || '').toLowerCase(),
    role,
    ipAddress: clientIp(req),
    device: isMobile ? 'Mobile Device' : 'Desktop Browser',
    deviceType: isMobile ? 'mobile' : 'desktop',
    browser: ua.slice(0, 45),
    createdAt: now,
    lastActive: now,
    expiresAt: Date.now() + SESSION_ABSOLUTE_MS
  };
  await getStore().set(COLLECTIONS.SESSIONS, tokenHash, rec);
  return { token, session: toPublicSession(rec, true) };
}

function toPublicSession(r: SessionRecord, isCurrent: boolean): UserSession {
  return {
    sessionId: r.sessionId,
    id: r.sessionId,
    userId: r.userId,
    userEmail: r.userEmail,
    role: r.role,
    ipAddress: r.ipAddress,
    device: r.device,
    deviceType: r.deviceType,
    browser: r.browser,
    createdAt: r.createdAt,
    lastActive: r.lastActive,
    isCurrent
  };
}

export function extractBearer(req: ReqLike): string | null {
  const h = req.headers['authorization'];
  const v = Array.isArray(h) ? h[0] : h;
  if (!v) return null;
  const m = /^Bearer\s+([A-Za-z0-9_\-\.]{16,200})$/.exec(v.trim());
  return m ? m[1] : null;
}

/**
 * Resolves the caller from the bearer token. Returns null for any invalid state
 * (missing, unknown, expired, revoked, account deleted/locked).
 */
export async function resolveAuth(req: ReqLike): Promise<AuthContext | null> {
  const token = extractBearer(req);
  if (!token) return null;
  const tokenHash = sha256Hex(token);
  const store = getStore();
  const rec = await store.get<SessionRecord>(COLLECTIONS.SESSIONS, tokenHash);
  if (!rec || rec.revoked) return null;

  const now = Date.now();
  if (now > rec.expiresAt || now - new Date(rec.lastActive).getTime() > SESSION_IDLE_MS) {
    await store.delete(COLLECTIONS.SESSIONS, tokenHash).catch(() => undefined);
    return null;
  }

  const user = await store.get<Landlord | Tenant>(rec.role === 'landlord' ? COLLECTIONS.LANDLORDS : COLLECTIONS.TENANTS, rec.userId);
  if (!user) return null; // account removed -> session dead
  if (user.lockoutUntil && new Date(user.lockoutUntil).getTime() > now) return null;

  if (now - new Date(rec.lastActive).getTime() > TOUCH_INTERVAL_MS) {
    await store
      .update(COLLECTIONS.SESSIONS, tokenHash, { lastActive: new Date(now).toISOString() })
      .catch(() => undefined);
  }

  return {
    role: rec.role,
    userId: rec.userId,
    user,
    sessionId: rec.sessionId,
    tokenHash,
    mustChangePassword: Boolean((user as any).mustChangePassword)
  };
}

export async function revokeSessionByToken(tokenHash: string): Promise<void> {
  await getStore().delete(COLLECTIONS.SESSIONS, tokenHash);
}

export async function listSessionsForUser(userId: string, currentTokenHash?: string): Promise<UserSession[]> {
  const rows = await getStore().where<SessionRecord>(COLLECTIONS.SESSIONS, 'userId', userId);
  const now = Date.now();
  return rows
    .filter((r) => !r.revoked && now <= r.expiresAt)
    .sort((a, b) => b.lastActive.localeCompare(a.lastActive))
    .map((r) => toPublicSession(r, r.tokenHash === currentTokenHash));
}

/** Revoke a session by its PUBLIC id; only the owner can revoke. */
export async function revokeSessionById(userId: string, sessionId: string): Promise<boolean> {
  const rows = await getStore().where<SessionRecord>(COLLECTIONS.SESSIONS, 'userId', userId);
  const target = rows.find((r) => r.sessionId === sessionId);
  if (!target) return false;
  await getStore().delete(COLLECTIONS.SESSIONS, target.tokenHash);
  return true;
}

export async function revokeAllSessionsForUser(userId: string, exceptTokenHash?: string): Promise<number> {
  const rows = await getStore().where<SessionRecord>(COLLECTIONS.SESSIONS, 'userId', userId);
  let n = 0;
  for (const r of rows) {
    if (r.tokenHash === exceptTokenHash) continue;
    await getStore().delete(COLLECTIONS.SESSIONS, r.tokenHash);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// OTP / step-up challenges (store-backed so they survive restarts & multiple instances)
// ---------------------------------------------------------------------------
export type ChallengeKind = 'login-2fa' | 'step-up' | 'financial' | 'forced-reset';

interface ChallengeRecord {
  id: string; // sha256(handle)
  kind: ChallengeKind;
  userId: string;
  userEmail: string;
  role: Role;
  otpHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: number;
  action?: string;
  createdAt: string;
  verified?: boolean;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Creates a challenge. Returns the opaque handle (give to client) and the plaintext OTP (email it; never return it). */
export async function createChallenge(input: {
  kind: ChallengeKind;
  user: Landlord | Tenant;
  role: Role;
  action?: string;
  ttlMs?: number;
  maxAttempts?: number;
}): Promise<{ handle: string; otp: string; expiresAt: number }> {
  const handle = crypto.randomBytes(24).toString('hex');
  const otp = generateSecurityOtp();
  const expiresAt = Date.now() + (input.ttlMs ?? CHALLENGE_TTL_MS);
  const rec: ChallengeRecord = {
    id: sha256Hex(handle),
    kind: input.kind,
    userId: input.user.id,
    userEmail: (input.user.email || '').toLowerCase(),
    role: input.role,
    otpHash: sha256Hex(`${handle}:${otp}`),
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 5,
    expiresAt,
    action: input.action,
    createdAt: new Date().toISOString()
  };
  await getStore().set(COLLECTIONS.AUTH_CHALLENGES, rec.id, rec);
  return { handle, otp, expiresAt };
}

/** Re-issues a fresh OTP on an existing challenge (resets attempts, extends expiry). */
export async function refreshChallengeOtp(handle: string): Promise<{ otp: string; rec: ChallengeRecord } | null> {
  const id = sha256Hex(handle);
  const store = getStore();
  const rec = await store.get<ChallengeRecord>(COLLECTIONS.AUTH_CHALLENGES, id);
  if (!rec || rec.verified) return null;
  const otp = generateSecurityOtp();
  const patch = { otpHash: sha256Hex(`${handle}:${otp}`), attempts: 0, expiresAt: Date.now() + CHALLENGE_TTL_MS };
  await store.update(COLLECTIONS.AUTH_CHALLENGES, id, patch);
  return { otp, rec: { ...rec, ...patch } };
}

export type ChallengeResult =
  | { ok: true; rec: ChallengeRecord }
  | { ok: false; reason: 'invalid' | 'expired' | 'too-many-attempts' | 'wrong-code'; attemptsLeft?: number };

/** Verifies and (on success) consumes a challenge. Wrong codes burn an attempt. */
export async function verifyChallenge(handle: string, otp: string, expectedKind?: ChallengeKind): Promise<ChallengeResult> {
  if (!handle || typeof handle !== 'string' || handle.length > 200) return { ok: false, reason: 'invalid' };
  const id = sha256Hex(handle);
  const store = getStore();
  const rec = await store.get<ChallengeRecord>(COLLECTIONS.AUTH_CHALLENGES, id);
  if (!rec || (expectedKind && rec.kind !== expectedKind)) return { ok: false, reason: 'invalid' };
  if (Date.now() > rec.expiresAt) {
    await store.delete(COLLECTIONS.AUTH_CHALLENGES, id).catch(() => undefined);
    return { ok: false, reason: 'expired' };
  }
  if (rec.attempts >= rec.maxAttempts) {
    await store.delete(COLLECTIONS.AUTH_CHALLENGES, id).catch(() => undefined);
    return { ok: false, reason: 'too-many-attempts' };
  }

  const candidate = sha256Hex(`${handle}:${String(otp || '').replace(/\s+/g, '')}`);
  if (!timingSafeEqualStrings(candidate, rec.otpHash)) {
    const attempts = rec.attempts + 1;
    await store.update(COLLECTIONS.AUTH_CHALLENGES, id, { attempts });
    return { ok: false, reason: 'wrong-code', attemptsLeft: Math.max(0, rec.maxAttempts - attempts) };
  }

  await store.delete(COLLECTIONS.AUTH_CHALLENGES, id); // one-time use
  return { ok: true, rec };
}

/** After step-up OTP verification a short-lived grant authorises one sensitive action. */
export async function createStepUpGrant(auth: AuthContext, action: string, ttlMs = 5 * 60 * 1000): Promise<string> {
  const handle = crypto.randomBytes(24).toString('hex');
  const rec = {
    id: sha256Hex(`grant:${handle}`),
    kind: 'step-up' as const,
    userId: auth.userId,
    role: auth.role,
    action,
    expiresAt: Date.now() + ttlMs,
    createdAt: new Date().toISOString()
  };
  await getStore().set(COLLECTIONS.AUTH_CHALLENGES, rec.id, rec);
  return handle;
}

/** Consumes a step-up grant if it belongs to this user and action. */
export async function consumeStepUpGrant(auth: AuthContext, handle: string, action?: string): Promise<boolean> {
  if (!handle || typeof handle !== 'string') return false;
  const id = sha256Hex(`grant:${handle}`);
  const rec: any = await getStore().get(COLLECTIONS.AUTH_CHALLENGES, id);
  if (!rec || rec.userId !== auth.userId || rec.role !== auth.role) return false;
  if (Date.now() > rec.expiresAt) return false;
  if (action && rec.action && rec.action !== action) return false;
  await getStore().delete(COLLECTIONS.AUTH_CHALLENGES, id);
  return true;
}

// ---------------------------------------------------------------------------
// Rate limiting (in-process; per instance)
// ---------------------------------------------------------------------------
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private maxKeys = 50_000) {}

  /** Records a hit; returns whether it is within the limit. */
  hit(key: string, max: number, windowMs: number, now = Date.now()): { allowed: boolean; retryAfterSec: number; remaining: number } {
    const arr = (this.hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      this.hits.set(key, arr);
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000));
      return { allowed: false, retryAfterSec, remaining: 0 };
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > this.maxKeys) this.prune(windowMs, now);
    return { allowed: true, retryAfterSec: 0, remaining: max - arr.length };
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private prune(windowMs: number, now: number) {
    for (const [k, arr] of this.hits) {
      if (!arr.length || now - arr[arr.length - 1] > windowMs) this.hits.delete(k);
    }
  }
}

export const globalLimiter = new RateLimiter();

export function rateLimit(opts: { name: string; max: number; windowMs: number; key?: (req: ReqLike) => string }) {
  return (req: ReqLike, res: ResLike, next: NextLike) => {
    const k = `${opts.name}:${opts.key ? opts.key(req) : clientIp(req)}`;
    const r = globalLimiter.hit(k, opts.max, opts.windowMs);
    if (!r.allowed) {
      res.setHeader('Retry-After', String(r.retryAfterSec));
      return res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.', retryAfterSeconds: r.retryAfterSec });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Route gate
// ---------------------------------------------------------------------------
/** Routes callable without a user session. Everything else under /api needs a bearer token. */
const PUBLIC_ROUTES: Array<{ method: string; pattern: RegExp }> = [
  { method: 'GET', pattern: /^\/api\/health$/ },
  { method: 'GET', pattern: /^\/api\/email\/status$/ },
  { method: 'GET', pattern: /^\/api\/public\/vacancies$/ },
  { method: 'POST', pattern: /^\/api\/auth\/login$/ },
  { method: 'POST', pattern: /^\/api\/auth\/2fa\/(verify|resend)$/ },
  { method: 'POST', pattern: /^\/api\/auth\/(forgot|reset)-password$/ },
  { method: 'POST', pattern: /^\/api\/landlords\/register$/ },
  { method: 'POST', pattern: /^\/api\/tenants\/register$/ },
  // Provider-to-server callbacks: authenticated by their own secrets/signatures, NOT by user sessions.
  { method: 'POST', pattern: /^\/api\/(mpesa|payments)\/callback\/[A-Za-z0-9_\-]{8,200}$/ },
  { method: 'POST', pattern: /^\/api\/mpesa\/subscription-callback\/[A-Za-z0-9_\-]{8,200}$/ },
  { method: 'POST', pattern: /^\/api\/mpesa\/c2b\/(validation|confirmation)\/[A-Za-z0-9_\-]{8,200}$/ },
  { method: 'POST', pattern: /^\/api\/banks\/(equity|kcb|coop|pesalink)\/callback$/ },
  // Signed, expiring links embedded in emails (verified inside the handlers).
  { method: 'GET', pattern: /^\/api\/tenants\/[^/]+\/statement-pdf$/ },
  { method: 'GET', pattern: /^\/api\/payments\/[^/]+\/receipt-pdf$/ }
];

export function isPublicRoute(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return PUBLIC_ROUTES.some((r) => r.method === m && r.pattern.test(path));
}

/** Paths a user with a pending forced password change may still reach. */
const ALLOWED_WHILE_PASSWORD_CHANGE_PENDING = [/^\/api\/auth\/(me|logout|change-password)$/];

/**
 * Express-compatible middleware. Mount with app.use('/api', apiGate).
 * Non-public routes get a 401 without a valid session; `req.auth` is populated otherwise.
 */
export async function apiGate(req: ReqLike, res: ResLike, next: NextLike) {
  try {
    // OPTIONS (CORS preflight) is answered before this gate.
    const path = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
    const auth = await resolveAuth(req);
    if (auth) req.auth = auth;

    if (isPublicRoute(req.method, path)) return next();

    if (!auth) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      return res.status(401).json({ error: 'Authentication required. Please sign in again.', code: 'AUTH_REQUIRED' });
    }
    if (auth.mustChangePassword && !ALLOWED_WHILE_PASSWORD_CHANGE_PENDING.some((p) => p.test(path))) {
      return res.status(403).json({
        error: 'You must change your password before continuing.',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }
    return next();
  } catch (err) {
    // Never fail open.
    console.error('[auth] gate error:', err);
    return res.status(503).json({ error: 'Authentication service temporarily unavailable.' });
  }
}

// ---------------------------------------------------------------------------
// Authorisation helpers
// ---------------------------------------------------------------------------
export function requireRole(role: Role) {
  return (req: ReqLike, res: ResLike, next: NextLike) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required.' });
    if (req.auth.role !== role) {
      return res.status(403).json({ error: `This action is only available to ${role}s.` });
    }
    next();
  };
}

export const requireLandlord = requireRole('landlord');
export const requireTenant = requireRole('tenant');

/** The landlord id that "owns" the caller's view of the world. */
export function ownerLandlordId(auth: AuthContext): string | undefined {
  return auth.role === 'landlord' ? auth.userId : (auth.user as Tenant).landlordId;
}

/** Can the caller see/modify a record stamped with this landlordId? Landlords: own only. */
export function landlordOwns(auth: AuthContext, recordLandlordId?: string): boolean {
  return auth.role === 'landlord' && Boolean(recordLandlordId) && recordLandlordId === auth.userId;
}

// ---------------------------------------------------------------------------
// Signed, expiring download links (for PDF links embedded in emails)
// ---------------------------------------------------------------------------
function linkSecret(): string {
  const s = process.env.LINK_SIGNING_SECRET || process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('LINK_SIGNING_SECRET (>=16 chars) must be set in production.');
  }
  return 'dev-only-link-secret-not-for-production';
}

export function signLink(resource: string, ttlMs = 7 * 24 * 60 * 60 * 1000): { exp: number; sig: string } {
  const exp = Date.now() + ttlMs;
  const sig = crypto.createHmac('sha256', linkSecret()).update(`${resource}|${exp}`).digest('hex');
  return { exp, sig };
}

export function verifyLink(resource: string, exp: unknown, sig: unknown): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || Date.now() > e || typeof sig !== 'string') return false;
  const expected = crypto.createHmac('sha256', linkSecret()).update(`${resource}|${e}`).digest('hex');
  return timingSafeEqualStrings(expected, sig);
}
