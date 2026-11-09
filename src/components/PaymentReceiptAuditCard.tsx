import React, { useState } from 'react';
import { BadgeCheck, Download, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { downloadReceiptPdf } from '../lib/api';
import { BankAuditTrail, Payment } from '../types';

const BANK_LABEL: Record<string, string> = {
  equity: 'Equity Bank (Jenga)', kcb: 'KCB Bank (Buni)', coop: 'Co-operative Bank', pesalink: 'PesaLink (IPSL)', mpesa: 'M-Pesa (Safaricom)'
};
const VIA_LABEL: Record<string, string> = {
  'bank-webhook': 'Signed bank notification',
  'bank-api-query': 'Live bank transaction query',
  'mpesa-daraja': 'Safaricom Daraja confirmation',
  'statement-reconciliation': 'Bank statement reconciliation',
  'manual-landlord': 'Entered manually by landlord (not bank-verified)'
};
const MATCH_LABEL: Record<string, string> = {
  'invoice-reference': 'Invoice reference in narration',
  'unit-number': 'Unit number in narration',
  'phone-number': 'Tenant phone number',
  'manual-assignment': 'Assigned by landlord',
  'api-query': 'Bank query by reference'
};

const when = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
};

/** Shows how a payment was verified and lets the user download the PDF receipt carrying the same audit trail. */
export const PaymentReceiptAuditCard: React.FC<{ payment: Payment; compact?: boolean }> = ({ payment, compact }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const audit: BankAuditTrail | undefined = payment.bankAudit;
  const manual = !audit || audit.verifiedVia === 'manual-landlord' || payment.verificationSource === 'manual-landlord';

  const download = async () => {
    setBusy(true); setErr(null);
    try { await downloadReceiptPdf(payment.id, `Receipt_${payment.referenceCode || payment.id}.pdf`); }
    catch (e: any) { setErr(e?.message || 'Could not download the receipt.'); }
    finally { setBusy(false); }
  };

  const rows: [string, string | undefined][] = audit ? [
    ['Settled via', BANK_LABEL[audit.bank] || audit.bank],
    ['Bank reference', audit.bankReference],
    ['Channel', audit.channel],
    ['Verified by', VIA_LABEL[audit.verifiedVia] || audit.verifiedVia],
    ['Signature check', audit.signatureVerified === undefined ? undefined : audit.signatureVerified ? 'Passed' : 'Not applicable'],
    ['Bank received', when(audit.receivedAt)],
    ['Verified', when(audit.verifiedAt)],
    ['Matched by', audit.matchMethod ? MATCH_LABEL[audit.matchMethod] || audit.matchMethod : undefined],
    ['Payer', audit.payerName],
    ['Payer phone', audit.payerPhoneMasked],
    ['Account', audit.accountMasked]
  ] : [];

  return (
    <div className={`rounded-xl border ${manual ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/60'} ${compact ? 'p-2.5' : 'p-3'} text-xs text-slate-800 space-y-2`} data-testid="receipt-audit-card">
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 font-extrabold ${manual ? 'text-amber-900' : 'text-emerald-900'}`}>
          {manual ? <ShieldAlert className="w-4 h-4 text-amber-600" /> : <BadgeCheck className="w-4 h-4 text-emerald-600" />}
          {manual ? 'Recorded by landlord' : 'Verified bank audit trail'}
        </span>
        <button type="button" onClick={download} disabled={busy} className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 font-bold text-[11px] flex items-center gap-1 disabled:opacity-50 cursor-pointer">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Receipt PDF
        </button>
      </div>
      {audit ? (
        <dl className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-2'} gap-x-4 gap-y-1`}>
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-slate-200/60 pb-0.5">
              <dt className="text-slate-500 text-[10px] uppercase font-bold">{k}</dt>
              <dd className="font-semibold text-right break-all">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-[11px] text-slate-600 flex items-start gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          This payment was entered by your landlord and has no bank confirmation attached. Reference: <strong className="font-mono">{payment.referenceCode}</strong>
        </p>
      )}
      {err && <p className="text-rose-700 text-[11px]" role="alert">{err}</p>}
    </div>
  );
};

export default PaymentReceiptAuditCard;
