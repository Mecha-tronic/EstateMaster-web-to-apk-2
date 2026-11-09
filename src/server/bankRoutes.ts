/**
 * Bank API routes (mounted from server.ts via registerBankRoutes).
 *
 *   POST /api/banks/equity/callback    Jenga IPN webhook
 *   POST /api/banks/kcb/callback       KCB Buni IPN webhook
 *   POST /api/banks/coop/callback      Co-op account-notification webhook
 *   POST /api/banks/pesalink/callback  PesaLink / IPSL credit relay
 *   POST /api/banks/verify-transaction Real-time verification by reference (tenant / landlord)
 *   GET  /api/banks/verifications/:id  Live progress of a verification (polled by the UI)
 *   GET  /api/banks/status             Health + OAuth handshake (diagnostics for landlords; balances for platform admins)
 *   GET  /api/banks/rails              Which settlement rails a tenant can use + where to pay
 *   GET  /api/banks/subscription-instructions  How a landlord pays the platform subscription by bank
 */
import crypto from 'crypto';
import { getStore } from './store.js';
import { COLLECTIONS } from './db.js';
import {
  AuthContext,
  ReqLike,
  ResLike,
  rateLimit,
  clientIp,
  requireLandlord
} from './auth.js';
import {
  BankDriver,
  BankId,
  NormalizedBankTxn,
  PayloadError,
  authenticateWebhook,
  createBankDrivers,
  isWebhookSecurityConfigured,
  kcbAck,
  matchTransaction,
  normalizeByBank,
  resolveLandlordIds,
  txnCorroboratesInvoice,
  canonicalReference,
  remainingBalance,
  MatchInvoice,
  MatchLandlord
} from '../lib/bankService.js';
import { processInboundTransaction, assignUnaccountedPayment, claimSubscriptionReference, refKey } from './ledger.js';
import type { Invoice, Landlord, Payment, Tenant, UnaccountedPayment } from '../types.js';
import { landlordPaymentView } from '../lib/security.js';

export interface BankRouteDeps {
  /** Fire receipts / notifications after a payment is posted. Must not throw into the request. */
  onPaymentPosted: (payment: Payment, invoice?: Invoice) => Promise<void>;
  /** Security / audit log. */
  audit: (
    type: any,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    description: string,
    req: any,
    userEmail: string,
    userId?: string,
    role?: 'landlord' | 'tenant' | 'system'
  ) => Promise<unknown>;
  /** Optional: told when a deposit lands in a landlord's unaccounted queue. */
  onQueued?: (unaccounted: UnaccountedPayment) => Promise<void>;
  /** Called after a subscription is activated by a bank deposit. */
  onSubscriptionActivated?: (landlord: Landlord, txn: NormalizedBankTxn) => Promise<void>;
}

const PLATFORM_SUBSCRIPTION_AMOUNT = Number(process.env.PLATFORM_SUBSCRIPTION_AMOUNT || 20000);

type App = {
  get: (path: any, ...handlers: any[]) => any;
  post: (path: any, ...handlers: any[]) => any;
};

const BANK_IDS: BankId[] = ['equity', 'kcb', 'coop', 'pesalink'];

export function subscriptionReferenceFor(l: { id: string }): string {
  return `SUB-${l.id.replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase()}`;
}

function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isPlatformAdmin(auth?: AuthContext): boolean {
  return Boolean(auth && auth.role === 'landlord' && platformAdminEmails().includes((auth.user.email || '').toLowerCase()));
}

/** Short unique reference tenants type on bank transfers, e.g. EM-A101-7QK2 (stable per invoice). */
export function makePaymentReference(unitNumber: string | undefined, invoiceId: string): string {
  const unit = (unitNumber || 'UNIT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'UNIT';
  const suffix = crypto.createHash('sha256').update(invoiceId).digest('hex').slice(0, 4).toUpperCase();
  return `EM-${unit}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------
async function loadMatchingContext() {
  const store = getStore();
  const [unpaid, partial, overdue, landlords, tenants] = await Promise.all([
    store.where<Invoice>(COLLECTIONS.INVOICES, 'status', 'Unpaid'),
    store.where<Invoice>(COLLECTIONS.INVOICES, 'status', 'Partial'),
    store.where<Invoice>(COLLECTIONS.INVOICES, 'status', 'Overdue'),
    store.list<Landlord>(COLLECTIONS.LANDLORDS),
    store.list<Tenant>(COLLECTIONS.TENANTS)
  ]);
  const phoneByTenant = new Map(tenants.map((t) => [t.id, t.phone]));
  const open: MatchInvoice[] = [...unpaid, ...partial, ...overdue].filter((i) => !i.carriedForwardToInvoiceId).map((i) => ({
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    paymentReference: i.paymentReference,
    landlordId: i.landlordId,
    tenantId: i.tenantId,
    tenantName: i.tenantName,
    tenantPhone: phoneByTenant.get(i.tenantId),
    unitNumber: i.unitNumber,
    propertyName: i.propertyName,
    totalAmount: i.totalAmount,
    amountPaid: i.amountPaid,
    status: i.status
  }));
  const matchLandlords: MatchLandlord[] = landlords.map((l) => ({
    id: l.id,
    accountNumber: l.accountNumber,
    mpesaPaybill: l.mpesaPaybill,
    mpesaTillNumber: l.mpesaTillNumber
  }));
  return { open, landlords, matchLandlords };
}

export async function writeWebhookAudit(entry: Record<string, any>) {
  const id = `wh-${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
  try {
    await getStore().set(COLLECTIONS.WEBHOOK_AUDIT, id, { id, at: new Date().toISOString(), ...entry });
  } catch (err) {
    console.warn('[bank-webhook] audit write failed:', (err as any)?.message);
  }
}

// ---------------------------------------------------------------------------
// Subscription (landlord -> platform) deposits
// ---------------------------------------------------------------------------
async function tryHandleSubscriptionCredit(
  txn: NormalizedBankTxn,
  landlords: Landlord[]
): Promise<{ handled: boolean; outcome?: string; landlord?: Landlord }> {
  const haystack = `${txn.customerReference} ${txn.narration}`.toUpperCase();
  const m = /(?<![A-Z0-9])SUB-([A-Z0-9]{4,8})(?![A-Z0-9])/.exec(haystack);
  if (!m) return { handled: false };
  const landlord = landlords.find((l) => subscriptionReferenceFor(l) === `SUB-${m[1]}`);
  if (!landlord) return { handled: false };

  if (txn.amount + 0.5 < PLATFORM_SUBSCRIPTION_AMOUNT) {
    await writeWebhookAudit({
      provider: txn.bank, reference: txn.reference, outcome: 'subscription-underpaid',
      detail: `Landlord ${landlord.id} paid ${txn.amount} < ${PLATFORM_SUBSCRIPTION_AMOUNT}`
    });
    return { handled: true, outcome: 'subscription-underpaid', landlord };
  }

  const claimed = await claimSubscriptionReference(txn.reference, landlord.id, txn.amount);
  if (!claimed) return { handled: true, outcome: 'duplicate', landlord };

  try {
    const base = landlord.subscriptionExpiry && new Date(landlord.subscriptionExpiry) > new Date() ? new Date(landlord.subscriptionExpiry) : new Date();
    base.setFullYear(base.getFullYear() + 1);
    await getStore().update(COLLECTIONS.LANDLORDS, landlord.id, {
      subscriptionStatus: 'Active',
      subscriptionPaid: true,
      subscriptionExpiry: base.toISOString().split('T')[0],
      receiptCode: txn.reference
    });
  } catch (err) {
    // Release the claim so the bank's retry can succeed.
    await getStore().delete(COLLECTIONS.REF_CLAIMS, `ref-${refKey(txn.reference)}`).catch(() => undefined);
    throw err;
  }
  return { handled: true, outcome: 'subscription-activated', landlord };
}

// ---------------------------------------------------------------------------
// Shared inbound-credit pipeline (bank webhooks AND M-Pesa C2B use it)
// ---------------------------------------------------------------------------
export async function routeInboundCredit(
  txn: NormalizedBankTxn,
  deps: BankRouteDeps,
  meta: { ip: string; authMethods?: string[]; payloadHash?: string; signatureVerified: boolean; req: any }
): Promise<string> {
  const ctxData = await loadMatchingContext();

  // 1. Landlord subscription deposits
  const sub = await tryHandleSubscriptionCredit(txn, ctxData.landlords);
  if (sub.handled) {
    await writeWebhookAudit({ provider: txn.bank, reference: txn.reference, outcome: sub.outcome, amount: txn.amount, ip: meta.ip, authMethods: meta.authMethods, payloadHash: meta.payloadHash });
    if (sub.outcome === 'subscription-activated' && sub.landlord && deps.onSubscriptionActivated) {
      deps.onSubscriptionActivated(sub.landlord, txn).catch((e) => console.warn('[bank-webhook] subscription notify failed:', e?.message));
    }
    return sub.outcome || 'handled';
  }

  // 2. Rent deposits: auto-match -> post, otherwise queue
  const match = matchTransaction(txn, ctxData.open, ctxData.matchLandlords);
  const owner = resolveLandlordIds(txn, ctxData.matchLandlords);
  const result = await processInboundTransaction(
    txn,
    match.decision === 'auto' && match.invoice
      ? { kind: 'post', invoiceId: match.invoice.id, method: match.method!, confidence: match.confidence }
      : {
          kind: 'queue',
          landlordId: match.suggestion?.invoice.landlordId || (owner && owner.length === 1 ? owner[0] : undefined),
          reason: match.reason,
          suggestion: match.suggestion
            ? { tenantId: match.suggestion.invoice.tenantId, tenantName: match.suggestion.invoice.tenantName, unitNumber: match.suggestion.invoice.unitNumber, confidence: match.suggestion.confidence }
            : undefined
        },
    { verifiedVia: txn.bank === 'mpesa' ? 'mpesa-daraja' : 'bank-webhook', signatureVerified: meta.signatureVerified }
  );

  await writeWebhookAudit({
    provider: txn.bank, reference: txn.reference, outcome: result.outcome, amount: txn.amount, ip: meta.ip,
    authMethods: meta.authMethods, payloadHash: meta.payloadHash, paymentId: result.payment?.id, detail: result.reason.slice(0, 200)
  });

  if (result.outcome === 'posted' && result.payment) {
    deps.onPaymentPosted(result.payment, result.invoice).catch((e) => console.warn('[bank-webhook] receipt failed:', e?.message));
  } else if (result.outcome === 'queued' && result.unaccounted && deps.onQueued) {
    deps.onQueued(result.unaccounted).catch((e) => console.warn('[bank-webhook] queue notify failed:', e?.message));
  } else if (result.outcome === 'duplicate') {
    await deps.audit('SUSPICIOUS_ACTIVITY', 'LOW', `Duplicate ${txn.bank} notification ignored (ref ${txn.reference})`, meta.req, 'system', undefined, 'system').catch(() => undefined);
  }
  return result.outcome;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
export function registerBankRoutes(app: App, deps: BankRouteDeps) {
  const drivers = createBankDrivers();
  const isProd = process.env.NODE_ENV === 'production';
  const allowInsecureDev = process.env.BANK_WEBHOOKS_ALLOW_UNSIGNED_DEV === 'true';
  const driverFor = (bank: BankId): BankDriver | undefined => (bank === 'pesalink' ? undefined : (drivers as any)[bank]);

  // ------------------------------ Webhooks ---------------------------------
  const webhookLimiter = rateLimit({ name: 'bank-webhook', max: 600, windowMs: 60_000 });

  for (const bank of BANK_IDS) {
    app.post(`/api/banks/${bank}/callback`, webhookLimiter, async (req: ReqLike, res: ResLike) => {
      const cfg = drivers.configs[bank];
      const ip = clientIp(req);
      const rawBody: Buffer = (req as any).rawBody || Buffer.alloc(0);

      // 1. Authenticate the sender BEFORE parsing anything. Fail closed.
      const auth = authenticateWebhook({
        cfg: cfg.webhook,
        rawBody,
        headers: req.headers as any,
        sourceIp: ip,
        allowInsecureDev,
        isProduction: isProd
      });
      if (!auth.ok) {
        await writeWebhookAudit({ provider: bank, outcome: 'rejected-auth', detail: auth.reason, ip });
        await deps.audit('SUSPICIOUS_ACTIVITY', auth.status === 503 ? 'MEDIUM' : 'HIGH', `Rejected ${bank} webhook: ${auth.reason}`, req, 'system', undefined, 'system').catch(() => undefined);
        return res.status(auth.status).json({ error: 'Unauthorized webhook request.' });
      }

      // 2. Parse + normalise into the canonical model
      let txn: NormalizedBankTxn;
      try {
        const body = (req as any).body;
        if (!body || typeof body !== 'object') throw new PayloadError('Body must be JSON');
        txn = normalizeByBank(bank, body);
      } catch (err: any) {
        const status = err instanceof PayloadError ? 400 : 400;
        await writeWebhookAudit({ provider: bank, outcome: 'rejected-payload', detail: String(err?.message || err).slice(0, 200), ip, authMethods: auth.methods });
        return res.status(status).json({ error: 'Invalid notification payload.' });
      }

      const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
      const ack = (ok: boolean, message: string) =>
        bank === 'kcb' ? kcbAck(txn.reference, ok, message) : { status: ok ? 'success' : 'failed', message, reference: txn.reference };

      try {
        const result = await routeInboundCredit(txn, deps, { ip, authMethods: auth.methods, payloadHash, signatureVerified: true, req });
        // Always 200 for processed/duplicate/queued so the bank stops retrying (the ledger is idempotent).
        return res.status(200).json(ack(true, result));
      } catch (err: any) {
        console.error(`[bank-webhook:${bank}] processing error:`, err?.message || err);
        await writeWebhookAudit({ provider: bank, reference: txn.reference, outcome: 'error', detail: String(err?.message || err).slice(0, 200), ip });
        // 5xx => the bank retries; safe because processing is idempotent.
        return res.status(500).json(ack(false, 'Temporary processing error'));
      }
    });
  }

  // ------------------------------ Verification -----------------------------
  interface VerificationStep {
    key: string;
    label: string;
    status: 'done' | 'active' | 'pending' | 'failed' | 'skipped';
    at?: string;
    detail?: string;
  }
  interface VerificationRecord {
    id: string;
    userId: string;
    role: 'landlord' | 'tenant';
    landlordId?: string;
    invoiceId: string;
    bank: BankId | 'mpesa';
    reference: string;
    status: 'checking' | 'verified' | 'pending' | 'awaiting-landlord' | 'rejected' | 'timed-out';
    message: string;
    steps: VerificationStep[];
    paymentId?: string;
    attempts: number;
    createdAt: string;
    lastCheckedAt: string;
  }

  const STEP_LABELS: Record<string, string> = {
    received: 'Reference received',
    ledger: 'Checked against the payment ledger',
    bank: 'Queried the bank',
    match: 'Matched to your invoice',
    posted: 'Payment posted & receipt issued'
  };

  const mkSteps = (): VerificationStep[] =>
    ['received', 'ledger', 'bank', 'match', 'posted'].map((k) => ({ key: k, label: STEP_LABELS[k], status: 'pending' as const }));

  const setStep = (rec: VerificationRecord, key: string, status: VerificationStep['status'], detail?: string) => {
    const s = rec.steps.find((x) => x.key === key);
    if (s) {
      s.status = status;
      s.detail = detail;
      s.at = new Date().toISOString();
    }
  };

  const PUBLIC_MESSAGES = {
    unavailable: 'The bank could not be reached right now. We will keep checking, and your payment will post automatically as soon as the bank notifies us.',
    notFound: 'We have not seen this deposit at the bank yet. Bank notifications can take a few minutes. We will keep checking and post it automatically.',
    uncorroborated: 'A deposit with this reference was found, but it does not carry your invoice number or unit in its narration, so it cannot be matched automatically. Please ask your landlord to assign it from their queue.',
    used: 'This reference has already been used for a different payment and cannot be redeemed again.'
  };

  async function runVerification(rec: VerificationRecord, invoice: Invoice): Promise<VerificationRecord> {
    const store = getStore();
    rec.attempts += 1;
    rec.lastCheckedAt = new Date().toISOString();
    rec.status = 'checking';
    setStep(rec, 'received', 'done');

    // --- Ledger check (covers webhooks that already arrived, manual entries, previous claims)
    setStep(rec, 'ledger', 'active');
    const claim: any = await store.get(COLLECTIONS.REF_CLAIMS, `ref-${refKey(rec.reference)}`);
    if (claim) {
      setStep(rec, 'ledger', 'done', 'Reference found in ledger');
      setStep(rec, 'bank', 'skipped', 'Already confirmed by the bank notification');
      if (claim.status === 'posted' && claim.paymentId) {
        const payment = await store.get<Payment>(COLLECTIONS.PAYMENTS, claim.paymentId);
        if (payment && payment.invoiceId === invoice.id && payment.tenantId === invoice.tenantId) {
          setStep(rec, 'match', 'done');
          setStep(rec, 'posted', 'done');
          rec.status = 'verified';
          rec.paymentId = payment.id;
          rec.message = `Verified: KSh ${payment.amount.toLocaleString()} has been applied to invoice ${invoice.invoiceNumber}.`;
          return rec;
        }
        setStep(rec, 'match', 'failed');
        rec.status = 'rejected';
        rec.message = PUBLIC_MESSAGES.used;
        return rec;
      }
      if (claim.status === 'queued' && claim.unaccountedId) {
        // The bank already told us about this deposit and it is waiting in a landlord queue.
        const btx: any = await store.get(COLLECTIONS.BANK_TRANSACTIONS, `btx-${refKey(rec.reference)}`);
        const unacc = await store.get<UnaccountedPayment>(COLLECTIONS.UNACCOUNTED, claim.unaccountedId);
        if (btx && unacc && unacc.status === 'Pending Assignment' && (!unacc.landlordId || unacc.landlordId === invoice.landlordId)) {
          const { open, matchLandlords } = await loadMatchingContext();
          const mi = open.find((o) => o.id === invoice.id);
          const corr = mi ? txnCorroboratesInvoice(btx as NormalizedBankTxn, mi) : { ok: false, confidence: 0, reason: '' };
          if (corr.ok && invoice.landlordId) {
            const r = await assignUnaccountedPayment({
              landlordId: invoice.landlordId,
              unaccountedId: unacc.id,
              tenantId: invoice.tenantId,
              invoiceId: invoice.id,
              notes: corr.reason,
              system: { verifiedVia: 'bank-webhook', confidence: corr.confidence }
            });
            if (r.outcome === 'posted' && r.payment) {
              setStep(rec, 'match', 'done', corr.reason);
              setStep(rec, 'posted', 'done');
              rec.status = 'verified';
              rec.paymentId = r.payment.id;
              rec.message = `Verified: KSh ${r.payment.amount.toLocaleString()} applied to invoice ${invoice.invoiceNumber}.`;
              deps.onPaymentPosted(r.payment, r.invoice).catch(() => undefined);
              return rec;
            }
          }
          // Leave a hint for the landlord (does not change ownership or post anything).
          await store.update(COLLECTIONS.UNACCOUNTED, unacc.id, {
            notes: `${unacc.notes || ''} | Tenant ${invoice.tenantName} (${invoice.unitNumber}) reports this deposit is for invoice ${invoice.invoiceNumber}.`.slice(0, 500),
            suggestedTenantId: unacc.suggestedTenantId || invoice.tenantId,
            suggestedTenantName: unacc.suggestedTenantName || invoice.tenantName,
            suggestedUnitNumber: unacc.suggestedUnitNumber || invoice.unitNumber
          }).catch(() => undefined);
        }
        setStep(rec, 'match', 'active', 'Waiting for landlord');
        rec.status = 'awaiting-landlord';
        rec.message = 'The bank has confirmed this deposit. Your landlord has been asked to confirm which invoice it settles; you will get a receipt as soon as they do.';
        return rec;
      }
      rec.status = 'rejected';
      rec.message = PUBLIC_MESSAGES.used;
      return rec;
    }
    setStep(rec, 'ledger', 'done', 'Not seen before');

    // --- Ask the bank
    setStep(rec, 'bank', 'active');
    const driver = rec.bank === 'mpesa' || rec.bank === 'pesalink' ? undefined : driverFor(rec.bank as BankId);
    if (!driver || !driver.capabilities().transactionQuery) {
      setStep(rec, 'bank', 'skipped', 'Live query not available for this bank; awaiting bank notification');
      rec.status = 'pending';
      rec.message = PUBLIC_MESSAGES.notFound;
      return rec;
    }
    const q = await driver.queryTransactionByReference(rec.reference);
    if (!q.ok) {
      setStep(rec, 'bank', 'failed', 'Bank unreachable');
      console.warn(`[verify] ${rec.bank} query failed:`, q.error);
      rec.status = 'pending';
      rec.message = PUBLIC_MESSAGES.unavailable;
      return rec;
    }
    if (!q.data) {
      setStep(rec, 'bank', 'done', 'Not found yet');
      rec.status = 'pending';
      rec.message = PUBLIC_MESSAGES.notFound;
      return rec;
    }
    const txn = q.data;
    setStep(rec, 'bank', 'done', 'Deposit confirmed by the bank');

    // --- Does it belong to THIS invoice?
    setStep(rec, 'match', 'active');
    const { open, matchLandlords } = await loadMatchingContext();
    const mi = open.find((o) => o.id === invoice.id);
    if (!mi) {
      setStep(rec, 'match', 'failed');
      rec.status = 'rejected';
      rec.message = 'This invoice is already settled.';
      return rec;
    }
    const owners = resolveLandlordIds(txn, matchLandlords);
    if (owners && invoice.landlordId && !owners.includes(invoice.landlordId)) {
      // Credited to a different landlord's account: do not attach to this invoice.
      setStep(rec, 'match', 'failed', 'Credited to a different account');
      rec.status = 'pending';
      rec.message = PUBLIC_MESSAGES.uncorroborated;
      return rec;
    }
    const corr = txnCorroboratesInvoice(txn, mi);
    if (!corr.ok) {
      setStep(rec, 'match', 'failed', 'Reference does not identify this invoice');
      rec.status = 'pending';
      rec.message = PUBLIC_MESSAGES.uncorroborated;
      return rec;
    }

    const result = await processInboundTransaction(
      txn,
      { kind: 'post', invoiceId: invoice.id, method: 'api-query', confidence: corr.confidence },
      { verifiedVia: 'bank-api-query', signatureVerified: false }
    );
    if (result.outcome === 'posted' && result.payment) {
      setStep(rec, 'match', 'done', corr.reason);
      setStep(rec, 'posted', 'done');
      rec.status = 'verified';
      rec.paymentId = result.payment.id;
      rec.message = `Verified: KSh ${result.payment.amount.toLocaleString()} applied to invoice ${invoice.invoiceNumber}.`;
      deps.onPaymentPosted(result.payment, result.invoice).catch(() => undefined);
    } else if (result.outcome === 'queued') {
      setStep(rec, 'match', 'active', 'Needs landlord confirmation');
      rec.status = 'awaiting-landlord';
      rec.message = 'The bank confirmed the deposit, but it needs your landlord to confirm the allocation. You will be notified.';
    } else if (result.outcome === 'duplicate') {
      setStep(rec, 'match', 'failed');
      rec.status = 'rejected';
      rec.message = PUBLIC_MESSAGES.used;
    } else {
      setStep(rec, 'match', 'failed');
      rec.status = 'rejected';
      rec.message = result.reason;
    }
    return rec;
  }

  const publicVerification = (r: VerificationRecord) => ({
    id: r.id,
    status: r.status,
    message: r.message,
    steps: r.steps,
    bank: r.bank,
    reference: r.reference,
    invoiceId: r.invoiceId,
    paymentId: r.paymentId,
    attempts: r.attempts,
    createdAt: r.createdAt,
    lastCheckedAt: r.lastCheckedAt
  });

  async function loadAuthorizedInvoice(auth: AuthContext, invoiceId: string): Promise<Invoice | null> {
    const inv = await getStore().get<Invoice>(COLLECTIONS.INVOICES, invoiceId);
    if (!inv) return null;
    if (auth.role === 'tenant') return inv.tenantId === auth.userId ? inv : null;
    return inv.landlordId === auth.userId ? inv : null;
  }

  app.post(
    '/api/banks/verify-transaction',
    rateLimit({ name: 'bank-verify', max: 12, windowMs: 10 * 60_000, key: (r) => (r.auth ? r.auth.userId : clientIp(r)) }),
    async (req: ReqLike, res: ResLike) => {
      try {
        const auth = req.auth!;
        const body = (req as any).body || {};
        const bank = String(body.bank || '').toLowerCase();
        const reference = canonicalReference(body.reference);
        const invoiceId = String(body.invoiceId || '');
        if (!(['equity', 'kcb', 'coop', 'pesalink', 'mpesa'] as string[]).includes(bank)) {
          return res.status(400).json({ error: 'Choose a supported bank: equity, kcb, coop, pesalink or mpesa.' });
        }
        if (!/^[A-Z0-9][A-Z0-9\-_/.]{5,63}$/.test(reference)) {
          return res.status(400).json({ error: 'Enter the transaction reference exactly as shown on your bank or SMS confirmation (6-64 letters/digits).' });
        }
        if (!invoiceId) return res.status(400).json({ error: 'Select the invoice you are paying.' });

        const invoice = await loadAuthorizedInvoice(auth, invoiceId);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
        if (remainingBalance(invoice) <= 0) {
          // The bank's own notification may already have settled THIS invoice with THIS reference: show the receipt, not an error.
          const claim: any = await getStore().get(COLLECTIONS.REF_CLAIMS, `ref-${refKey(reference)}`);
          const paid = claim?.status === 'posted' && claim.paymentId ? await getStore().get<Payment>(COLLECTIONS.PAYMENTS, claim.paymentId) : undefined;
          if (!(paid && paid.invoiceId === invoice.id && paid.tenantId === invoice.tenantId)) {
            return res.status(409).json({ error: 'This invoice is already settled (fully paid or rolled into a newer invoice).' });
          }
        }

        const now = new Date().toISOString();
        const rec: VerificationRecord = {
          id: `ver-${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`,
          userId: auth.userId,
          role: auth.role,
          landlordId: invoice.landlordId,
          invoiceId: invoice.id,
          bank: bank as any,
          reference,
          status: 'checking',
          message: 'Checking…',
          steps: mkSteps(),
          attempts: 0,
          createdAt: now,
          lastCheckedAt: now
        };
        await runVerification(rec, invoice);
        await getStore().set(COLLECTIONS.BANK_VERIFICATIONS, rec.id, rec);
        return res.status(rec.status === 'rejected' ? 409 : 200).json(publicVerification(rec));
      } catch (err: any) {
        console.error('[verify-transaction] error:', err?.message || err);
        return res.status(500).json({ error: 'Verification failed. Please try again.' });
      }
    }
  );

  const VERIFICATION_TTL_MS = 15 * 60_000;
  const RECHECK_AFTER_MS = 8_000;
  const MAX_ATTEMPTS = 25;

  app.get(
    '/api/banks/verifications/:id',
    rateLimit({ name: 'bank-verify-poll', max: 60, windowMs: 60_000, key: (r) => (r.auth ? r.auth.userId : clientIp(r)) }),
    async (req: ReqLike, res: ResLike) => {
      try {
        const auth = req.auth!;
        const id = String((req as any).params?.id || '');
        const rec = await getStore().get<VerificationRecord>(COLLECTIONS.BANK_VERIFICATIONS, id);
        if (!rec || rec.userId !== auth.userId) return res.status(404).json({ error: 'Verification not found.' });

        const waiting = rec.status === 'pending' || rec.status === 'awaiting-landlord' || rec.status === 'checking';
        if (waiting) {
          const age = Date.now() - new Date(rec.createdAt).getTime();
          if (age > VERIFICATION_TTL_MS || rec.attempts >= MAX_ATTEMPTS) {
            rec.status = 'timed-out';
            rec.message = 'We could not confirm this deposit yet. It will still post automatically if the bank notifies us later; otherwise contact your landlord with the reference.';
            await getStore().set(COLLECTIONS.BANK_VERIFICATIONS, rec.id, rec);
          } else if (Date.now() - new Date(rec.lastCheckedAt).getTime() >= RECHECK_AFTER_MS) {
            const invoice = await loadAuthorizedInvoice(auth, rec.invoiceId);
            if (invoice) {
              await runVerification(rec, invoice);
              await getStore().set(COLLECTIONS.BANK_VERIFICATIONS, rec.id, rec);
            }
          }
        }
        return res.json(publicVerification(rec));
      } catch (err: any) {
        console.error('[verification-poll] error:', err?.message || err);
        return res.status(500).json({ error: 'Could not load verification.' });
      }
    }
  );

  // ------------------------------ Status / health --------------------------
  let statusCache: { at: number; value: any } | null = null;

  app.get(
    '/api/banks/status',
    rateLimit({ name: 'bank-status', max: 20, windowMs: 60_000, key: (r) => (r.auth ? r.auth.userId : clientIp(r)) }),
    async (req: ReqLike, res: ResLike) => {
      try {
        const auth = req.auth!;
        const admin = isPlatformAdmin(auth);
        const wantFresh = (req as any).query?.fresh === '1' && auth.role === 'landlord';

        if (!statusCache || wantFresh || Date.now() - statusCache.at > 60_000) {
          const out: Record<string, any> = {};
          await Promise.all(
            (['equity', 'kcb', 'coop'] as const).map(async (b) => {
              const d = drivers[b];
              const caps = d.capabilities();
              const health = await d.health();
              out[b] = {
                label: d.cfg.label,
                configured: caps.oauth,
                oauthHandshake: health.handshake,
                webhookSecurityConfigured: caps.webhook,
                liveTransactionQuery: caps.transactionQuery,
                balanceQuery: caps.balance,
                latencyMs: health.latencyMs,
                error: health.error
              };
            })
          );
          out.pesalink = {
            label: drivers.configs.pesalink.label,
            configured: true,
            webhookSecurityConfigured: isWebhookSecurityConfigured(drivers.configs.pesalink.webhook),
            note: 'PesaLink credits arrive through the receiving bank or an aggregator callback.'
          };
          statusCache = { at: Date.now(), value: out };
        }

        const base = statusCache.value;
        if (auth.role === 'tenant') {
          // Tenants only learn which rails are usable.
          const rails: Record<string, any> = {};
          for (const k of Object.keys(base)) rails[k] = { label: base[k].label, available: Boolean(base[k].webhookSecurityConfigured || base[k].liveTransactionQuery) };
          return res.json({ banks: rails, checkedAt: new Date(statusCache.at).toISOString() });
        }

        // Landlords: diagnostics without upstream error detail unless platform admin.
        const banks: Record<string, any> = {};
        for (const k of Object.keys(base)) {
          const { error, latencyMs, ...rest } = base[k];
          banks[k] = admin ? base[k] : rest;
        }

        let balances: Record<string, any> | undefined;
        if (admin) {
          balances = {};
          for (const b of ['equity', 'kcb', 'coop'] as const) {
            if (drivers[b].capabilities().balance) {
              const r = await drivers[b].getBalance();
              balances[b] = r.ok ? r.data : { error: r.error };
            }
          }
        }
        return res.json({
          banks,
          balances,
          environment: process.env.BANKS_ENVIRONMENT || (isProd ? 'production' : 'sandbox'),
          checkedAt: new Date(statusCache.at).toISOString()
        });
      } catch (err: any) {
        console.error('[bank-status] error:', err?.message || err);
        return res.status(500).json({ error: 'Could not read bank status.' });
      }
    }
  );

  // Tenant: where to send money (their landlord's accounts) + the invoice reference to quote.
  app.get('/api/banks/rails', async (req: ReqLike, res: ResLike) => {
    try {
      const auth = req.auth!;
      let landlordId: string | undefined;
      if (auth.role === 'tenant') landlordId = (auth.user as Tenant).landlordId;
      else landlordId = auth.userId;
      if (!landlordId) return res.json({ landlord: null, platform: {} });
      const landlord = await getStore().get<Landlord>(COLLECTIONS.LANDLORDS, landlordId);
      return res.json({
        landlord: landlord ? landlordPaymentView(landlord) : null,
        platform: {
          equityPaybill: process.env.PLATFORM_EQUITY_PAYBILL || undefined,
          kcbPaybill: process.env.PLATFORM_KCB_PAYBILL || undefined,
          coopAccount: process.env.PLATFORM_COOP_ACCOUNT || undefined
        }
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Could not load payment channels.' });
    }
  });

  app.get('/api/banks/subscription-instructions', requireLandlord as any, async (req: ReqLike, res: ResLike) => {
    const auth = req.auth!;
    return res.json({
      amount: PLATFORM_SUBSCRIPTION_AMOUNT,
      reference: subscriptionReferenceFor({ id: auth.userId }),
      accountName: process.env.PLATFORM_ACCOUNT_NAME || 'EstateMaster Kenya',
      channels: {
        equity: process.env.PLATFORM_EQUITY_PAYBILL ? { paybill: process.env.PLATFORM_EQUITY_PAYBILL } : undefined,
        kcb: process.env.PLATFORM_KCB_PAYBILL ? { paybill: process.env.PLATFORM_KCB_PAYBILL } : undefined,
        coop: process.env.PLATFORM_COOP_ACCOUNT ? { account: process.env.PLATFORM_COOP_ACCOUNT } : undefined
      },
      note: 'Quote the reference exactly. Your subscription activates automatically when the bank notifies us.'
    });
  });
}
