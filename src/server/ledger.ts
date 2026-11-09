/**
 * Payment ledger: the ONLY code path that creates Payment records and adjusts invoices.
 *
 * Guarantees (enforced inside a single atomic store transaction):
 *  1. A transaction reference can be redeemed at most once, ever. A `reference_claims`
 *     document keyed by the canonical reference is created atomically with the payment /
 *     queue entry; a second attempt finds the claim and is rejected as a duplicate.
 *  2. An invoice is never over-paid: the balance is re-read inside the transaction and a
 *     payment larger than the remaining balance is diverted to the landlord queue.
 *  3. Payment, invoice adjustment, ledger row and claim commit together or not at all.
 *  4. IDs are derived deterministically from the reference, so even a retried transaction
 *     cannot produce two payments.
 *  5. Tenant/landlord ownership is validated here (not just in the routes).
 */
import crypto from 'crypto';
import { getStore, DELETE_FIELD } from './store.js';
import { COLLECTIONS } from './db.js';
import {
  NormalizedBankTxn,
  MatchMethod,
  canonicalReference,
  referenceIdentity,
  isPlainReference,
  remainingBalance,
  round2,
  maskAccount,
  maskPhone,
  describeSource
} from '../lib/bankService.js';
import type {
  Invoice,
  Payment,
  PaymentVerificationSource,
  UnaccountedPayment,
  BankAuditTrail,
  Tenant,
  Landlord
} from '../types.js';
import { generateSerial } from '../lib/security.js';

export type Outcome = 'posted' | 'queued' | 'duplicate' | 'ignored' | 'rejected';

export interface LedgerResult {
  outcome: Outcome;
  reason: string;
  payment?: Payment;
  invoice?: Invoice;
  unaccounted?: UnaccountedPayment;
  /** When duplicate: the payment that already consumed the reference (for idempotent responses). */
  existingPayment?: Payment;
  claimStatus?: 'posted' | 'queued';
}

export interface PostPlan {
  kind: 'post';
  invoiceId: string;
  method: MatchMethod | 'manual-assignment' | 'api-query';
  confidence: number;
}
export interface QueuePlan {
  kind: 'queue';
  landlordId?: string;
  reason: string;
  suggestion?: { tenantId?: string; tenantName?: string; unitNumber?: string; confidence: number };
  notes?: string;
}
export type Plan = PostPlan | QueuePlan;

export interface LedgerContext {
  verifiedVia: PaymentVerificationSource;
  signatureVerified?: boolean;
  recordedBy?: string; // user id for manual / assignment actions
  notes?: string;
  paymentMethod?: Payment['paymentMethod'];
  /** For manual cash/non-bank payments with no external reference. */
  allowSyntheticReference?: boolean;
}

interface ClaimDoc {
  reference: string;
  rail: string;
  status: 'posted' | 'queued' | 'ignored';
  paymentId?: string;
  unaccountedId?: string;
  invoiceId?: string;
  landlordId?: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

/** Deterministic, collision-resistant doc id fragment for a reference. */
export function refKey(reference: string): string {
  return crypto.createHash('sha256').update(referenceIdentity(reference)).digest('hex').slice(0, 24);
}

function claimId(reference: string): string {
  return `ref-${refKey(reference)}`;
}

function methodLabel(txn: NormalizedBankTxn): Payment['paymentMethod'] {
  return txn.bank === 'mpesa' ? 'M-Pesa' : 'Bank Transfer';
}

function buildAudit(txn: NormalizedBankTxn, ctx: LedgerContext, method?: BankAuditTrail['matchMethod'], confidence?: number): BankAuditTrail {
  return {
    bank: txn.bank,
    bankReference: txn.reference,
    channel: txn.channel,
    verifiedVia: ctx.verifiedVia,
    signatureVerified: ctx.signatureVerified,
    receivedAt: txn.transactionDate,
    verifiedAt: new Date().toISOString(),
    matchMethod: method,
    matchConfidence: confidence,
    payerName: txn.payerName,
    payerPhoneMasked: maskPhone(txn.payerPhone),
    accountMasked: maskAccount(txn.creditAccount),
    currency: txn.currency
  };
}

function applyToInvoice(inv: Invoice, amount: number): { amountPaid: number; status: Invoice['status'] } {
  const amountPaid = round2((inv.amountPaid || 0) + amount);
  const status: Invoice['status'] = amountPaid + 0.005 >= inv.totalAmount ? 'Paid' : 'Partial';
  return { amountPaid, status };
}

/**
 * Processes ONE inbound credit. Atomically either posts it to an invoice, queues it for landlord
 * assignment, or reports it as a duplicate. Safe to call concurrently / repeatedly with the same txn.
 */
export async function processInboundTransaction(
  txn: NormalizedBankTxn,
  plan: Plan,
  ctx: LedgerContext
): Promise<LedgerResult> {
  const store = getStore();

  if (txn.direction !== 'credit') return { outcome: 'ignored', reason: 'Debit transactions are not payments.' };
  if (txn.status !== 'success') return { outcome: 'ignored', reason: `Transaction status is "${txn.status}"; only successful credits are posted.` };
  if (txn.currency !== 'KES') {
    // Never silently treat foreign currency as shillings.
    plan = { kind: 'queue', landlordId: plan.kind === 'queue' ? plan.landlordId : undefined, reason: `Currency ${txn.currency} requires manual review.` };
  }

  const cId = claimId(txn.reference);
  const rk = refKey(txn.reference);
  const paymentId = `pay-${rk}`;
  const unaccId = `unacc-${rk}`;
  const bankTxnId = `btx-${rk}`;
  const serial = generateSerial('RCT');
  const nowIso = new Date().toISOString();

  return store.transact<LedgerResult>(async (tx) => {
    // ---- READS FIRST ----
    const existingClaim = await tx.get<ClaimDoc>(COLLECTIONS.REF_CLAIMS, cId);
    if (existingClaim) {
      const existingPayment = existingClaim.paymentId ? await tx.get<Payment>(COLLECTIONS.PAYMENTS, existingClaim.paymentId) : undefined;
      return {
        outcome: 'duplicate',
        reason: `Reference ${txn.reference} has already been ${existingClaim.status === 'posted' ? 'applied to a payment' : 'received and queued'}.`,
        existingPayment,
        claimStatus: existingClaim.status === 'posted' ? 'posted' : 'queued'
      };
    }

    let invoice: Invoice | undefined;
    if (plan.kind === 'post') invoice = await tx.get<Invoice>(COLLECTIONS.INVOICES, plan.invoiceId);

    // ---- DECIDE (re-validated against fresh data) ----
    let effective: Plan = plan;
    if (plan.kind === 'post') {
      if (!invoice) {
        effective = { kind: 'queue', reason: 'Matched invoice no longer exists.' };
      } else if (remainingBalance(invoice) <= 0) {
        effective = { kind: 'queue', landlordId: invoice.landlordId, reason: `Invoice ${invoice.invoiceNumber} is already settled (fully paid or rolled into a newer invoice).` };
      } else if (txn.amount > remainingBalance(invoice) + 1) {
        effective = {
          kind: 'queue',
          landlordId: invoice.landlordId,
          reason: `Amount KSh ${txn.amount.toLocaleString()} exceeds balance KSh ${remainingBalance(invoice).toLocaleString()} on ${invoice.invoiceNumber}.`,
          suggestion: { tenantId: invoice.tenantId, tenantName: invoice.tenantName, unitNumber: invoice.unitNumber, confidence: plan.confidence }
        };
      }
    }

    // ---- WRITES ----
    if (effective.kind === 'post' && invoice) {
      const adj = applyToInvoice(invoice, txn.amount);
      const audit = buildAudit(txn, ctx, effective.method as any, effective.confidence);
      const payment: Payment = {
        id: paymentId,
        serialNumber: serial,
        invoiceId: invoice.id,
        tenantId: invoice.tenantId,
        tenantName: invoice.tenantName,
        tenantEmail: invoice.tenantEmail,
        unitNumber: invoice.unitNumber,
        propertyName: invoice.propertyName,
        propertyId: invoice.propertyId,
        landlordId: invoice.landlordId,
        periodMonth: invoice.periodMonth,
        amount: txn.amount,
        paymentMethod: ctx.paymentMethod || methodLabel(txn),
        referenceCode: txn.reference,
        paymentDate: txn.transactionDate || nowIso,
        status: 'Completed',
        verificationSource: ctx.verifiedVia,
        bank: txn.bank,
        bankTransactionId: bankTxnId,
        bankAudit: audit,
        recordedBy: ctx.recordedBy,
        notes: ctx.notes || `${describeSource(txn)} payment verified (${ctx.verifiedVia}). Serial: ${serial}`,
        externalDeliveryStatus: 'pending'
      };
      tx.create(COLLECTIONS.PAYMENTS, paymentId, payment);
      tx.update(COLLECTIONS.INVOICES, invoice.id, { amountPaid: adj.amountPaid, status: adj.status });
      tx.create(COLLECTIONS.BANK_TRANSACTIONS, bankTxnId, {
        id: bankTxnId, ...txn, status: 'posted', paymentId, invoiceId: invoice.id, landlordId: invoice.landlordId,
        verifiedVia: ctx.verifiedVia, signatureVerified: Boolean(ctx.signatureVerified), recordedAt: nowIso
      });
      tx.create(COLLECTIONS.REF_CLAIMS, cId, {
        reference: txn.reference, rail: txn.bank, status: 'posted', paymentId, invoiceId: invoice.id,
        landlordId: invoice.landlordId, amount: txn.amount, createdAt: nowIso, updatedAt: nowIso
      } satisfies ClaimDoc);
      return {
        outcome: 'posted',
        reason: `Posted KSh ${txn.amount.toLocaleString()} to invoice ${invoice.invoiceNumber}.`,
        payment,
        invoice: { ...invoice, amountPaid: adj.amountPaid, status: adj.status }
      };
    }

    // Queue for manual assignment
    const q = effective as QueuePlan;
    const unacc: UnaccountedPayment = {
      id: unaccId,
      landlordId: q.landlordId,
      bankTransactionId: bankTxnId,
      bank: txn.bank,
      currency: txn.currency,
      source: txn.bank === 'mpesa' ? 'M-Pesa Paybill' : txn.channel === 'PESALINK' ? 'Pesalink' : 'Bank Transfer',
      referenceCode: txn.reference,
      senderName: txn.payerName,
      senderPhone: txn.payerPhone,
      amount: txn.amount,
      receivedDate: txn.transactionDate || nowIso,
      rawNarration: txn.narration,
      accountReferenceRaw: txn.customerReference,
      bankName: describeSource(txn),
      notes: [q.reason, q.notes].filter(Boolean).join(' '),
      status: 'Pending Assignment',
      matchConfidence: q.suggestion?.confidence ?? 0,
      suggestedTenantId: q.suggestion?.tenantId,
      suggestedTenantName: q.suggestion?.tenantName,
      suggestedUnitNumber: q.suggestion?.unitNumber
    };
    tx.create(COLLECTIONS.UNACCOUNTED, unaccId, unacc);
    tx.create(COLLECTIONS.BANK_TRANSACTIONS, bankTxnId, {
      id: bankTxnId, ...txn, status: 'queued', unaccountedId: unaccId, landlordId: q.landlordId,
      verifiedVia: ctx.verifiedVia, signatureVerified: Boolean(ctx.signatureVerified), recordedAt: nowIso
    });
    tx.create(COLLECTIONS.REF_CLAIMS, cId, {
      reference: txn.reference, rail: txn.bank, status: 'queued', unaccountedId: unaccId,
      landlordId: q.landlordId, amount: txn.amount, createdAt: nowIso, updatedAt: nowIso
    } satisfies ClaimDoc);
    return { outcome: 'queued', reason: q.reason, unaccounted: unacc };
  });
}

// ---------------------------------------------------------------------------
// Landlord assigns a queued deposit to a tenant invoice
// ---------------------------------------------------------------------------
export interface AssignInput {
  landlordId: string; // caller (verified by the route)
  unaccountedId: string;
  tenantId: string;
  invoiceId?: string;
  notes?: string;
  /** System-initiated assignment after the deposit was corroborated against the invoice. */
  system?: { verifiedVia: PaymentVerificationSource; confidence: number };
}

export async function assignUnaccountedPayment(input: AssignInput): Promise<LedgerResult> {
  const store = getStore();
  const serial = generateSerial('RCT');
  const nowIso = new Date().toISOString();

  return store.transact<LedgerResult>(async (tx) => {
    const unacc = await tx.get<UnaccountedPayment>(COLLECTIONS.UNACCOUNTED, input.unaccountedId);
    if (!unacc) return { outcome: 'rejected', reason: 'Queued payment not found.' };
    // Ownership: queue entries belong to a landlord. Unowned ones (could not be attributed) may be
    // claimed by a landlord only if the target tenant is theirs (checked below).
    if (unacc.landlordId && unacc.landlordId !== input.landlordId) {
      return { outcome: 'rejected', reason: 'This queued payment belongs to another landlord.' };
    }
    if (unacc.status !== 'Pending Assignment') {
      return { outcome: 'rejected', reason: `This payment has already been ${unacc.status.toLowerCase()}.` };
    }

    const tenant = await tx.get<Tenant>(COLLECTIONS.TENANTS, input.tenantId);
    if (!tenant || tenant.landlordId !== input.landlordId) {
      return { outcome: 'rejected', reason: 'Tenant not found in your portfolio.' };
    }

    // Choose invoice: explicit, else oldest open invoice for this tenant (read before write).
    let invoice: Invoice | undefined;
    if (input.invoiceId) {
      invoice = await tx.get<Invoice>(COLLECTIONS.INVOICES, input.invoiceId);
    } else {
      const open = (await store.where<Invoice>(COLLECTIONS.INVOICES, 'tenantId', tenant.id))
        .filter((i) => remainingBalance(i) > 0)
        .sort((a, b) => (a.issueDate || a.invoiceNumber).localeCompare(b.issueDate || b.invoiceNumber));
      if (open[0]) invoice = await tx.get<Invoice>(COLLECTIONS.INVOICES, open[0].id);
    }
    if (!invoice) return { outcome: 'rejected', reason: 'No open invoice found for this tenant. Generate an invoice first.' };
    if (invoice.tenantId !== tenant.id || invoice.landlordId !== input.landlordId) {
      return { outcome: 'rejected', reason: 'Invoice does not belong to the selected tenant.' };
    }
    const remaining = remainingBalance(invoice);
    if (remaining <= 0) return { outcome: 'rejected', reason: `Invoice ${invoice.invoiceNumber} is already settled (fully paid or rolled into a newer invoice).` };
    if (unacc.amount > remaining + 1) {
      return {
        outcome: 'rejected',
        reason: `Deposit of KSh ${unacc.amount.toLocaleString()} exceeds the balance KSh ${remaining.toLocaleString()} on ${invoice.invoiceNumber}. Choose a larger invoice or generate a new one.`
      };
    }

    const rk = refKey(unacc.referenceCode);
    const paymentId = `pay-${rk}`;
    const adj = applyToInvoice(invoice, unacc.amount);
    const txnLike: NormalizedBankTxn = {
      bank: (unacc.bank as any) || 'equity',
      reference: unacc.referenceCode,
      amount: unacc.amount,
      currency: unacc.currency || 'KES',
      direction: 'credit',
      status: 'success',
      channel: unacc.source === 'Pesalink' ? 'PESALINK' : 'BANK_TRANSFER',
      narration: unacc.rawNarration || '',
      customerReference: unacc.accountReferenceRaw || '',
      payerName: unacc.senderName,
      payerPhone: unacc.senderPhone,
      transactionDate: unacc.receivedDate,
      origin: 'webhook'
    };
    const payment: Payment = {
      id: paymentId,
      serialNumber: serial,
      invoiceId: invoice.id,
      tenantId: tenant.id,
      tenantName: tenant.fullName,
      tenantEmail: tenant.email,
      unitNumber: invoice.unitNumber || tenant.unitNumber,
      propertyName: invoice.propertyName || tenant.propertyName,
      propertyId: invoice.propertyId || tenant.propertyId,
      landlordId: input.landlordId,
      periodMonth: invoice.periodMonth,
      amount: unacc.amount,
      paymentMethod: unacc.bank === 'mpesa' ? 'M-Pesa' : 'Bank Transfer',
      referenceCode: unacc.referenceCode,
      paymentDate: unacc.receivedDate || nowIso,
      status: 'Completed',
      verificationSource: input.system ? input.system.verifiedVia : 'manual-landlord',
      bank: unacc.bank,
      bankTransactionId: unacc.bankTransactionId,
      bankAudit: buildAudit(
        txnLike,
        { verifiedVia: input.system ? input.system.verifiedVia : 'manual-landlord', recordedBy: input.landlordId },
        input.system ? 'invoice-reference' : 'manual-assignment',
        input.system ? input.system.confidence : 100
      ),
      recordedBy: input.system ? undefined : input.landlordId,
      notes: `${input.system ? 'Auto-assigned after tenant verification.' : 'Assigned from unaccounted queue by landlord.'} ${input.notes || ''}`.trim() + ` Serial: ${serial}`,
      externalDeliveryStatus: 'pending'
    };

    tx.create(COLLECTIONS.PAYMENTS, paymentId, payment);
    tx.update(COLLECTIONS.INVOICES, invoice.id, { amountPaid: adj.amountPaid, status: adj.status });
    tx.update(COLLECTIONS.UNACCOUNTED, unacc.id, {
      status: 'Reconciled',
      reconciledTenantId: tenant.id,
      reconciledTenantName: tenant.fullName,
      reconciledInvoiceId: invoice.id,
      reconciledAt: nowIso,
      landlordId: input.landlordId
    });
    if (unacc.bankTransactionId) {
      tx.update(COLLECTIONS.BANK_TRANSACTIONS, unacc.bankTransactionId, { status: 'posted', paymentId, invoiceId: invoice.id });
    }
    tx.update(COLLECTIONS.REF_CLAIMS, claimId(unacc.referenceCode), { status: 'posted', paymentId, invoiceId: invoice.id, updatedAt: nowIso });

    return {
      outcome: 'posted',
      reason: `Assigned to ${tenant.fullName} / ${invoice.invoiceNumber}.`,
      payment,
      invoice: { ...invoice, amountPaid: adj.amountPaid, status: adj.status }
    };
  });
}

export async function ignoreUnaccountedPayment(landlordId: string, unaccountedId: string, reason: string): Promise<LedgerResult> {
  return getStore().transact<LedgerResult>(async (tx) => {
    const unacc = await tx.get<UnaccountedPayment>(COLLECTIONS.UNACCOUNTED, unaccountedId);
    if (!unacc) return { outcome: 'rejected', reason: 'Queued payment not found.' };
    if (unacc.landlordId && unacc.landlordId !== landlordId) return { outcome: 'rejected', reason: 'This queued payment belongs to another landlord.' };
    if (!unacc.landlordId) return { outcome: 'rejected', reason: 'Unattributed deposits can only be handled by assigning them to your tenant.' };
    if (unacc.status !== 'Pending Assignment') return { outcome: 'rejected', reason: `Already ${unacc.status.toLowerCase()}.` };
    // The reference claim is intentionally kept: an ignored deposit must never be redeemable later.
    tx.update(COLLECTIONS.UNACCOUNTED, unaccountedId, { status: 'Ignored', ignoredReason: reason.slice(0, 300) });
    return { outcome: 'ignored', reason: 'Marked as ignored.' };
  });
}

// ---------------------------------------------------------------------------
// Manual entry by a landlord (cash, or a bank/M-Pesa reference they vouch for)
// ---------------------------------------------------------------------------
export interface ManualPaymentInput {
  landlordId: string;
  invoiceId: string;
  amount: number;
  paymentMethod: Payment['paymentMethod'];
  referenceCode?: string;
  notes?: string;
  paymentDate?: string;
}

export async function recordManualPayment(input: ManualPaymentInput): Promise<LedgerResult> {
  const store = getStore();
  const nowIso = new Date().toISOString();
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { outcome: 'rejected', reason: 'Amount must be greater than zero.' };
  if (amount > 100_000_000) return { outcome: 'rejected', reason: 'Amount exceeds sanity limit.' };

  const method = input.paymentMethod;
  const needsRef = method === 'M-Pesa' || method === 'Bank Transfer' || method === 'Check' || method === 'Credit Card';
  let reference = canonicalReference(input.referenceCode);
  if (reference && !isPlainReference(reference)) return { outcome: 'rejected', reason: 'The reference may only contain letters, digits and - _ / . (at least 4 letters/digits).' };
  if (needsRef) {
    if (reference.length < 6) return { outcome: 'rejected', reason: 'A transaction reference of at least 6 characters is required for this payment method.' };
    if (/^(REF|TEST|DEMO|SAB0+)/.test(reference)) return { outcome: 'rejected', reason: 'This reference looks like a placeholder. Enter the real confirmation code.' };
  } else if (!reference) {
    reference = `CASH-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  }

  const rk = refKey(reference);
  const paymentId = `pay-${rk}`;
  const cId = claimId(reference);
  const serial = generateSerial('RCT');

  return store.transact<LedgerResult>(async (tx) => {
    const claim = await tx.get<ClaimDoc>(COLLECTIONS.REF_CLAIMS, cId);
    if (claim) return { outcome: 'duplicate', reason: `Reference ${reference} has already been used. Duplicate payments are not permitted.` };

    const invoice = await tx.get<Invoice>(COLLECTIONS.INVOICES, input.invoiceId);
    if (!invoice) return { outcome: 'rejected', reason: 'Invoice not found.' };
    if (invoice.landlordId !== input.landlordId) return { outcome: 'rejected', reason: 'Invoice not found.' };
    const remaining = remainingBalance(invoice);
    if (remaining <= 0) return { outcome: 'rejected', reason: `Invoice ${invoice.invoiceNumber} is already settled (fully paid or rolled into a newer invoice).` };
    if (amount > remaining + 0.5) {
      return { outcome: 'rejected', reason: `Amount KSh ${amount.toLocaleString()} exceeds the outstanding balance KSh ${remaining.toLocaleString()}.` };
    }

    const adj = applyToInvoice(invoice, amount);
    const payment: Payment = {
      id: paymentId,
      serialNumber: serial,
      invoiceId: invoice.id,
      tenantId: invoice.tenantId,
      tenantName: invoice.tenantName,
      tenantEmail: invoice.tenantEmail,
      unitNumber: invoice.unitNumber,
      propertyName: invoice.propertyName,
      propertyId: invoice.propertyId,
      landlordId: invoice.landlordId,
      periodMonth: invoice.periodMonth,
      amount,
      paymentMethod: method,
      referenceCode: reference,
      paymentDate: input.paymentDate && !isNaN(Date.parse(input.paymentDate)) ? new Date(input.paymentDate).toISOString() : nowIso,
      status: 'Completed',
      verificationSource: 'manual-landlord',
      recordedBy: input.landlordId,
      notes: `${input.notes ? input.notes + ' ' : ''}Recorded manually by landlord (not bank-verified). Serial: ${serial}`.trim(),
      externalDeliveryStatus: 'pending'
    };
    tx.create(COLLECTIONS.PAYMENTS, paymentId, payment);
    tx.update(COLLECTIONS.INVOICES, invoice.id, { amountPaid: adj.amountPaid, status: adj.status });
    tx.create(COLLECTIONS.REF_CLAIMS, cId, {
      reference, rail: 'manual', status: 'posted', paymentId, invoiceId: invoice.id,
      landlordId: invoice.landlordId, amount, createdAt: nowIso, updatedAt: nowIso
    } satisfies ClaimDoc);
    return { outcome: 'posted', reason: `Recorded KSh ${amount.toLocaleString()} against ${invoice.invoiceNumber}.`, payment, invoice: { ...invoice, amountPaid: adj.amountPaid, status: adj.status } };
  });
}

// ---------------------------------------------------------------------------
// Reversal (records adjustment): void a payment and restore the invoice balance
// ---------------------------------------------------------------------------
export async function reversePayment(landlordId: string, paymentId: string, reason: string): Promise<LedgerResult> {
  const nowIso = new Date().toISOString();
  return getStore().transact<LedgerResult>(async (tx) => {
    const payment = await tx.get<Payment>(COLLECTIONS.PAYMENTS, paymentId);
    if (!payment || payment.landlordId !== landlordId) return { outcome: 'rejected', reason: 'Payment not found.' };
    if (payment.status === 'Failed') return { outcome: 'rejected', reason: 'Payment is already reversed.' };
    const invoice = payment.invoiceId ? await tx.get<Invoice>(COLLECTIONS.INVOICES, payment.invoiceId) : undefined;

    tx.update(COLLECTIONS.PAYMENTS, paymentId, {
      status: 'Failed',
      notes: `${payment.notes || ''} | REVERSED ${nowIso}: ${reason.slice(0, 200)}`.trim()
    });
    if (invoice) {
      const paid = Math.max(0, round2((invoice.amountPaid || 0) - payment.amount));
      const status: Invoice['status'] = paid <= 0 ? 'Unpaid' : paid + 0.005 >= invoice.totalAmount ? 'Paid' : 'Partial';
      tx.update(COLLECTIONS.INVOICES, invoice.id, { amountPaid: paid, status });
    }
    // The reference claim stays: a reversed payment's reference can NEVER be reused.
    return { outcome: 'posted', reason: 'Payment reversed and invoice balance restored.', payment: { ...payment, status: 'Failed' } };
  });
}

// ---------------------------------------------------------------------------
// Landlord subscription (platform revenue) – separate, idempotent
// ---------------------------------------------------------------------------
export async function claimSubscriptionReference(reference: string, landlordId: string, amount: number): Promise<boolean> {
  const ref = canonicalReference(reference);
  if (!ref) return false;
  const store = getStore();
  const nowIso = new Date().toISOString();
  return store.create(COLLECTIONS.REF_CLAIMS, claimId(ref), {
    reference: ref, rail: 'subscription', status: 'posted', landlordId, amount, createdAt: nowIso, updatedAt: nowIso
  } satisfies ClaimDoc);
}

export { DELETE_FIELD };
export type { Landlord };
