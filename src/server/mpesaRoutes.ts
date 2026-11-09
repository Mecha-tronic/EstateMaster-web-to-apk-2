/**
 * Safaricom Daraja integration (STK push + C2B), hardened.
 *
 *  - NO hard-coded credentials, NO "simulation mode" that fabricates receipts, NO simulate-approval endpoint.
 *  - Provider callbacks arrive on a secret path (`MPESA_CALLBACK_SECRET`) and are then CONFIRMED against Daraja's
 *    STK Query API before any money is posted. Amount and phone are checked against the persisted checkout.
 *  - Checkouts are persisted (survive restarts / multiple instances) and single-use.
 *  - Rent is posted only through the ledger (idempotent by M-Pesa receipt); subscriptions only on a verified payment.
 */
import crypto from 'crypto';
import { getStore } from './store.js';
import { COLLECTIONS } from './db.js';
import { AuthContext, ReqLike, ResLike, clientIp, rateLimit, requireLandlord } from './auth.js';
import { App, body, h, num, str } from './http.js';
import { logSecurityEvent } from './audit.js';
import { activateSubscription, PLATFORM_SUBSCRIPTION_AMOUNT } from './subscription.js';
import { processInboundTransaction, refKey } from './ledger.js';
import { routeInboundCredit, BankRouteDeps, writeWebhookAudit } from './bankRoutes.js';
import { normalizeMpesaC2B, normalizeMpesaStk, remainingBalance, PayloadError, NormalizedBankTxn } from '../lib/bankService.js';
import { normalizeKenyanPhone, isValidKenyanPhone } from './guards.js';
import { timingSafeEqualStrings } from '../lib/security.js';
import type { Invoice, Landlord, Payment, Tenant } from '../types.js';

interface Checkout {
  id: string; // CheckoutRequestID
  merchantRequestId: string;
  type: 'rent' | 'subscription';
  landlordId?: string; invoiceId?: string; tenantId?: string;
  initiatedBy: string; initiatedRole: 'landlord' | 'tenant';
  phone: string; amount: number; accountRef: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  resultDesc?: string; receiptCode?: string; paymentId?: string;
  /** Callback said success but Daraja could not be reached to confirm; the poller finishes the job. */
  callbackSucceeded?: boolean; callbackReceipt?: string;
  createdAt: string; lastQueryAt?: string;
}

const clean = (v?: string) => (v || '').trim().replace(/^["'`]|["'`]$/g, '').trim();

export function getDarajaConfig() {
  const consumerKey = clean(process.env.MPESA_CONSUMER_KEY);
  const consumerSecret = clean(process.env.MPESA_CONSUMER_SECRET);
  const passkey = clean(process.env.MPESA_PASSKEY);
  const shortcode = clean(process.env.MPESA_SHORTCODE);
  const isProduction = ['production', 'live'].includes(clean(process.env.MPESA_ENVIRONMENT).toLowerCase());
  return {
    consumerKey, consumerSecret, passkey, shortcode,
    partyB: clean(process.env.MPESA_PARTYB) || shortcode,
    transactionType: clean(process.env.MPESA_TRANSACTION_TYPE) || 'CustomerPayBillOnline',
    isConfigured: Boolean(consumerKey && consumerSecret && passkey && shortcode),
    isProduction,
    env: isProduction ? 'production' : 'sandbox',
    baseUrl: isProduction ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke',
    callbackSecret: clean(process.env.MPESA_CALLBACK_SECRET)
  };
}

let tokenCache: { token: string; expiresAt: number } | null = null;
let lastAuthError: string | null = null;

async function timedFetch(url: string, init: RequestInit, ms = 12_000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

async function getDarajaToken(): Promise<string | null> {
  const c = getDarajaConfig();
  if (!c.isConfigured) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  try {
    const r = await timedFetch(`${c.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString('base64')}` }
    });
    if (!r.ok) { lastAuthError = `Daraja OAuth rejected (${r.status}). Check the consumer key/secret and environment.`; return null; }
    const d = (await r.json()) as { access_token?: string; expires_in?: string };
    if (!d.access_token) { lastAuthError = 'Daraja OAuth returned no token.'; return null; }
    tokenCache = { token: d.access_token, expiresAt: Date.now() + (parseInt(d.expires_in || '3599', 10) * 1000) };
    lastAuthError = null;
    return d.access_token;
  } catch (e: any) {
    lastAuthError = `Daraja network error: ${e?.name === 'AbortError' ? 'timeout' : e?.message}`;
    return null;
  }
}

function darajaTimestamp(): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date());
  const m: Record<string, string> = {};
  parts.forEach((p) => { m[p.type] = p.value; });
  return `${m.year}${m.month}${m.day}${m.hour}${m.minute}${m.second}`;
}

/** Daraja STK Query: the authoritative answer to "did this checkout succeed?". */
async function stkQuery(checkoutRequestId: string): Promise<{ state: 'success' | 'failed' | 'pending' | 'unknown'; desc?: string }> {
  const c = getDarajaConfig();
  const token = await getDarajaToken();
  if (!token) return { state: 'unknown', desc: lastAuthError || 'Daraja not reachable' };
  const ts = darajaTimestamp();
  try {
    const r = await timedFetch(`${c.baseUrl}/mpesa/stkpushquery/v1/query`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ BusinessShortCode: c.shortcode, Password: Buffer.from(`${c.shortcode}${c.passkey}${ts}`).toString('base64'), Timestamp: ts, CheckoutRequestID: checkoutRequestId })
    });
    const d: any = await r.json().catch(() => ({}));
    if (d?.errorCode === '500.001.1001' || /still under processing/i.test(String(d?.errorMessage || ''))) return { state: 'pending', desc: 'The request is still being processed.' };
    if (d?.ResultCode === undefined) return { state: 'unknown', desc: String(d?.errorMessage || d?.ResponseDescription || 'No result').slice(0, 200) };
    return Number(d.ResultCode) === 0 ? { state: 'success', desc: d.ResultDesc } : { state: 'failed', desc: String(d.ResultDesc || 'Payment was not completed.') };
  } catch (e: any) {
    return { state: 'unknown', desc: e?.message };
  }
}

export function registerMpesaRoutes(app: App, deps: BankRouteDeps) {
  const store = () => getStore();
  const isProd = process.env.NODE_ENV === 'production';
  const devUnsigned = !isProd && process.env.BANK_WEBHOOKS_ALLOW_UNSIGNED_DEV === 'true';

  const secretOk = (given: string): boolean => {
    const { callbackSecret } = getDarajaConfig();
    if (!callbackSecret || callbackSecret.length < 16) return devUnsigned;
    return timingSafeEqualStrings(given || '', callbackSecret);
  };

  const publicUrl = (path: string) => {
    const { callbackSecret } = getDarajaConfig();
    const base = (process.env.MPESA_CALLBACK_BASE_URL || process.env.APP_URL || '').replace(/\/$/, '');
    return base ? `${base}${path}/${callbackSecret}` : '';
  };

  // --------------------------------------------------------------- status
  app.get('/api/mpesa/config-status', h(async (_req, res) => {
    const c = getDarajaConfig();
    const token = c.isConfigured ? Boolean(await getDarajaToken()) : false;
    return res.json({
      configured: c.isConfigured, environment: c.env, shortcode: c.shortcode || '',
      hasPasskey: Boolean(c.passkey), hasCallbackUrl: Boolean(c.callbackSecret && (process.env.MPESA_CALLBACK_BASE_URL || process.env.APP_URL)),
      liveTokenConnected: token,
      platformBeneficiary: { phone: process.env.PLATFORM_MPESA_PHONE || '', name: process.env.PLATFORM_ACCOUNT_NAME || 'EstateMaster Kenya' },
      message: !c.isConfigured ? 'M-Pesa STK is not configured on this server. Bank and manual channels still work.'
        : token ? `Connected to Safaricom Daraja (${c.env.toUpperCase()}, shortcode ${c.shortcode}).` : 'Credentials present but the Daraja handshake failed.'
    });
  }));

  // ------------------------------------------------------------ STK push
  async function startStk(req: ReqLike, res: ResLike, opts: { type: 'rent' | 'subscription'; amount: number; phone: string; accountRef: string; invoice?: Invoice; landlordId?: string; tenantId?: string }) {
    const auth = req.auth as AuthContext;
    const c = getDarajaConfig();
    if (!c.isConfigured) return res.status(503).json({ error: 'M-Pesa STK is not available right now. Please pay by bank transfer or Paybill and verify the reference.' });
    if (!c.callbackSecret || c.callbackSecret.length < 16 || !publicUrl('/api/mpesa/callback')) {
      return res.status(503).json({ error: 'M-Pesa callbacks are not configured on this server.' });
    }
    const token = await getDarajaToken();
    if (!token) return res.status(502).json({ error: 'Could not reach Safaricom right now. Please try again shortly.' });
    const ts = darajaTimestamp();
    const phone = normalizeKenyanPhone(opts.phone);
    const payload = {
      BusinessShortCode: c.shortcode, Password: Buffer.from(`${c.shortcode}${c.passkey}${ts}`).toString('base64'), Timestamp: ts,
      TransactionType: c.transactionType, Amount: Math.max(1, Math.round(opts.amount)), PartyA: phone, PartyB: c.partyB, PhoneNumber: phone,
      CallBackURL: publicUrl(opts.type === 'subscription' ? '/api/mpesa/subscription-callback' : '/api/mpesa/callback'),
      AccountReference: opts.accountRef.replace(/[^A-Za-z0-9\-]/g, '').slice(0, 12) || 'EstateMaster',
      TransactionDesc: opts.type === 'subscription' ? 'Licence' : 'Rent'
    };
    let data: any;
    try {
      const r = await timedFetch(`${c.baseUrl}/mpesa/stkpush/v1/processrequest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      data = await r.json().catch(() => ({}));
      if (!r.ok || String(data.ResponseCode) !== '0') {
        console.warn('[mpesa] STK rejected:', JSON.stringify(data).slice(0, 300));
        return res.status(400).json({ error: String(data?.errorMessage || data?.ResponseDescription || 'Safaricom rejected the request. Check the phone number and try again.').slice(0, 200) });
      }
    } catch (e: any) {
      return res.status(502).json({ error: 'Safaricom did not respond in time. Please try again.' });
    }
    const co: Checkout = {
      id: data.CheckoutRequestID, merchantRequestId: data.MerchantRequestID, type: opts.type,
      landlordId: opts.landlordId, invoiceId: opts.invoice?.id, tenantId: opts.tenantId,
      initiatedBy: auth.userId, initiatedRole: auth.role, phone, amount: Math.round(opts.amount), accountRef: opts.accountRef,
      status: 'PENDING', createdAt: new Date().toISOString()
    };
    await store().set(COLLECTIONS.MPESA_CHECKOUTS, co.id, co);
    return res.json({
      success: true, pending: true, MerchantRequestID: co.merchantRequestId, CheckoutRequestID: co.id, ResponseCode: '0',
      ResponseDescription: data.ResponseDescription, CustomerMessage: data.CustomerMessage || `A payment prompt was sent to ${phone}. Enter your M-Pesa PIN to approve.`,
      amount: co.amount, phone, accountRef: co.accountRef
    });
  }

  const stkLimiter = rateLimit({ name: 'stk', max: 10, windowMs: 10 * 60_000, key: (r) => r.auth?.userId || clientIp(r) });

  app.post('/api/mpesa/subscription-stk-push', requireLandlord as any, stkLimiter, h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const phone = str(body(req).phone, 30);
    if (!isValidKenyanPhone(phone)) return res.status(400).json({ error: 'Enter a valid Safaricom number (e.g. 0712 345 678).' });
    // The amount is fixed server-side; whatever the client sends is ignored.
    return startStk(req, res, { type: 'subscription', amount: PLATFORM_SUBSCRIPTION_AMOUNT, phone, accountRef: `SUB-${auth.userId.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()}`, landlordId: auth.userId });
  }));

  app.post('/api/mpesa/stk-push', stkLimiter, h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const b = body(req);
    const phone = str(b.phone, 30);
    if (!isValidKenyanPhone(phone)) return res.status(400).json({ error: 'Enter a valid Safaricom number (e.g. 0712 345 678).' });
    const inv = await store().get<Invoice>(COLLECTIONS.INVOICES, str(b.invoiceId, 80));
    const owns = inv && (auth.role === 'tenant' ? inv.tenantId === auth.userId : inv.landlordId === auth.userId);
    if (!inv || !owns) return res.status(404).json({ error: 'Invoice not found.' });
    const due = remainingBalance(inv);
    if (due <= 0) return res.status(409).json({ error: 'This invoice is already settled.' });
    const amount = b.amount === undefined ? due : num(b.amount, NaN);
    if (!(amount >= 1) || amount > due + 0.5) return res.status(400).json({ error: `Enter an amount between KSh 1 and KSh ${due.toLocaleString()}.` });
    return startStk(req, res, { type: 'rent', amount, phone, accountRef: inv.paymentReference || inv.unitNumber || 'Rent', invoice: inv, landlordId: inv.landlordId, tenantId: inv.tenantId });
  }));

  // ------------------------------------------------- finishing a checkout
  async function finishCheckout(co: Checkout, receipt: string, source: 'callback' | 'query'): Promise<Checkout> {
    const reference = receipt || `STK-${co.id}`;
    if (co.type === 'subscription') {
      const r = await activateSubscription(co.landlordId!, reference, co.amount);
      co.status = r.status === 'underpaid' ? 'FAILED' : 'COMPLETED';
      co.receiptCode = reference;
      co.resultDesc = r.status === 'activated' || r.status === 'duplicate' ? 'Subscription activated.' : 'Amount received was below the subscription fee.';
      if (r.status === 'activated' && r.landlord && deps.onSubscriptionActivated) deps.onSubscriptionActivated(r.landlord, { bank: 'mpesa', reference } as any).catch(() => undefined);
    } else {
      const inv = await store().get<Invoice>(COLLECTIONS.INVOICES, co.invoiceId || '');
      if (!inv) { co.status = 'FAILED'; co.resultDesc = 'Invoice no longer exists.'; return co; }
      const txn: NormalizedBankTxn = {
        bank: 'mpesa', reference, amount: co.amount, currency: 'KES', direction: 'credit', status: 'success', channel: 'MPESA',
        narration: `M-Pesa STK ${co.accountRef}`, customerReference: co.accountRef, payerPhone: co.phone, transactionDate: new Date().toISOString(),
        origin: source === 'callback' ? 'daraja' : 'api-query'
      };
      const r = await processInboundTransaction(txn, { kind: 'post', invoiceId: inv.id, method: 'invoice-reference', confidence: 100 }, { verifiedVia: 'mpesa-daraja', signatureVerified: true });
      co.receiptCode = reference;
      if (r.outcome === 'posted' && r.payment) { co.status = 'COMPLETED'; co.paymentId = r.payment.id; co.resultDesc = r.reason; deps.onPaymentPosted(r.payment, r.invoice).catch(() => undefined); }
      else if (r.outcome === 'duplicate') { co.status = 'COMPLETED'; co.paymentId = r.existingPayment?.id; co.resultDesc = 'Already recorded.'; }
      else { co.status = 'COMPLETED'; co.resultDesc = `Payment received and queued for your landlord: ${r.reason}`; }
    }
    await store().set(COLLECTIONS.MPESA_CHECKOUTS, co.id, co);
    return co;
  }

  async function handleStkCallback(req: ReqLike, res: ResLike, expectType: 'rent' | 'subscription') {
    const ok = (extra = '') => res.status(200).json({ ResultCode: 0, ResultDesc: `Accepted${extra}` });
    if (!secretOk(String((req as any).params?.secret || ''))) {
      await writeWebhookAudit({ provider: 'mpesa', outcome: 'rejected-auth', ip: clientIp(req) });
      await deps.audit('SUSPICIOUS_ACTIVITY', 'HIGH', 'M-Pesa callback with bad/missing secret', req, 'system', undefined, 'system').catch(() => undefined);
      return res.status(403).json({ error: 'Forbidden' });
    }
    const cb = (req as any).body?.Body?.stkCallback;
    const id = typeof cb?.CheckoutRequestID === 'string' ? cb.CheckoutRequestID : '';
    const co = id ? await store().get<Checkout>(COLLECTIONS.MPESA_CHECKOUTS, id) : undefined;
    if (!co || co.type !== expectType) { await writeWebhookAudit({ provider: 'mpesa', outcome: 'unknown-checkout', ip: clientIp(req), detail: id.slice(0, 40) }); return ok(); }
    if (co.status !== 'PENDING') return ok(); // replay

    if (Number(cb.ResultCode) !== 0) {
      co.status = 'FAILED'; co.resultDesc = String(cb.ResultDesc || 'Payment was not completed.').slice(0, 200);
      await store().set(COLLECTIONS.MPESA_CHECKOUTS, co.id, co);
      return ok();
    }

    let txn: NormalizedBankTxn;
    try { txn = normalizeMpesaStk(cb, co.accountRef); } catch (e) { await writeWebhookAudit({ provider: 'mpesa', outcome: 'rejected-payload', ip: clientIp(req) }); return ok(); }
    if (Math.abs(txn.amount - co.amount) > 0.5 || (txn.payerPhone && txn.payerPhone !== co.phone)) {
      await writeWebhookAudit({ provider: 'mpesa', reference: txn.reference, outcome: 'rejected-mismatch', amount: txn.amount, ip: clientIp(req), detail: `expected ${co.amount}/${co.phone}` });
      await deps.audit('SUSPICIOUS_ACTIVITY', 'HIGH', `M-Pesa callback amount/phone mismatch for ${co.id}`, req, 'system', undefined, 'system').catch(() => undefined);
      co.status = 'FAILED'; co.resultDesc = 'Confirmation did not match the request.';
      await store().set(COLLECTIONS.MPESA_CHECKOUTS, co.id, co);
      return ok();
    }
    // Do not trust the callback alone: ask Daraja.
    const q = await stkQuery(co.id);
    if (q.state === 'success') { await finishCheckout(co, txn.reference, 'callback'); return ok(); }
    if (q.state === 'failed') { co.status = 'FAILED'; co.resultDesc = q.desc; await store().set(COLLECTIONS.MPESA_CHECKOUTS, co.id, co); return ok(); }
    co.callbackSucceeded = true; co.callbackReceipt = txn.reference;
    await store().set(COLLECTIONS.MPESA_CHECKOUTS, co.id, co);
    return ok();
  }

  const cbLimiter = rateLimit({ name: 'mpesa-cb', max: 300, windowMs: 60_000 });
  app.post('/api/mpesa/callback/:secret', cbLimiter, h((req, res) => handleStkCallback(req, res, 'rent')));
  app.post('/api/payments/callback/:secret', cbLimiter, h((req, res) => handleStkCallback(req, res, 'rent')));
  app.post('/api/mpesa/subscription-callback/:secret', cbLimiter, h((req, res) => handleStkCallback(req, res, 'subscription')));

  // ----------------------------------------------------------- C2B (paybill / till)
  app.post('/api/mpesa/c2b/validation/:secret', cbLimiter, h(async (req, res) => {
    if (!secretOk(String((req as any).params?.secret || ''))) return res.status(403).json({ error: 'Forbidden' });
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }));
  app.post('/api/mpesa/c2b/confirmation/:secret', cbLimiter, h(async (req, res) => {
    const ip = clientIp(req);
    if (!secretOk(String((req as any).params?.secret || ''))) {
      await writeWebhookAudit({ provider: 'mpesa-c2b', outcome: 'rejected-auth', ip });
      return res.status(403).json({ error: 'Forbidden' });
    }
    let txn: NormalizedBankTxn;
    try { txn = normalizeMpesaC2B((req as any).body); } catch (e) {
      await writeWebhookAudit({ provider: 'mpesa-c2b', outcome: 'rejected-payload', ip, detail: e instanceof PayloadError ? e.message : 'bad payload' });
      return res.status(400).json({ ResultCode: 1, ResultDesc: 'Invalid payload' });
    }
    try {
      const outcome = await routeInboundCredit(txn, deps, { ip, authMethods: ['secret-path'], signatureVerified: true, req });
      return res.json({ ResultCode: 0, ResultDesc: outcome });
    } catch (e: any) {
      console.error('[mpesa-c2b] processing error:', e?.message || e);
      return res.status(500).json({ ResultCode: 1, ResultDesc: 'Temporary error' }); // Safaricom retries; the ledger is idempotent
    }
  }));

  // --------------------------------------------------------------- polling
  app.get('/api/mpesa/query/:checkoutRequestId', rateLimit({ name: 'stk-poll', max: 90, windowMs: 60_000, key: (r) => r.auth?.userId || clientIp(r) }), h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const co = await store().get<Checkout>(COLLECTIONS.MPESA_CHECKOUTS, String((req as any).params.checkoutRequestId));
    const mine = co && (co.initiatedBy === auth.userId || (co.landlordId === auth.userId && auth.role === 'landlord'));
    if (!co || !mine) return res.status(404).json({ error: 'Payment request not found.' });

    if (co.status === 'PENDING') {
      const age = Date.now() - new Date(co.createdAt).getTime();
      const sinceQuery = co.lastQueryAt ? Date.now() - new Date(co.lastQueryAt).getTime() : Infinity;
      if (age > 8000 && sinceQuery > 6000) {
        co.lastQueryAt = new Date().toISOString();
        const q = await stkQuery(co.id);
        if (q.state === 'success') await finishCheckout(co, co.callbackReceipt || '', 'query');
        else if (q.state === 'failed') { co.status = 'FAILED'; co.resultDesc = q.desc; await store().set(COLLECTIONS.MPESA_CHECKOUTS, co.id, co); }
        else await store().set(COLLECTIONS.MPESA_CHECKOUTS, co.id, co);
      }
      if (co.status === 'PENDING' && Date.now() - new Date(co.createdAt).getTime() > 5 * 60_000 && !co.callbackSucceeded) {
        co.status = 'FAILED'; co.resultDesc = 'The request timed out. If money left your account it will be applied automatically; otherwise try again.';
        await store().set(COLLECTIONS.MPESA_CHECKOUTS, co.id, co);
      }
    }
    const payment = co.paymentId ? await store().get<Payment>(COLLECTIONS.PAYMENTS, co.paymentId) : undefined;
    return res.json({ checkoutRequestId: co.id, status: co.status, resultDesc: co.resultDesc, receiptCode: co.receiptCode, payment, amount: co.amount, phone: co.phone.replace(/^(\d{4})\d+(\d{2})$/, '$1*****$2'), message: co.resultDesc });
  }));

  // Landlord helper: has this M-Pesa code already reached the ledger?
  app.post('/api/mpesa/verify-receipt', requireLandlord as any, rateLimit({ name: 'mpesa-verify', max: 30, windowMs: 10 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }), h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const code = str(body(req).receiptCode, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 8) return res.status(400).json({ error: 'Enter the M-Pesa confirmation code exactly as in the SMS.' });
    const claim: any = await store().get(COLLECTIONS.REF_CLAIMS, `ref-${refKey(code)}`);
    if (!claim) return res.status(404).json({ error: 'This code has not reached EstateMaster yet. M-Pesa confirmations arrive automatically within a minute; if you have confirmed it on your M-Pesa statement you can record it manually.' });
    if (claim.landlordId && claim.landlordId !== auth.userId) return res.status(409).json({ error: 'This code has already been used.' });
    const payment = claim.paymentId ? await store().get<Payment>(COLLECTIONS.PAYMENTS, claim.paymentId) : undefined;
    return res.json({ success: true, message: claim.status === 'posted' ? 'Verified: this payment is already on your ledger.' : 'The deposit was received and is waiting in your unaccounted queue.', payment, status: claim.status });
  }));
}
