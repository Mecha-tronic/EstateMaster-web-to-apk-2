/**
 * HTML e-mail fragments (server-side). EVERY interpolated value is escaped.
 * Payment instructions always come from the tenant's OWN landlord record (never hard-coded).
 */
import { escapeHtml as e } from '../lib/security.js';
import type { Invoice, Landlord, Payment, Quote } from '../types.js';

const kes = (n: unknown) => `KSh ${Number(n || 0).toLocaleString('en-KE')}`;

export function paymentChannelsHtml(l: Partial<Landlord> | undefined | null, unitNumber?: string, paymentReference?: string): string {
  if (!l) return '<p style="font-size:12px;color:#64748b">Payment details are available in your tenant portal.</p>';
  const rows: string[] = [];
  if (l.mpesaPaybill) rows.push(`<p style="margin:2px 0">M-Pesa Paybill: <strong>${e(l.mpesaPaybill)}</strong> | Account: <strong>${e(paymentReference || unitNumber || '')}</strong></p>`);
  if (l.mpesaTillNumber) rows.push(`<p style="margin:2px 0">M-Pesa Buy Goods Till: <strong>${e(l.mpesaTillNumber)}</strong></p>`);
  if (l.bankName && l.accountNumber) {
    rows.push(`<p style="margin:2px 0">Bank: <strong>${e(l.bankName)}</strong>${l.branchName ? ` (${e(l.branchName)})` : ''} | A/C Name: <strong>${e(l.accountName || l.companyName || l.name)}</strong> | A/C No: <strong>${e(l.accountNumber)}</strong></p>`);
    if (paymentReference) rows.push(`<p style="margin:2px 0;color:#b45309">For bank transfers, quote this reference so we can match your deposit instantly: <strong style="font-family:monospace">${e(paymentReference)}</strong></p>`);
  }
  if (!rows.length) return '<p style="font-size:12px;color:#64748b">Your landlord has not published payment details yet. Please contact them.</p>';
  return `<div style="background:#f0fdf4;border:1px solid #86efac;padding:12px;border-radius:8px;margin:16px 0;font-size:12px;color:#166534"><p style="margin:2px 0;font-weight:bold">Official Payment Channels:</p>${rows.join('')}</div>`;
}

export function invoiceEmailHtml(inv: Invoice, landlord: Landlord | undefined, serial: string, name: string): string {
  return `
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:16px 0">
    <h3 style="color:#1e293b;margin-top:0;font-size:16px">Rent Invoice</h3>
    <p style="color:#334155;font-size:14px">Dear <strong>${e(name)}</strong>,</p>
    <p style="color:#334155;font-size:14px">Your invoice for <strong>${e(inv.periodMonth)}</strong> for unit <strong>${e(inv.unitNumber)}</strong> (${e(inv.propertyName)}) is ready. The PDF is attached.</p>
    <div style="background:#fff;border:1px solid #cbd5e1;padding:16px;border-radius:8px;margin:16px 0;font-size:13px">
      <p style="margin:4px 0"><strong>Document Serial:</strong> <code>${e(serial)}</code></p>
      <p style="margin:4px 0"><strong>Invoice Number:</strong> ${e(inv.invoiceNumber)}</p>
      <p style="margin:4px 0"><strong>Payment Reference:</strong> <code style="font-weight:bold">${e(inv.paymentReference || inv.invoiceNumber)}</code></p>
      <p style="margin:4px 0"><strong>Due Date:</strong> ${e(inv.dueDate)}</p>
      <p style="margin:4px 0"><strong>Base Rent:</strong> ${kes(inv.rentAmount)}</p>
      ${inv.previousArrears && inv.previousArrears > 0 ? `<p style="margin:4px 0;color:#b45309"><strong>Balance brought forward:</strong> ${kes(inv.previousArrears)}</p>` : ''}
      <p style="margin:4px 0"><strong>Water &amp; Trash:</strong> ${kes((inv.waterFee || 0) + (inv.trashFee || 0))}</p>
      ${inv.maintenanceFee ? `<p style="margin:4px 0"><strong>Maintenance:</strong> ${kes(inv.maintenanceFee)}</p>` : ''}
      ${inv.discount ? `<p style="margin:4px 0;color:#15803d"><strong>Discount:</strong> -${kes(inv.discount)}</p>` : ''}
      <hr style="border:0;border-top:1px solid #cbd5e1;margin:10px 0"/>
      <p style="margin:4px 0;font-size:16px;font-weight:bold">Total Amount Due: ${kes(inv.totalAmount)}</p>
    </div>
    ${paymentChannelsHtml(landlord, inv.unitNumber, inv.paymentReference)}
  </div>`;
}

export function quoteEmailHtml(q: Quote, serial: string): string {
  return `
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:16px 0">
    <h3 style="color:#0f172a;margin-top:0;font-size:16px">Official Rental Quote</h3>
    <p style="font-size:14px">Dear <strong>${e(q.tenantName)}</strong>, thank you for your interest in <strong>Unit ${e(q.unitNumber)}</strong> at <strong>${e(q.propertyName)}</strong>.</p>
    <div style="background:#fff;border:1px solid #cbd5e1;padding:16px;border-radius:8px;font-size:13px">
      <p style="margin:4px 0"><strong>Serial:</strong> <code>${e(serial)}</code></p>
      <p style="margin:4px 0"><strong>Quote #:</strong> ${e(q.quoteNumber)}</p>
      <p style="margin:4px 0"><strong>Monthly Rent:</strong> ${kes(q.monthlyRentQuote)}</p>
      <p style="margin:4px 0"><strong>Deposit:</strong> ${kes(q.depositQuote)}</p>
      <p style="margin:4px 0"><strong>Lease:</strong> ${e(q.leaseTermMonths)} months</p>
      <p style="margin:8px 0 0;font-size:16px;font-weight:bold;color:#0284c7">Total Move-in Cost: ${kes(q.totalMoveInCost)}</p>
      <p style="margin:4px 0;color:#64748b;font-size:12px">Valid until ${e(q.validUntil)}</p>
    </div>
  </div>`;
}

export function welcomeEmailHtml(opts: {
  fullName: string; unitNumber: string; propertyName: string; bedrooms?: number; bathrooms?: number;
  monthlyRent: number; leaseTermMonths: number | string; startDate: string; endDate: string; email: string;
  quote: Quote; invoice: Invoice; landlord?: Landlord; welcomeSerial: string; pendingApproval: boolean;
}): string {
  return `
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:16px 0">
    <p style="font-size:15px;margin-top:0">Hello <strong>${e(opts.fullName)}</strong>,</p>
    <p style="font-size:14px;line-height:1.5">Your registration for <strong>Unit ${e(opts.unitNumber)}</strong> at <strong>${e(opts.propertyName)}</strong> has been received.${opts.pendingApproval ? ' Your landlord will confirm your tenancy shortly.' : ''}</p>
    <div style="background:#fff;border-left:4px solid #2563eb;padding:16px;margin:16px 0;border-radius:4px;font-size:13px">
      <p style="margin:4px 0"><strong>Unit:</strong> ${e(opts.unitNumber)}${opts.bedrooms ? ` (${e(opts.bedrooms)} Bed, ${e(opts.bathrooms)} Bath)` : ''}</p>
      <p style="margin:4px 0"><strong>Monthly Rent:</strong> ${kes(opts.monthlyRent)}</p>
      <p style="margin:4px 0"><strong>Lease:</strong> ${e(opts.leaseTermMonths)} months (${e(opts.startDate)} to ${e(opts.endDate)})</p>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:16px;margin:16px 0;border-radius:8px;font-size:13px;color:#15803d">
      <p style="margin:4px 0">Quote #${e(opts.quote.quoteNumber)} - total move-in ${kes(opts.quote.totalMoveInCost)} (Serial: <code>${e(opts.quote.serialNumber)}</code>)</p>
      <p style="margin:4px 0">Invoice #${e(opts.invoice.invoiceNumber)} - ${kes(opts.invoice.totalAmount)} due ${e(opts.invoice.dueDate)} (Reference: <code>${e(opts.invoice.paymentReference)}</code>)</p>
    </div>
    ${paymentChannelsHtml(opts.landlord, opts.unitNumber, opts.invoice.paymentReference)}
    <p style="font-size:12px;color:#64748b">Welcome notice serial: <code>${e(opts.welcomeSerial)}</code></p>
  </div>`;
}

export function receiptEmailHtml(opts: {
  pay: Payment; invoice?: Invoice; serial: string; recipientName: string; history: Payment[]; cumulative: number; downloadUrl: string; pdfFilename: string;
}): string {
  const { pay, invoice, serial, history } = opts;
  const rows = history.map((p, i) => `
    <tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
      <td style="padding:8px 10px;font-size:12px">${i + 1}</td>
      <td style="padding:8px 10px;font-size:12px">${p.paymentDate ? e(new Date(p.paymentDate).toLocaleDateString('en-KE')) : ''}</td>
      <td style="padding:8px 10px;font-size:12px;font-family:monospace;font-weight:bold">${e(p.referenceCode || p.serialNumber)}</td>
      <td style="padding:8px 10px;font-size:12px">${e(p.periodMonth || 'Rent')}</td>
      <td style="padding:8px 10px;font-size:12px">${e(p.paymentMethod)}</td>
      <td style="padding:8px 10px;font-size:12px;text-align:right;font-weight:bold">${kes(p.amount)}</td>
    </tr>`).join('');
  const a = pay.bankAudit;
  const audit = a ? `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin-top:12px;font-size:12px;color:#1e3a8a">
      <p style="margin:0 0 6px;font-weight:bold">Verified bank audit trail</p>
      <p style="margin:2px 0">Bank / rail: <strong>${e((a.bank || '').toString().toUpperCase())}</strong>${a.channel ? ` (${e(a.channel)})` : ''}</p>
      <p style="margin:2px 0">Bank reference: <strong style="font-family:monospace">${e(a.bankReference)}</strong></p>
      <p style="margin:2px 0">Verified via: <strong>${e(a.verifiedVia)}</strong>${a.signatureVerified ? ' (signature verified)' : ''}</p>
      <p style="margin:2px 0">Matched by: <strong>${e(a.matchMethod || 'n/a')}</strong>${a.matchConfidence != null ? ` (${e(a.matchConfidence)}% confidence)` : ''}</p>
      ${a.accountMasked ? `<p style="margin:2px 0">Credited account: ${e(a.accountMasked)}</p>` : ''}
      <p style="margin:2px 0">Verified at: ${a.verifiedAt ? e(new Date(a.verifiedAt).toLocaleString('en-KE')) : ''}</p>
    </div>` : '';
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px;margin-bottom:24px">
      <h3 style="color:#166534;margin:0 0 12px;font-size:18px">Payment Received &amp; Verified</h3>
      <p style="color:#15803d;font-size:14px;margin:0 0 16px">Dear <strong>${e(opts.recipientName)}</strong>, we received <strong>${kes(pay.amount)}</strong> for <strong>Invoice #${e(invoice?.invoiceNumber || pay.invoiceId)}</strong> (${e(pay.propertyName)} - Unit ${e(pay.unitNumber)}).</p>
      <div style="background:#fff;border:1px solid #bbf7d0;border-radius:8px;padding:14px;font-size:13px">
        <p style="margin:2px 0"><strong>Receipt Serial:</strong> <code>${e(serial)}</code></p>
        <p style="margin:2px 0"><strong>Reference:</strong> <code>${e(pay.referenceCode)}</code></p>
        <p style="margin:2px 0"><strong>Method:</strong> ${e(pay.paymentMethod)}</p>
        <p style="margin:2px 0"><strong>Date:</strong> ${e(new Date(pay.paymentDate).toLocaleString('en-KE'))}</p>
        <p style="margin:2px 0"><strong>Status:</strong> <span style="color:#16a34a;font-weight:bold">COMPLETED</span></p>
      </div>
      ${audit}
    </div>
    <h4 style="margin:0 0 6px;font-size:15px">Lifetime Payment Statement</h4>
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e2e8f0">
      <thead><tr style="background:#0f172a;color:#fff;text-align:left"><th style="padding:8px 10px;font-size:11px">#</th><th style="padding:8px 10px;font-size:11px">Date</th><th style="padding:8px 10px;font-size:11px">Reference</th><th style="padding:8px 10px;font-size:11px">Period</th><th style="padding:8px 10px;font-size:11px">Method</th><th style="padding:8px 10px;font-size:11px;text-align:right">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:12px;padding:18px;margin:20px 0;display:flex;justify-content:space-between">
      <span style="font-size:12px;font-weight:bold;color:#854d0e">CUMULATIVE PAID (${history.length} payments)</span>
      <span style="font-size:20px;font-weight:800;color:#713f12">${kes(opts.cumulative)}</span>
    </div>
    <div style="text-align:center;margin-bottom:16px">
      <p style="font-size:12px;color:#64748b">The PDF (<strong>${e(opts.pdfFilename)}</strong>) is attached.</p>
      <a href="${e(opts.downloadUrl)}" style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;font-weight:bold;font-size:13px;padding:12px 24px;border-radius:8px">Download Receipt PDF</a>
      <p style="font-size:11px;color:#94a3b8">This secure link expires in 7 days.</p>
    </div>
  </div>`;
}
