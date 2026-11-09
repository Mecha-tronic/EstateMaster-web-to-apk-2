import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, XCircle, AlertTriangle, Landmark } from 'lucide-react';
import { BankStatusResponse, fetchBankStatus } from '../lib/api';

const Dot: React.FC<{ ok?: boolean; label: string; title?: string }> = ({ ok, label, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
    {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{label}
  </span>
);

const money = (v: any): string | null => {
  const n = Number(v?.available ?? v?.balance ?? v?.amount);
  return Number.isFinite(n) ? `${v?.currency || 'KES'} ${n.toLocaleString('en-KE', { maximumFractionDigits: 2 })}` : null;
};

/**
 * Landlord-facing health of the bank integrations: credentials present, OAuth handshake, webhook signature
 * secret configured, live query available. Secrets are never sent to the browser - only these flags.
 */
export const BankConnectionsStatus: React.FC<{ onStatus?: (s: BankStatusResponse) => void }> = ({ onStatus }) => {
  const [data, setData] = useState<BankStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true); setError(null);
    try { const s = await fetchBankStatus(fresh); setData(s); onStatus?.(s); }
    catch (e: any) { setError(e?.message || 'Could not read bank connection status.'); }
    finally { setLoading(false); }
  }, [onStatus]);

  useEffect(() => { load(false); }, [load]);

  const banks = Object.entries(data?.banks || {});

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 text-xs" data-testid="bank-connections-status">
      <div className="flex items-center justify-between">
        <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5 text-sm"><Landmark className="w-4 h-4 text-blue-600" /> Bank connections</h4>
        <button type="button" onClick={() => load(true)} disabled={loading} className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-bold flex items-center gap-1 disabled:opacity-50 cursor-pointer">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Test connections
        </button>
      </div>
      {data?.environment && <p className="text-[10px] text-slate-500">Environment: <strong className="uppercase">{data.environment}</strong> {data.environment !== 'production' && '(sandbox traffic is not real money)'}</p>}
      {error && <p className="text-rose-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}
      {!data && loading && <p className="text-slate-500">Checking…</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {banks.map(([key, b]) => {
          const bal = money((data?.balances || {})[key]);
          return (
            <div key={key} className="border border-slate-200 rounded-xl p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <strong className="text-slate-900">{b.label}</strong>
                {b.latencyMs !== undefined && <span className="text-[9px] text-slate-400 font-mono">{b.latencyMs} ms</span>}
              </div>
              <div className="flex flex-wrap gap-1">
                <Dot ok={b.configured} label="Credentials" />
                <Dot ok={b.oauthHandshake} label="OAuth" title="Token exchange with the bank succeeded" />
                <Dot ok={b.webhookSecurityConfigured} label="Webhook signature" title="A signature secret / key / Basic credential is configured" />
                <Dot ok={b.liveTransactionQuery} label="Live query" />
              </div>
              {bal && <p className="text-[11px] text-slate-700">Balance: <strong>{bal}</strong></p>}
              {b.error && <p className="text-[10px] text-rose-700 break-words">{b.error}</p>}
              {b.note && <p className="text-[10px] text-slate-500">{b.note}</p>}
              {!b.webhookSecurityConfigured && b.configured && (
                <p className="text-[10px] text-amber-700 flex items-start gap-1"><ShieldCheck className="w-3 h-3 mt-0.5 shrink-0" />Webhooks are rejected until a signature secret is configured.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BankConnectionsStatus;
