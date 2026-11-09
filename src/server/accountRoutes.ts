/**
 * Landlord profile, properties, units and tenants.
 *
 * Authorisation model (enforced here, never trusted from the client):
 *   - Landlord: may read/write ONLY records stamped with their own landlordId.
 *   - Tenant:   may read ONLY their own tenant record, unit, property and landlord payment details.
 *   - Public:   may register, and read the minimal vacancy list.
 *   - Writes use allow-lists (no mass assignment) and server-derived ownership fields.
 */
import crypto from 'crypto';
import { getStore, DELETE_FIELD } from './store.js';
import { COLLECTIONS } from './db.js';
import {
  AuthContext, createChallenge, createSession, consumeStepUpGrant, rateLimit, revokeAllSessionsForUser, verifyChallenge,
  requireLandlord, clientIp
} from './auth.js';
import { App, body, h, num, pick, str } from './http.js';
import { findAccountByEmail, loadAccount, maskEmail, colFor } from './accounts.js';
import { dispatchSystemEmail, sendOtpEmail } from './mailer.js';
import { logSecurityEvent } from './audit.js';
import {
  createPasswordCredential, escapeHtml, generateSerial, isValidEmail, landlordPaymentView, newId, normalizeEmail,
  sanitizeUserForClient, validatePasswordStrength, verifyPasswordCredential
} from '../lib/security.js';
import { displayPhone, isValidKenyanPhone, requireActiveSubscription, validImageUrl, isSubscriptionActive } from './guards.js';
import { makePaymentReference, subscriptionReferenceFor } from './bankRoutes.js';
import { welcomeEmailHtml } from './templates.js';
import { remainingBalance } from '../lib/bankService.js';
import type { FinancialAuditEntry, Invoice, Landlord, Property, Quote, Tenant, Unit } from '../types.js';

const PLATFORM_SUBSCRIPTION_AMOUNT = Number(process.env.PLATFORM_SUBSCRIPTION_AMOUNT || 20000);
const FINANCIAL_FIELDS = ['bankName', 'accountName', 'accountNumber', 'branchName', 'swiftCode', 'mpesaTillNumber', 'mpesaPaybill', 'mpesaPhoneNumber'] as const;
const LANDLORD_PROFILE_FIELDS = ['name', 'companyName', 'phone', 'idNumber', ...FINANCIAL_FIELDS] as const;

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** Validates settlement fields; returns an error message or null. */
function validateFinancial(p: Record<string, any>): string | null {
  if (p.mpesaPaybill && !/^\d{5,7}$/.test(digits(p.mpesaPaybill))) return 'M-Pesa Paybill must be 5-7 digits.';
  if (p.mpesaTillNumber && !/^\d{5,7}$/.test(digits(p.mpesaTillNumber))) return 'M-Pesa Till must be 5-7 digits.';
  if (p.accountNumber && !/^\d{6,20}$/.test(digits(p.accountNumber))) return 'Bank account number must be 6-20 digits.';
  if (p.swiftCode && !/^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/.test(String(p.swiftCode).trim())) return 'SWIFT/BIC code looks invalid.';
  if (p.mpesaPhoneNumber && !isValidKenyanPhone(p.mpesaPhoneNumber)) return 'M-Pesa phone number looks invalid.';
  return null;
}

/** Two landlords must never share a settlement identifier (it would let one capture the other's deposits). */
async function settlementConflict(fields: Record<string, any>, exceptLandlordId?: string): Promise<string | null> {
  const all = await getStore().list<Landlord>(COLLECTIONS.LANDLORDS);
  for (const other of all) {
    if (other.id === exceptLandlordId) continue;
    if (fields.mpesaPaybill && digits(other.mpesaPaybill) && digits(other.mpesaPaybill) === digits(fields.mpesaPaybill))
      return 'That M-Pesa Paybill is already registered to another account. Contact support if this is yours.';
    if (fields.mpesaTillNumber && digits(other.mpesaTillNumber) && digits(other.mpesaTillNumber) === digits(fields.mpesaTillNumber))
      return 'That M-Pesa Till is already registered to another account. Contact support if this is yours.';
    if (fields.accountNumber && digits(other.accountNumber) && digits(other.accountNumber) === digits(fields.accountNumber))
      return 'That bank account is already registered to another account. Contact support if this is yours.';
  }
  return null;
}

function cleanFinancial(src: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of FINANCIAL_FIELDS) {
    if (src[k] === undefined) continue;
    out[k] = k === 'mpesaPaybill' || k === 'mpesaTillNumber' || k === 'accountNumber' ? digits(src[k]) : str(src[k], 120);
    if (k === 'swiftCode') out[k] = out[k].toUpperCase();
  }
  return out;
}

export function registerAccountRoutes(app: App) {
  const store = () => getStore();

  // =========================================================== landlords
  app.get('/api/landlords', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    if (auth.role === 'landlord') return res.json([sanitizeUserForClient(auth.user as Landlord)]);
    const lid = (auth.user as Tenant).landlordId;
    const l = lid ? await store().get<Landlord>(COLLECTIONS.LANDLORDS, lid) : undefined;
    return res.json(l ? [landlordPaymentView(l)] : []);
  }));

  app.post(
    '/api/landlords/register',
    rateLimit({ name: 'register-landlord', max: 6, windowMs: 60 * 60_000 }),
    h(async (req, res) => {
      const b = body(req);
      const name = str(b.name, 100), companyName = str(b.companyName, 120), phone = str(b.phone, 30);
      const email = normalizeEmail(b.email);
      if (!name || !email || !phone || !companyName) return res.status(400).json({ error: 'Full name, company name, email and phone are required.' });
      if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      if (!isValidKenyanPhone(phone)) return res.status(400).json({ error: 'Enter a valid Kenyan phone number (e.g. 0712 345 678).' });
      const weak = validatePasswordStrength(b.password, { email, name });
      if (weak) return res.status(400).json({ error: weak });
      const fin = cleanFinancial(b);
      const finErr = validateFinancial(fin);
      if (finErr) return res.status(400).json({ error: finErr });

      // Same message whether or not the email exists would hide a real UX need; registration is a public form,
      // so we return a clear conflict but rate-limit it (above) to blunt enumeration.
      if (await findAccountByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      const conflict = await settlementConflict(fin);
      if (conflict) return res.status(409).json({ error: conflict });

      const cred = await createPasswordCredential(b.password);
      const id = newId('landlord');
      const landlord: Landlord = {
        id, name, companyName, email, emailLower: email, phone: displayPhone(phone),
        ...cred,
        twoFactorEnabled: false, failedLoginAttempts: 0, securityScore: 60,
        idNumber: str(b.idNumber, 40) || undefined,
        // NOT active until a verified payment arrives (M-Pesa callback / bank notification).
        subscriptionStatus: 'Pending Payment', subscriptionPaid: false,
        subscriptionPlan: `EstateMaster Annual License (KSH ${PLATFORM_SUBSCRIPTION_AMOUNT.toLocaleString()}/yr)`,
        registeredAt: new Date().toISOString(),
        ...fin,
        mpesaPhoneNumber: fin.mpesaPhoneNumber || displayPhone(phone),
        accountName: fin.accountName || (fin.accountNumber ? companyName : undefined)
      } as Landlord;
      await store().set(COLLECTIONS.LANDLORDS, id, landlord as any);
      await logSecurityEvent('ACCOUNT_REGISTERED', 'LOW', `Landlord registered (${companyName})`, req, email, id, 'landlord');

      const { token } = await createSession(req, landlord, 'landlord');
      dispatchSystemEmail({
        recipientEmail: email, recipientName: name, subject: 'Welcome to EstateMaster - complete your subscription',
        emailType: 'Welcome & Lease', prefix: 'WLC', landlordId: id,
        bodyHtml: `<p>Welcome, <strong>${escapeHtml(name)}</strong> (${escapeHtml(companyName)}).</p>
          <p>Your account is created. To activate it, pay the annual licence of <strong>KSh ${PLATFORM_SUBSCRIPTION_AMOUNT.toLocaleString()}</strong> by M-Pesa STK push or bank transfer using the reference
          <strong style="font-family:monospace">${escapeHtml(subscriptionReferenceFor({ id }))}</strong>. Activation is automatic once the payment is confirmed.</p>`
      }).catch(() => undefined);

      return res.status(201).json({
        landlord: sanitizeUserForClient(landlord),
        sessionToken: token,
        subscription: { amount: PLATFORM_SUBSCRIPTION_AMOUNT, reference: subscriptionReferenceFor({ id }), status: 'Pending Payment' },
        receiptCode: '',
        message: 'Account created. Complete the subscription payment to activate it.'
      });
    })
  );

  app.post('/api/landlords/:id/request-financial-otp', requireLandlord as any, rateLimit({ name: 'fin-otp', max: 5, windowMs: 10 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }), h(async (req, res) => {
    const auth = req.auth as AuthContext;
    if ((req as any).params.id !== auth.userId) return res.status(403).json({ error: 'You can only manage your own account.' });
    const ch = await createChallenge({ kind: 'financial', user: auth.user, role: 'landlord', action: 'financial-update' });
    const ok = await sendOtpEmail({ to: auth.user.email, name: (auth.user as Landlord).name, otp: ch.otp, purpose: 'changing payout details', landlordId: auth.userId });
    if (!ok && process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'We could not send your code right now. Please try again shortly.' });
    return res.json({ challengeId: ch.handle, emailMasked: maskEmail(auth.user.email), phoneMasked: '', message: `A code was sent to ${maskEmail(auth.user.email)}.` });
  }));

  app.get('/api/landlords/:id/financial-audit-log', requireLandlord as any, h(async (req, res) => {
    const auth = req.auth as AuthContext;
    if ((req as any).params.id !== auth.userId) return res.status(403).json({ error: 'You can only view your own audit trail.' });
    const l = auth.user as Landlord;
    return res.json({ auditTrail: l.financialAuditTrail || [], lastFinancialUpdateAt: l.lastFinancialUpdateAt, lastFinancialUpdatedBy: l.lastFinancialUpdatedBy });
  }));

  app.patch('/api/landlords/:id', requireLandlord as any, h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const id = (req as any).params.id;
    if (id !== auth.userId) {
      await logSecurityEvent('ACCESS_DENIED', 'HIGH', `Attempted to modify landlord ${id}`, req, auth.user.email, auth.userId, auth.role);
      return res.status(403).json({ error: 'You can only modify your own account.' });
    }
    const landlord = auth.user as Landlord;
    const b = body(req);
    const patch = pick<Landlord>(b, LANDLORD_PROFILE_FIELDS as any) as Record<string, any>;
    if (patch.name !== undefined) patch.name = str(patch.name, 100);
    if (patch.companyName !== undefined) patch.companyName = str(patch.companyName, 120);
    if (patch.idNumber !== undefined) patch.idNumber = str(patch.idNumber, 40);
    if (patch.phone !== undefined) {
      if (!isValidKenyanPhone(patch.phone)) return res.status(400).json({ error: 'Enter a valid Kenyan phone number.' });
      patch.phone = displayPhone(patch.phone);
    }
    Object.assign(patch, cleanFinancial(patch));
    const finErr = validateFinancial(patch);
    if (finErr) return res.status(400).json({ error: finErr });

    const changedFin = FINANCIAL_FIELDS.filter((f) => patch[f] !== undefined && String(patch[f] ?? '').trim() !== String((landlord as any)[f] ?? '').trim());

    let verifiedMethod = '';
    if (changedFin.length) {
      // Re-authentication. Landlords with 2FA MUST use the emailed code; others may use password OR code.
      const pw = typeof b.confirmationPassword === 'string' ? b.confirmationPassword : '';
      const otp = str(b.otp, 12), challengeId = str(b.challengeId, 200);
      if (otp && challengeId) {
        const r = await verifyChallenge(challengeId, otp, 'financial');
        if (!r.ok || r.rec.userId !== auth.userId) {
          await logSecurityEvent('UNAUTHORIZED_PAYMENT_DETAILS_CHANGE_ATTEMPT', 'HIGH', `Bad/expired code while changing payout details (${changedFin.join(', ')})`, req, landlord.email, landlord.id, 'landlord');
          return res.status(403).json({ error: 'Security verification failed: invalid or expired code. Nothing was changed.', requiresVerification: true, invalidOtp: true });
        }
        verifiedMethod = 'Emailed one-time code';
      } else if (pw && !landlord.twoFactorEnabled) {
        const v = await verifyPasswordCredential(pw, landlord);
        if (!v.valid) {
          await logSecurityEvent('UNAUTHORIZED_PAYMENT_DETAILS_CHANGE_ATTEMPT', 'HIGH', `Wrong password while changing payout details (${changedFin.join(', ')})`, req, landlord.email, landlord.id, 'landlord');
          return res.status(403).json({ error: 'Security verification failed: incorrect password. Nothing was changed.', requiresVerification: true, incorrectPassword: true });
        }
        verifiedMethod = 'Password re-authentication';
      } else {
        return res.status(403).json({
          error: landlord.twoFactorEnabled
            ? 'Changing payout details requires the one-time code sent to your email.'
            : 'Changing payout details requires your password or an emailed one-time code.',
          requiresVerification: true, changedFields: changedFin, landlordEmailMasked: maskEmail(landlord.email)
        });
      }
      const conflict = await settlementConflict(patch, landlord.id);
      if (conflict) return res.status(409).json({ error: conflict });
    }

    const update: Record<string, any> = { ...patch };
    if (patch.name !== undefined || patch.companyName !== undefined) update.securityScore = undefined;
    if (changedFin.length) {
      const entry: FinancialAuditEntry = {
        id: newId('fin'), timestamp: new Date().toISOString(), verifiedMethod, action: 'Settlement details updated',
        changedFields: [...changedFin], ipAddress: clientIp(req), summary: `Updated: ${changedFin.join(', ')}`
      };
      update.financialAuditTrail = [entry, ...(landlord.financialAuditTrail || [])].slice(0, 100);
      update.lastFinancialUpdateAt = entry.timestamp;
      update.lastFinancialUpdatedBy = landlord.email;
      await logSecurityEvent('BANK_DETAILS_MODIFIED', 'HIGH', `Payout details changed (${changedFin.join(', ')}) via ${verifiedMethod}`, req, landlord.email, landlord.id, 'landlord');
      const maskAcc = (a?: string) => (a && a.length > 4 ? `${'*'.repeat(a.length - 4)}${a.slice(-4)}` : a || 'N/A');
      dispatchSystemEmail({
        recipientEmail: landlord.email, recipientName: landlord.name, landlordId: landlord.id,
        subject: 'Security alert: payout details changed', emailType: 'Security Alert', prefix: 'SEC', sensitive: true,
        bodyHtml: `<p>Hello <strong>${escapeHtml(landlord.name)}</strong>,</p>
          <p>Your rent-collection settlement details were updated (${escapeHtml(changedFin.join(', '))}) using <strong>${escapeHtml(verifiedMethod)}</strong>.</p>
          <ul><li>Bank: ${escapeHtml(update.bankName ?? landlord.bankName ?? 'N/A')}</li><li>Account: ${escapeHtml(maskAcc(update.accountNumber ?? landlord.accountNumber))}</li>
          <li>Paybill: ${escapeHtml(update.mpesaPaybill ?? landlord.mpesaPaybill ?? 'None')}</li><li>Till: ${escapeHtml(update.mpesaTillNumber ?? landlord.mpesaTillNumber ?? 'None')}</li>
          <li>IP: ${escapeHtml(clientIp(req))}</li></ul>
          <p style="color:#b91c1c"><strong>If this was not you, change your password and contact support immediately.</strong></p>`
      }).catch(() => undefined);
    }
    for (const k of Object.keys(update)) if (update[k] === undefined) delete update[k];
    if (Object.keys(update).length) await store().update(COLLECTIONS.LANDLORDS, id, update);
    const fresh = (await store().get<Landlord>(COLLECTIONS.LANDLORDS, id))!;
    return res.json(sanitizeUserForClient(fresh));
  }));

  // ======================================================= public vacancies
  app.get('/api/public/vacancies', rateLimit({ name: 'vacancies', max: 60, windowMs: 60_000 }), h(async (_req, res) => {
    const units = await store().list<Unit>(COLLECTIONS.UNITS);
    const props = await store().list<Property>(COLLECTIONS.PROPERTIES);
    const landlords = await store().list<Landlord>(COLLECTIONS.LANDLORDS);
    const active = new Set(landlords.filter(isSubscriptionActive).map((l) => l.id));
    const pm = new Map(props.map((p) => [p.id, p]));
    const vacant = units.filter((u) => (u.status === 'Available' || u.status === 'Vacant') && u.landlordId && active.has(u.landlordId));
    return res.json({
      units: vacant.map((u) => ({
        id: u.id, propertyId: u.propertyId, propertyName: u.propertyName, unitNumber: u.unitNumber, bedrooms: u.bedrooms,
        bathrooms: u.bathrooms, sqft: u.sqft, monthlyRent: u.monthlyRent, depositAmount: u.depositAmount, status: u.status, features: u.features, type: u.type
      })),
      properties: [...new Set(vacant.map((u) => u.propertyId))].map((pid) => {
        const p = pm.get(pid || '');
        return p ? { id: p.id, name: p.name, address: p.address, city: p.city, type: p.type, imageUrl: p.imageUrl, description: p.description, amenities: p.amenities } : null;
      }).filter(Boolean)
    });
  }));

  // ============================================================ properties
  app.get('/api/properties', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    if (auth.role === 'landlord') return res.json(await store().where<Property>(COLLECTIONS.PROPERTIES, 'landlordId', auth.userId));
    const pid = (auth.user as Tenant).propertyId;
    const p = pid ? await store().get<Property>(COLLECTIONS.PROPERTIES, pid) : undefined;
    return res.json(p ? [p] : []);
  }));

  const PROPERTY_FIELDS = ['name', 'address', 'location', 'city', 'type', 'totalUnits', 'imageUrl', 'description', 'amenities'] as const;
  function cleanProperty(src: Record<string, any>): Partial<Property> | { error: string } {
    const p = pick<Property>(src, PROPERTY_FIELDS as any) as Record<string, any>;
    for (const k of ['name', 'address', 'location', 'city', 'type', 'description'] as const) if (p[k] !== undefined) p[k] = str(p[k], k === 'description' ? 1000 : 160);
    if (p.totalUnits !== undefined) p.totalUnits = Math.max(0, Math.min(5000, Math.floor(num(p.totalUnits))));
    if (p.amenities !== undefined) p.amenities = Array.isArray(p.amenities) ? p.amenities.slice(0, 30).map((a: any) => str(a, 60)).filter(Boolean) : [];
    if (p.imageUrl !== undefined) {
      const ok = validImageUrl(p.imageUrl, 600_000);
      if (!ok) return { error: 'Property image must be an https link or a small PNG/JPEG/WebP upload.' };
      p.imageUrl = ok;
    }
    return p;
  }

  app.post('/api/properties', requireActiveSubscription as any, h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const c = cleanProperty(body(req)) as any;
    if (c.error) return res.status(400).json({ error: c.error });
    if (!c.name) return res.status(400).json({ error: 'Property name is required.' });
    const prop: Property = { id: newId('prop'), ...c, landlordId: auth.userId };
    await store().set(COLLECTIONS.PROPERTIES, prop.id, prop as any);
    return res.status(201).json(prop);
  }));

  app.patch('/api/properties/:id', requireLandlord as any, h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const prop = await store().get<Property>(COLLECTIONS.PROPERTIES, (req as any).params.id);
    if (!prop || prop.landlordId !== auth.userId) return res.status(404).json({ error: 'Property not found.' });
    const c = cleanProperty(body(req)) as any;
    if (c.error) return res.status(400).json({ error: c.error });
    if (Object.keys(c).length) await store().update(COLLECTIONS.PROPERTIES, prop.id, c);
    if (c.name && c.name !== prop.name) {
      for (const u of await store().where<Unit>(COLLECTIONS.UNITS, 'propertyId', prop.id)) await store().update(COLLECTIONS.UNITS, u.id, { propertyName: c.name });
      for (const t of await store().where<Tenant>(COLLECTIONS.TENANTS, 'propertyId', prop.id)) await store().update(COLLECTIONS.TENANTS, t.id, { propertyName: c.name });
    }
    return res.json({ ...prop, ...c });
  }));

  app.delete('/api/properties/:id', requireLandlord as any, h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const prop = await store().get<Property>(COLLECTIONS.PROPERTIES, (req as any).params.id);
    if (!prop || prop.landlordId !== auth.userId) return res.status(404).json({ error: 'Property not found.' });
    const tenants = (await store().where<Tenant>(COLLECTIONS.TENANTS, 'propertyId', prop.id)).filter((t) => t.landlordId === auth.userId);
    const invoices = await store().where<Invoice>(COLLECTIONS.INVOICES, 'landlordId', auth.userId);
    const owing = invoices.filter((i) => i.propertyId === prop.id || tenants.some((t) => t.id === i.tenantId)).filter((i) => remainingBalance(i) > 0);
    if (owing.length) {
      return res.status(409).json({ error: `This property still has ${owing.length} unpaid invoice(s). Settle or reverse them before deleting it.` });
    }
    const units = (await store().where<Unit>(COLLECTIONS.UNITS, 'propertyId', prop.id)).filter((u) => u.landlordId === auth.userId);
    for (const t of tenants) { await revokeAllSessionsForUser(t.id); await store().delete(COLLECTIONS.TENANTS, t.id); }
    for (const u of units) await store().delete(COLLECTIONS.UNITS, u.id);
    await store().delete(COLLECTIONS.PROPERTIES, prop.id);
    await logSecurityEvent('SENSITIVE_DATA_MODIFIED', 'MEDIUM', `Property ${prop.name} deleted (${units.length} units, ${tenants.length} tenants)`, req, auth.user.email, auth.userId, 'landlord');
    return res.json({ message: 'Property, units and tenant accounts removed. Financial records were kept.', id: prop.id, deletedUnitsCount: units.length, deletedTenantsCount: tenants.length });
  }));

  // ================================================================ units
  app.get('/api/units', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    if (auth.role === 'landlord') return res.json(await store().where<Unit>(COLLECTIONS.UNITS, 'landlordId', auth.userId));
    const uid = (auth.user as Tenant).unitId;
    const u = uid ? await store().get<Unit>(COLLECTIONS.UNITS, uid) : undefined;
    return res.json(u ? [{ ...u, currentTenantEmail: undefined }] : []);
  }));

  app.post('/api/units', requireActiveSubscription as any, h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const b = body(req);
    const prop = await store().get<Property>(COLLECTIONS.PROPERTIES, str(b.propertyId, 80));
    if (!prop || prop.landlordId !== auth.userId) return res.status(404).json({ error: 'Property not found.' });
    const unitNumber = str(b.unitNumber, 30);
    if (!unitNumber) return res.status(400).json({ error: 'Unit number is required.' });
    const rent = num(b.monthlyRent, NaN);
    if (!(rent > 0) || rent > 10_000_000) return res.status(400).json({ error: 'Enter a valid monthly rent.' });
    const dup = (await store().where<Unit>(COLLECTIONS.UNITS, 'propertyId', prop.id)).find((u) => u.unitNumber.toLowerCase() === unitNumber.toLowerCase());
    if (dup) return res.status(409).json({ error: `Unit ${unitNumber} already exists in ${prop.name}.` });
    const status = (['Available', 'Occupied', 'Under Maintenance', 'Vacant'] as const).includes(b.status) ? b.status : 'Available';
    const unit: Unit = {
      id: newId('unit'), landlordId: auth.userId, propertyId: prop.id, propertyName: prop.name, unitNumber,
      bedrooms: Math.max(0, Math.min(50, num(b.bedrooms))), bathrooms: Math.max(0, Math.min(50, num(b.bathrooms))),
      sqft: Math.max(0, Math.min(1_000_000, num(b.sqft))), monthlyRent: rent,
      depositAmount: Math.max(0, num(b.depositAmount, rent)), status, type: str(b.type, 40) || undefined,
      features: Array.isArray(b.features) ? b.features.slice(0, 30).map((f: any) => str(f, 60)).filter(Boolean) : []
    };
    await store().set(COLLECTIONS.UNITS, unit.id, unit as any);
    return res.status(201).json(unit);
  }));

  // ============================================================== tenants
  app.get('/api/tenants', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    if (auth.role === 'landlord') return res.json((await store().where<Tenant>(COLLECTIONS.TENANTS, 'landlordId', auth.userId)).map((t) => sanitizeUserForClient(t)));
    return res.json([sanitizeUserForClient(auth.user as Tenant)]);
  }));

  const TENANT_LANDLORD_FIELDS = ['fullName', 'phone', 'occupation', 'income', 'emergencyContactName', 'emergencyContactPhone', 'moveInDate', 'leaseStartDate', 'leaseEndDate', 'monthlyRent', 'depositPaid', 'status', 'idNumber', 'profilePictureUrl'] as const;
  const TENANT_SELF_FIELDS = ['phone', 'occupation', 'emergencyContactName', 'emergencyContactPhone', 'profilePictureUrl'] as const;

  app.patch('/api/tenants/:id', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const id = (req as any).params.id;
    const tenant = await store().get<Tenant>(COLLECTIONS.TENANTS, id);
    const allowed = auth.role === 'landlord' ? tenant && tenant.landlordId === auth.userId : tenant && tenant.id === auth.userId;
    if (!tenant || !allowed) return res.status(404).json({ error: 'Tenant not found.' });
    const patch = pick<Tenant>(body(req), (auth.role === 'landlord' ? TENANT_LANDLORD_FIELDS : TENANT_SELF_FIELDS) as any) as Record<string, any>;
    for (const k of ['fullName', 'occupation', 'emergencyContactName', 'idNumber'] as const) if (patch[k] !== undefined) patch[k] = str(patch[k], 120);
    if (patch.phone !== undefined) { if (!isValidKenyanPhone(patch.phone)) return res.status(400).json({ error: 'Enter a valid Kenyan phone number.' }); patch.phone = displayPhone(patch.phone); }
    if (patch.emergencyContactPhone !== undefined) patch.emergencyContactPhone = str(patch.emergencyContactPhone, 30);
    if (patch.income !== undefined) patch.income = Math.max(0, num(patch.income));
    if (patch.monthlyRent !== undefined) { patch.monthlyRent = num(patch.monthlyRent, NaN); if (!(patch.monthlyRent > 0)) return res.status(400).json({ error: 'Enter a valid rent amount.' }); }
    if (patch.status !== undefined && !['Active', 'Pending Approval', 'Past'].includes(patch.status)) return res.status(400).json({ error: 'Invalid status.' });
    if (patch.depositPaid !== undefined) patch.depositPaid = Boolean(patch.depositPaid);
    for (const k of ['moveInDate', 'leaseStartDate', 'leaseEndDate'] as const) if (patch[k] !== undefined && isNaN(Date.parse(patch[k]))) return res.status(400).json({ error: 'Invalid date.' });
    if (patch.profilePictureUrl !== undefined) {
      const ok = validImageUrl(patch.profilePictureUrl);
      if (!ok) return res.status(400).json({ error: 'Profile picture must be a small PNG/JPEG/WebP image or an https link.' });
      patch.profilePictureUrl = ok;
    }
    if (Object.keys(patch).length) await store().update(COLLECTIONS.TENANTS, id, patch);
    const fresh = (await store().get<Tenant>(COLLECTIONS.TENANTS, id))!;
    return res.json(sanitizeUserForClient(fresh));
  }));

  app.delete('/api/tenants/:id', requireLandlord as any, h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const tenant = await store().get<Tenant>(COLLECTIONS.TENANTS, (req as any).params.id);
    if (!tenant || tenant.landlordId !== auth.userId) return res.status(404).json({ error: 'Tenant not found.' });
    await revokeAllSessionsForUser(tenant.id);
    await store().delete(COLLECTIONS.TENANTS, tenant.id);
    let vacated = 0;
    const unit = tenant.unitId ? await store().get<Unit>(COLLECTIONS.UNITS, tenant.unitId) : undefined;
    if (unit && unit.landlordId === auth.userId) {
      await store().update(COLLECTIONS.UNITS, unit.id, { status: 'Vacant', currentTenantName: '', currentTenantEmail: '' });
      vacated = 1;
      if (unit.propertyId) {
        const occupied = (await store().where<Unit>(COLLECTIONS.UNITS, 'propertyId', unit.propertyId)).filter((u) => u.status === 'Occupied').length;
        await store().update(COLLECTIONS.PROPERTIES, unit.propertyId, { occupiedUnits: occupied }).catch(() => undefined);
      }
    }
    await logSecurityEvent('SENSITIVE_DATA_MODIFIED', 'MEDIUM', `Tenant ${tenant.fullName} moved out`, req, auth.user.email, auth.userId, 'landlord');
    return res.json({ message: 'Tenant moved out and unit marked Vacant.', tenant: sanitizeUserForClient(tenant), vacatedUnitsCount: vacated });
  }));

  // ---------------------------------------------------- tenant registration
  app.post(
    '/api/tenants/register',
    rateLimit({ name: 'register-tenant', max: 8, windowMs: 60 * 60_000 }),
    h(async (req, res) => {
      const b = body(req);
      const fullName = str(b.fullName, 100);
      const email = normalizeEmail(b.email);
      const phone = str(b.phone, 30);
      if (!fullName || !email || !b.unitId) return res.status(400).json({ error: 'Full name, email and the selected unit are required.' });
      if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      if (phone && !isValidKenyanPhone(phone)) return res.status(400).json({ error: 'Enter a valid Kenyan phone number.' });
      const weak = validatePasswordStrength(b.password, { email, name: fullName });
      if (weak) return res.status(400).json({ error: weak });
      if (await findAccountByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });

      const unit = await store().get<Unit>(COLLECTIONS.UNITS, str(b.unitId, 80));
      if (!unit || !unit.landlordId) return res.status(404).json({ error: 'The selected apartment is no longer available.' });
      if (unit.status !== 'Available' && unit.status !== 'Vacant') return res.status(409).json({ error: 'This unit is already occupied or reserved.' });
      const landlord = await store().get<Landlord>(COLLECTIONS.LANDLORDS, unit.landlordId);
      if (!landlord || !isSubscriptionActive(landlord)) return res.status(409).json({ error: 'This property is not currently accepting registrations.' });
      const prop = unit.propertyId ? await store().get<Property>(COLLECTIONS.PROPERTIES, unit.propertyId) : undefined;

      // Landlord-created tenants are Active at once; public applicants await the landlord's confirmation.
      const byOwner = req.auth?.role === 'landlord' && req.auth.userId === unit.landlordId;
      const leaseTermMonths = Math.max(1, Math.min(120, Math.floor(num(b.leaseTermMonths, 12))));
      const startDate = b.moveInDate && !isNaN(Date.parse(b.moveInDate)) ? new Date(b.moveInDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      const endObj = new Date(startDate); endObj.setMonth(endObj.getMonth() + leaseTermMonths);
      const cred = await createPasswordCredential(b.password);
      const picture = b.profilePictureUrl ? validImageUrl(b.profilePictureUrl) : null;

      const tenant: Tenant = {
        id: newId('tenant'), landlordId: unit.landlordId, propertyId: unit.propertyId, unitId: unit.id,
        propertyName: unit.propertyName || prop?.name || 'Apartment', unitNumber: unit.unitNumber,
        fullName, email, emailLower: email, phone: phone ? displayPhone(phone) : '', ...cred,
        twoFactorEnabled: false, failedLoginAttempts: 0, securityScore: 60,
        idNumber: str(b.idNumber, 40) || undefined, occupation: str(b.occupation, 80) || undefined,
        income: Math.max(0, num(b.income)), emergencyContactName: str(b.emergencyContactName, 100) || undefined,
        emergencyContactPhone: str(b.emergencyContactPhone, 30) || undefined,
        moveInDate: startDate, leaseStartDate: startDate, leaseEndDate: endObj.toISOString().split('T')[0],
        monthlyRent: unit.monthlyRent, depositPaid: false, status: byOwner ? 'Active' : 'Pending Approval',
        profilePictureUrl: picture || undefined, registeredAt: new Date().toISOString()
      };

      // Reserve the unit atomically: two applicants can never both take it.
      const reserved = await store().transact<boolean>(async (tx) => {
        const u = await tx.get<Unit>(COLLECTIONS.UNITS, unit.id);
        if (!u || (u.status !== 'Available' && u.status !== 'Vacant')) return false;
        tx.update(COLLECTIONS.UNITS, unit.id, { status: 'Occupied', currentTenantName: fullName, currentTenantEmail: email });
        tx.create(COLLECTIONS.TENANTS, tenant.id, tenant as any);
        return true;
      });
      if (!reserved) return res.status(409).json({ error: 'Someone else just reserved this unit. Please choose another.' });

      if (unit.propertyId) {
        const occupied = (await store().where<Unit>(COLLECTIONS.UNITS, 'propertyId', unit.propertyId)).filter((u) => u.status === 'Occupied').length;
        await store().update(COLLECTIONS.PROPERTIES, unit.propertyId, { occupiedUnits: occupied }).catch(() => undefined);
      }

      const now = new Date();
      const validUntil = new Date(now.getTime() + 14 * 86400_000).toISOString().split('T')[0];
      const quoteSerial = generateSerial('QTE');
      const deposit = unit.depositAmount ?? unit.monthlyRent;
      const quote: Quote = {
        id: newId('q'), landlordId: unit.landlordId, tenantId: tenant.id, serialNumber: quoteSerial,
        quoteNumber: `QTE-${quoteSerial.slice(-6)}`, tenantName: fullName, tenantEmail: email, tenantPhone: tenant.phone || 'N/A',
        unitId: unit.id, unitNumber: unit.unitNumber, propertyName: tenant.propertyName,
        monthlyRentQuote: unit.monthlyRent, depositQuote: deposit, leaseTermMonths, validUntil,
        estimatedUtilities: 0, specialDiscount: 0, totalMoveInCost: unit.monthlyRent + deposit,
        notes: `Automated quote for Unit ${unit.unitNumber}. Serial: ${quoteSerial}`, status: 'Sent',
        externalDeliveryStatus: 'pending', createdAt: now.toISOString(), emailedToTenant: true, emailSentAt: now.toISOString()
      };
      await store().set(COLLECTIONS.QUOTES, quote.id, quote as any);

      const invSerial = generateSerial('INV');
      const invId = newId('inv');
      const waterFee = 0, trashFee = 0;
      const invoice: Invoice = {
        id: invId, landlordId: unit.landlordId, serialNumber: invSerial, invoiceNumber: `INV-${invSerial.slice(-6)}`,
        paymentReference: makePaymentReference(unit.unitNumber, invId),
        tenantId: tenant.id, tenantName: fullName, tenantEmail: email, unitId: unit.id, unitNumber: unit.unitNumber,
        propertyId: unit.propertyId, propertyName: tenant.propertyName,
        issueDate: now.toISOString().split('T')[0], dueDate: new Date(now.getTime() + 7 * 86400_000).toISOString().split('T')[0],
        periodMonth: now.toLocaleString('en-KE', { month: 'long', year: 'numeric' }),
        rentAmount: unit.monthlyRent, waterFee, trashFee, maintenanceFee: 0, taxAmount: 0, discount: 0,
        totalAmount: unit.monthlyRent + waterFee + trashFee, status: 'Unpaid', amountPaid: 0,
        externalDeliveryStatus: 'pending', notes: `Initial move-in invoice. Serial: ${invSerial}`, emailedToTenant: true, emailSentAt: now.toISOString()
      };
      await store().set(COLLECTIONS.INVOICES, invoice.id, invoice as any);

      await logSecurityEvent('ACCOUNT_REGISTERED', 'LOW', `Tenant registered for ${unit.unitNumber} (${tenant.status})`, req, email, tenant.id, 'tenant');
      const welcomeSerial = generateSerial('WLC');
      const mail = await dispatchSystemEmail({
        recipientEmail: email, recipientName: fullName, landlordId: unit.landlordId, documentId: invoice.id,
        subject: `Registration received: Unit ${unit.unitNumber} - ${tenant.propertyName}`, emailType: 'Welcome & Lease', prefix: 'WLC', serialNumber: welcomeSerial,
        bodyHtml: welcomeEmailHtml({
          fullName, unitNumber: unit.unitNumber, propertyName: tenant.propertyName || '', bedrooms: unit.bedrooms, bathrooms: unit.bathrooms,
          monthlyRent: unit.monthlyRent, leaseTermMonths, startDate, endDate: tenant.leaseEndDate!, email, quote, invoice, landlord, welcomeSerial,
          pendingApproval: tenant.status === 'Pending Approval'
        })
      }).catch(() => undefined);
      if (mail?.externalDelivered) {
        await store().update(COLLECTIONS.INVOICES, invoice.id, { externalDeliveryStatus: 'delivered' });
        await store().update(COLLECTIONS.QUOTES, quote.id, { externalDeliveryStatus: 'delivered' });
      }

      // Applicants get a session so they can pay straight away; landlords creating a tenant keep their own session.
      const sessionToken = byOwner ? undefined : (await createSession(req, tenant, 'tenant')).token;
      const freshUnit = await store().get<Unit>(COLLECTIONS.UNITS, unit.id);
      return res.status(201).json({
        success: true, tenant: sanitizeUserForClient(tenant), quote, invoice, unit: freshUnit, welcomeSerial, sessionToken,
        landlord: landlordPaymentView(landlord), externalDelivered: Boolean(mail?.externalDelivered),
        message: `Registration received. Your quote and invoice were sent to ${email}.`
      });
    })
  );
}
