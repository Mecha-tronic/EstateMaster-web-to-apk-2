/**
 * Server-only data access layer (same function names as the old src/lib/db.ts so
 * server.ts changes are minimal), backed by the Store abstraction (Firestore Admin
 * or in-memory).
 *
 * Differences from the legacy browser-side layer:
 *  - Errors are THROWN, never swallowed into `[]` / silent no-ops. Callers must not
 *    mistake an outage for "empty database" (that previously caused fallbacks to
 *    seeded demo accounts and silent data loss).
 *  - Never used from the browser.
 */
import { getStore, DELETE_FIELD } from './store.js';
import type {
  Landlord,
  Tenant,
  Property,
  Unit,
  Invoice,
  Quote,
  Payment,
  MaintenanceRequest,
  EmailLog,
  SecurityLog,
  UnaccountedPayment
} from '../types.js';

export const COLLECTIONS = {
  LANDLORDS: 'landlords',
  TENANTS: 'tenants',
  PROPERTIES: 'properties',
  UNITS: 'units',
  INVOICES: 'invoices',
  QUOTES: 'quotes',
  PAYMENTS: 'payments',
  MAINTENANCE: 'maintenance',
  EMAILS: 'emails',
  SECURITY_LOGS: 'security_logs',
  SESSIONS: 'sessions',
  AUTH_CHALLENGES: 'auth_challenges',
  UNACCOUNTED: 'unaccounted_payments',
  BANK_TRANSACTIONS: 'bank_transactions',
  REF_CLAIMS: 'reference_claims',
  BANK_VERIFICATIONS: 'bank_verifications',
  WEBHOOK_AUDIT: 'webhook_audit',
  LOGIN_ATTEMPTS: 'login_attempts',
  MPESA_CHECKOUTS: 'mpesa_checkouts'
} as const;

const s = () => getStore();

// --- LANDLORDS ---
export const getLandlordsFromDb = () => s().list<Landlord>(COLLECTIONS.LANDLORDS);
export const getLandlordByIdFromDb = (id: string) => s().get<Landlord>(COLLECTIONS.LANDLORDS, id);
export const saveLandlordToDb = (l: Landlord) => s().set(COLLECTIONS.LANDLORDS, l.id, l as any);
export const updateLandlordInDb = (id: string, data: Partial<Landlord> & Record<string, any>) =>
  s().update(COLLECTIONS.LANDLORDS, id, data);

// --- TENANTS ---
export const getTenantsFromDb = () => s().list<Tenant>(COLLECTIONS.TENANTS);
export const getTenantByIdFromDb = (id: string) => s().get<Tenant>(COLLECTIONS.TENANTS, id);
export const getTenantsByLandlordFromDb = (landlordId: string) => s().where<Tenant>(COLLECTIONS.TENANTS, 'landlordId', landlordId);
export const saveTenantToDb = (t: Tenant) => s().set(COLLECTIONS.TENANTS, t.id, t as any);
export const updateTenantInDb = (id: string, data: Partial<Tenant> & Record<string, any>) =>
  s().update(COLLECTIONS.TENANTS, id, data);
export const deleteTenantFromDb = (id: string) => s().delete(COLLECTIONS.TENANTS, id);

// --- PROPERTIES ---
export const getPropertiesFromDb = () => s().list<Property>(COLLECTIONS.PROPERTIES);
export const getPropertyByIdFromDb = (id: string) => s().get<Property>(COLLECTIONS.PROPERTIES, id);
export const savePropertyToDb = (p: Property) => s().set(COLLECTIONS.PROPERTIES, p.id, p as any);
export const updatePropertyInDb = (id: string, data: Partial<Property>) => s().update(COLLECTIONS.PROPERTIES, id, data);
export const deletePropertyFromDb = (id: string) => s().delete(COLLECTIONS.PROPERTIES, id);

// --- UNITS ---
export const getUnitsFromDb = () => s().list<Unit>(COLLECTIONS.UNITS);
export const getUnitByIdFromDb = (id: string) => s().get<Unit>(COLLECTIONS.UNITS, id);
export const saveUnitToDb = (u: Unit) => s().set(COLLECTIONS.UNITS, u.id, u as any);
export const updateUnitInDb = (id: string, data: Partial<Unit>) => s().update(COLLECTIONS.UNITS, id, data);
export const deleteUnitFromDb = (id: string) => s().delete(COLLECTIONS.UNITS, id);

// --- INVOICES ---
export const getInvoicesFromDb = () => s().list<Invoice>(COLLECTIONS.INVOICES);
export const getInvoiceByIdFromDb = (id: string) => s().get<Invoice>(COLLECTIONS.INVOICES, id);
export const saveInvoiceToDb = (i: Invoice) => s().set(COLLECTIONS.INVOICES, i.id, i as any);
export const updateInvoiceInDb = (id: string, data: Partial<Invoice>) => s().update(COLLECTIONS.INVOICES, id, data);

// --- QUOTES ---
export const getQuotesFromDb = () => s().list<Quote>(COLLECTIONS.QUOTES);
export const saveQuoteToDb = (q: Quote) => s().set(COLLECTIONS.QUOTES, q.id, q as any);

// --- PAYMENTS ---
export const getPaymentsFromDb = async (): Promise<Payment[]> => {
  const all = await s().list<Payment>(COLLECTIONS.PAYMENTS);
  return all.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
};
export const getPaymentByIdFromDb = (id: string) => s().get<Payment>(COLLECTIONS.PAYMENTS, id);
export const savePaymentToDb = (p: Payment) => s().set(COLLECTIONS.PAYMENTS, p.id, p as any);
export const updatePaymentInDb = (id: string, data: Partial<Payment>) => s().update(COLLECTIONS.PAYMENTS, id, data);

// --- MAINTENANCE ---
export const getMaintenanceFromDb = () => s().list<MaintenanceRequest>(COLLECTIONS.MAINTENANCE);
export const saveMaintenanceToDb = (m: MaintenanceRequest) => s().set(COLLECTIONS.MAINTENANCE, m.id, m as any);
export const updateMaintenanceInDb = (id: string, data: Partial<MaintenanceRequest>) =>
  s().update(COLLECTIONS.MAINTENANCE, id, data);

// --- EMAIL LOGS ---
export const getEmailsFromDb = () => s().list<EmailLog>(COLLECTIONS.EMAILS);
export const saveEmailToDb = (e: EmailLog) => s().set(COLLECTIONS.EMAILS, e.id, e as any);
export const updateEmailInDb = (id: string, data: Partial<EmailLog>) => s().update(COLLECTIONS.EMAILS, id, data);

// --- SECURITY LOGS ---
export const getSecurityLogsFromDb = async (): Promise<SecurityLog[]> => {
  const logs = await s().list<SecurityLog>(COLLECTIONS.SECURITY_LOGS);
  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};
export const saveSecurityLogToDb = (l: SecurityLog) => s().set(COLLECTIONS.SECURITY_LOGS, l.id, l as any);

// --- UNACCOUNTED PAYMENTS (landlord-assignment queue) ---
export const getUnaccountedFromDb = () => s().list<UnaccountedPayment>(COLLECTIONS.UNACCOUNTED);
export const getUnaccountedByLandlordFromDb = (landlordId: string) =>
  s().where<UnaccountedPayment>(COLLECTIONS.UNACCOUNTED, 'landlordId', landlordId);
export const getUnaccountedByIdFromDb = (id: string) => s().get<UnaccountedPayment>(COLLECTIONS.UNACCOUNTED, id);

export { DELETE_FIELD };

/**
 * DEMO DATA ONLY. Seeds the sample estate when ENABLE_DEMO_SEED=true (never in production).
 * Seeded accounts get a random one-time password that is printed once to the server log,
 * so no well-known credential can ever exist.
 */
export async function seedDbIfEmpty(
  initialLandlords: Landlord[],
  initialProperties: Property[],
  initialUnits: Unit[],
  initialTenants: Tenant[],
  initialInvoices: Invoice[],
  initialQuotes: Quote[],
  initialPayments: Payment[],
  initialMaintenance: MaintenanceRequest[],
  initialEmails: EmailLog[]
): Promise<void> {
  if (await s().get('_meta', 'demo_seed_done')) return;
  const existing = await getLandlordsFromDb();
  if (existing.length > 0) return; // never touch a database that already has real accounts

  for (const l of initialLandlords) await saveLandlordToDb(l);
  for (const p of initialProperties) await savePropertyToDb(p);
  for (const u of initialUnits) await saveUnitToDb(u);
  for (const t of initialTenants) await saveTenantToDb(t);
  for (const i of initialInvoices) await saveInvoiceToDb(i);
  for (const q of initialQuotes) await saveQuoteToDb(q);
  for (const p of initialPayments) await savePaymentToDb(p);
  for (const m of initialMaintenance) await saveMaintenanceToDb(m);
  for (const e of initialEmails) await saveEmailToDb(e);
  await s().set('_meta', 'demo_seed_done', { at: new Date().toISOString() });
}
