/**
 * Invoices, quotes, payments, the unaccounted-deposit queue, statement reconciliation and receipts.
 *
 * Records-adjustment guarantees:
 *  - Money only enters the books through ledger.ts (atomic, claim-once, balance re-checked in-transaction).
 *  - Tenants can NOT self-record payments; they verify a bank/M-Pesa reference (see bankRoutes) and the
 *    server confirms it with the bank before anything is posted.
 *  - New invoices carry forward unpaid balances ONCE: older invoices are marked rolled-over so the same debt
 *    can never be collected (or paid) twice.
 *  - Reversals restore the invoice balance and permanently burn the reference.
 */
import crypto from 'crypto';
import { getStore } from './store.js';
import { COLLECTIONS } from './db.js';
import { AuthContext, ReqLike, ResLike, rateLimit, requireLandlord, verifyLink, clientIp } from './auth.js';
import { App, body, h, num, str } from './http.js';
import { logSecurityEvent } from './audit.js';
import { dispatchSystemEmail } from './mailer.js';
import { invoiceEmailHtml, quoteEmailHtml } from './templates.js';
import { buildReceiptPdf, sendReceipt } from './receipts.js';
import { requireActiveSubscription } from './guards.js';
import { makePaymentReference } from './bankRoutes.js';
import {
  assignUnaccountedPayment, ignoreUnaccountedPayment, processInboundTransaction, recordManualPayment, reversePayment
} from './ledger.js';
import { PayloadError, matchTransaction, normalizeStatementRow, remainingBalance, round2, MatchInvoice } from '../lib/bankService.js';
import { generateInvoicePdf } from '../lib/pdfStatementGenerator.js';
import { generateSerial, isValidEmail, newId, normalizeEmail, verifyPasswordCredential } from '../lib/security.js';
import type { Invoice, Landlord, MaintenanceRequest, Payment, Quote, Tenant, UnaccountedPayment, Unit, Property } from '../types.js';

const MAX_FEE = 10_000_000;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function parseCost(m: MaintenanceRequest): number {
  const c = Number(m.cost);
  if (Number.isFinite(c) && c > 0) return c;
  const est = m.aiEstimatedCost ? parseFloat(m.aiEstimatedCost.replace(/[^\d.]/g, '')) : 0;
  return Number.isFinite(est) ? est : 0;
}

async function openInvoicesFor(landlordId: string): Promise<MatchInvoice[]> {
  const store = getStore();
  const [invoices, tenants] = await Promise.all([
    store.where<Invoice>(COLLECTIONS.INVOICES, 'landlordId', landlordId),
    store.where<Tenant>(COLLECTIONS.TENANTS, 'landlordId', landlordId)
  ]);
  const phone = new Map(tenants.map((t) => [t.id, t.phone]));
  return invoices.filter((i) => remainingBalance(i) > 0).map((i) => ({
    id: i.id, invoiceNumber: i.invoiceNumber, paymentReference: i.paymentReference, landlordId: i.landlordId,
    tenantId: i.tenantId, tenantName: i.tenantName, tenantPhone: phone.get(i.tenantId), unitNumber: i.unitNumber,
    propertyName: i.propertyName, totalAmount: i.totalAmount, amountPaid: i.amountPaid, status: i.status
  }));
}

export function registerBillingRoutes(app: App) {
  const store = () => getStore();

  // ================================================================ invoices
  app.get('/api/invoices', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const rows = auth.role === 'landlord'
      ? await store().where<Invoice>(COLLECTIONS.INVOICES, 'landlordId', auth.userId)
      : await store().where<Invoice>(COLLECTIONS.INVOICES, 'tenantId', auth.userId);
    return res.json(rows.sort((a, b) => String(b.issueDate || '').localeCompare(String(a.issueDate || ''))));
  }));

  app.post('/api/invoices/generate', requireActiveSubscription as any, rateLimit({ name: 'inv-gen', max: 120, windowMs: 60 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }), h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const b = body(req);
    const tenant = await store().get<Tenant>(COLLECTIONS.TENANTS, str(b.tenantId, 80));
    if (!tenant || tenant.landlordId !== auth.userId) return res.status(404).json({ error: 'Tenant not found in your portfolio.' });
    const landlord = auth.user as Landlord;

    const periodMonth = str(b.periodMonth, 40) || new Date().toLocaleString('en-KE', { month: 'long', year: 'numeric' });
    const waterFee = Math.max(0, num(b.waterFee, 0)), trashFee = Math.max(0, num(b.trashFee, 0));
    let maintenanceFee = Math.max(0, num(b.maintenanceFee, 0));
    const discount = Math.max(0, num(b.discount, 0));
    const rent = Number(tenant.monthlyRent);
    if (!(rent > 0)) return res.status(400).json({ error: 'This tenant has no monthly rent set.' });
    if ([waterFee, trashFee, maintenanceFee, discount].some((n) => !Number.isFinite(n) || n > MAX_FEE)) return res.status(400).json({ error: 'One of the amounts is out of range.' });

    // One invoice per tenant per period (atomic guard against double-clicks / retries).
    const periodKey = `invperiod-${tenant.id}-${slug(periodMonth)}`;
    const fresh = await store().create(COLLECTIONS.REF_CLAIMS, periodKey, { kind: 'invoice-period', tenantId: tenant.id, periodMonth, createdAt: new Date().toISOString() });
    if (!fresh) return res.status(409).json({ error: `An invoice for ${periodMonth} already exists for ${tenant.fullName}.` });

    try {
      const unit = tenant.unitId ? await store().get<Unit>(COLLECTIONS.UNITS, tenant.unitId) : undefined;
      const prop = tenant.propertyId ? await store().get<Property>(COLLECTIONS.PROPERTIES, tenant.propertyId) : undefined;
      const prior = (await store().where<Invoice>(COLLECTIONS.INVOICES, 'tenantId', tenant.id)).filter((i) => remainingBalance(i) > 0);
      const maint = (await store().where<MaintenanceRequest>(COLLECTIONS.MAINTENANCE, 'landlordId', auth.userId))
        .filter((m) => m.tenantId === tenant.id && m.status === 'Completed' && !m.isBilled);
      if (maintenanceFee === 0 && maint.length) maintenanceFee = maint.reduce((s, m) => s + parseCost(m), 0);

      const invId = newId('inv');
      const serial = generateSerial('INV');
      const issue = new Date();
      const due = new Date(issue.getTime() + 5 * 86400_000);
      let invoice!: Invoice;
      let carried = 0;
      let waived = 0;

      await store().transact(async (tx) => {
        // Re-read every candidate INSIDE the transaction so a concurrent payment can't be double counted.
        const live: Invoice[] = [];
        for (const p of prior) {
          const cur = await tx.get<Invoice>(COLLECTIONS.INVOICES, p.id);
          if (cur && remainingBalance(cur) > 0) live.push(cur);
        }
        const computed = round2(live.reduce((s, i) => s + remainingBalance(i), 0));
        // The landlord may WAIVE part of the arrears (lower the figure), never invent more.
        const requested = b.previousArrears !== undefined ? Math.max(0, num(b.previousArrears, computed)) : computed;
        carried = round2(Math.min(requested, computed));
        waived = round2(computed - carried);
        const total = round2(rent + waterFee + trashFee + maintenanceFee + carried - discount);
        if (!(total > 0)) throw new PayloadError('The invoice total must be greater than zero.');
        invoice = {
          id: invId, landlordId: auth.userId, serialNumber: serial, invoiceNumber: `INV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          paymentReference: makePaymentReference(tenant.unitNumber || unit?.unitNumber, invId),
          tenantId: tenant.id, tenantName: tenant.fullName, tenantEmail: tenant.email,
          unitId: tenant.unitId || unit?.id || '', unitNumber: tenant.unitNumber || unit?.unitNumber || '',
          propertyId: tenant.propertyId || unit?.propertyId, propertyName: tenant.propertyName || unit?.propertyName || prop?.name || '',
          issueDate: issue.toISOString().split('T')[0], dueDate: due.toISOString().split('T')[0], periodMonth,
          rentAmount: rent, waterFee, trashFee, maintenanceFee, taxAmount: 0, discount, previousArrears: carried,
          totalAmount: total, status: 'Unpaid', amountPaid: 0, externalDeliveryStatus: 'pending',
          notes: str(b.notes, 500) || `Rent statement for ${periodMonth}.${waived ? ` Landlord waived KSh ${waived.toLocaleString()} of previous arrears.` : ''} Serial: ${serial}`,
          emailedToTenant: false
        };
        tx.create(COLLECTIONS.INVOICES, invId, invoice as any);
        // Roll the old balances forward (they are now collected through THIS invoice only).
        for (const old of live) {
          tx.update(COLLECTIONS.INVOICES, old.id, { carriedForwardAmount: remainingBalance(old), carriedForwardToInvoiceId: invId });
        }
      });

      for (const m of maint) {
        await store().update(COLLECTIONS.MAINTENANCE, m.id, { isBilled: true, billedToInvoiceId: invId, billedAt: new Date().toISOString(), billedAmount: parseCost(m) }).catch(() => undefined);
      }
      await logSecurityEvent('SENSITIVE_DATA_MODIFIED', 'LOW', `Invoice ${invoice.invoiceNumber} issued to ${tenant.fullName} (KSh ${invoice.totalAmount}); carried ${carried}, waived ${waived}`, req, auth.user.email, auth.userId, 'landlord');

      // Deliver (best effort; the invoice already exists)
      const sent = await emailInvoice(invoice, landlord, tenant, prop?.address);
      if (sent) {
        await store().update(COLLECTIONS.INVOICES, invId, { emailedToTenant: true, emailSentAt: new Date().toISOString(), externalDeliveryStatus: sent.externalDelivered ? 'delivered' : 'simulated_fallback' }).catch(() => undefined);
        invoice = { ...invoice, emailedToTenant: true, externalDeliveryStatus: sent.externalDelivered ? 'delivered' : 'simulated_fallback' };
      }
      return res.status(201).json(invoice);
    } catch (err: any) {
      // Release the period guard so the landlord can retry after fixing the problem.
      await store().delete(COLLECTIONS.REF_CLAIMS, periodKey).catch(() => undefined);
      if (err instanceof PayloadError) return res.status(400).json({ error: err.message });
      throw err;
    }
  }));

  async function emailInvoice(inv: Invoice, landlord: Landlord, tenant: Tenant, address?: string) {
    try {
      const serial = inv.serialNumber || generateSerial('INV');
      let pdf: Buffer | undefined;
      try {
        pdf = await generateInvoicePdf({
          companyName: landlord.companyName || landlord.name, landlordName: landlord.name, landlordPhone: landlord.phone, landlordEmail: landlord.email,
          landlordPaybill: landlord.mpesaPaybill, landlordTill: landlord.mpesaTillNumber, bankName: landlord.bankName,
          accountName: landlord.accountName || landlord.name, accountNumber: landlord.accountNumber, invoice: inv,
          tenantName: tenant.fullName, tenantEmail: tenant.email, tenantPhone: tenant.phone,
          unitNumber: inv.unitNumber, propertyName: inv.propertyName, propertyAddress: address || inv.propertyName
        });
      } catch (e) { console.warn('[invoice] PDF failed:', (e as any)?.message); }
      return await dispatchSystemEmail({
        recipientEmail: tenant.email, recipientName: tenant.fullName, landlordId: inv.landlordId, documentId: inv.id,
        subject: `Rent invoice ${inv.invoiceNumber} (${inv.periodMonth}) - KSh ${inv.totalAmount.toLocaleString('en-KE')}`,
        emailType: 'Invoice', prefix: 'INV', serialNumber: serial,
        bodyHtml: invoiceEmailHtml(inv, landlord, serial, tenant.fullName),
        attachments: pdf ? [{ filename: `Invoice_${inv.invoiceNumber}.pdf`, content: pdf, contentType: 'application/pdf' }] : undefined
      });
    } catch (e) {
      console.warn('[invoice] email failed:', (e as any)?.message);
      return null;
    }
  }

  app.post('/api/invoices/:id/send-email', requireLandlord as any, rateLimit({ name: 'inv-mail', max: 60, windowMs: 60 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }), h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const inv = await store().get<Invoice>(COLLECTIONS.INVOICES, (req as any).params.id);
    if (!inv || inv.landlordId !== auth.userId) return res.status(404).json({ error: 'Invoice not found.' });
    const tenant = await store().get<Tenant>(COLLECTIONS.TENANTS, inv.tenantId);
    // Always the tenant's registered address: this endpoint is not a general mail relay.
    if (!tenant || tenant.landlordId !== auth.userId) return res.status(404).json({ error: 'Tenant not found.' });
    const prop = inv.propertyId ? await store().get<Property>(COLLECTIONS.PROPERTIES, inv.propertyId) : undefined;
    const r = await emailInvoice(inv, auth.user as Landlord, tenant, prop?.address);
    const serial = inv.serialNumber || r?.serialNumber;
    await store().update(COLLECTIONS.INVOICES, inv.id, { emailedToTenant: true, emailSentAt: new Date().toISOString(), tenantEmail: tenant.email, ...(serial ? { serialNumber: serial } : {}) });
    return res.json({ success: true, serialNumber: serial, recipientEmail: tenant.email, externalDelivered: Boolean(r?.externalDelivered), invoice: { ...inv, emailedToTenant: true }, message: `Invoice ${inv.invoiceNumber} sent to ${tenant.email}.` });
  }));

  // ================================================================= quotes
  app.get('/api/quotes', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    if (auth.role === 'landlord') return res.json(await store().where<Quote>(COLLECTIONS.QUOTES, 'landlordId', auth.userId));
    return res.json(await store().where<Quote>(COLLECTIONS.QUOTES, 'tenantId', auth.userId));
  }));

  app.post('/api/quotes/generate', requireActiveSubscription as any, rateLimit({ name: 'quote-gen', max: 60, windowMs: 60 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }), h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const b = body(req);
    const unit = await store().get<Unit>(COLLECTIONS.UNITS, str(b.unitId, 80));
    if (!unit || unit.landlordId !== auth.userId) return res.status(404).json({ error: 'Unit not found.' });
    const tenantEmail = normalizeEmail(b.tenantEmail);
    const tenantName = str(b.tenantName, 100);
    if (!tenantName || !isValidEmail(tenantEmail)) return res.status(400).json({ error: 'Prospect name and a valid email are required.' });
    const rent = num(b.monthlyRentQuote, unit.monthlyRent), deposit = num(b.depositQuote, unit.depositAmount ?? rent);
    if (!(rent > 0) || rent > MAX_FEE || deposit < 0 || deposit > MAX_FEE) return res.status(400).json({ error: 'Rent/deposit out of range.' });
    const term = Math.max(1, Math.min(120, Math.floor(num(b.leaseTermMonths, 12))));
    const serial = generateSerial('QTE');
    const qte: Quote = {
      id: newId('q'), landlordId: auth.userId, serialNumber: serial, quoteNumber: `QTE-${serial.slice(-6)}`,
      tenantName, tenantEmail, tenantPhone: str(b.tenantPhone, 30) || 'N/A', unitId: unit.id, unitNumber: unit.unitNumber, propertyName: unit.propertyName,
      monthlyRentQuote: rent, depositQuote: deposit, leaseTermMonths: term,
      validUntil: new Date(Date.now() + 14 * 86400_000).toISOString().split('T')[0], estimatedUtilities: 0, specialDiscount: 0,
      totalMoveInCost: round2(rent + deposit), notes: str(b.notes, 500) || `Official quotation. Serial: ${serial}`, status: 'Sent',
      externalDeliveryStatus: 'pending', createdAt: new Date().toISOString(), emailedToTenant: true, emailSentAt: new Date().toISOString()
    };
    await store().set(COLLECTIONS.QUOTES, qte.id, qte as any);
    const r = await dispatchSystemEmail({
      recipientEmail: tenantEmail, recipientName: tenantName, landlordId: auth.userId, documentId: qte.id,
      subject: `Rental quotation ${qte.quoteNumber} - Unit ${unit.unitNumber}`, emailType: 'Quote', prefix: 'QTE', serialNumber: serial, bodyHtml: quoteEmailHtml(qte, serial)
    }).catch(() => null);
    if (r?.externalDelivered) { qte.externalDeliveryStatus = 'delivered'; await store().update(COLLECTIONS.QUOTES, qte.id, { externalDeliveryStatus: 'delivered' }); }
    return res.status(201).json(qte);
  }));

  // =============================================================== payments
  app.get('/api/payments', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const rows = auth.role === 'landlord'
      ? await store().where<Payment>(COLLECTIONS.PAYMENTS, 'landlordId', auth.userId)
      : await store().where<Payment>(COLLECTIONS.PAYMENTS, 'tenantId', auth.userId);
    return res.json(rows.sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate))));
  }));

  /** Landlord records cash / a bank-or-M-Pesa reference they vouch for. Tenants must use bank verification. */
  app.post('/api/payments/record', rateLimit({ name: 'pay-record', max: 120, windowMs: 60 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }), h(async (req, res) => {
    const auth = req.auth as AuthContext;
    if (auth.role !== 'landlord') {
      await logSecurityEvent('ACCESS_DENIED', 'MEDIUM', 'Tenant attempted to self-record a payment', req, auth.user.email, auth.userId, 'tenant');
      return res.status(403).json({
        error: 'Payments are confirmed by the bank or M-Pesa, not typed in. Use "Verify my payment" with your transaction reference.',
        code: 'USE_VERIFICATION'
      });
    }
    const b = body(req);
    const method = (['M-Pesa', 'Bank Transfer', 'Credit Card', 'Cash', 'Check'] as const).find((m) => m === b.paymentMethod);
    if (!method) return res.status(400).json({ error: 'Choose a valid payment method.' });
    const r = await recordManualPayment({
      landlordId: auth.userId, invoiceId: str(b.invoiceId, 80), amount: num(b.amount, NaN), paymentMethod: method,
      referenceCode: str(b.referenceCode, 64), notes: str(b.notes, 300), paymentDate: str(b.paymentDate, 40) || undefined
    });
    if (r.outcome === 'posted' && r.payment) {
      await logSecurityEvent('PAYMENT_RECORDED', 'LOW', `Manual payment ${r.payment.referenceCode} KSh ${r.payment.amount}`, req, auth.user.email, auth.userId, 'landlord');
      sendReceipt(r.payment, r.invoice).catch(() => undefined);
      return res.status(201).json({ success: true, payment: r.payment, invoice: r.invoice, receiptCode: r.payment.referenceCode, message: r.reason });
    }
    return res.status(r.outcome === 'duplicate' ? 409 : 400).json({ error: r.reason, duplicate: r.outcome === 'duplicate' });
  }));

  app.post('/api/payments/:id/reverse', requireLandlord as any, rateLimit({ name: 'pay-reverse', max: 20, windowMs: 60 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }), h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const b = body(req);
    const reason = str(b.reason, 200);
    if (reason.length < 5) return res.status(400).json({ error: 'Give a reason (at least 5 characters) for the reversal.' });
    const pw = typeof b.confirmationPassword === 'string' ? b.confirmationPassword : '';
    if (!(await verifyPasswordCredential(pw, auth.user)).valid) {
      await logSecurityEvent('SUSPICIOUS_ACTIVITY', 'HIGH', 'Wrong password while reversing a payment', req, auth.user.email, auth.userId, 'landlord');
      return res.status(403).json({ error: 'Your password is required to reverse a payment.' });
    }
    const r = await reversePayment(auth.userId, (req as any).params.id, reason);
    if (r.outcome !== 'posted') return res.status(400).json({ error: r.reason });
    await logSecurityEvent('PAYMENT_REVERSED', 'HIGH', `Payment ${(req as any).params.id} reversed: ${reason}`, req, auth.user.email, auth.userId, 'landlord');
    return res.json({ success: true, payment: r.payment, message: r.reason });
  }));

  // ======================================================== unaccounted queue
  app.get('/api/payments/unaccounted', requireLandlord as any, h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const rows = await store().where<UnaccountedPayment>(COLLECTIONS.UNACCOUNTED, 'landlordId', auth.userId);
    return res.json(rows.sort((a, b) => String(b.receivedDate).localeCompare(String(a.receivedDate))));
  }));

  app.post('/api/payments/unaccounted/:id/assign', requireLandlord as any, rateLimit({ name: 'unacc-assign', max: 120, windowMs: 60 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }), h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const b = body(req);
    const r = await assignUnaccountedPayment({
      landlordId: auth.userId, unaccountedId: (req as any).params.id, tenantId: str(b.tenantId, 80),
      invoiceId: str(b.invoiceId, 80) || undefined, notes: str(b.notes, 300)
    });
    if (r.outcome !== 'posted' || !r.payment) return res.status(400).json({ error: r.reason });
    await logSecurityEvent('PAYMENT_RECORDED', 'LOW', `Queued deposit ${r.payment.referenceCode} assigned to ${r.payment.tenantName}`, req, auth.user.email, auth.userId, 'landlord');
    sendReceipt(r.payment, r.invoice).catch(() => undefined);
    const unaccounted = await store().get<UnaccountedPayment>(COLLECTIONS.UNACCOUNTED, (req as any).params.id);
    return res.json({ payment: r.payment, invoice: r.invoice, unaccounted, message: r.reason });
  }));

  app.post('/api/payments/unaccounted/:id/ignore', requireLandlord as any, h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const r = await ignoreUnaccountedPayment(auth.userId, (req as any).params.id, str(body(req).reason, 300) || 'Not a rent payment');
    if (r.outcome !== 'ignored') return res.status(400).json({ error: r.reason });
    return res.json({ success: true, message: r.reason });
  }));

  // ------------------------------------------------ statement reconciliation
  app.post('/api/payments/reconcile-statement', requireLandlord as any, rateLimit({ name: 'stmt-recon', max: 30, windowMs: 60 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }), h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const records = Array.isArray(body(req).records) ? body(req).records.slice(0, 500) : [];
    if (!records.length) return res.status(400).json({ error: 'No statement rows supplied.' });
    const open = await openInvoicesFor(auth.userId);
    const results: Array<{ referenceCode: string; outcome: string; reason: string; paymentId?: string; unaccountedId?: string; matchMethod?: string; confidence?: number }> = [];
    const posted: Payment[] = [];

    for (const row of records) {
      const refShown = str(row?.referenceCode, 64);
      try {
        const txn = normalizeStatementRow({
          referenceCode: row.referenceCode, amount: num(row.amount, NaN), description: str(row.description, 300), date: str(row.date, 40),
          bankName: str(row.bankName, 60), senderPhone: str(row.senderPhone, 30), senderName: str(row.senderName, 100)
        });
        // The landlord may pin a row to one of THEIR invoices; otherwise the engine matches it.
        const pinned = str(row.invoiceId, 80) ? open.find((o) => o.id === str(row.invoiceId, 80)) : undefined;
        const m = pinned ? null : matchTransaction(txn, open, []);
        const plan = pinned
          ? ({ kind: 'post', invoiceId: pinned.id, method: 'manual-assignment', confidence: 100 } as const)
          : m && m.decision === 'auto' && m.invoice
            ? ({ kind: 'post', invoiceId: m.invoice.id, method: m.method!, confidence: m.confidence } as const)
            : ({
                kind: 'queue', landlordId: auth.userId, reason: m?.reason || 'No matching open invoice.',
                suggestion: m?.suggestion ? { tenantId: m.suggestion.invoice.tenantId, tenantName: m.suggestion.invoice.tenantName, unitNumber: m.suggestion.invoice.unitNumber, confidence: m.suggestion.confidence } : undefined
              } as const);
        const r = await processInboundTransaction(txn, plan as any, { verifiedVia: 'statement-reconciliation', signatureVerified: false, recordedBy: auth.userId });
        if (r.outcome === 'posted' && r.payment) {
          posted.push(r.payment);
          const idx = open.findIndex((o) => o.id === r.invoice?.id);
          if (idx >= 0 && r.invoice) open[idx] = { ...open[idx], amountPaid: r.invoice.amountPaid, status: r.invoice.status };
        }
        results.push({ referenceCode: txn.reference, outcome: r.outcome, reason: r.reason, paymentId: r.payment?.id, unaccountedId: r.unaccounted?.id, matchMethod: (plan as any).method, confidence: (plan as any).confidence });
      } catch (err: any) {
        results.push({ referenceCode: refShown, outcome: 'rejected', reason: err instanceof PayloadError ? err.message : 'Row could not be processed.' });
      }
    }
    for (const p of posted) sendReceipt(p).catch(() => undefined);
    const count = (o: string) => results.filter((r) => r.outcome === o).length;
    await logSecurityEvent('PAYMENT_RECORDED', 'LOW', `Statement reconciliation: ${count('posted')} posted, ${count('queued')} queued, ${count('duplicate')} duplicate`, req, auth.user.email, auth.userId, 'landlord');
    return res.json({
      results, newPayments: posted,
      summary: { posted: count('posted'), queued: count('queued'), duplicate: count('duplicate'), rejected: count('rejected') + count('ignored') }
    });
  }));

  // ============================================================ PDF downloads
  /** Allowed if the caller owns the record (bearer session) OR holds a valid signed, expiring link from an e-mail. */
  const canDownload = (req: ReqLike, resource: string, ownerOk: (a: AuthContext) => boolean): boolean => {
    const q = (req as any).query || {};
    if (req.auth && ownerOk(req.auth)) return true;
    return verifyLink(resource, q.exp, q.sig);
  };

  const sendPdf = (res: ResLike, pdf: Buffer, filename: string) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9_.-]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    (res as any).setHeader('Content-Length', String(pdf.length));
    return (res as any).send(pdf);
  };

  app.get('/api/payments/:id/receipt-pdf', rateLimit({ name: 'pdf', max: 60, windowMs: 10 * 60_000 }), h(async (req, res) => {
    const id = (req as any).params.id;
    const pay = await store().get<Payment>(COLLECTIONS.PAYMENTS, id);
    if (!pay || !canDownload(req, `receipt:${id}`, (a) => (a.role === 'landlord' ? pay.landlordId === a.userId : pay.tenantId === a.userId))) {
      return res.status(404).json({ error: 'Receipt not found or link expired.' });
    }
    const { pdf } = await buildReceiptPdf(pay);
    return sendPdf(res, pdf, `EstateMaster_Receipt_${pay.serialNumber || pay.id}.pdf`);
  }));

  app.get('/api/tenants/:id/statement-pdf', rateLimit({ name: 'pdf', max: 60, windowMs: 10 * 60_000 }), h(async (req, res) => {
    const tenantId = (req as any).params.id;
    const tenant = await store().get<Tenant>(COLLECTIONS.TENANTS, tenantId);
    if (!tenant || !canDownload(req, `statement:${tenantId}`, (a) => (a.role === 'landlord' ? tenant.landlordId === a.userId : tenant.id === a.userId))) {
      return res.status(404).json({ error: 'Statement not found or link expired.' });
    }
    const payments = (await store().where<Payment>(COLLECTIONS.PAYMENTS, 'tenantId', tenantId)).filter((p) => p.status === 'Completed')
      .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());
    const wanted = str((req as any).query?.paymentId, 80);
    const current = payments.find((p) => p.id === wanted) || payments[payments.length - 1];
    if (!current) return res.status(404).json({ error: 'No completed payments to show yet.' });
    const { pdf } = await buildReceiptPdf(current);
    return sendPdf(res, pdf, `EstateMaster_Statement_${tenant.fullName}.pdf`);
  }));
}
