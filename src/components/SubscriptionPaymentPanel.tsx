import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, Landmark, Loader2, RefreshCw, Smartphone, XCircle } from 'lucide-react';
import {
  SubscriptionInstructions, fetchLandlords, fetchSubscriptionInstructions, queryMpesaStkStatus, triggerSubscriptionStkPush
} from '../lib/api';
import { Landlord } from '../types';
import { formatKSH } from '../lib/formatters';

/** True when the server-stored licence is active and unexpired. The browser never writes this state. */
export const isLicenceActive = (l?: Pick<Landlord, 'subscriptionStatus' | 'subscriptionExpiry'> | null): boolean => {
  if (!l || l.subscriptionStatus !== 'Active' || !l.subscriptionExpiry) return false;
  const d = new Date(l.subscriptionExpiry);
  d.setHours(23, 59, 59, 999);
  return d >= new Date();
};

interface Props {
  landlord: Pick<Landlord, 'id' | 'phone' | 'subscriptionStatus' | 'subscriptionExpiry'>;
  /** Called after the SERVER reports an active licence (STK confirmed or bank deposit matched). */
  onActivated: () => void;
  tone?: 'dark' | 'light';
}

type Phase = 'idle' | 'sending' | 'waiting' | 'done' | 'failed';

/**
 * Pays the EstateMaster licence. The amount is fixed by the server. Activation only ever happens on the server
 * when Safaricom / the bank confirms the money; this component then re-reads the landlord record to find out.
 */
export const SubscriptionPaymentPanel: React.FC<Props> = ({ landlord, onActivated, tone = 'light' }) => {
  const dark = tone === 'dark';
  const [info, setInfo] = useState<SubscriptionInstructions | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [phone, setPhone] = useState(landlord.phone || '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const alive = useRef(true);
  // Expiry when the panel opened: an early renewal only counts once the server has moved it forward.
  const baseline = useRef<{ active: boolean; expiry?: string }>({ active: isLicenceActive(landlord), expiry: landlord.subscriptionExpiry });

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    fetchSubscriptionInstructions().then((i) => alive.current && setInfo(i)).catch((e) => alive.current && setInfoError(e?.message || 'Could not load payment instructions.'));
  }, []);

  const card = dark ? 'bg-slate-950/80 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800';
  const input = dark ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500' : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => alive.current && setCopied(null), 1600); } catch { /* ignore */ }
  };

  /** Re-reads the landlord from the server; the only source of truth for "paid". */
  const refreshFromServer = async (): Promise<boolean> => {
    try {
      const list = await fetchLandlords();
      const mine = list.find((l) => l.id === landlord.id) || list[0];
      if (!isLicenceActive(mine)) return false;
      return !baseline.current.active || mine?.subscriptionExpiry !== baseline.current.expiry;
    } catch { return false; }
  };

  const checkNow = async () => {
    setChecking(true); setMessage(null);
    const ok = await refreshFromServer();
    if (!alive.current) return;
    setChecking(false);
    if (ok) { setPhase('done'); setMessage('Payment confirmed. Your licence is active.'); onActivated(); }
    else setMessage('No confirmed payment yet. Bank notifications usually arrive within a minute. Check again shortly.');
  };

  const payStk = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase('sending'); setMessage(null);
    try {
      const res: any = await triggerSubscriptionStkPush({ phone: phone.trim() });
      const id: string | undefined = res?.CheckoutRequestID;
      if (!id) throw new Error('The payment request could not be started.');
      if (!alive.current) return;
      setPhase('waiting'); setMessage('Check your phone and enter your M-Pesa PIN to approve the payment.');
      const deadline = Date.now() + 2 * 60_000;
      while (alive.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await queryMpesaStkStatus(id);
        if (!alive.current) return;
        if (st.status === 'COMPLETED') {
          const ok = await refreshFromServer();
          if (!alive.current) return;
          if (ok) { setPhase('done'); setMessage('Payment confirmed by Safaricom. Your licence is active.'); onActivated(); return; }
          setPhase('failed'); setMessage(st.resultDesc || 'Payment received but the licence is not active yet. Press "Check payment status".'); return;
        }
        if (st.status === 'FAILED') { setPhase('failed'); setMessage(st.resultDesc || 'The payment was cancelled or failed. You have not been charged.'); return; }
      }
      if (alive.current) { setPhase('idle'); setMessage('Still waiting for confirmation. If you approved the prompt, press "Check payment status".'); }
    } catch (err: any) {
      if (alive.current) { setPhase('failed'); setMessage(err?.message || 'Could not start the M-Pesa payment.'); }
    }
  };

  const busy = phase === 'sending' || phase === 'waiting';
  const amount = info?.amount ?? 20000;

  return (
    <div className="space-y-4 text-xs" data-testid="subscription-payment-panel">
      <div className={`rounded-xl border p-3 flex justify-between items-center font-bold ${card}`}>
        <span>Annual licence</span><span className="text-amber-500 text-sm">{formatKSH(amount)} / year</span>
      </div>

      {message && (
        <div role="status" aria-live="polite" className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2 ${phase === 'done' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : phase === 'failed' ? 'bg-rose-50 border-rose-200 text-rose-900' : dark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
          {phase === 'done' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : phase === 'failed' ? <XCircle className="w-4 h-4 shrink-0 text-rose-600" /> : <Loader2 className={`w-4 h-4 shrink-0 ${busy ? 'animate-spin' : ''}`} />}
          <span>{message}</span>
        </div>
      )}

      <form onSubmit={payStk} className="space-y-2">
        <label className={`block font-bold ${dark ? 'text-slate-300' : 'text-slate-700'}`} htmlFor="sub-phone">M-Pesa phone number</label>
        <div className="relative">
          <input id="sub-phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" disabled={busy || phase === 'done'} autoComplete="tel"
            className={`w-full border rounded-xl py-2.5 px-3 font-mono text-xs focus:outline-none ${input}`} />
          <Smartphone className={`w-4 h-4 absolute right-3 top-3 ${muted}`} />
        </div>
        <button type="submit" disabled={busy || phase === 'done' || phone.trim().length < 9}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> {phase === 'sending' ? 'Sending M-Pesa prompt…' : 'Waiting for approval…'}</> : <>Pay {formatKSH(amount)} with M-Pesa</>}
        </button>
      </form>

      <div className={`rounded-xl border p-3 space-y-2 ${card}`}>
        <p className="font-extrabold flex items-center gap-1.5"><Landmark className="w-4 h-4 text-blue-500" /> Or pay from your bank</p>
        {infoError && <p className="text-rose-500">{infoError}</p>}
        {!info && !infoError && <p className={muted}>Loading bank details…</p>}
        {info && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className={`block text-[10px] ${muted}`}>Your payment reference (required)</span>
                <strong className="font-mono text-sm tracking-wide text-blue-500">{info.reference}</strong>
              </div>
              <button type="button" onClick={() => copy(info.reference, 'ref')} className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer">
                <Copy className="w-3 h-3" /> {copied === 'ref' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <ul className="space-y-0.5">
              {info.channels.equity && <li className="flex justify-between"><span className={muted}>Equity Paybill</span><strong className="font-mono">{info.channels.equity.paybill}</strong></li>}
              {info.channels.kcb && <li className="flex justify-between"><span className={muted}>KCB Paybill</span><strong className="font-mono">{info.channels.kcb.paybill}</strong></li>}
              {info.channels.coop && <li className="flex justify-between"><span className={muted}>Co-op account</span><strong className="font-mono">{info.channels.coop.account}</strong></li>}
              {!info.channels.equity && !info.channels.kcb && !info.channels.coop && <li className={muted}>Bank payment channels have not been configured yet. Use M-Pesa above.</li>}
            </ul>
            <p className={`text-[10px] ${muted}`}>Account name: {info.accountName}. {info.note}</p>
            <button type="button" onClick={checkNow} disabled={checking || phase === 'done'} className={`w-full py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer ${dark ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200' : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'}`}>
              {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Check payment status
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default SubscriptionPaymentPanel;
