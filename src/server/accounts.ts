/**
 * Account lookup helpers shared by route modules.
 */
import { getStore } from './store.js';
import { COLLECTIONS } from './db.js';
import { normalizeEmail } from '../lib/security.js';
import type { Landlord, Tenant } from '../types.js';
import type { Role } from './auth.js';

export type Account = { user: Landlord | Tenant; role: Role };

export const colFor = (role: Role) => (role === 'landlord' ? COLLECTIONS.LANDLORDS : COLLECTIONS.TENANTS);

/** Finds an account by email in both collections (uses the indexed emailLower; falls back to a scan for un-migrated rows). */
export async function findAccountByEmail(email: string, preferRole?: Role): Promise<Account | null> {
  const e = normalizeEmail(email);
  if (!e) return null;
  const store = getStore();
  const lookup = async (role: Role): Promise<Account | null> => {
    const rows = await store.where<Landlord | Tenant>(colFor(role), 'emailLower', e);
    if (rows[0]) return { user: rows[0], role };
    return null;
  };
  const order: Role[] = preferRole === 'tenant' ? ['tenant', 'landlord'] : ['landlord', 'tenant'];
  for (const r of order) {
    const hit = await lookup(r);
    if (hit) return hit;
  }
  return null;
}

/** True if any account (either role) already uses this email. */
export async function emailInUse(email: string): Promise<boolean> {
  return Boolean(await findAccountByEmail(email));
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email || '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user}***@${domain}`;
  return `${user[0]}***${user[user.length - 1]}@${domain}`;
}

export function maskPhoneNumber(phone: string): string {
  if (!phone) return '';
  const clean = phone.replace(/\s+/g, '');
  if (clean.length <= 6) return clean;
  return `${clean.slice(0, 4)} *** *** ${clean.slice(-2)}`;
}

export async function loadAccount(role: Role, id: string): Promise<(Landlord | Tenant) | undefined> {
  return getStore().get<Landlord | Tenant>(colFor(role), id);
}
