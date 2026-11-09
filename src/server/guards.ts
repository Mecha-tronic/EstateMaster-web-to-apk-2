/**
 * Shared authorisation guards / validators used by several route modules.
 */
import { AuthContext, ReqLike, ResLike, NextLike } from './auth.js';
import type { Landlord } from '../types.js';

export function isSubscriptionActive(l?: Pick<Landlord, 'subscriptionStatus' | 'subscriptionExpiry'> | null): boolean {
  if (!l) return false;
  if (l.subscriptionStatus !== 'Active' || !l.subscriptionExpiry) return false;
  const exp = new Date(l.subscriptionExpiry);
  if (isNaN(exp.getTime())) return false;
  exp.setHours(23, 59, 59, 999);
  return exp.getTime() >= Date.now();
}

/** Blocks NEW business activity (not payments, not reads, not paying the subscription itself) when the licence has lapsed. */
export function requireActiveSubscription(req: ReqLike, res: ResLike, next: NextLike) {
  const auth = req.auth as AuthContext | undefined;
  if (!auth) return res.status(401).json({ error: 'Authentication required.' });
  if (auth.role !== 'landlord') return res.status(403).json({ error: 'Only landlords can do this.' });
  if (!isSubscriptionActive(auth.user as Landlord)) {
    return res.status(402).json({ error: 'Your EstateMaster subscription is not active. Renew it to continue.', code: 'SUBSCRIPTION_INACTIVE' });
  }
  next();
}

export const KE_PHONE = /^(?:\+?254|0)?[17]\d{8}$/;

export function normalizeKenyanPhone(raw: unknown): string {
  let c = String(raw ?? '').replace(/[^\d]/g, '');
  if (c.startsWith('2540')) c = '254' + c.slice(4);
  else if (c.startsWith('0') && c.length === 10) c = '254' + c.slice(1);
  else if (/^[17]\d{8}$/.test(c)) c = '254' + c;
  return c;
}

export function isValidKenyanPhone(raw: unknown): boolean {
  return /^254[17]\d{8}$/.test(normalizeKenyanPhone(raw));
}

/** "+254 712 345 678" display form. */
export function displayPhone(raw: unknown): string {
  const n = normalizeKenyanPhone(raw);
  return /^254\d{9}$/.test(n) ? `+${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}` : String(raw ?? '');
}

const SAFE_IMAGE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
/** Accepts small data-URL images or https URLs only (no javascript:, no SVG). */
export function validImageUrl(v: unknown, maxLen = 450_000): string | null {
  if (typeof v !== 'string' || !v) return null;
  if (v.length > maxLen) return null;
  if (SAFE_IMAGE.test(v)) return v;
  if (/^https:\/\/[^\s<>"']+$/i.test(v) && v.length <= 2048) return v;
  return null;
}
