import React, { useState } from 'react';
import { Tenant, Invoice, BankStatementRecord } from '../types';
import { formatKSH } from '../lib/formatters';
import { parseBankStatementCSV } from '../lib/reconciliation';
import type { ReconcileRowResult } from '../lib/api';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Check,
  RefreshCw,
  Copy,
  Inbox
} from 'lucide-react';

/** Rows the server accepts per request (it also rate-limits uploads). */
const MAX_ROWS_PER_RUN = 500;
const MAX_FILE_BYTES = 1_500_000;

interface BankStatementReconcilerProps {
  tenants: Tenant[];
  invoices: Invoice[];
  /** Sends rows to the server. The server matches, posts each bank reference at most once, and queues the leftovers. */
  onBatchReconcile: (records: BankStatementRecord[]) => Promise<{
    reconciledCount: number;
    results?: ReconcileRowResult[];
    summary?: { posted: number; queued: number; duplicate: number; rejected: number };
  }>;
}

const keyOf = (ref: string) => String(ref || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Statement upload for deposits that did NOT arrive through a live bank connection.
 * This screen never posts anything itself: it sends rows to the server, which applies the same anti-double-entry
 * and matching rules as the live webhooks, and shows exactly what happened to each row.
 */
export const BankStatementReconciler: React.FC<BankStatementReconcilerProps> = ({ tenants, invoices, onBatchReconcile }) => {
  const [selectedBank, setSelectedBank] = useState<string>('Equity Bank');
  const [rawText, setRawText] = useState<string>('');
  const [records, setRecords] = useState<BankStatementRecord[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ posted: number; queued: number; duplicate: number; rejected: number } | null>(null);

  const openInvoiceFor = (tenantId: string) =>
    invoices.find((i) => i.tenantId === tenantId && i.status !== 'Paid' && !i.carriedForwardToInvoiceId);

  const handleParse = (text: string, bank: string = selectedBank) => {
    setError(null);
    setSummary(null);
    if (!text.trim()) {
      setRecords([]);
      setSelectedRecordIds(new Set());
      return;
    }
    const parsed = parseBankStatementCSV(text, bank, tenants, invoices);
    setRecords(parsed);
    // Pre-select confident matches that have a real bank reference
    setSelectedRecordIds(new Set(parsed.filter((r) => !r.parseWarning && r.matchedTenantId && (r.matchConfidence || 0) >= 60).map((r) => r.id)));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError('That file is too large. Export a shorter date range (under 1.5 MB) and try again.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      setRawText(content);
      handleParse(content);
    };
    reader.onerror = () => setError('The file could not be read.');
    reader.readAsText(file);
  };

  const submittable = (r: BankStatementRecord) => !r.parseWarning && !r.isReconciled && !r.serverOutcome;

  const toggleSelectRecord = (id: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllMatched = () => {
    const matched = records.filter((r) => submittable(r) && r.matchedTenantId);
    setSelectedRecordIds(selectedRecordIds.size === matched.length ? new Set() : new Set(matched.map((r) => r.id)));
  };

  const handleTenantOverride = (recordId: string, tenantId: string) => {
    const tenant = tenants.find((t) => t.id === tenantId);
    const open = tenant ? openInvoiceFor(tenant.id) : undefined;
    setRecords((prev) => prev.map((r) => (r.id !== recordId ? r : {
      ...r,
      matchedTenantId: tenant?.id,
      matchedTenantName: tenant?.fullName,
      matchedUnitNumber: tenant?.unitNumber,
      matchedInvoiceId: open?.id,
      matchConfidence: tenant ? 90 : 0,
      matchReason: tenant ? 'Chosen by you' : undefined
    })));
    if (tenant) setSelectedRecordIds((prev) => new Set(prev).add(recordId));
  };

  const handleExecute = async () => {
    const chosen = records.filter((r) => selectedRecordIds.has(r.id) && submittable(r)).slice(0, MAX_ROWS_PER_RUN);
    if (chosen.length === 0) return;
    setIsProcessing(true);
    setError(null);
    setSummary(null);
    try {
      const res = await onBatchReconcile(chosen);
      const byRef = new Map<string, ReconcileRowResult>();
      (res.results || []).forEach((x) => byRef.set(keyOf(x.referenceCode), x));
      const chosenIds = new Set(chosen.map((c) => c.id));
      setRecords((prev) => prev.map((r) => {
        if (!chosenIds.has(r.id)) return r;
        const out = byRef.get(keyOf(r.referenceCode));
        if (!out) return { ...r, serverOutcome: 'rejected', serverReason: 'The server returned no result for this row.' };
        return {
          ...r,
          serverOutcome: out.outcome as BankStatementRecord['serverOutcome'],
          serverReason: out.reason,
          isReconciled: out.outcome === 'posted' || out.outcome === 'duplicate'
        };
      }));
      setSelectedRecordIds(new Set());
      setSummary(res.summary || { posted: res.reconciledCount, queued: 0, duplicate: 0, rejected: 0 });
    } catch (err: any) {
      setError(err?.message || 'Reconciliation failed. Nothing was posted for rows without a result below. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const readyRows = records.filter((r) => submittable(r));
  const matchedCount = readyRows.filter((r) => r.matchedTenantId).length;
  const warningCount = records.filter((r) => r.parseWarning).length;
  const totalSelectedAmount = records.filter((r) => selectedRecordIds.has(r.id)).reduce((sum, r) => sum + r.amount, 0);

  const outcomeBadge = (r: BankStatementRecord) => {
    switch (r.serverOutcome) {
      case 'posted': return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Posted</span>;
      case 'duplicate': return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full"><Copy className="w-3 h-3" /> Already recorded</span>;
      case 'queued': return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full"><Inbox className="w-3 h-3" /> In unaccounted queue</span>;
      case 'rejected': return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" /> Rejected</span>;
      default:
        if (r.parseWarning) return <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">No reference</span>;
        return r.matchedTenantId
          ? <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Ready to post</span>
          : <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">Will be queued</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600/10 via-blue-600/5 to-transparent border border-blue-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-blue-600 text-white rounded-lg shadow-xs"><FileSpreadsheet className="w-4 h-4" /></span>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">Bank statement reconciliation</h3>
        </div>
        <p className="text-xs text-slate-600 max-w-3xl leading-relaxed mt-1">
          Deposits from connected banks are posted automatically. Use this for deposits that did not arrive that way: upload the statement
          (Date, Narration, Reference, Amount). The server matches each row by invoice reference, unit or phone, posts each bank reference
          <strong> only once</strong>, and puts anything it cannot match into the Unaccounted Queue. Re-uploading a statement is safe.
        </p>
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-3 flex items-start gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          A statement you upload is your own record, not a bank confirmation. Receipts for these payments say &ldquo;bank statement reconciliation&rdquo;
          rather than &ldquo;signed bank notification&rdquo;.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-700" htmlFor="stmt-bank">Bank / channel:</label>
            <select
              id="stmt-bank"
              value={selectedBank}
              onChange={(e) => { setSelectedBank(e.target.value); if (rawText) handleParse(rawText, e.target.value); }}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500"
            >
              <option value="Equity Bank">Equity Bank Kenya</option>
              <option value="KCB Bank">KCB Bank Kenya</option>
              <option value="Co-operative Bank">Co-operative Bank of Kenya</option>
              <option value="NCBA Bank">NCBA Bank</option>
              <option value="Stanbic Bank">Stanbic Bank</option>
              <option value="M-Pesa Till Statement">Safaricom M-Pesa statement</option>
              <option value="Generic CSV">Other bank (CSV)</option>
            </select>
          </div>
          <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-200 cursor-pointer flex items-center gap-1.5 transition">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload CSV file</span>
            <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="stmt-text">Or paste statement rows (Date, Narration, Reference, Amount):</label>
          <textarea
            id="stmt-text"
            rows={3}
            value={rawText}
            onChange={(e) => { setRawText(e.target.value); handleParse(e.target.value); }}
            placeholder="2026-10-20, EFT RENT UNIT A101 JANE WANJIKU, EQ98102910, 65000"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] text-slate-800 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-xs font-semibold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}

      {summary && (
        <div role="status" className="p-4 bg-white border border-slate-200 rounded-xl text-xs space-y-2">
          <p className="font-extrabold text-slate-900 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Reconciliation finished</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2"><b className="text-lg text-emerald-800 block">{summary.posted}</b>posted to invoices</div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2"><b className="text-lg text-amber-800 block">{summary.queued}</b>sent to unaccounted queue</div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><b className="text-lg text-slate-700 block">{summary.duplicate}</b>already recorded</div>
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-2"><b className="text-lg text-rose-800 block">{summary.rejected}</b>rejected</div>
          </div>
        </div>
      )}

      {records.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={toggleSelectAllMatched} className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1.5 cursor-pointer">
                <Check className="w-3.5 h-3.5" /> Select all matched ({matchedCount})
              </button>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-600">Selected: <strong>{selectedRecordIds.size} rows</strong> ({formatKSH(totalSelectedAmount)})</span>
              {warningCount > 0 && <span className="text-xs text-rose-700 font-semibold">{warningCount} row{warningCount === 1 ? '' : 's'} missing a bank reference</span>}
            </div>
            <button
              onClick={handleExecute}
              disabled={isProcessing || selectedRecordIds.size === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer transition"
            >
              {isProcessing ? (<><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sending to server...</>) : (<><ShieldCheck className="w-4 h-4" /> Reconcile selected ({selectedRecordIds.size})</>)}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3.5 w-10 text-center">Select</th>
                  <th className="p-3.5">Date &amp; reference</th>
                  <th className="p-3.5">Narration</th>
                  <th className="p-3.5">Amount (KSh)</th>
                  <th className="p-3.5">Suggested match</th>
                  <th className="p-3.5">Tenant</th>
                  <th className="p-3.5 text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => {
                  const selected = selectedRecordIds.has(r.id);
                  const confidence = r.matchConfidence || 0;
                  const locked = !submittable(r);
                  return (
                    <tr key={r.id} className={`hover:bg-slate-50/80 transition ${r.serverOutcome === 'posted' ? 'bg-emerald-50/40' : r.serverOutcome === 'rejected' || r.parseWarning ? 'bg-rose-50/40' : selected ? 'bg-blue-50/40' : ''}`}>
                      <td className="p-3.5 text-center">
                        <input type="checkbox" aria-label={`Select ${r.referenceCode || 'row'}`} disabled={locked} checked={selected} onChange={() => toggleSelectRecord(r.id)} className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 block">{r.referenceCode || '(none)'}</span>
                        <span className="text-[11px] text-slate-400">{r.date}</span>
                      </td>
                      <td className="p-3.5 max-w-xs">
                        <span className="font-mono text-slate-700 text-[11px] block truncate" title={r.description}>{r.description}</span>
                        <span className="text-[10px] text-slate-400">{r.bankName}</span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap font-black text-slate-900">{formatKSH(r.amount)}</td>
                      <td className="p-3.5 max-w-sm">
                        {r.matchedTenantName ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${confidence >= 80 ? 'bg-emerald-100 text-emerald-800' : confidence >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{confidence}%</span>
                              <strong className="text-slate-900">{r.matchedTenantName}</strong>
                              {r.matchedUnitNumber && <span className="bg-slate-100 px-1.5 rounded text-[10px] font-bold text-slate-700">Unit {r.matchedUnitNumber}</span>}
                            </div>
                            {r.matchReason && <p className="text-[11px] text-slate-500 leading-snug">{r.matchReason}</p>}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-slate-400"><AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" /><span className="text-[11px]">No match found</span></div>
                        )}
                        {r.parseWarning && <p className="text-[11px] text-rose-700 mt-1">{r.parseWarning}</p>}
                      </td>
                      <td className="p-3.5">
                        {!locked ? (
                          <select
                            aria-label="Assign to tenant"
                            value={r.matchedTenantId || ''}
                            onChange={(e) => handleTenantOverride(r.id, e.target.value)}
                            className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Let the server decide</option>
                            {tenants.map((t) => (<option key={t.id} value={t.id}>{t.fullName} (Unit {t.unitNumber || 'N/A'})</option>))}
                          </select>
                        ) : (
                          <span className="text-xs font-bold text-slate-700">{r.matchedTenantName || '-'}</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          {outcomeBadge(r)}
                          {r.serverReason && <span className="text-[10px] text-slate-500 max-w-[220px] text-right leading-snug">{r.serverReason}</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {records.length > MAX_ROWS_PER_RUN && (
            <p className="p-3 text-[11px] text-amber-800 bg-amber-50 border-t border-amber-200">Only {MAX_ROWS_PER_RUN} rows are sent per run. Run it again for the remaining rows.</p>
          )}
        </div>
      )}
    </div>
  );
};
