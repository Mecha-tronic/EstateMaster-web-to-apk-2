import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Copy, Download, Landmark, Loader2, RefreshCw, ShieldCheck, XCircle, CircleDashed, MinusCircle
} from 'lucide-react';
import {
  BankRail, BankRailsResponse, BankStatusResponse, BankVerification, ApiError,
  downloadReceiptPdf, fetchBankRails, fetchBankStatus, isVerificationFinal, pollBankVerification, verifyBankTransaction
} from '../lib/api';
import { Invoice } from '../types';

/**
 * Direct bank settlement for a tenant.
 *
 * The tenant pays from their own bank / M-Pesa app, quoting the invoice reference, then pastes the bank's
 * transaction reference here. Nothing is "recorded" by the browser: the server checks the reference against
 * the signed bank webhook ledger and (where available) the bank's live transaction-query API, and only the
 * bank's confirmation can mark the invoice paid. This panel just shows that process live.
 */

const RAILS: { id: BankRail; label: string; hint: string; placeholder: string }[] = [
  { id: 'equity', label: 'Equity Bank', hint: 'Equity account, Paybill or Equitel. Use the transaction ID on your SMS / app receipt.', placeholder: 'e.g. FT26301ABCDE' },
  { id: 'kcb', label: 'KCB Bank', hint: 'KCB account, Paybill or KCB M-Pesa. Use the transaction reference on your confirmation.', placeholder: 'e.g. KCB1234567890' },
  { id: 'coop', label: 'Co-operative Bank', hint: 'Co-op account or MCo-op Cash. Use the transaction reference from your statement or SMS.', placeholder: 'e.g. COOP987654321' },
  { id: 'pesalink', label: 'PesaLink (other banks)', hint: 'Interbank transfer from any PesaLink-enabled bank. Use the PesaLink reference.', placeholder: 'e.g. PL26301XYZ123' },
  { id: 'mpesa', label: 'M-Pesa', hint: 'Safaricom M-Pesa confirmation code (10 characters).', placeholder: 'e.g. QJK9483HD7' }
];

const fmt = (n: number) => `KSh ${Math.round(n || 0).toLocaleString('en-KE')}`;

interface Props {
  invoice: Invoice;
  /** Called once the server reports the payment as verified and posted (use it to refresh data). */
  onVerified?: (v: BankVerification) => void;
  /** Pre-select a rail. */
  initialBank?: BankRail;
}

export const BankVerificationPanel: React.FC<Props> = ({ invoice, onVerified, initialBank }) => {
  const [rails, setRails] = useState<BankRailsResponse | null>(null);
  const [status, setStatus] = useState<BankStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bank, setBank] = useState<BankRail>(initialBank || 'equity');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<BankVerification | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r, s] = await Promise.all([fetchBankRails(), fetchBankStatus().catch(() => null)]);
        if (!alive) return;
        setRails(r); setStatus(s);
      } catch (e: any) {
        if (alive) setLoadError(e?.message || 'Could not load the landlord\'s payment channels.');
      }
    })();
    return () => { alive = false; };
  }, []);

  const railInfo = RAILS.find((r) => r.id === bank)!;
  const remaining = Math.max(0, (invoice.totalAmount || 0) - (invoice.amountPaid || 0));
  const quoteRef = invoice.paymentReference || invoice.invoiceNumber;
  const landlord = rails?.landlord;

  // A rail is "live" when the server can actually verify it (signed webhooks or live query configured).
  const available = (id: BankRail): boolean | undefined => {
    const key = id === 'mpesa' ? 'mpesa' : id;
    const b = status?.banks?.[key];
    if (!b) return undefined;
    return b.available ?? Boolean(b.webhookSecurityConfigured || b.liveTransactionQuery);
  };

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => mounted.current && setCopied(null), 1800); } catch { /* clipboard blocked */ }
  };

  const cleanedRef = useMemo(() => reference.trim().replace(/\s+/g, ''), [reference]);
  const canSubmit = !busy && cleanedRef.length >= 6 && remaining > 0 && !(verification && !isVerificationFinal(verification));

  const run = async () => {
    setError(null);
    setBusy(true);
    setVerification(null);
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const first = await verifyBankTransaction({ bank, reference: cleanedRef, invoiceId: invoice.id });
      if (!mounted.current) return;
      setVerification(first);
      if (first.status === 'verified') { onVerified?.(first); return; }
      if (isVerificationFinal(first)) return;
      const last = await pollBankVerification(first.id, (v) => mounted.current && setVerification(v), { signal: ctl.signal });
      if (mounted.current && last.status === 'verified') onVerified?.(last);
    } catch (e: any) {
      if (!mounted.current) return;
      if (e instanceof ApiError && e.status === 429) setError('Too many attempts. Please wait a few minutes before trying again.');
      else setError(e?.message || 'Verification failed. Please try again.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const downloadReceipt = async () => {
    if (!verification?.paymentId) return;
    setReceiptBusy(true);
    try { await downloadReceiptPdf(verification.paymentId, `Receipt_${quoteRef}.pdf`); }
    catch (e: any) { setError(e?.message || 'Could not download the receipt.'); }
    finally { setReceiptBusy(false); }
  };

  const stepIcon = (s: BankVerification['steps'][number]['status']) => {
    switch (s) {
      case 'done': return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'active': return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'failed': return <XCircle className="w-4 h-4 text-rose-600" />;
      case 'skipped': return <MinusCircle className="w-4 h-4 text-slate-400" />;
      default: return <CircleDashed className="w-4 h-4 text-slate-300" />;
    }
  };

  const landlordAccount = landlord && (landlord as any).accountNumber;
  const inFlight = verification && !isVerificationFinal(verification);

  return (
    <div className="space-y-3 text-xs text-slate-800" data-testid="bank-verification-panel">
      {/* 1. choose the rail */}
      <div>
        <label className="block text-slate-700 font-bold mb-1">1. Choose how you paid</label>
        <div className="grid grid-cols-2 gap-1.5">
          {RAILS.map((r) => {
            const av = available(r.id);
            const selected = bank === r.id;
            return (
              <button
                key={r.id}
                type="button"
                disabled={busy}
                onClick={() => { setBank(r.id); setError(null); }}
                className={`text-left p-2 rounded-lg border text-[11px] font-bold transition cursor-pointer ${selected ? 'border-blue-600 bg-blue-50 text-blue-900 ring-1 ring-blue-300' : 'border-slate-200 bg-white hover:border-slate-400 text-slate-700'}`}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1"><Landmark className="w-3.5 h-3.5 shrink-0" />{r.label}</span>
                  {av === true && <span className="text-[9px] px-1 rounded bg-emerald-100 text-emerald-800">Live</span>}
                  {av === false && <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-800">Review</span>}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">{railInfo.hint}</p>
        {available(bank) === false && (
          <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Live confirmation is not connected for this bank yet. Your reference is saved and your landlord will confirm it.
          </p>
        )}
      </div>

      {/* 2. where to pay */}
      <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 space-y-2">
        <p className="font-bold text-blue-900 text-xs">2. Pay exactly {fmt(remaining)} and quote this reference</p>
        {loadError && <p className="text-rose-700 text-[11px]">{loadError}</p>}
        <div className="bg-white border border-blue-200 rounded-lg p-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] text-slate-500 block">Invoice reference (put this in the narration / account field)</span>
              <strong className="font-mono text-blue-800 text-sm tracking-wide">{quoteRef}</strong>
            </div>
            <button type="button" onClick={() => copy(quoteRef, 'ref')} className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer">
              <Copy className="w-3 h-3" /> {copied === 'ref' ? 'Copied' : 'Copy'}
            </button>
          </div>
          {landlord && (
            <div className="pt-1 border-t border-slate-100 space-y-0.5">
              {(landlord as any).bankName && <div className="flex justify-between"><span className="text-slate-500 text-[10px]">Bank</span><strong>{(landlord as any).bankName}</strong></div>}
              {(landlord as any).accountName && <div className="flex justify-between"><span className="text-slate-500 text-[10px]">Account name</span><strong>{(landlord as any).accountName}</strong></div>}
              {landlordAccount && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[10px]">Account number</span>
                  <span className="flex items-center gap-1.5">
                    <strong className="font-mono text-blue-700">{landlordAccount}</strong>
                    <button type="button" onClick={() => copy(String(landlordAccount), 'acct')} className="text-blue-700 hover:underline text-[10px] font-bold cursor-pointer">{copied === 'acct' ? 'Copied' : 'Copy'}</button>
                  </span>
                </div>
              )}
              {(landlord as any).mpesaPaybill && <div className="flex justify-between"><span className="text-slate-500 text-[10px]">M-Pesa Paybill</span><strong className="font-mono">{(landlord as any).mpesaPaybill}</strong></div>}
              {(landlord as any).mpesaTillNumber && <div className="flex justify-between"><span className="text-slate-500 text-[10px]">M-Pesa Till</span><strong className="font-mono">{(landlord as any).mpesaTillNumber}</strong></div>}
            </div>
          )}
          {!landlord && !loadError && <p className="text-[11px] text-slate-500">Loading your landlord's payment details…</p>}
        </div>
        <p className="text-[10px] text-slate-600">Quoting the reference lets the system match your deposit to this invoice automatically, usually within seconds of the bank's notification.</p>
      </div>

      {/* 3. verify */}
      <div className="space-y-2">
        <label className="block text-slate-700 font-bold" htmlFor="bank-ref-input">3. Enter the bank's transaction reference</label>
        <input
          id="bank-ref-input"
          type="text"
          value={reference}
          onChange={(e) => { setReference(e.target.value); setError(null); }}
          disabled={busy || !!inFlight}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={railInfo.placeholder}
          className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm font-mono uppercase font-bold text-sm focus:outline-none focus:border-blue-500"
        />
        {error && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs font-semibold flex items-start gap-2" role="alert">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}
        <button
          type="button"
          onClick={run}
          disabled={!canSubmit}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 font-bold text-white shadow-sm transition flex items-center justify-center gap-2 text-sm cursor-pointer"
        >
          {busy ? (<><Loader2 className="w-4 h-4 animate-spin" /> Verifying with the bank…</>) : (<><ShieldCheck className="w-4 h-4" /> Verify my payment</>)}
        </button>
        {remaining <= 0 && <p className="text-[11px] text-emerald-700 font-semibold">This invoice has no balance left to pay.</p>}
      </div>

      {/* live progress */}
      {verification && (
        <div
          className={`rounded-xl border p-3 space-y-2 ${verification.status === 'verified' ? 'bg-emerald-50 border-emerald-300' : verification.status === 'rejected' || verification.status === 'timed-out' ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-200'}`}
          aria-live="polite"
          data-testid="verification-progress"
        >
          <div className="flex items-center gap-2 font-extrabold text-[12px]">
            {verification.status === 'verified' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              : verification.status === 'rejected' || verification.status === 'timed-out' ? <XCircle className="w-4 h-4 text-rose-600" />
              : verification.status === 'awaiting-landlord' ? <Clock className="w-4 h-4 text-amber-600" />
              : <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />}
            <span>{verification.message}</span>
          </div>
          <ol className="space-y-1.5">
            {verification.steps.map((s) => (
              <li key={s.key} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{stepIcon(s.status)}</span>
                <span className="flex-1">
                  <span className={`font-semibold ${s.status === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>{s.label}</span>
                  {s.detail && <span className="block text-[10px] text-slate-500">{s.detail}</span>}
                </span>
                {s.at && <span className="text-[9px] text-slate-400 font-mono shrink-0">{new Date(s.at).toLocaleTimeString('en-KE')}</span>}
              </li>
            ))}
          </ol>
          {verification.status === 'awaiting-landlord' && (
            <p className="text-[10px] text-amber-800">The bank has not confirmed this reference yet. It has been sent to your landlord for manual confirmation. You do not need to pay again.</p>
          )}
          {verification.status === 'verified' && verification.paymentId && (
            <button type="button" onClick={downloadReceipt} disabled={receiptBusy} className="w-full py-2 rounded-lg bg-white border border-emerald-400 text-emerald-800 font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition disabled:opacity-50 cursor-pointer">
              {receiptBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download receipt with bank audit trail
            </button>
          )}
          {(verification.status === 'rejected' || verification.status === 'timed-out') && (
            <button type="button" onClick={() => { setVerification(null); setError(null); }} className="text-[11px] font-bold text-slate-700 underline cursor-pointer">Try a different reference</button>
          )}
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-[10px] text-slate-500 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>Payments are confirmed by the bank, not by this screen. A bank reference can only ever be used once, so a reference that was already redeemed will be refused.</span>
      </div>
    </div>
  );
};

export default BankVerificationPanel;
