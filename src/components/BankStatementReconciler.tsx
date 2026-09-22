import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Tenant, Invoice, BankStatementRecord } from '../types';
import { formatKSH } from '../lib/formatters';
import {
  parseBankStatementCSV,
  SAMPLE_BANK_STATEMENTS
} from '../lib/reconciliation';
import {
  FileSpreadsheet,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Landmark,
  ArrowRight,
  ShieldCheck,
  Check,
  RefreshCw,
  HelpCircle,
  Search,
  Building,
  UserCheck
} from 'lucide-react';

interface BankStatementReconcilerProps {
  tenants: Tenant[];
  invoices: Invoice[];
  onBatchReconcile: (records: BankStatementRecord[]) => Promise<{ reconciledCount: number }>;
  onRouteToUnaccountedQueue?: (record: BankStatementRecord) => Promise<void>;
}

export const BankStatementReconciler: React.FC<BankStatementReconcilerProps> = ({
  tenants,
  invoices,
  onBatchReconcile,
  onRouteToUnaccountedQueue
}) => {
  const [selectedBank, setSelectedBank] = useState<string>('Equity Bank');
  const [rawText, setRawText] = useState<string>('');
  const [records, setRecords] = useState<BankStatementRecord[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<{ message: string; count: number } | null>(null);

  const handleParse = (textToParse: string, bank: string = selectedBank) => {
    if (!textToParse.trim()) {
      setRecords([]);
      return;
    }
    const parsed = parseBankStatementCSV(textToParse, bank, tenants, invoices);
    setRecords(parsed);

    // Auto-select records with confidence >= 60%
    const autoSelected = new Set<string>();
    parsed.forEach((r) => {
      if ((r.matchConfidence || 0) >= 60 && r.matchedTenantId) {
        autoSelected.add(r.id);
      }
    });
    setSelectedRecordIds(autoSelected);
    setReconcileResult(null);
  };

  const handleLoadSample = (sampleKey: keyof typeof SAMPLE_BANK_STATEMENTS, bankName: string) => {
    setSelectedBank(bankName);
    const sampleText = SAMPLE_BANK_STATEMENTS[sampleKey];
    setRawText(sampleText);
    handleParse(sampleText, bankName);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawText(content);
      handleParse(content);
    };
    reader.readAsText(file);
  };

  const toggleSelectRecord = (id: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllMatched = () => {
    const matched = records.filter((r) => Boolean(r.matchedTenantId) && !r.isReconciled);
    if (selectedRecordIds.size === matched.length) {
      setSelectedRecordIds(new Set());
    } else {
      setSelectedRecordIds(new Set(matched.map((r) => r.id)));
    }
  };

  const handleTenantOverride = (recordId: string, tenantId: string) => {
    const tenant = tenants.find((t) => t.id === tenantId);
    const unpaid = invoices.find((i) => i.tenantId === tenantId && i.status !== 'Paid');

    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== recordId) return r;
        return {
          ...r,
          matchedTenantId: tenant?.id,
          matchedTenantName: tenant?.fullName,
          matchedUnitNumber: tenant?.unitNumber,
          matchedInvoiceId: unpaid?.id,
          matchConfidence: 90,
          matchReason: 'Manually verified by landlord'
        };
      })
    );

    setSelectedRecordIds((prev) => new Set(prev).add(recordId));
  };

  const handleExecuteReconciliation = async () => {
    const toReconcile = records.filter((r) => selectedRecordIds.has(r.id) && r.matchedTenantId && !r.isReconciled);
    if (toReconcile.length === 0) return;

    setIsProcessing(true);
    setReconcileResult(null);

    try {
      const res = await onBatchReconcile(toReconcile);
      // Mark reconciled in table
      setRecords((prev) =>
        prev.map((r) => (selectedRecordIds.has(r.id) ? { ...r, isReconciled: true } : r))
      );
      setSelectedRecordIds(new Set());
      setReconcileResult({
        count: res.reconciledCount,
        message: `Successfully reconciled ${res.reconciledCount} transactions! Invoices marked Paid & balances updated.`
      });
    } catch (err: any) {
      alert(`Reconciliation error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const matchedCount = records.filter((r) => Boolean(r.matchedTenantId) && !r.isReconciled).length;
  const totalSelectedAmount = records
    .filter((r) => selectedRecordIds.has(r.id))
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-blue-600/10 via-blue-600/5 to-transparent border border-blue-200 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-600 text-white rounded-lg shadow-xs">
                <FileSpreadsheet className="w-4 h-4" />
              </span>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Bank Statement & Till CSV Auto-Reconciler
              </h3>
            </div>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              Upload or paste your CSV/Excel statements from Equity Bank, KCB, Co-op, NCBA, Stanbic, or Safaricom Till. The intelligent engine automatically scans narrations, matches unit numbers and amounts, and settles invoices in bulk.
            </p>
          </div>

          {/* Quick Demo Statement Loaders */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-bold text-slate-500 mr-1">Load Demo Statement:</span>
            <button
              onClick={() => handleLoadSample('equity', 'Equity Bank')}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
            >
              Equity Bank (CSV)
            </button>
            <button
              onClick={() => handleLoadSample('kcb', 'KCB Bank')}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
            >
              KCB Bank (CSV)
            </button>
            <button
              onClick={() => handleLoadSample('mpesaTill', 'M-Pesa Till Statement')}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
            >
              M-Pesa Till (CSV)
            </button>
          </div>
        </div>
      </div>

      {/* Input Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-700">Bank / Channel:</label>
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500"
            >
              <option value="Equity Bank">Equity Bank Kenya</option>
              <option value="KCB Bank">KCB Bank Kenya</option>
              <option value="Co-operative Bank">Co-operative Bank of Kenya</option>
              <option value="NCBA Bank">NCBA Bank</option>
              <option value="Stanbic Bank">Stanbic Bank</option>
              <option value="M-Pesa Till Statement">Safaricom M-Pesa Statement</option>
              <option value="Generic CSV">Generic Bank Statement CSV</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-200 cursor-pointer flex items-center gap-1.5 transition">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload CSV / Excel File</span>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Or Paste Statement Data (Date, Narration, Reference, Amount):
          </label>
          <textarea
            rows={3}
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              handleParse(e.target.value);
            }}
            placeholder="e.g. 2026-09-20, EFT RENT UNIT A101 JANE WANJIKU, EQ98102910, 65000"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] text-slate-800 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {reconcileResult && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{reconcileResult.message}</span>
        </div>
      )}

      {/* Reconciliation Table */}
      {records.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs space-y-4">
          {/* Table Header Controls */}
          <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAllMatched}
                className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Select All Matched ({matchedCount})
              </button>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-600">
                Selected: <strong>{selectedRecordIds.size} rows</strong> ({formatKSH(totalSelectedAmount)})
              </span>
            </div>

            <button
              onClick={handleExecuteReconciliation}
              disabled={isProcessing || selectedRecordIds.size === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer transition hover:scale-105"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Auto-Reconcile Selected ({selectedRecordIds.size})
                </>
              )}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3.5 w-10 text-center">Select</th>
                  <th className="p-3.5">Date & Ref</th>
                  <th className="p-3.5">Description / Narration</th>
                  <th className="p-3.5">Amount (KSh)</th>
                  <th className="p-3.5">Intelligent Match Analysis</th>
                  <th className="p-3.5">Tenant Assignment</th>
                  <th className="p-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => {
                  const isSelected = selectedRecordIds.has(r.id);
                  const confidence = r.matchConfidence || 0;
                  const isHigh = confidence >= 80;
                  const isMed = confidence >= 50 && confidence < 80;

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/80 transition ${
                        r.isReconciled ? 'bg-emerald-50/40 opacity-75' : isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          disabled={r.isReconciled || !r.matchedTenantId}
                          checked={isSelected}
                          onChange={() => toggleSelectRecord(r.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>

                      <td className="p-3.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 block">{r.referenceCode}</span>
                        <span className="text-[11px] text-slate-400">{r.date}</span>
                      </td>

                      <td className="p-3.5 max-w-xs">
                        <span className="font-mono text-slate-700 text-[11px] block truncate" title={r.description}>
                          {r.description}
                        </span>
                        <span className="text-[10px] text-slate-400">{r.bankName}</span>
                      </td>

                      <td className="p-3.5 whitespace-nowrap font-black text-slate-900">
                        {formatKSH(r.amount)}
                      </td>

                      <td className="p-3.5 max-w-sm">
                        {r.matchedTenantName ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                  isHigh
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isMed
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {confidence}% Match
                              </span>
                              <strong className="text-slate-900">{r.matchedTenantName}</strong>
                              {r.matchedUnitNumber && (
                                <span className="bg-slate-100 px-1.5 py-0.2 rounded text-[10px] font-bold text-slate-700">
                                  Unit {r.matchedUnitNumber}
                                </span>
                              )}
                            </div>
                            {r.matchReason && (
                              <p className="text-[11px] text-slate-500 leading-snug">{r.matchReason}</p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-slate-400">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="text-[11px]">Unmatched Narration</span>
                          </div>
                        )}
                      </td>

                      <td className="p-3.5">
                        {!r.isReconciled ? (
                          <select
                            value={r.matchedTenantId || ''}
                            onChange={(e) => handleTenantOverride(r.id, e.target.value)}
                            className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                          >
                            <option value="">-- Choose Tenant --</option>
                            {tenants.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.fullName} (Unit {t.unitNumber || 'N/A'})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs font-bold text-emerald-800">{r.matchedTenantName}</span>
                        )}
                      </td>

                      <td className="p-3.5 text-right whitespace-nowrap">
                        {r.isReconciled ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Settled
                          </span>
                        ) : r.matchedTenantId ? (
                          <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            Ready
                          </span>
                        ) : (
                          <button
                            onClick={() => onRouteToUnaccountedQueue && onRouteToUnaccountedQueue(r)}
                            className="text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg transition cursor-pointer"
                          >
                            Route to Unaccounted Queue
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
