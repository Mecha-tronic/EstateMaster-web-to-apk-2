/**
 * One-time startup migration from the legacy (open Firestore) data model.
 *
 *  1. Credentials: plaintext `password` fields are removed. Accounts protected by a demo/weak password are
 *     DEACTIVATED (hash removed) so the owner must use "Forgot password" - otherwise anyone who knows
 *     "password123" could take the account over. Strong legacy hashes are kept and upgraded at next login.
 *  2. emailLower is back-filled (indexed, case-insensitive lookups).
 *  3. Ownership: landlordId is back-filled on units / tenants / invoices / payments / quotes / maintenance by
 *     following property -> unit -> tenant. Records whose owner cannot be determined stay hidden from everyone.
 *  4. Invoices get a bank payment reference.
 */
import { getStore, DELETE_FIELD } from './store.js';
import { COLLECTIONS } from './db.js';
import { makePaymentReference } from './bankRoutes.js';
import { createPasswordCredential, credentialMatchesWeakPassword, isWeakPassword } from '../lib/security.js';
import type { Invoice, Landlord, MaintenanceRequest, Payment, Property, Quote, Tenant, Unit } from '../types.js';

const FLAG = 'migration_secure_v1';

export interface MigrationReport {
  skipped: boolean;
  credentialsDeactivated: number;
  credentialsUpgraded: number;
  emailLowerSet: number;
  ownershipBackfilled: number;
  orphans: number;
  referencesAdded: number;
}

export async function runStartupMigration(log: (m: string) => void = console.log): Promise<MigrationReport> {
  const store = getStore();
  const report: MigrationReport = { skipped: false, credentialsDeactivated: 0, credentialsUpgraded: 0, emailLowerSet: 0, ownershipBackfilled: 0, orphans: 0, referencesAdded: 0 };
  if (await store.get('_meta', FLAG)) { report.skipped = true; return report; }

  // ---------- 1 + 2: accounts
  for (const col of [COLLECTIONS.LANDLORDS, COLLECTIONS.TENANTS] as const) {
    const rows = await store.list<any>(col);
    for (const u of rows) {
      const patch: Record<string, any> = {};
      if (u.email && u.emailLower !== String(u.email).trim().toLowerCase()) { patch.emailLower = String(u.email).trim().toLowerCase(); report.emailLowerSet++; }

      const plaintext: string | undefined = typeof u.password === 'string' ? u.password : undefined;
      if (plaintext !== undefined) patch.password = DELETE_FIELD;

      const hasHash = Boolean(u.passwordHash && u.passwordSalt);
      if (hasHash) {
        if (u.passwordAlgo !== 'scrypt-v1' && (await credentialMatchesWeakPassword(u))) {
          Object.assign(patch, { passwordHash: DELETE_FIELD, passwordSalt: DELETE_FIELD, passwordAlgo: DELETE_FIELD, mustChangePassword: true });
          report.credentialsDeactivated++;
        }
      } else if (plaintext !== undefined) {
        if (plaintext.length >= 10 && !isWeakPassword(plaintext)) { Object.assign(patch, await createPasswordCredential(plaintext)); report.credentialsUpgraded++; }
        else { patch.mustChangePassword = true; report.credentialsDeactivated++; }
      }
      if (Object.keys(patch).length) await store.update(col, u.id, patch);
    }
  }

  // ---------- 3: ownership
  const [props, units, tenants, invoices, payments, quotes, maint] = await Promise.all([
    store.list<Property>(COLLECTIONS.PROPERTIES), store.list<Unit>(COLLECTIONS.UNITS), store.list<Tenant>(COLLECTIONS.TENANTS),
    store.list<Invoice>(COLLECTIONS.INVOICES), store.list<Payment>(COLLECTIONS.PAYMENTS), store.list<Quote>(COLLECTIONS.QUOTES),
    store.list<MaintenanceRequest>(COLLECTIONS.MAINTENANCE)
  ]);
  const landlordIds = new Set((await store.list<Landlord>(COLLECTIONS.LANDLORDS)).map((l) => l.id));
  const propOwner = new Map(props.filter((p) => p.landlordId && landlordIds.has(p.landlordId)).map((p) => [p.id, p.landlordId!]));
  const unitOwner = new Map<string, string>();
  for (const u of units) {
    const o = (u.landlordId && landlordIds.has(u.landlordId) ? u.landlordId : undefined) || (u.propertyId ? propOwner.get(u.propertyId) : undefined);
    if (o) unitOwner.set(u.id, o);
    if (o && u.landlordId !== o) { await store.update(COLLECTIONS.UNITS, u.id, { landlordId: o }); report.ownershipBackfilled++; }
    else if (!o) report.orphans++;
  }
  const tenantOwner = new Map<string, string>();
  for (const t of tenants) {
    const o = (t.landlordId && landlordIds.has(t.landlordId) ? t.landlordId : undefined) || (t.propertyId ? propOwner.get(t.propertyId) : undefined) || (t.unitId ? unitOwner.get(t.unitId) : undefined);
    if (o) tenantOwner.set(t.id, o);
    if (o && t.landlordId !== o) { await store.update(COLLECTIONS.TENANTS, t.id, { landlordId: o }); report.ownershipBackfilled++; }
    else if (!o) report.orphans++;
  }
  const stamp = async (col: string, rows: Array<{ id: string; landlordId?: string; tenantId?: string; unitId?: string }>) => {
    for (const r of rows) {
      const o = (r.landlordId && landlordIds.has(r.landlordId) ? r.landlordId : undefined) || (r.tenantId ? tenantOwner.get(r.tenantId) : undefined) || (r.unitId ? unitOwner.get(r.unitId) : undefined);
      if (o && r.landlordId !== o) { await store.update(col, r.id, { landlordId: o }); report.ownershipBackfilled++; }
      else if (!o) report.orphans++;
    }
  };
  await stamp(COLLECTIONS.INVOICES, invoices);
  await stamp(COLLECTIONS.PAYMENTS, payments);
  await stamp(COLLECTIONS.QUOTES, quotes);
  await stamp(COLLECTIONS.MAINTENANCE, maint);

  // ---------- 4: payment references
  for (const i of invoices) {
    if (!i.paymentReference) { await store.update(COLLECTIONS.INVOICES, i.id, { paymentReference: makePaymentReference(i.unitNumber, i.id) }); report.referencesAdded++; }
  }
  // Existing payments with a reference occupy that reference (anti double-redeem across the migration).
  await store.set('_meta', FLAG, { at: new Date().toISOString(), ...report });
  log(`[migration] ${JSON.stringify(report)}`);
  return report;
}
