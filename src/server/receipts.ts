/**
 * Receipts & statements: PDF generation, signed download links, e-mail dispatch.
 * Only COMPLETED payments count towards statements/cumulative totals (reversed payments are excluded).
 */
import { getStore } from './store.js';
import { COLLECTIONS } from './db.js';
import { signLink } from './auth.js';
import { dispatchSystemEmail } from './mailer.js';
import { receiptEmailHtml } from './templates.js';
import { generatePaymentReceiptAndStatementPdf } from '../lib/pdfStatementGenerator.js';
import { generateSerial } from '../lib/security.js';
import type { Invoice, Landlord, Payment, Tenant } from '../types.js';

export function appBaseUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

const VERIFIED_LABEL: Record<string, string> = {
  'bank-webhook': 'Bank notification (real-time)',
  'bank-api-query': 'Bank transaction query (API)',
  'mpesa-daraja': 'Safaricom M-Pesa (Daraja)',
  'statement-reconciliation': 'Bank statement reconciliation (landlord-supplied)',
  'manual-landlord': 'Recorded by landlord (not bank-verified)'
};

/** Human-readable audit lines printed on receipts (PDF + e-mail + UI use the same facts). */
export function paymentAuditLines(p: Payment): string[] {
  const a = p.bankAudit;
  if (!a) {
    return p.verificationSource === 'manual-landlord'
      ? ['Recorded manually by the landlord. This entry has not been confirmed by a bank or M-Pesa feed.']
      : [];
  }
  const lines = [
    `Rail: ${String(a.bank || '').toUpperCase()}${a.channel ? ` (${a.channel})` : ''}    Bank reference: ${a.bankReference}`,
    `Verified via: ${VERIFIED_LABEL[a.verifiedVia] || a.verifiedVia}${a.signatureVerified ? ' - bank signature verified' : ''}`,
    `Matched to invoice by: ${a.matchMethod || 'n/a'}${a.matchConfidence != null ? ` (${a.matchConfidence}% confidence)` : ''}`
  ];
  if (a.payerName || a.payerPhoneMasked) lines.push(`Payer: ${[a.payerName, a.payerPhoneMasked].filter(Boolean).join(' / ')}`);
  if (a.accountMasked) lines.push(`Credited account: ${a.accountMasked}`);
  lines.push(`Bank received: ${a.receivedAt ? new Date(a.receivedAt).toLocaleString('en-KE') : 'n/a'}    Verified: ${a.verifiedAt ? new Date(a.verifiedAt).toLocaleString('en-KE') : 'n/a'}`);
  return lines;
}

export function signedReceiptPath(paymentId: string): string {
  const { exp, sig } = signLink(`receipt:${paymentId}`);
  return `/api/payments/${encodeURIComponent(paymentId)}/receipt-pdf?exp=${exp}&sig=${sig}`;
}
export function signedStatementPath(tenantId: string, paymentId?: string): string {
  const { exp, sig } = signLink(`statement:${tenantId}`);
  return `/api/tenants/${encodeURIComponent(tenantId)}/statement-pdf?${paymentId ? `paymentId=${encodeURIComponent(paymentId)}&` : ''}exp=${exp}&sig=${sig}`;
}

async function tenantHistory(tenantId: string): Promise<Payment[]> {
  const rows = await getStore().where<Payment>(COLLECTIONS.PAYMENTS, 'tenantId', tenantId);
  return rows
    .filter((p) => p.status === 'Completed')
    .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());
}

export async function buildReceiptPdf(current: Payment): Promise<{ pdf: Buffer; history: Payment[]; cumulative: number }> {
  const store = getStore();
  const tenant = current.tenantId ? await store.get<Tenant>(COLLECTIONS.TENANTS, current.tenantId) : undefined;
  const landlord = current.landlordId ? await store.get<Landlord>(COLLECTIONS.LANDLORDS, current.landlordId) : undefined;
  const invoice = current.invoiceId ? await store.get<Invoice>(COLLECTIONS.INVOICES, current.invoiceId) : undefined;
  const history = current.tenantId ? await tenantHistory(current.tenantId) : [current];
  const cumulative = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const audit = paymentAuditLines(current);
  const pdf = await generatePaymentReceiptAndStatementPdf({
    companyName: landlord?.companyName || landlord?.name,
    landlordName: landlord?.name, landlordPhone: landlord?.phone, landlordEmail: landlord?.email,
    tenantName: current.tenantName || tenant?.fullName || 'Tenant',
    tenantEmail: current.tenantEmail || tenant?.email || '', tenantPhone: tenant?.phone || '',
    unitNumber: current.unitNumber || tenant?.unitNumber || '', propertyName: current.propertyName || tenant?.propertyName || '',
    moveInDate: tenant?.moveInDate || '',
    currentPayment: {
      serialNumber: current.serialNumber || generateSerial('RCT'), amount: current.amount, paymentMethod: current.paymentMethod,
      referenceCode: current.referenceCode, paymentDate: current.paymentDate, periodMonth: current.periodMonth || invoice?.periodMonth,
      invoiceNumber: invoice?.invoiceNumber || current.invoiceId,
      audit: audit.length ? { title: current.bankAudit ? 'Verified bank audit trail' : 'Verification note', lines: audit } : undefined
    },
    paymentHistory: history.map((p) => ({
      paymentDate: p.paymentDate, amount: p.amount, paymentMethod: p.paymentMethod, referenceCode: p.referenceCode,
      periodMonth: p.periodMonth || p.notes, notes: p.notes
    })),
    cumulativeTotalPaid: cumulative
  });
  return { pdf, history, cumulative };
}

/** Sends the receipt e-mail (with PDF) for a posted payment. Never throws. */
export async function sendReceipt(payment: Payment, invoice?: Invoice): Promise<void> {
  try {
    const store = getStore();
    const tenant = payment.tenantId ? await store.get<Tenant>(COLLECTIONS.TENANTS, payment.tenantId) : undefined;
    const to = payment.tenantEmail || tenant?.email;
    if (!to) return;
    const serial = payment.serialNumber || generateSerial('RCT');
    const name = payment.tenantName || tenant?.fullName || 'Resident';
    let built: Awaited<ReturnType<typeof buildReceiptPdf>> | null = null;
    try { built = await buildReceiptPdf({ ...payment, serialNumber: serial }); } catch (e) { console.warn('[receipt] PDF failed:', (e as any)?.message); }
    const history = built?.history || [payment];
    const filename = `Receipt_${serial}.pdf`;
    const res = await dispatchSystemEmail({
      recipientEmail: to, recipientName: name, landlordId: payment.landlordId, documentId: payment.id,
      subject: `Payment receipt ${payment.referenceCode} (KSh ${Number(payment.amount).toLocaleString('en-KE')})`,
      emailType: 'Payment Receipt', prefix: 'RCT', serialNumber: serial,
      bodyHtml: receiptEmailHtml({
        pay: payment, invoice, serial, recipientName: name, history,
        cumulative: built?.cumulative ?? payment.amount, pdfFilename: filename,
        downloadUrl: `${appBaseUrl()}${signedReceiptPath(payment.id)}`
      }),
      attachments: built ? [{ filename, content: built.pdf, contentType: 'application/pdf' }] : undefined
    });
    await store.update(COLLECTIONS.PAYMENTS, payment.id, { externalDeliveryStatus: res.externalDelivered ? 'delivered' : 'simulated_fallback' }).catch(() => undefined);
  } catch (err) {
    console.warn('[receipt] dispatch failed:', (err as any)?.message || err);
  }
}
