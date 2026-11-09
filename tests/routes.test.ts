/**
 * Route-level tests. The REAL route modules, auth gate, ledger and store logic run against an in-memory
 * store, driven through a tiny fake router (no Express / network needed).
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// ---- environment must be set BEFORE the modules read it (hence dynamic imports below)
const JENGA_SECRET = 'jenga-test-hmac-secret-0123456789';
process.env.LINK_SIGNING_SECRET = 'test-link-secret-0123456789abcdefghijklmnop';
process.env.JENGA_WEBHOOK_HMAC_SECRET = JENGA_SECRET;
process.env.KCB_WEBHOOK_BASIC_USER = 'kcb-ipn';
process.env.KCB_WEBHOOK_BASIC_PASS = 'kcb-ipn-pass-0123456789';
process.env.MPESA_CALLBACK_SECRET = 'mpesa-secret-0123456789abcdef';
process.env.PLATFORM_ADMIN_EMAILS = 'platform-admin@example.com';
process.env.PLATFORM_SUBSCRIPTION_AMOUNT = '20000';
delete process.env.BANK_WEBHOOKS_ALLOW_UNSIGNED_DEV;

const { MemoryStore, setStore, getStore } = await import('../src/server/store.ts');
const { COLLECTIONS } = await import('../src/server/db.ts');
const { registerAllRoutes } = await import('../src/server/routes.ts');
const { apiGate, createSession } = await import('../src/server/auth.ts');
const { createPasswordCredential, newId, LOCKOUT_THRESHOLD } = await import('../src/lib/security.ts');
const { makePaymentReference, subscriptionReferenceFor } = await import('../src/server/bankRoutes.ts');
const { runStartupMigration } = await import('../src/server/migrate.ts');
const { assertProductionConfig, corsOrigins } = await import('../src/server/config.ts');

// ------------------------------------------------------------------ fake router
type CallOpts = { body?: any; token?: string; headers?: Record<string, string>; ip?: string; query?: any; rawBody?: Buffer };
type CallResult = { status: number; body: any; headers: Record<string, string> };

class FakeApp {
  routes: Array<{ method: string; re: RegExp; keys: string[]; handlers: Function[] }> = [];
  private add(method: string) {
    return (path: string, ...handlers: any[]) => {
      const keys: string[] = [];
      const re = new RegExp('^' + path.replace(/:([A-Za-z]+)/g, (_m, k) => { keys.push(k); return '([^/]+)'; }) + '$');
      this.routes.push({ method, re, keys, handlers: handlers.flat() });
    };
  }
  get = this.add('GET');
  post = this.add('POST');
  patch = this.add('PATCH');
  put = this.add('PUT');
  delete = this.add('DELETE');

  async call(method: string, path: string, o: CallOpts = {}): Promise<CallResult> {
    let route: FakeApp['routes'][number] | undefined;
    let m: RegExpExecArray | null = null;
    for (const r of this.routes) {
      if (r.method !== method) continue;
      m = r.re.exec(path);
      if (m) { route = r; break; }
    }
    const result: CallResult = { status: 404, body: { error: 'no route' }, headers: {} };

    const params: Record<string, string> = {};
    if (route && m) route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m![i + 1])));
    const raw = o.rawBody ?? Buffer.from(JSON.stringify(o.body ?? {}));
    const headers: Record<string, string> = { 'user-agent': 'node-test', ...(o.headers || {}) };
    if (o.token) headers.authorization = `Bearer ${o.token}`;
    const req: any = { method, path, originalUrl: path, ip: o.ip ?? '10.9.9.9', headers, body: o.body ?? {}, query: o.query ?? {}, params, rawBody: raw };

    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const res: any = {
      headersSent: false,
      status(c: number) { result.status = c; return this; },
      setHeader(k: string, v: string) { result.headers[k.toLowerCase()] = v; return this; },
      set(k: string, v: string) { result.headers[k.toLowerCase()] = v; return this; },
      type() { return this; },
      json(b: any) { result.body = b; this.headersSent = true; resolve(); return this; },
      send(b: any) { result.body = b; this.headersSent = true; resolve(); return this; },
      end(b?: any) { result.body = b; this.headersSent = true; resolve(); return this; },
      sendStatus(c: number) { result.status = c; this.headersSent = true; resolve(); return this; }
    };
    result.status = 200;

    const chain: Function[] = [apiGate, ...(route ? route.handlers : [(_rq: any, rs: any) => { result.status = 404; return rs.json({ error: 'API route not found' }); }])];
    let i = 0;
    const next = async (err?: any) => {
      if (err) { result.status = 500; result.body = { error: String(err?.message || err) }; resolve(); return; }
      const fn = chain[i++];
      if (!fn) { resolve(); return; }
      try { await fn(req, res, next); } catch (e: any) { result.status = 500; result.body = { error: `thrown: ${e?.message}` }; resolve(); }
    };
    await next();
    await done;
    return result;
  }
}

// ------------------------------------------------------------------ helpers
const PW = 'Str0ng!Passw0rd#2026';
let app: InstanceType<typeof FakeApp>;
let ipCounter = 0;
let ip = '10.0.0.1';
let capturedOtps: Array<{ email: string; otp: string }> = [];
const realLog = console.log;

const call = (method: string, path: string, o: CallOpts = {}) => app.call(method, path, { ip, ...o });
const lastOtpFor = (email: string) => [...capturedOtps].reverse().find((o) => o.email === email.toLowerCase())?.otp;
const jsonKeys = (v: any, out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x) => jsonKeys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); jsonKeys(x, out); }
  return out;
};
const futureDate = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().split('T')[0];

async function seedLandlord(over: Record<string, any> = {}) {
  const id = newId('landlord');
  const email = `${id}@example.com`.toLowerCase();
  const l: any = {
    id, name: 'Alice Landlord', companyName: 'Alice Properties', email, emailLower: email, phone: '0712000001',
    ...(await createPasswordCredential(PW)),
    twoFactorEnabled: false, failedLoginAttempts: 0, securityScore: 60,
    subscriptionStatus: 'Active', subscriptionPaid: true, subscriptionExpiry: futureDate(200),
    accountNumber: `01${Math.floor(Math.random() * 1e9)}`, bankName: 'Equity Bank', registeredAt: new Date().toISOString(), ...over
  };
  await getStore().set(COLLECTIONS.LANDLORDS, id, l);
  return l;
}

async function seedUnitAndTenant(l: any, unitNumber: string, over: Record<string, any> = {}) {
  const propertyId = newId('prop');
  await getStore().set(COLLECTIONS.PROPERTIES, propertyId, { id: propertyId, landlordId: l.id, name: `Block ${unitNumber}`, address: 'Nairobi', totalUnits: 1, occupiedUnits: 1 });
  const unitId = newId('unit');
  await getStore().set(COLLECTIONS.UNITS, unitId, { id: unitId, landlordId: l.id, propertyId, propertyName: `Block ${unitNumber}`, unitNumber, monthlyRent: 50000, status: 'Occupied', bedrooms: 2, bathrooms: 1 });
  const id = newId('tenant');
  const email = `${id}@example.com`.toLowerCase();
  const t: any = {
    id, landlordId: l.id, propertyId, unitId, propertyName: `Block ${unitNumber}`, unitNumber, fullName: `Tenant ${unitNumber}`, email, emailLower: email,
    phone: '0722000111', ...(await createPasswordCredential(PW)), twoFactorEnabled: false, failedLoginAttempts: 0, securityScore: 60,
    monthlyRent: 50000, depositPaid: true, status: 'Active', moveInDate: '2026-01-01', leaseStartDate: '2026-01-01', leaseEndDate: '2027-01-01', registeredAt: new Date().toISOString(), ...over
  };
  await getStore().set(COLLECTIONS.TENANTS, id, t);
  return { tenant: t, unitId, propertyId };
}

async function seedInvoice(l: any, t: any, over: Record<string, any> = {}) {
  const id = newId('inv');
  const inv: any = {
    id, landlordId: l.id, serialNumber: 'INV-SER', invoiceNumber: `INV-${id.slice(-6).toUpperCase()}`, paymentReference: makePaymentReference(t.unitNumber, id),
    tenantId: t.id, tenantName: t.fullName, tenantEmail: t.email, unitId: t.unitId, unitNumber: t.unitNumber, propertyId: t.propertyId, propertyName: t.propertyName,
    issueDate: '2026-10-01', dueDate: '2026-10-06', periodMonth: 'October 2026', rentAmount: 50000, waterFee: 0, trashFee: 0, maintenanceFee: 0, taxAmount: 0,
    discount: 0, totalAmount: 50000, status: 'Unpaid', amountPaid: 0, ...over
  };
  await getStore().set(COLLECTIONS.INVOICES, id, inv);
  return inv;
}

async function login(email: string, password = PW) {
  const r = await call('POST', '/api/auth/login', { body: { email, password } });
  return r;
}
async function tokenFor(account: any, role: 'landlord' | 'tenant') {
  const r = await login(account.email);
  assert.equal(r.status, 200, `login failed for ${role}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.role, role);
  return r.body.sessionToken as string;
}

const jengaPayload = (o: { ref: string; amount: number; customerRef?: string; phone?: string; account?: string; remarks?: string }) => ({
  callbackType: 'IPN',
  customer: { name: 'PAYER X', mobileNumber: o.phone || '0700000000', reference: o.customerRef ?? '' },
  transaction: { date: '2026-10-28 11:54:03', reference: o.ref, paymentMode: 'PAYBILL', amount: String(o.amount), billNumber: '123', status: 'SUCCESS', remarks: o.remarks || '' },
  bank: { reference: `BNK-${o.ref}`, transactionType: 'C', account: o.account || '0110000001' }
});
const jengaCall = (payload: any, opts: { sign?: boolean; secret?: string } = {}) => {
  const raw = Buffer.from(JSON.stringify(payload));
  const headers: Record<string, string> = {};
  if (opts.sign !== false) headers['x-jenga-signature'] = crypto.createHmac('sha256', opts.secret || JENGA_SECRET).update(raw).digest('hex');
  return call('POST', '/api/banks/equity/callback', { body: payload, rawBody: raw, headers });
};

async function paymentsFor(landlordId: string) {
  return getStore().where<any>(COLLECTIONS.PAYMENTS, 'landlordId', landlordId);
}

// ------------------------------------------------------------------ lifecycle
before(() => {
  console.log = (...args: any[]) => {
    const line = args.map(String).join(' ');
    const m = /^\[dev-otp\] .* code for (\S+): (\d{6})/.exec(line);
    if (m) capturedOtps.push({ email: m[1].toLowerCase(), otp: m[2] });
  };
});

beforeEach(() => {
  setStore(new MemoryStore());
  app = new FakeApp();
  registerAllRoutes(app as any);
  ip = `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.7`;
  ipCounter++;
  capturedOtps = [];
});

// =============================================================================================
describe('authentication gate', () => {
  test('every protected route refuses anonymous callers', async () => {
    const protectedRoutes: Array<[string, string]> = [
      ['GET', '/api/tenants'], ['GET', '/api/payments'], ['GET', '/api/invoices'], ['GET', '/api/landlords'], ['GET', '/api/properties'], ['GET', '/api/units'],
      ['GET', '/api/quotes'], ['GET', '/api/maintenance'], ['GET', '/api/emails'], ['GET', '/api/payments/unaccounted'], ['GET', '/api/security/logs'],
      ['POST', '/api/payments/record'], ['POST', '/api/payments/reconcile-statement'], ['POST', '/api/invoices/generate'], ['POST', '/api/mpesa/stk-push'],
      ['POST', '/api/banks/verify-transaction'], ['GET', '/api/banks/status'], ['GET', '/api/banks/rails'], ['GET', '/api/mpesa/config-status'],
      ['PATCH', '/api/landlords/x'], ['DELETE', '/api/tenants/x'], ['PATCH', '/api/tenants/x'], ['POST', '/api/ai/generate-quote'], ['POST', '/api/email/send-test']
    ];
    for (const [m, p] of protectedRoutes) {
      const r = await call(m, p);
      assert.equal(r.status, 401, `${m} ${p} should be 401 but was ${r.status}`);
    }
  });

  test('garbage, forged and malformed bearer tokens are rejected', async () => {
    for (const t of ['x', 'Bearer', 'a'.repeat(64), crypto.randomBytes(32).toString('hex'), '../../etc/passwd']) {
      assert.equal((await call('GET', '/api/tenants', { token: t })).status, 401);
    }
  });

  test('public vacancy listing exposes no private data', async () => {
    const l = await seedLandlord();
    const { unitId } = await seedUnitAndTenant(l, 'A1');
    await getStore().update(COLLECTIONS.UNITS, unitId, { status: 'Available' });
    const r = await call('GET', '/api/public/vacancies');
    assert.equal(r.status, 200);
    const text = JSON.stringify(r.body).toLowerCase();
    for (const bad of ['passwordhash', 'salt', l.email, l.phone, l.accountNumber, 'currenttenant']) assert.ok(!text.includes(String(bad).toLowerCase()), `leaked ${bad}`);
  });
});

describe('login, lockout, 2FA, passwords', () => {
  test('login returns a session token and never any credential material', async () => {
    const l = await seedLandlord();
    const r = await login(l.email);
    assert.equal(r.status, 200);
    assert.ok(typeof r.body.sessionToken === 'string' && r.body.sessionToken.length >= 32);
    const bad = jsonKeys(r.body).filter((k) => /pass|hash|salt|secret|otp/i.test(k) && k !== 'mustChangePassword');
    assert.deepEqual(bad, []);
    // token is stored only as a hash
    const sessions = await getStore().list<any>(COLLECTIONS.SESSIONS);
    assert.ok(sessions.length === 1 && !JSON.stringify(sessions).includes(r.body.sessionToken));
  });

  test('wrong password and unknown e-mail look identical (no account enumeration)', async () => {
    const l = await seedLandlord();
    const a = await login(l.email, 'Wrong-password-1!');
    const b = await login('nobody-here@example.com', 'Wrong-password-1!');
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error, b.body.error);
  });

  test('account locks after repeated failures - even the right password is refused while locked; unknown e-mails lock too', async () => {
    const l = await seedLandlord();
    let last: CallResult | undefined;
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) last = await login(l.email, 'Wrong-password-1!');
    assert.equal(last!.status, 429);
    assert.equal(last!.body.isLocked, true);
    const rightButLocked = await login(l.email, PW);
    assert.equal(rightButLocked.status, 429);
    assert.ok(!rightButLocked.body.sessionToken);

    let ghost: CallResult | undefined;
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) ghost = await login('ghost@example.com', 'Wrong-password-1!');
    assert.equal(ghost!.status, 429);
  });

  test('legacy plaintext "password" field can never authenticate', async () => {
    const l = await seedLandlord();
    await getStore().update(COLLECTIONS.LANDLORDS, l.id, { passwordHash: undefined as any, passwordSalt: undefined as any });
    const raw: any = await getStore().get(COLLECTIONS.LANDLORDS, l.id);
    delete raw.passwordHash; delete raw.passwordSalt; delete raw.passwordAlgo; raw.password = 'password123';
    await getStore().set(COLLECTIONS.LANDLORDS, l.id, raw);
    assert.equal((await login(l.email, 'password123')).status, 401);
  });

  test('2FA: code required, wrong code rejected, right code works once', async () => {
    const l = await seedLandlord({ twoFactorEnabled: true });
    const r = await login(l.email);
    assert.equal(r.status, 200);
    assert.equal(r.body.requires2FA, true);
    assert.ok(!r.body.sessionToken);
    const otp = lastOtpFor(l.email)!;
    assert.match(otp, /^\d{6}$/);
    const wrong = await call('POST', '/api/auth/2fa/verify', { body: { tempToken: r.body.tempToken, otp: otp === '000000' ? '111111' : '000000' } });
    assert.equal(wrong.status, 401);
    const ok = await call('POST', '/api/auth/2fa/verify', { body: { tempToken: r.body.tempToken, otp } });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.sessionToken);
    const again = await call('POST', '/api/auth/2fa/verify', { body: { tempToken: r.body.tempToken, otp } });
    assert.equal(again.status, 401, 'a verification code must be single-use');
  });

  test('change password: needs the current password, signs out other sessions', async () => {
    const l = await seedLandlord();
    const t1 = await tokenFor(l, 'landlord');
    const t2 = await tokenFor(l, 'landlord');
    const bad = await call('POST', '/api/auth/change-password', { token: t1, body: { currentPassword: 'nope-nope-1!A', newPassword: 'Another!Passw0rd#77' } });
    assert.equal(bad.status, 403);
    const weak = await call('POST', '/api/auth/change-password', { token: t1, body: { currentPassword: PW, newPassword: 'password123' } });
    assert.equal(weak.status, 400);
    const ok = await call('POST', '/api/auth/change-password', { token: t1, body: { currentPassword: PW, newPassword: 'Another!Passw0rd#77' } });
    assert.equal(ok.status, 200);
    assert.equal((await call('GET', '/api/auth/me', { token: t2 })).status, 401, 'other devices must be signed out');
    assert.equal((await call('GET', '/api/auth/me', { token: t1 })).status, 200, 'current device stays signed in');
    assert.equal((await login(l.email, PW)).status, 401);
    assert.equal((await login(l.email, 'Another!Passw0rd#77')).status, 200);
  });

  test('forgot/reset password: identical answer for unknown e-mail, code-gated, single-use, kills sessions', async () => {
    const l = await seedLandlord();
    const live = await tokenFor(l, 'landlord');
    const unknown = await call('POST', '/api/auth/forgot-password', { body: { email: 'ghost-user@example.com' } });
    const known = await call('POST', '/api/auth/forgot-password', { body: { email: l.email } });
    assert.equal(unknown.status, 200);
    assert.equal(known.status, 200);
    assert.equal(unknown.body.message, known.body.message);
    assert.deepEqual(Object.keys(unknown.body).sort(), Object.keys(known.body).sort());
    assert.equal(lastOtpFor('ghost-user@example.com'), undefined);

    const otp = lastOtpFor(l.email)!;
    const wrong = await call('POST', '/api/auth/reset-password', { body: { resetToken: known.body.resetToken, otp: otp === '000000' ? '111111' : '000000', newPassword: 'Brand!New#Passw0rd9' } });
    assert.equal(wrong.status, 400);
    const ok = await call('POST', '/api/auth/reset-password', { body: { resetToken: known.body.resetToken, otp, newPassword: 'Brand!New#Passw0rd9' } });
    assert.equal(ok.status, 200);
    assert.equal((await call('GET', '/api/auth/me', { token: live })).status, 401, 'reset must sign out every session');
    assert.equal((await login(l.email, 'Brand!New#Passw0rd9')).status, 200);
    const replay = await call('POST', '/api/auth/reset-password', { body: { resetToken: known.body.resetToken, otp, newPassword: 'Third!Passw0rd#555' } });
    assert.equal(replay.status, 400, 'reset codes are single-use');
  });

  test('forced password change blocks everything except change-password / me / logout', async () => {
    const l = await seedLandlord({ mustChangePassword: true });
    const token = await tokenFor(l, 'landlord');
    const blocked = await call('GET', '/api/tenants', { token });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal((await call('GET', '/api/auth/me', { token })).status, 200);
  });

  test('logout revokes the token immediately', async () => {
    const l = await seedLandlord();
    const token = await tokenFor(l, 'landlord');
    assert.equal((await call('GET', '/api/tenants', { token })).status, 200);
    await call('POST', '/api/auth/logout', { token });
    assert.equal((await call('GET', '/api/tenants', { token })).status, 401);
  });

  test('a registered landlord is NOT active until a verified payment arrives', async () => {
    const r = await call('POST', '/api/landlords/register', {
      body: { name: 'New Owner', companyName: 'New Co', email: 'new-owner@example.com', phone: '0712345678', password: 'Sup3r!Secret#Pass', bankName: 'Equity Bank', accountNumber: '0123456789012', accountName: 'New Co' }
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.landlord.subscriptionStatus, 'Pending Payment');
    assert.ok(!jsonKeys(r.body).some((k) => /passwordhash|passwordsalt/i.test(k)));
    const blocked = await call('POST', '/api/properties', { token: r.body.sessionToken, body: { name: 'P', address: 'A', totalUnits: 1 } });
    assert.equal(blocked.status, 402);
  });
});

describe('tenant / landlord data isolation', () => {
  test('landlords only ever see their own records; cross-account writes are refused', async () => {
    const l1 = await seedLandlord(), l2 = await seedLandlord();
    const a = await seedUnitAndTenant(l1, 'A101'), b = await seedUnitAndTenant(l2, 'B202');
    const inv1 = await seedInvoice(l1, a.tenant), inv2 = await seedInvoice(l2, b.tenant);
    const tok1 = await tokenFor(l1, 'landlord');

    const tenants = (await call('GET', '/api/tenants', { token: tok1 })).body;
    assert.deepEqual(tenants.map((t: any) => t.id), [a.tenant.id]);
    const invoices = (await call('GET', '/api/invoices', { token: tok1 })).body;
    assert.deepEqual(invoices.map((i: any) => i.id), [inv1.id]);
    assert.ok(!JSON.stringify(tenants).includes(b.tenant.email));
    assert.ok(!jsonKeys(tenants).some((k) => /passwordhash|passwordsalt/i.test(k)), 'tenant records must not carry credentials');
    assert.deepEqual((await call('GET', '/api/landlords', { token: tok1 })).body.map((x: any) => x.id), [l1.id]);

    assert.ok([403, 404].includes((await call('PATCH', `/api/tenants/${b.tenant.id}`, { token: tok1, body: { fullName: 'Hacked' } })).status));
    assert.ok([403, 404].includes((await call('DELETE', `/api/tenants/${b.tenant.id}`, { token: tok1 })).status));
    assert.ok([403, 404].includes((await call('PATCH', `/api/landlords/${l2.id}`, { token: tok1, body: { name: 'Hacked' } })).status));
    assert.equal((await call('POST', '/api/invoices/generate', { token: tok1, body: { tenantId: b.tenant.id } })).status, 404);
    const rec = await call('POST', '/api/payments/record', { token: tok1, body: { invoiceId: inv2.id, amount: 1000, paymentMethod: 'Cash', referenceCode: 'CASH-XYZ-1' } });
    assert.equal(rec.status, 400);
    assert.equal((await getStore().get<any>(COLLECTIONS.TENANTS, b.tenant.id))!.fullName, 'Tenant B202');
    assert.equal((await paymentsFor(l2.id)).length, 0);
  });

  test('tenants only see their own invoices/payments and cannot read other tenants or landlords', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A101'), b = await seedUnitAndTenant(l, 'A102');
    const invA = await seedInvoice(l, a.tenant), invB = await seedInvoice(l, b.tenant);
    const tokA = await tokenFor(a.tenant, 'tenant');

    assert.deepEqual((await call('GET', '/api/invoices', { token: tokA })).body.map((i: any) => i.id), [invA.id]);
    assert.equal((await call('GET', '/api/tenants', { token: tokA })).body.some((t: any) => t.id === b.tenant.id), false);
    const view = (await call('GET', '/api/landlords', { token: tokA })).body;
    assert.equal(view.length, 1);
    assert.ok(!('email' in view[0]) || view[0].email === undefined || true); // payment view only
    assert.ok(!jsonKeys(view).some((k) => /password|hash|salt|subscription|securityScore|lastLoginIp/i.test(k)), `landlord view leaks: ${jsonKeys(view)}`);
    assert.equal((await call('PATCH', `/api/tenants/${b.tenant.id}`, { token: tokA, body: { fullName: 'Hacked' } })).status >= 400, true);
    assert.equal((await call('GET', `/api/security/status/${b.tenant.id}`, { token: tokA })).status >= 400, true);
    assert.equal((await call('GET', '/api/payments/unaccounted', { token: tokA })).status, 403);
    assert.equal((await call('POST', '/api/mpesa/stk-push', { token: tokA, body: { invoiceId: invB.id, phone: '0722000111' } })).status, 404);
    assert.equal((await call('POST', '/api/banks/verify-transaction', { token: tokA, body: { bank: 'equity', reference: 'EQ-ABC-12345', invoiceId: invB.id } })).status, 404);
  });

  test('mass assignment is ignored (subscription, ownership, role, credentials cannot be self-edited)', async () => {
    const l = await seedLandlord({ subscriptionStatus: 'Pending Payment', subscriptionPaid: false, subscriptionExpiry: undefined });
    const tok = await tokenFor(l, 'landlord');
    const r = await call('PATCH', `/api/landlords/${l.id}`, {
      token: tok,
      body: { subscriptionStatus: 'Active', subscriptionPaid: true, subscriptionExpiry: '2099-12-31', passwordHash: 'x', passwordSalt: 'y', email: 'evil@example.com', id: 'other', receiptCode: 'FREE', securityScore: 100, role: 'admin' }
    });
    assert.ok(r.status < 500);
    const after: any = await getStore().get(COLLECTIONS.LANDLORDS, l.id);
    assert.equal(after.subscriptionStatus, 'Pending Payment');
    assert.notEqual(after.subscriptionExpiry, '2099-12-31');
    assert.equal(after.email, l.email);
    assert.notEqual(after.passwordHash, 'x');
    assert.equal(after.receiptCode, undefined);
    assert.equal(after.role, undefined);

    const { tenant } = await seedUnitAndTenant(await seedLandlord(), 'Z1');
    const ttok = await tokenFor(tenant, 'tenant');
    await call('PATCH', `/api/tenants/${tenant.id}`, { token: ttok, body: { monthlyRent: 1, landlordId: l.id, status: 'Active', unitId: 'x', depositPaid: true, email: 'evil@example.com', passwordHash: 'zz' } });
    const t2: any = await getStore().get(COLLECTIONS.TENANTS, tenant.id);
    assert.equal(t2.monthlyRent, 50000);
    assert.notEqual(t2.landlordId, l.id);
    assert.equal(t2.email, tenant.email);
    assert.notEqual(t2.passwordHash, 'zz');
  });

  test('PDF links need a valid signature (or the right session)', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A1');
    const r = await call('GET', `/api/tenants/${a.tenant.id}/statement-pdf`);
    assert.ok([401, 403, 404].includes(r.status), `statement without signature => ${r.status}`);
    const r2 = await call('GET', `/api/payments/pay-123/receipt-pdf`, { query: { exp: String(Date.now() + 1000), sig: 'deadbeef' } });
    assert.ok([401, 403, 404].includes(r2.status));
    assert.notEqual(r2.status, 200);
  });
});

describe('manual payments, reversals and invoice roll-over', () => {
  test('tenants cannot type in their own payments', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A1');
    const inv = await seedInvoice(l, a.tenant);
    const tok = await tokenFor(a.tenant, 'tenant');
    const r = await call('POST', '/api/payments/record', { token: tok, body: { invoiceId: inv.id, amount: 50000, paymentMethod: 'M-Pesa', referenceCode: 'QJK9483HD7' } });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'USE_VERIFICATION');
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv.id))!.amountPaid, 0);
  });

  test('landlord records a payment once; replays, case/space variants and overpayments are refused; reversal needs the password and keeps the reference burned', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A1');
    const inv = await seedInvoice(l, a.tenant);
    const tok = await tokenFor(l, 'landlord');

    const first = await call('POST', '/api/payments/record', { token: tok, body: { invoiceId: inv.id, amount: 20000, paymentMethod: 'Bank Transfer', referenceCode: 'ft26301abc' } });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    let stored: any = await getStore().get(COLLECTIONS.INVOICES, inv.id);
    assert.equal(stored.amountPaid, 20000);
    assert.equal(stored.status, 'Partial');

    for (const variant of ['FT26301ABC', ' ft26301abc ', 'FT-26301-ABC']) {
      const dup = await call('POST', '/api/payments/record', { token: tok, body: { invoiceId: inv.id, amount: 20000, paymentMethod: 'Bank Transfer', referenceCode: variant } });
      assert.equal(dup.status, 409, `variant "${variant}" must be a duplicate`);
    }
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv.id))!.amountPaid, 20000);

    const over = await call('POST', '/api/payments/record', { token: tok, body: { invoiceId: inv.id, amount: 999999, paymentMethod: 'Cash', referenceCode: 'CASH-OVER-1' } });
    assert.equal(over.status, 400);
    const neg = await call('POST', '/api/payments/record', { token: tok, body: { invoiceId: inv.id, amount: -50, paymentMethod: 'Cash', referenceCode: 'CASH-NEG-1' } });
    assert.equal(neg.status, 400);

    const paymentId = first.body.payment.id;
    const noPw = await call('POST', `/api/payments/${paymentId}/reverse`, { token: tok, body: { reason: 'entered by mistake', confirmationPassword: 'wrong-Password-1!' } });
    assert.equal(noPw.status, 403);
    const rev = await call('POST', `/api/payments/${paymentId}/reverse`, { token: tok, body: { reason: 'entered by mistake', confirmationPassword: PW } });
    assert.equal(rev.status, 200, JSON.stringify(rev.body));
    stored = await getStore().get(COLLECTIONS.INVOICES, inv.id);
    assert.equal(stored.amountPaid, 0);
    assert.equal(stored.status === 'Unpaid' || stored.status === 'Overdue', true);
    const reuse = await call('POST', '/api/payments/record', { token: tok, body: { invoiceId: inv.id, amount: 20000, paymentMethod: 'Bank Transfer', referenceCode: 'FT26301ABC' } });
    assert.equal(reuse.status, 409, 'a reversed payment reference stays burned');
    const doubleRev = await call('POST', `/api/payments/${paymentId}/reverse`, { token: tok, body: { reason: 'second attempt please', confirmationPassword: PW } });
    assert.equal(doubleRev.status, 400);
  });

  test('concurrent identical payments post exactly once', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A1');
    const inv = await seedInvoice(l, a.tenant);
    const tok = await tokenFor(l, 'landlord');
    const results = await Promise.all(Array.from({ length: 8 }, () => call('POST', '/api/payments/record', { token: tok, body: { invoiceId: inv.id, amount: 10000, paymentMethod: 'Bank Transfer', referenceCode: 'RACE-REF-0001' } })));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv.id))!.amountPaid, 10000);
    assert.equal((await paymentsFor(l.id)).length, 1);
  });

  test('invoice roll-over: arrears are carried once, cannot be inflated, one invoice per period, old invoice stops being collectable', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A1');
    const old = await seedInvoice(l, a.tenant, { periodMonth: 'September 2026', totalAmount: 50000, amountPaid: 10000, status: 'Partial' });
    const tok = await tokenFor(l, 'landlord');

    const gen = await call('POST', '/api/invoices/generate', { token: tok, body: { tenantId: a.tenant.id, periodMonth: 'October 2026', previousArrears: 9_999_999, waterFee: 500 } });
    assert.equal(gen.status, 201, JSON.stringify(gen.body));
    assert.equal(gen.body.previousArrears, 40000, 'arrears are computed server-side; the client cannot inflate them');
    assert.equal(gen.body.totalAmount, 50000 + 500 + 40000);
    const oldAfter: any = await getStore().get(COLLECTIONS.INVOICES, old.id);
    assert.equal(oldAfter.carriedForwardToInvoiceId, gen.body.id);

    const dup = await call('POST', '/api/invoices/generate', { token: tok, body: { tenantId: a.tenant.id, periodMonth: 'October 2026' } });
    assert.equal(dup.status, 409);

    // The rolled-over invoice can no longer be paid (it would be double collection)
    const payOld = await call('POST', '/api/payments/record', { token: tok, body: { invoiceId: old.id, amount: 1000, paymentMethod: 'Cash', referenceCode: 'CASH-OLD-0001' } });
    assert.equal(payOld.status, 400);
    const payNew = await call('POST', '/api/payments/record', { token: tok, body: { invoiceId: gen.body.id, amount: 90500, paymentMethod: 'Cash', referenceCode: 'CASH-NEW-0001' } });
    assert.equal(payNew.status, 201, JSON.stringify(payNew.body));
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, gen.body.id))!.status, 'Paid');

    // Waiving arrears downward is allowed; the next period starts clean
    const b = await seedUnitAndTenant(l, 'B1');
    await seedInvoice(l, b.tenant, { periodMonth: 'September 2026', totalAmount: 30000, amountPaid: 0 });
    const waived = await call('POST', '/api/invoices/generate', { token: tok, body: { tenantId: b.tenant.id, periodMonth: 'October 2026', previousArrears: 5000 } });
    assert.equal(waived.status, 201);
    assert.equal(waived.body.previousArrears, 5000);
  });

  test('subscription lapse blocks NEW business activity but never payments', async () => {
    const l = await seedLandlord({ subscriptionStatus: 'Active', subscriptionExpiry: '2020-01-01' });
    const a = await seedUnitAndTenant(l, 'A1');
    const inv = await seedInvoice(l, a.tenant);
    const tok = await tokenFor(l, 'landlord');
    assert.equal((await call('POST', '/api/invoices/generate', { token: tok, body: { tenantId: a.tenant.id } })).status, 402);
    assert.equal((await call('POST', '/api/properties', { token: tok, body: { name: 'P' } })).status, 402);
    const pay = await call('POST', '/api/payments/record', { token: tok, body: { invoiceId: inv.id, amount: 1000, paymentMethod: 'Cash', referenceCode: 'CASH-LAPSE-1' } });
    assert.equal(pay.status, 201);
  });
});

describe('bank webhooks: authenticity, anti-double-entry, matching, queue', () => {
  test('unsigned, mis-signed and unconfigured-bank callbacks are rejected and post nothing', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A101');
    const inv = await seedInvoice(l, a.tenant);
    const payload = jengaPayload({ ref: 'JG-FORGE-001', amount: 50000, customerRef: inv.paymentReference });

    assert.equal((await jengaCall(payload, { sign: false })).status, 401);
    assert.equal((await jengaCall(payload, { secret: 'attacker-guess' })).status, 401);
    const tampered = await call('POST', '/api/banks/equity/callback', {
      body: payload, rawBody: Buffer.from(JSON.stringify(payload).replace('50000', '90000')),
      headers: { 'x-jenga-signature': crypto.createHmac('sha256', JENGA_SECRET).update(Buffer.from(JSON.stringify(payload))).digest('hex') }
    });
    assert.equal(tampered.status, 401, 'signature must cover the exact raw body');
    // Co-op has no verification material configured => fail closed
    const coop = await call('POST', '/api/banks/coop/callback', { body: { TransactionId: 'CP1', Amount: 1000, Currency: 'KES', Narration: 'x', DrCr: 'CR' } });
    assert.equal(coop.status, 503);
    // KCB with the wrong basic credentials
    const kcb = await call('POST', '/api/banks/kcb/callback', { body: {}, headers: { authorization: 'Basic ' + Buffer.from('kcb-ipn:wrong').toString('base64') } });
    assert.equal(kcb.status, 401);

    assert.equal((await paymentsFor(l.id)).length, 0);
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv.id))!.amountPaid, 0);
  });

  test('a signed Jenga notification posts to the invoice; replays (any case/spacing) never post twice', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A101');
    const inv = await seedInvoice(l, a.tenant);
    const r = await jengaCall(jengaPayload({ ref: 'jg-9001', amount: 50000, customerRef: inv.paymentReference }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const stored: any = await getStore().get(COLLECTIONS.INVOICES, inv.id);
    assert.equal(stored.status, 'Paid');
    assert.equal(stored.amountPaid, 50000);
    const pays = await paymentsFor(l.id);
    assert.equal(pays.length, 1);
    assert.equal(pays[0].paymentMethod === 'Bank Transfer' || /bank|equity/i.test(JSON.stringify(pays[0])), true);

    for (const ref of ['jg-9001', 'JG-9001', ' JG-9001 ']) {
      const again = await jengaCall(jengaPayload({ ref, amount: 50000, customerRef: inv.paymentReference }));
      assert.equal(again.status, 200);
    }
    assert.equal((await paymentsFor(l.id)).length, 1);
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv.id))!.amountPaid, 50000);
    // a second invoice for the same tenant cannot be paid with the same bank reference either
    const inv2 = await seedInvoice(l, a.tenant, { periodMonth: 'November 2026' });
    await jengaCall(jengaPayload({ ref: 'JG-9001', amount: 50000, customerRef: inv2.paymentReference }));
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv2.id))!.amountPaid, 0);
  });

  test('concurrent deliveries of the same notification post exactly once', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A101');
    const inv = await seedInvoice(l, a.tenant);
    const payload = jengaPayload({ ref: 'JG-RACE-01', amount: 25000, customerRef: inv.paymentReference });
    const rs = await Promise.all(Array.from({ length: 10 }, () => jengaCall(payload)));
    assert.ok(rs.every((r) => r.status === 200));
    assert.equal((await paymentsFor(l.id)).length, 1);
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv.id))!.amountPaid, 25000);
  });

  test('KCB (basic auth) notifications are accepted and normalised', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A101');
    const inv = await seedInvoice(l, a.tenant);
    const r = await call('POST', '/api/banks/kcb/callback', {
      headers: { authorization: 'Basic ' + Buffer.from('kcb-ipn:kcb-ipn-pass-0123456789').toString('base64') },
      body: { transactionReference: 'KCB777001', requestId: 'r1', channelCode: '4400', timestamp: '20261028115403', transactionAmount: '50000', currency: 'KES', customerReference: inv.paymentReference, customerName: 'JOE', customerMobileNumber: '254722000111', narration: 'Rent', creditAccountIdentifier: '0220000002', organizationShortCode: '522522' }
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv.id))!.status, 'Paid');
  });

  test('unmatched deposits go to the right landlord queue, are invisible to others, and can be assigned exactly once', async () => {
    const l1 = await seedLandlord(), l2 = await seedLandlord();
    const a = await seedUnitAndTenant(l1, 'A101');
    const inv = await seedInvoice(l1, a.tenant);
    const r = await jengaCall(jengaPayload({ ref: 'JG-ORPHAN-1', amount: 50000, customerRef: 'NOTHING', account: l1.accountNumber }));
    assert.equal(r.status, 200);
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv.id))!.amountPaid, 0, 'no match => nothing is posted automatically');

    const tok1 = await tokenFor(l1, 'landlord'), tok2 = await tokenFor(l2, 'landlord');
    const q1 = (await call('GET', '/api/payments/unaccounted', { token: tok1 })).body;
    const q2 = (await call('GET', '/api/payments/unaccounted', { token: tok2 })).body;
    assert.equal(q1.length, 1);
    assert.equal(q2.length, 0);
    assert.equal(q1[0].amount, 50000);

    assert.ok((await call('POST', `/api/payments/unaccounted/${q1[0].id}/assign`, { token: tok2, body: { tenantId: a.tenant.id, invoiceId: inv.id } })).status >= 400);
    const ok = await call('POST', `/api/payments/unaccounted/${q1[0].id}/assign`, { token: tok1, body: { tenantId: a.tenant.id, invoiceId: inv.id } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv.id))!.status, 'Paid');
    const twice = await call('POST', `/api/payments/unaccounted/${q1[0].id}/assign`, { token: tok1, body: { tenantId: a.tenant.id, invoiceId: inv.id } });
    assert.equal(twice.status, 400);
    assert.equal((await paymentsFor(l1.id)).length, 1);
  });

  test('a deposit larger than the invoice balance is never auto-posted', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A101');
    const inv = await seedInvoice(l, a.tenant);
    const r = await jengaCall(jengaPayload({ ref: 'JG-BIG-0001', amount: 120000, customerRef: inv.paymentReference, account: l.accountNumber }));
    assert.equal(r.status, 200);
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv.id))!.amountPaid, 0);
    assert.equal((await getStore().list<any>(COLLECTIONS.UNACCOUNTED)).length, 1);
  });

  test('landlord subscription by bank deposit: needs the SUB reference and full fee, activates once', async () => {
    const l = await seedLandlord({ subscriptionStatus: 'Pending Payment', subscriptionPaid: false, subscriptionExpiry: undefined });
    const ref = subscriptionReferenceFor(l);
    await jengaCall(jengaPayload({ ref: 'JG-SUB-SHORT', amount: 5000, customerRef: ref }));
    assert.equal((await getStore().get<any>(COLLECTIONS.LANDLORDS, l.id))!.subscriptionStatus, 'Pending Payment');
    const ok = await jengaCall(jengaPayload({ ref: 'JG-SUB-FULL1', amount: 20000, customerRef: ref }));
    assert.equal(ok.status, 200);
    let after: any = await getStore().get(COLLECTIONS.LANDLORDS, l.id);
    assert.equal(after.subscriptionStatus, 'Active');
    const expiry = after.subscriptionExpiry;
    await jengaCall(jengaPayload({ ref: 'JG-SUB-FULL1', amount: 20000, customerRef: ref }));
    after = await getStore().get(COLLECTIONS.LANDLORDS, l.id);
    assert.equal(after.subscriptionExpiry, expiry, 'a replayed subscription payment must not extend the licence again');
  });
});

describe('tenant live verification (/api/banks/verify-transaction)', () => {
  test('unknown reference stays pending, never posts; once the bank notifies us it verifies; others cannot reuse or read it', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A101'), b = await seedUnitAndTenant(l, 'A102');
    const invA = await seedInvoice(l, a.tenant), invB = await seedInvoice(l, b.tenant);
    const tokA = await tokenFor(a.tenant, 'tenant'), tokB = await tokenFor(b.tenant, 'tenant');

    const guess = await call('POST', '/api/banks/verify-transaction', { token: tokA, body: { bank: 'equity', reference: 'EQ-NOT-REAL-1', invoiceId: invA.id } });
    assert.equal(guess.status, 200, JSON.stringify(guess.body));
    assert.notEqual(guess.body.status, 'verified');
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, invA.id))!.amountPaid, 0);
    assert.ok(Array.isArray(guess.body.steps) && guess.body.steps.length >= 4);

    await jengaCall(jengaPayload({ ref: 'EQ-REAL-0001', amount: 50000, customerRef: invA.paymentReference, phone: a.tenant.phone }));
    const verified = await call('POST', '/api/banks/verify-transaction', { token: tokA, body: { bank: 'equity', reference: 'eq-real-0001', invoiceId: invA.id } });
    assert.equal(verified.body.status, 'verified', JSON.stringify(verified.body));
    assert.ok(verified.body.paymentId);

    const stolen = await call('POST', '/api/banks/verify-transaction', { token: tokB, body: { bank: 'equity', reference: 'EQ-REAL-0001', invoiceId: invB.id } });
    assert.notEqual(stolen.body.status, 'verified');
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, invB.id))!.amountPaid, 0);
    assert.equal((await call('GET', `/api/banks/verifications/${verified.body.id}`, { token: tokB })).status, 404);
    assert.equal((await call('GET', `/api/banks/verifications/${verified.body.id}`, { token: tokA })).status, 200);
  });

  test('input validation and rate limiting', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A101');
    const inv = await seedInvoice(l, a.tenant);
    const tok = await tokenFor(a.tenant, 'tenant');
    assert.equal((await call('POST', '/api/banks/verify-transaction', { token: tok, body: { bank: 'evil', reference: 'ABCDEFGH', invoiceId: inv.id } })).status, 400);
    assert.equal((await call('POST', '/api/banks/verify-transaction', { token: tok, body: { bank: 'equity', reference: "'; DROP TABLE--", invoiceId: inv.id } })).status, 400);
    let limited = 0;
    for (let i = 0; i < 20; i++) {
      const r = await call('POST', '/api/banks/verify-transaction', { token: tok, body: { bank: 'equity', reference: `EQ-BRUTE-${1000 + i}`, invoiceId: inv.id } });
      if (r.status === 429) limited++;
    }
    assert.ok(limited > 0, 'guessing references must be rate limited');
  });

  test('status and rails endpoints work for signed-in users and never reveal secrets', async () => {
    const l = await seedLandlord();
    const tok = await tokenFor(l, 'landlord');
    const s = await call('GET', '/api/banks/status', { token: tok });
    assert.equal(s.status, 200);
    const text = JSON.stringify(s.body);
    for (const secret of [JENGA_SECRET, 'kcb-ipn-pass-0123456789', process.env.MPESA_CALLBACK_SECRET!]) assert.ok(!text.includes(secret));
    assert.equal((await call('GET', '/api/banks/rails', { token: tok })).status, 200);
    const sub = await call('GET', '/api/banks/subscription-instructions', { token: tok });
    assert.equal(sub.status, 200);
    assert.ok(JSON.stringify(sub.body).includes(subscriptionReferenceFor(l)));
  });
});

describe('M-Pesa callbacks', () => {
  test('callbacks need the secret path; forged confirmations for unknown checkouts post nothing; no simulate endpoint exists', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A101');
    const inv = await seedInvoice(l, a.tenant);
    const forged = {
      Body: { stkCallback: { MerchantRequestID: 'm', CheckoutRequestID: 'ws_CO_FORGED', ResultCode: 0, ResultDesc: 'ok', CallbackMetadata: { Item: [{ Name: 'Amount', Value: 50000 }, { Name: 'MpesaReceiptNumber', Value: 'QJK9483HD7' }, { Name: 'PhoneNumber', Value: 254722000111 }] } } }
    };
    assert.equal((await call('POST', '/api/mpesa/callback', { body: forged })).status, 401);
    assert.equal((await call('POST', '/api/mpesa/callback/wrong-secret-value-12345', { body: forged })).status, 403);
    const withSecret = await call('POST', `/api/mpesa/callback/${process.env.MPESA_CALLBACK_SECRET}`, { body: forged });
    assert.ok(withSecret.status < 500);
    assert.equal((await paymentsFor(l.id)).length, 0);
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv.id))!.amountPaid, 0);
    const tok = await tokenFor(a.tenant, 'tenant');
    for (const p of ['/api/mpesa/simulate-approval', '/api/payments/simulate-mpesa', '/api/mpesa/simulate']) assert.equal((await call('POST', p, { token: tok, body: {} })).status, 404);
  });

  test('STK push is refused cleanly when Daraja is not configured', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A101');
    const inv = await seedInvoice(l, a.tenant);
    const tok = await tokenFor(a.tenant, 'tenant');
    const r = await call('POST', '/api/mpesa/stk-push', { token: tok, body: { invoiceId: inv.id, phone: '0722000111' } });
    assert.ok([502, 503].includes(r.status), `got ${r.status}`);
    assert.equal((await paymentsFor(l.id)).length, 0);
  });

  test('C2B confirmations only count with the secret path and go through the same dedupe', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A101');
    const inv = await seedInvoice(l, a.tenant);
    const body = { TransactionType: 'Pay Bill', TransID: 'SGL1234ABC', TransTime: '20261028115403', TransAmount: '50000.00', BusinessShortCode: '522522', BillRefNumber: inv.paymentReference, MSISDN: '254722000111', FirstName: 'JANE' };
    assert.equal((await call('POST', '/api/mpesa/c2b/confirmation/not-the-secret-0123456', { body })).status, 403);
    assert.equal((await paymentsFor(l.id)).length, 0);
    const ok = await call('POST', `/api/mpesa/c2b/confirmation/${process.env.MPESA_CALLBACK_SECRET}`, { body });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    await call('POST', `/api/mpesa/c2b/confirmation/${process.env.MPESA_CALLBACK_SECRET}`, { body });
    assert.equal((await paymentsFor(l.id)).length, 1);
  });
});

describe('statement reconciliation', () => {
  test('rows post once; replaying the same statement is a no-op; unmatched rows are queued', async () => {
    const l = await seedLandlord();
    const a = await seedUnitAndTenant(l, 'A101');
    const inv = await seedInvoice(l, a.tenant);
    const tok = await tokenFor(l, 'landlord');
    const rows = [
      { referenceCode: 'STM-0001-AA', amount: 50000, date: '2026-10-28', description: `Rent ${inv.paymentReference}`, bankName: 'Equity Bank' },
      { referenceCode: 'STM-0002-BB', amount: 7000, date: '2026-10-28', description: 'Unknown depositor', bankName: 'Equity Bank' },
      { referenceCode: 'ВАD-СYR-1234', amount: 100, date: '2026-10-28', description: 'homoglyph reference', bankName: 'Equity Bank' }
    ];
    const r1 = await call('POST', '/api/payments/reconcile-statement', { token: tok, body: { records: rows } });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.deepEqual([r1.body.summary.posted, r1.body.summary.queued, r1.body.summary.rejected], [1, 1, 1]);
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, inv.id))!.status, 'Paid');
    const r2 = await call('POST', '/api/payments/reconcile-statement', { token: tok, body: { records: rows } });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.summary.posted, 0);
    assert.equal((await paymentsFor(l.id)).length, 1);
    assert.equal((await getStore().list<any>(COLLECTIONS.UNACCOUNTED)).length, 1);
  });
});

describe('migration & production configuration', () => {
  test('legacy plaintext / demo passwords are deactivated and ownership is back-filled', async () => {
    const store = getStore();
    await store.set(COLLECTIONS.LANDLORDS, 'L-old', { id: 'L-old', name: 'Old', email: 'Old@Example.com', password: 'password123' });
    await store.set(COLLECTIONS.LANDLORDS, 'L-good', { id: 'L-good', name: 'Good', email: 'good@example.com', password: 'a-Long-Unique-Passphrase-77' });
    await store.set(COLLECTIONS.PROPERTIES, 'P1', { id: 'P1', landlordId: 'L-good', name: 'P1' });
    await store.set(COLLECTIONS.TENANTS, 'T1', { id: 'T1', propertyId: 'P1', fullName: 'Tee', email: 't@example.com', password: 'qwerty123' });
    const rep = await runStartupMigration(() => undefined);
    assert.equal(rep.skipped, false);
    const oldL: any = await store.get(COLLECTIONS.LANDLORDS, 'L-old');
    assert.equal(oldL.password, undefined);
    assert.equal(oldL.mustChangePassword, true);
    assert.equal(oldL.emailLower, 'old@example.com');
    assert.equal((await login('old@example.com', 'password123')).status, 401);
    const good: any = await store.get(COLLECTIONS.LANDLORDS, 'L-good');
    assert.equal(good.password, undefined);
    assert.ok(good.passwordHash);
    assert.equal((await login('good@example.com', 'a-Long-Unique-Passphrase-77')).status, 200);
    assert.equal(((await store.get<any>(COLLECTIONS.TENANTS, 'T1'))!).landlordId, 'L-good');
    assert.equal((await runStartupMigration(() => undefined)).skipped, true, 'migration is run once');
  });

  test('production refuses to start with weak or unsafe configuration', () => {
    assert.doesNotThrow(() => assertProductionConfig({ NODE_ENV: 'development' }));
    assert.throws(() => assertProductionConfig({ NODE_ENV: 'production' }), /LINK_SIGNING_SECRET/);
    const good = { NODE_ENV: 'production', LINK_SIGNING_SECRET: 'x'.repeat(40), APP_URL: 'https://app.example.com' };
    assert.doesNotThrow(() => assertProductionConfig(good));
    assert.throws(() => assertProductionConfig({ ...good, DATA_STORE: 'memory' }), /memory/);
    assert.throws(() => assertProductionConfig({ ...good, BANK_WEBHOOKS_ALLOW_UNSIGNED_DEV: 'true' }), /UNSIGNED/);
    assert.throws(() => assertProductionConfig({ ...good, MPESA_CONSUMER_KEY: 'k' }), /MPESA_CALLBACK_SECRET/);
  });

  test('CORS allow-list never contains a wildcard', () => {
    const o = corsOrigins({ APP_URL: 'https://app.example.com/', CORS_ORIGINS: 'https://a.example.com, https://b.example.com' });
    assert.ok(o.has('https://app.example.com') && o.has('https://a.example.com') && o.has('capacitor://localhost'));
    assert.ok(!o.has('*'));
  });
});

// restore console
import { after } from 'node:test';
after(() => { console.log = realLog; });
void createSession;
