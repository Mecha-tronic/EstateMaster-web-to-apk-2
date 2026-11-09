import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { MemoryStore, setStore, getStore } from '../src/server/store.ts';
import { COLLECTIONS } from '../src/server/db.ts';
import {
  authenticateWebhook,
  verifyHmac,
  verifyRsa,
  ipAllowed,
  normalizeJengaIpn,
  normalizeKcbIpn,
  normalizeCoopNotification,
  normalizePesalink,
  normalizeMpesaStk,
  matchTransaction,
  normalizeKenyanPhone,
  PayloadError,
  referenceIdentity,
  isPlainReference,
  canonicalReference,
  type NormalizedBankTxn,
  type MatchInvoice,
  type WebhookSecurityConfig
} from '../src/lib/bankService.ts';
import {
  processInboundTransaction,
  assignUnaccountedPayment,
  recordManualPayment,
  reversePayment
} from '../src/server/ledger.ts';
import {
  createPasswordCredential,
  verifyPasswordCredential,
  validatePasswordStrength,
  sanitizeUserForClient,
  generateSecurityOtp
} from '../src/lib/security.ts';
import {
  createSession,
  resolveAuth,
  createChallenge,
  verifyChallenge,
  RateLimiter,
  isPublicRoute,
  signLink,
  verifyLink,
  revokeAllSessionsForUser
} from '../src/server/auth.ts';

// ---------------------------------------------------------------- fixtures
const wcfg = (over: Partial<WebhookSecurityConfig> = {}): WebhookSecurityConfig => ({
  hmacHeader: 'x-sig',
  hmacEncoding: 'hex',
  rsaHeader: 'x-rsa',
  ipAllowlist: [],
  maxSkewSeconds: 600,
  ...over
});

const baseTxn = (over: Partial<NormalizedBankTxn> = {}): NormalizedBankTxn => ({
  bank: 'equity',
  reference: 'EQ12345678',
  amount: 50000,
  currency: 'KES',
  direction: 'credit',
  status: 'success',
  channel: 'BANK_TRANSFER',
  narration: '',
  customerReference: '',
  transactionDate: new Date().toISOString(),
  origin: 'webhook',
  ...over
});

async function seed() {
  const s = getStore();
  await s.set(COLLECTIONS.LANDLORDS, 'L1', { id: 'L1', name: 'Land Lord', email: 'l1@x.com', accountNumber: '0110000001' });
  await s.set(COLLECTIONS.LANDLORDS, 'L2', { id: 'L2', name: 'Other Lord', email: 'l2@x.com', accountNumber: '0220000002' });
  await s.set(COLLECTIONS.TENANTS, 'T1', { id: 'T1', landlordId: 'L1', fullName: 'Jane', email: 'jane@x.com', phone: '+254712345678', unitNumber: 'A101' });
  await s.set(COLLECTIONS.TENANTS, 'T2', { id: 'T2', landlordId: 'L1', fullName: 'Joe', email: 'joe@x.com', phone: '+254722000111', unitNumber: 'B202' });
  await s.set(COLLECTIONS.TENANTS, 'T3', { id: 'T3', landlordId: 'L2', fullName: 'Other', email: 'o@x.com', phone: '+254733000222', unitNumber: 'A101' });
  const inv = (id: string, no: string, tenantId: string, landlordId: string, unit: string, total: number) => ({
    id, invoiceNumber: no, tenantId, landlordId, tenantName: tenantId, unitNumber: unit, totalAmount: total, amountPaid: 0, status: 'Unpaid', issueDate: '2026-10-01'
  });
  await s.set(COLLECTIONS.INVOICES, 'I1', inv('I1', 'INV-100001', 'T1', 'L1', 'A101', 50000));
  await s.set(COLLECTIONS.INVOICES, 'I2', inv('I2', 'INV-100002', 'T2', 'L1', 'B202', 30000));
  await s.set(COLLECTIONS.INVOICES, 'I3', inv('I3', 'INV-100003', 'T3', 'L2', 'A101', 40000));
}

const openInvoices = async (): Promise<MatchInvoice[]> => {
  const s = getStore();
  const [inv, ten] = await Promise.all([s.list<any>(COLLECTIONS.INVOICES), s.list<any>(COLLECTIONS.TENANTS)]);
  const ph = new Map(ten.map((t: any) => [t.id, t.phone]));
  return inv.map((i: any) => ({ ...i, tenantPhone: ph.get(i.tenantId) }));
};

beforeEach(async () => {
  setStore(new MemoryStore());
  await seed();
});

// ---------------------------------------------------------------- webhook authenticity
describe('webhook authenticity', () => {
  const body = Buffer.from(JSON.stringify({ transaction: { reference: 'X1', amount: 10 } }));

  test('HMAC-SHA256 accepts a correct signature and rejects tampering', () => {
    const secret = 's3cret-value';
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    assert.equal(verifyHmac(body, sig, secret, 'hex'), true);
    assert.equal(verifyHmac(body, `sha256=${sig}`, secret, 'hex'), true);
    assert.equal(verifyHmac(Buffer.from(body.toString().replace('10', '99')), sig, secret, 'hex'), false);
    assert.equal(verifyHmac(body, sig, 'wrong-secret', 'hex'), false);
    assert.equal(verifyHmac(body, 'deadbeef', secret, 'hex'), false);
  });

  test('RSA-SHA256 accepts a bank signature and rejects forgeries', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const sig = crypto.sign('RSA-SHA256', body, privateKey).toString('base64');
    assert.equal(verifyRsa(body, sig, pub), true);
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const forged = crypto.sign('RSA-SHA256', body, other.privateKey).toString('base64');
    assert.equal(verifyRsa(body, forged, pub), false);
    assert.equal(verifyRsa(Buffer.from('{}'), sig, pub), false);
  });

  test('FAILS CLOSED when no security control is configured (production and default dev)', () => {
    const r = authenticateWebhook({ cfg: wcfg(), rawBody: body, headers: {}, sourceIp: '1.2.3.4', isProduction: true });
    assert.equal(r.ok, false);
    const r2 = authenticateWebhook({ cfg: wcfg(), rawBody: body, headers: {}, sourceIp: '1.2.3.4', isProduction: false });
    assert.equal(r2.ok, false);
  });

  test('unsigned dev override never works in production', () => {
    const dev = authenticateWebhook({ cfg: wcfg(), rawBody: body, headers: {}, sourceIp: '1.1.1.1', isProduction: false, allowInsecureDev: true });
    assert.equal(dev.ok, true);
    const prod = authenticateWebhook({ cfg: wcfg(), rawBody: body, headers: {}, sourceIp: '1.1.1.1', isProduction: true, allowInsecureDev: true });
    assert.equal(prod.ok, false);
  });

  test('every configured control must pass (HMAC + IP + basic)', () => {
    const secret = 'abc123xyz-secret';
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const cfg = wcfg({ hmacSecret: secret, ipAllowlist: ['10.0.0.0/24'], basicUser: 'u', basicPass: 'p' });
    const basic = 'Basic ' + Buffer.from('u:p').toString('base64');
    const ok = authenticateWebhook({ cfg, rawBody: body, headers: { 'x-sig': sig, authorization: basic }, sourceIp: '10.0.0.77', isProduction: true });
    assert.equal(ok.ok, true);
    assert.equal(authenticateWebhook({ cfg, rawBody: body, headers: { 'x-sig': sig, authorization: basic }, sourceIp: '10.0.1.77', isProduction: true }).ok, false);
    assert.equal(authenticateWebhook({ cfg, rawBody: body, headers: { 'x-sig': sig }, sourceIp: '10.0.0.77', isProduction: true }).ok, false);
    assert.equal(authenticateWebhook({ cfg, rawBody: body, headers: { authorization: basic }, sourceIp: '10.0.0.77', isProduction: true }).ok, false);
  });

  test('stale timestamps are rejected (replay window)', () => {
    const secret = 'abc123xyz-secret';
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const cfg = wcfg({ hmacSecret: secret, timestampHeader: 'x-ts', maxSkewSeconds: 300 });
    const fresh = String(Math.floor(Date.now() / 1000));
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    assert.equal(authenticateWebhook({ cfg, rawBody: body, headers: { 'x-sig': sig, 'x-ts': fresh }, sourceIp: '1.1.1.1', isProduction: true }).ok, true);
    assert.equal(authenticateWebhook({ cfg, rawBody: body, headers: { 'x-sig': sig, 'x-ts': old }, sourceIp: '1.1.1.1', isProduction: true }).ok, false);
  });

  test('CIDR matching', () => {
    assert.equal(ipAllowed('::ffff:10.1.2.3', ['10.1.2.0/24']), true);
    assert.equal(ipAllowed('10.1.3.3', ['10.1.2.0/24']), false);
    assert.equal(ipAllowed('8.8.8.8', ['8.8.8.8']), true);
  });
});

// ---------------------------------------------------------------- normalisation
describe('payload normalisation', () => {
  test('Jenga IPN', () => {
    const t = normalizeJengaIpn({
      callbackType: 'IPN',
      customer: { name: 'JANE W', mobileNumber: '0712345678', reference: 'EM-A101-ABCD' },
      transaction: { date: '2026-10-28 11:54:03', reference: 'jg-9001 ', paymentMode: 'PAYBILL', amount: '50,000.00', billNumber: '123', status: 'SUCCESS', remarks: 'rent' },
      bank: { reference: 'BNK1', transactionType: 'C', account: '0110000001' }
    });
    assert.equal(t.bank, 'equity');
    assert.equal(t.reference, 'JG-9001');
    assert.equal(t.amount, 50000);
    assert.equal(t.channel, 'PAYBILL');
    assert.equal(t.payerPhone, '254712345678');
    assert.equal(t.transactionDate, '2026-10-28T08:54:03.000Z'); // EAT -> UTC
    assert.equal(t.direction, 'credit');
  });

  test('KCB Buni IPN (documented fields)', () => {
    const t = normalizeKcbIpn({
      transactionReference: 'KCB777', requestId: 'r1', channelCode: '4400', timestamp: '20261028115403', transactionAmount: '12500', currency: 'KES',
      customerReference: 'INV-100002', customerName: 'JOE', customerMobileNumber: '254722000111', balance: '1', narration: 'Rent', creditAccountIdentifier: '0220000002',
      organizationShortCode: '522522', tillNumber: ''
    });
    assert.equal(t.bank, 'kcb');
    assert.equal(t.amount, 12500);
    assert.equal(t.customerReference, 'INV-100002');
    assert.equal(t.direction, 'credit');
  });

  test('Co-op, PesaLink, M-Pesa map to the same model', () => {
    const c = normalizeCoopNotification({ TransactionId: 'CP1000042', Amount: 1000, Currency: 'KES', Narration: 'unit A101', AcctNo: '1', DrCr: 'CR' });
    assert.equal(c.bank, 'coop');
    const p = normalizePesalink({ transactionId: 'PL1000042', amount: 2000, narration: 'rent', senderName: 'X' });
    assert.equal(p.channel, 'PESALINK');
    const m = normalizeMpesaStk({ ResultCode: 0, CallbackMetadata: { Item: [{ Name: 'MpesaReceiptNumber', Value: 'QJK9483HD7' }, { Name: 'Amount', Value: 1500 }, { Name: 'PhoneNumber', Value: 254712345678 }, { Name: 'TransactionDate', Value: 20261028115403 }] } }, 'A101');
    assert.equal(m.bank, 'mpesa');
    assert.equal(m.reference, 'QJK9483HD7');
    assert.equal(m.amount, 1500);
  });

  test('reference identity ignores case, spacing, separators and invisible characters; rejects look-alikes', () => {
    const id = (r: string) => referenceIdentity(r);
    assert.equal(id('FT26301ABC'), id(' ft-26301-abc '));
    assert.equal(id('FT26301ABC'), id('F\u200BT 26301 ABC'));
    assert.equal(id('FT26301ABC'), id('\uFF26\uFF34\uFF12\uFF16\uFF13\uFF10\uFF11\uFF21\uFF22\uFF23')); // full-width forms fold via NFKC
    assert.notEqual(id('FT26301ABC'), id('FT26301ABD'));
    assert.equal(isPlainReference(canonicalReference('FT26301\u0410BC')), false); // Cyrillic A
    assert.equal(isPlainReference(canonicalReference('---')), false);
    assert.throws(() => normalizePesalink({ transactionId: 'PL10\u0410042', amount: 100 }), PayloadError);
  });

  test('malformed payloads are rejected, not coerced', () => {
    assert.throws(() => normalizeJengaIpn({}), PayloadError);
    assert.throws(() => normalizeKcbIpn({ transactionReference: 'A', transactionAmount: '-5' }), PayloadError);
    assert.throws(() => normalizeKcbIpn({ transactionReference: 'A', transactionAmount: 'abc' }), PayloadError);
    assert.throws(() => normalizeKcbIpn({ transactionReference: 'A'.repeat(100), transactionAmount: '5' }), PayloadError);
    assert.throws(() => normalizePesalink({ transactionId: 'X', amount: 1e12 }), PayloadError);
  });

  test('phone normalisation', () => {
    for (const v of ['0712345678', '+254 712 345 678', '254712345678', '712345678', '2540712345678']) assert.equal(normalizeKenyanPhone(v), '254712345678');
  });
});

// ---------------------------------------------------------------- matching
describe('auto-matching', () => {
  test('invoice number in the reference -> auto at 100', async () => {
    const m = matchTransaction(baseTxn({ amount: 50000, customerReference: 'INV-100001' }), await openInvoices());
    assert.equal(m.decision, 'auto');
    assert.equal(m.invoice?.id, 'I1');
    assert.equal(m.confidence, 100);
  });

  test('invoice number inside free-text narration', async () => {
    const m = matchTransaction(baseTxn({ amount: 30000, narration: 'RENT FOR inv-100002 THANKS' }), await openInvoices());
    assert.equal(m.invoice?.id, 'I2');
  });

  test('payer phone matches tenant -> auto at 80', async () => {
    const m = matchTransaction(baseTxn({ amount: 30000, payerPhone: '0722000111' }), await openInvoices());
    assert.equal(m.decision, 'auto');
    assert.equal(m.invoice?.id, 'I2');
    assert.equal(m.method, 'phone-number');
  });

  test('unit number alone is NOT enough, but with the exact amount it is', async () => {
    const weak = matchTransaction(baseTxn({ amount: 12345, narration: 'unit B202' }), await openInvoices());
    assert.equal(weak.decision, 'queue');
    assert.equal(weak.suggestion?.invoice.id, 'I2');
    const strong = matchTransaction(baseTxn({ amount: 30000, narration: 'unit B202' }), await openInvoices());
    assert.equal(strong.decision, 'auto');
    assert.equal(strong.method, 'unit-number');
  });

  test('same unit number at two landlords is disambiguated by the credited account', async () => {
    const landlords = [
      { id: 'L1', accountNumber: '0110000001' },
      { id: 'L2', accountNumber: '0220000002' }
    ];
    const m = matchTransaction(baseTxn({ amount: 40000, narration: 'A101', customerReference: 'A101', creditAccount: '0220000002' }), await openInvoices(), landlords);
    assert.equal(m.invoice?.id, 'I3');
  });

  test('ambiguous references go to the queue rather than guessing', async () => {
    const m = matchTransaction(baseTxn({ amount: 40000, narration: 'A101', customerReference: 'A101' }), await openInvoices());
    assert.equal(m.decision, 'queue');
  });

  test('overpayment is never auto-posted', async () => {
    const m = matchTransaction(baseTxn({ amount: 60000, customerReference: 'INV-100001' }), await openInvoices());
    assert.equal(m.decision, 'queue');
    assert.match(m.reason, /exceeds/);
  });

  test('"unit 1" does not match unit 101 / A101 (no substring false positives)', async () => {
    const m = matchTransaction(baseTxn({ amount: 50000, narration: 'unit 1' }), [
      { id: 'X', invoiceNumber: 'INV-1', landlordId: 'L1', tenantId: 'T', tenantName: 'T', unitNumber: '101', totalAmount: 50000, status: 'Unpaid' }
    ]);
    assert.equal(m.decision, 'queue');
    assert.equal(m.suggestion, undefined);
  });

  test('no match -> queue', async () => {
    const m = matchTransaction(baseTxn({ narration: 'gift' }), await openInvoices());
    assert.equal(m.decision, 'queue');
  });
});

// ---------------------------------------------------------------- ledger
describe('ledger: anti-double-entry & invoice adjustment', () => {
  const post = (txn: NormalizedBankTxn, invoiceId = 'I1') =>
    processInboundTransaction(txn, { kind: 'post', invoiceId, method: 'invoice-reference', confidence: 100 }, { verifiedVia: 'bank-webhook', signatureVerified: true });

  test('posts, adjusts the invoice, and writes the audit trail', async () => {
    const r = await post(baseTxn({ amount: 20000 }));
    assert.equal(r.outcome, 'posted');
    const inv = await getStore().get<any>(COLLECTIONS.INVOICES, 'I1');
    assert.equal(inv.amountPaid, 20000);
    assert.equal(inv.status, 'Partial');
    assert.equal(r.payment?.bankAudit?.signatureVerified, true);
    assert.equal(r.payment?.verificationSource, 'bank-webhook');
  });

  test('the same reference can never be redeemed twice (sequential)', async () => {
    assert.equal((await post(baseTxn({ amount: 10000 }))).outcome, 'posted');
    const again = await post(baseTxn({ amount: 10000 }));
    assert.equal(again.outcome, 'duplicate');
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, 'I1')).amountPaid, 10000);
    assert.equal((await getStore().list(COLLECTIONS.PAYMENTS)).length, 1);
  });

  test('...even when 25 identical webhooks arrive concurrently', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => post(baseTxn({ amount: 10000 }))));
    assert.equal(results.filter((r) => r.outcome === 'posted').length, 1);
    assert.equal(results.filter((r) => r.outcome === 'duplicate').length, 24);
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, 'I1')).amountPaid, 10000);
  });

  test('reference casing / whitespace variants are the same reference', async () => {
    assert.equal((await post(baseTxn({ reference: 'abc 12345 6' }))).outcome, 'posted');
    assert.equal((await post(baseTxn({ reference: 'ABC123456' }))).outcome, 'duplicate');
  });

  test('a manual entry blocks a later webhook with the same reference (and vice versa)', async () => {
    const m = await recordManualPayment({ landlordId: 'L1', invoiceId: 'I1', amount: 10000, paymentMethod: 'Bank Transfer', referenceCode: 'EQ-MANUAL-1' });
    assert.equal(m.outcome, 'posted');
    assert.equal((await post(baseTxn({ reference: 'EQ-MANUAL-1', amount: 10000 }))).outcome, 'duplicate');
    assert.equal((await post(baseTxn({ reference: 'WEBHOOK-FIRST', amount: 5000 }))).outcome, 'posted');
    assert.equal((await recordManualPayment({ landlordId: 'L1', invoiceId: 'I1', amount: 5000, paymentMethod: 'Bank Transfer', referenceCode: 'webhook-first' })).outcome, 'duplicate');
  });

  test('payment that would over-pay is diverted to the queue, never applied', async () => {
    await post(baseTxn({ reference: 'R-A', amount: 45000 }));
    const r = await post(baseTxn({ reference: 'R-B', amount: 10000 }));
    assert.equal(r.outcome, 'queued');
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, 'I1')).amountPaid, 45000);
  });

  test('two different payments racing for the last of an invoice cannot over-pay it', async () => {
    const rs = await Promise.all([
      post(baseTxn({ reference: 'RACE-1', amount: 30000 })),
      post(baseTxn({ reference: 'RACE-2', amount: 30000 }))
    ]);
    assert.deepEqual(rs.map((r) => r.outcome).sort(), ['posted', 'queued']);
    const inv = await getStore().get<any>(COLLECTIONS.INVOICES, 'I1');
    assert.ok(inv.amountPaid <= inv.totalAmount);
  });

  test('final payment closes the invoice as Paid', async () => {
    await post(baseTxn({ reference: 'P1', amount: 20000 }));
    await post(baseTxn({ reference: 'P2', amount: 30000 }));
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, 'I1')).status, 'Paid');
  });

  test('queued deposit: landlord assigns it; other landlords cannot touch it', async () => {
    const q = await processInboundTransaction(baseTxn({ reference: 'Q1', amount: 30000, narration: 'mystery' }), { kind: 'queue', landlordId: 'L1', reason: 'no match' }, { verifiedVia: 'bank-webhook' });
    assert.equal(q.outcome, 'queued');
    const id = q.unaccounted!.id;

    const wrong = await assignUnaccountedPayment({ landlordId: 'L2', unaccountedId: id, tenantId: 'T3' });
    assert.equal(wrong.outcome, 'rejected');

    const cross = await assignUnaccountedPayment({ landlordId: 'L1', unaccountedId: id, tenantId: 'T3' });
    assert.equal(cross.outcome, 'rejected'); // tenant of another landlord

    const ok = await assignUnaccountedPayment({ landlordId: 'L1', unaccountedId: id, tenantId: 'T2' });
    assert.equal(ok.outcome, 'posted');
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, 'I2')).status, 'Paid');

    const twice = await assignUnaccountedPayment({ landlordId: 'L1', unaccountedId: id, tenantId: 'T2' });
    assert.equal(twice.outcome, 'rejected');
    assert.equal((await getStore().list(COLLECTIONS.PAYMENTS)).length, 1);
  });

  test('a queued reference is also protected from re-delivery', async () => {
    await processInboundTransaction(baseTxn({ reference: 'Q2' }), { kind: 'queue', landlordId: 'L1', reason: 'x' }, { verifiedVia: 'bank-webhook' });
    const again = await processInboundTransaction(baseTxn({ reference: 'Q2' }), { kind: 'queue', landlordId: 'L1', reason: 'x' }, { verifiedVia: 'bank-webhook' });
    assert.equal(again.outcome, 'duplicate');
    assert.equal((await getStore().list(COLLECTIONS.UNACCOUNTED)).length, 1);
  });

  test('landlords cannot pay or record against another landlord’s invoice', async () => {
    const r = await recordManualPayment({ landlordId: 'L2', invoiceId: 'I1', amount: 100, paymentMethod: 'Cash' });
    assert.equal(r.outcome, 'rejected');
  });

  test('manual entry: placeholder refs, zero/negative/over amounts are refused', async () => {
    for (const referenceCode of ['REF-123456', 'TEST12345', 'abc']) {
      assert.equal((await recordManualPayment({ landlordId: 'L1', invoiceId: 'I1', amount: 100, paymentMethod: 'M-Pesa', referenceCode })).outcome, 'rejected');
    }
    assert.equal((await recordManualPayment({ landlordId: 'L1', invoiceId: 'I1', amount: 0, paymentMethod: 'Cash' })).outcome, 'rejected');
    assert.equal((await recordManualPayment({ landlordId: 'L1', invoiceId: 'I1', amount: -5, paymentMethod: 'Cash' })).outcome, 'rejected');
    assert.equal((await recordManualPayment({ landlordId: 'L1', invoiceId: 'I1', amount: 50001, paymentMethod: 'Cash' })).outcome, 'rejected');
  });

  test('cash payments get unique generated references (no collisions)', async () => {
    const a = await recordManualPayment({ landlordId: 'L1', invoiceId: 'I1', amount: 1000, paymentMethod: 'Cash' });
    const b = await recordManualPayment({ landlordId: 'L1', invoiceId: 'I1', amount: 1000, paymentMethod: 'Cash' });
    assert.equal(a.outcome, 'posted');
    assert.equal(b.outcome, 'posted');
    assert.notEqual(a.payment!.referenceCode, b.payment!.referenceCode);
  });

  test('reversal restores the balance but keeps the reference burned', async () => {
    const p = await post(baseTxn({ reference: 'REV-1', amount: 50000 }));
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, 'I1')).status, 'Paid');
    const rev = await reversePayment('L1', p.payment!.id, 'bounced');
    assert.equal(rev.outcome, 'posted');
    const inv = await getStore().get<any>(COLLECTIONS.INVOICES, 'I1');
    assert.equal(inv.amountPaid, 0);
    assert.equal(inv.status, 'Unpaid');
    assert.equal((await post(baseTxn({ reference: 'REV-1', amount: 50000 }))).outcome, 'duplicate');
    assert.equal((await reversePayment('L2', p.payment!.id, 'x')).outcome, 'rejected');
  });

  test('debits, failures and foreign currency are not posted as rent', async () => {
    assert.equal((await post(baseTxn({ reference: 'D1', direction: 'debit' }))).outcome, 'ignored');
    assert.equal((await post(baseTxn({ reference: 'F1', status: 'failed' }))).outcome, 'ignored');
    const usd = await post(baseTxn({ reference: 'U1', currency: 'USD', amount: 100 }));
    assert.equal(usd.outcome, 'queued');
    assert.equal((await getStore().get<any>(COLLECTIONS.INVOICES, 'I1')).amountPaid, 0);
  });
});

// ---------------------------------------------------------------- credentials & sessions
describe('credentials, sessions, challenges', () => {
  test('scrypt credentials verify, never accept plaintext/master passwords', async () => {
    const cred = await createPasswordCredential('Correct-Horse-9');
    assert.equal((await verifyPasswordCredential('Correct-Horse-9', cred)).valid, true);
    assert.equal((await verifyPasswordCredential('correct-horse-9', cred)).valid, false);
    assert.equal((await verifyPasswordCredential('password123', cred)).valid, false);
    assert.equal((await verifyPasswordCredential('password123', { passwordHash: undefined })).valid, false);
    assert.equal((await verifyPasswordCredential('anything', undefined)).valid, false);
    assert.notEqual(cred.passwordHash, (await createPasswordCredential('Correct-Horse-9')).passwordHash); // unique salts
  });

  test('legacy PBKDF2 hashes still verify and are flagged for upgrade', async () => {
    const salt = 'abcd1234abcd1234';
    const hash = crypto.pbkdf2Sync('Old-Password-1', salt, 10000, 64, 'sha512').toString('hex');
    const r = await verifyPasswordCredential('Old-Password-1', { passwordHash: hash, passwordSalt: salt });
    assert.deepEqual(r, { valid: true, needsUpgrade: true });
    assert.equal((await verifyPasswordCredential('nope', { passwordHash: hash, passwordSalt: salt })).valid, false);
  });

  test('password policy', () => {
    assert.ok(validatePasswordStrength('short1'));
    assert.ok(validatePasswordStrength('password123'));
    assert.ok(validatePasswordStrength('aaaaaaaaaaaa'));
    assert.ok(validatePasswordStrength('abcdefghijkl'));
    assert.ok(validatePasswordStrength('jane.wanjiku99', { email: 'jane.wanjiku@x.com' }));
    assert.equal(validatePasswordStrength('Tr1cky-Phrase!'), null);
  });

  test('sanitizeUserForClient strips every secret', () => {
    const u: any = sanitizeUserForClient({ id: 'x', email: 'a@b.c', password: 'p', passwordHash: 'h', passwordSalt: 's', passwordAlgo: 'a', twoFactorSecret: 't', lockoutUntil: 'l', failedLoginAttempts: 3, name: 'n' } as any);
    for (const k of ['password', 'passwordHash', 'passwordSalt', 'passwordAlgo', 'twoFactorSecret', 'lockoutUntil', 'failedLoginAttempts']) assert.equal(k in u, false, k);
    assert.equal(u.name, 'n');
  });

  test('OTPs are 6 digits, zero-padded', () => {
    for (let i = 0; i < 200; i++) assert.match(generateSecurityOtp(), /^\d{6}$/);
  });

  const fakeReq = (token?: string): any => ({ method: 'GET', path: '/x', ip: '1.1.1.1', headers: { 'user-agent': 'Mozilla/5.0', ...(token ? { authorization: `Bearer ${token}` } : {}) } });

  test('sessions: opaque token resolves; unknown/garbage/expired/revoked do not; only a hash is stored', async () => {
    const user: any = { id: 'L1', email: 'l1@x.com' };
    const { token } = await createSession(fakeReq(), user, 'landlord');
    assert.equal((await resolveAuth(fakeReq(token)))?.userId, 'L1');
    assert.equal(await resolveAuth(fakeReq('a'.repeat(64))), null);
    assert.equal(await resolveAuth(fakeReq('short')), null);
    assert.equal(await resolveAuth(fakeReq()), null);
    const stored = JSON.stringify(await getStore().list(COLLECTIONS.SESSIONS));
    assert.equal(stored.includes(token), false);

    // a session for a deleted account is dead
    await getStore().delete(COLLECTIONS.LANDLORDS, 'L1');
    assert.equal(await resolveAuth(fakeReq(token)), null);
  });

  test('sessions: revoke-all kills them', async () => {
    const user: any = { id: 'L2', email: 'l2@x.com' };
    const a = await createSession(fakeReq(), user, 'landlord');
    const b = await createSession(fakeReq(), user, 'landlord');
    assert.equal(await revokeAllSessionsForUser('L2'), 2);
    assert.equal(await resolveAuth(fakeReq(a.token)), null);
    assert.equal(await resolveAuth(fakeReq(b.token)), null);
  });

  test('a landlord token cannot be used as a tenant (role pinned to the session)', async () => {
    const { token } = await createSession(fakeReq(), { id: 'T1', email: 'jane@x.com' } as any, 'tenant');
    const a = await resolveAuth(fakeReq(token));
    assert.equal(a?.role, 'tenant');
  });

  test('2FA challenge: right code once; wrong codes burn attempts and then lock; codes are single-use', async () => {
    const user: any = { id: 'T1', email: 'jane@x.com' };
    const c = await createChallenge({ kind: 'login-2fa', user, role: 'tenant', maxAttempts: 3 });
    assert.equal((await verifyChallenge(c.handle, '000000' === c.otp ? '111111' : '000000', 'login-2fa')).ok, false);
    const ok = await verifyChallenge(c.handle, c.otp, 'login-2fa');
    assert.equal(ok.ok, true);
    assert.equal((await verifyChallenge(c.handle, c.otp, 'login-2fa')).ok, false); // consumed

    const c2 = await createChallenge({ kind: 'login-2fa', user, role: 'tenant', maxAttempts: 3 });
    const wrong = c2.otp === '123456' ? '654321' : '123456';
    for (let i = 0; i < 3; i++) await verifyChallenge(c2.handle, wrong, 'login-2fa');
    const locked = await verifyChallenge(c2.handle, c2.otp, 'login-2fa'); // even the right code is refused now
    assert.equal(locked.ok, false);
  });

  test('challenge kinds cannot be swapped', async () => {
    const user: any = { id: 'T1', email: 'jane@x.com' };
    const c = await createChallenge({ kind: 'step-up', user, role: 'tenant' });
    assert.equal((await verifyChallenge(c.handle, c.otp, 'login-2fa')).ok, false);
  });

  test('rate limiter blocks after the limit and recovers after the window', () => {
    const rl = new RateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) assert.equal(rl.hit('k', 5, 60_000, t0 + i).allowed, true);
    assert.equal(rl.hit('k', 5, 60_000, t0 + 10).allowed, false);
    assert.equal(rl.hit('k', 5, 60_000, t0 + 61_000).allowed, true);
  });

  test('route gate: only intended routes are public', () => {
    for (const [m, p] of [['GET', '/api/health'], ['POST', '/api/auth/login'], ['POST', '/api/banks/equity/callback'], ['POST', '/api/mpesa/callback/s3cretPathValue1234']] as const) assert.equal(isPublicRoute(m, p), true, `${m} ${p}`);
    for (const [m, p] of [['GET', '/api/tenants'], ['GET', '/api/payments'], ['POST', '/api/payments/record'], ['POST', '/api/mpesa/callback'], ['POST', '/api/mpesa/callback/short'], ['POST', '/api/mpesa/simulate-approval'], ['POST', '/api/emails/send'], ['GET', '/api/landlords'], ['POST', '/api/banks/verify-transaction'], ['GET', '/api/banks/status'], ['PATCH', '/api/landlords/x'], ['DELETE', '/api/tenants/x']] as const) assert.equal(isPublicRoute(m, p), false, `${m} ${p}`);
  });

  test('signed links: valid, tampered, expired', () => {
    const { exp, sig } = signLink('receipt:p1', 60_000);
    assert.equal(verifyLink('receipt:p1', exp, sig), true);
    assert.equal(verifyLink('receipt:p2', exp, sig), false);
    assert.equal(verifyLink('receipt:p1', exp + 1, sig), false);
    const expired = signLink('receipt:p1', -1000);
    assert.equal(verifyLink('receipt:p1', expired.exp, expired.sig), false);
  });
});
