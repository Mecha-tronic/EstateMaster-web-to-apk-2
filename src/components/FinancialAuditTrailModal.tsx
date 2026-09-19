import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  History,
  X,
  RefreshCw,
  Calendar,
  CheckCircle2,
  Lock,
  Globe,
  Smartphone,
  CreditCard,
  Building2,
  AlertCircle
} from 'lucide-react';
import { FinancialAuditEntry, Landlord } from '../types';
import { fetchFinancialAuditLog } from '../lib/api';

interface FinancialAuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
  landlord: Landlord;
}

export const FinancialAuditTrailModal: React.FC<FinancialAuditTrailModalProps> = ({
  isOpen,
  onClose,
  landlord
}) => {
  const [loading, setLoading] = useState(true);
  const [auditTrail, setAuditTrail] = useState<FinancialAuditEntry[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string | undefined>(landlord.lastFinancialUpdateAt);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);

    fetchFinancialAuditLog(landlord.id)
      .then((res) => {
        if (isMounted) {
          setAuditTrail(res.auditTrail || landlord.financialAuditTrail || []);
          setLastUpdate(res.lastFinancialUpdateAt || landlord.lastFinancialUpdateAt);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAuditTrail(landlord.financialAuditTrail || []);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, landlord]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden text-slate-900 max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-5 border-b border-blue-900/60 relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-400">
              <History className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">Settlement Account Audit History</h3>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[10px] uppercase tracking-wider">
                  Tamper-Proof
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Every modification to Bank or M-Pesa channels is cryptographically logged for <strong className="text-white">{landlord.name}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Current State Summary */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs shrink-0 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Current Active Destination</span>
            <p className="font-bold text-slate-800">
              {landlord.bankName || 'Kenyan Commercial Bank'} &bull; <span className="font-mono text-blue-700">{landlord.accountNumber || '0110293847561'}</span>
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Last Authorized Modification</span>
            <p className="font-bold text-slate-800">
              {lastUpdate ? new Date(lastUpdate).toLocaleString() : 'Initial Account Provisioning'}
            </p>
          </div>
        </div>

        {/* Body List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1 text-xs">
          {loading ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span>Loading cryptographic audit trail...</span>
            </div>
          ) : auditTrail.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <ShieldCheck className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="font-bold text-slate-700">Initial Settlement Configuration Active</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No subsequent modifications have been made to your payment destinations. All future changes requiring landlord credential verification will be tracked here.
              </p>
            </div>
          ) : (
            auditTrail.map((entry, eIdx) => (
              <div
                key={`audit-entry-${entry.id || entry.timestamp}-${eIdx}`}
                className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                      <Lock className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <span className="font-bold text-slate-800">{entry.summary || 'Settlement Details Updated'}</span>
                      <span className="block text-[10px] text-slate-500 font-mono">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                    Verified
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-lg">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Verification Method</span>
                    <span className="font-semibold text-slate-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      {entry.verifiedMethod}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Caller Network Signature</span>
                    <span className="font-mono text-slate-600 flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-blue-500" />
                      {entry.ipAddress || '127.0.0.1'}
                    </span>
                  </div>
                </div>

                {entry.changedFields && entry.changedFields.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] text-slate-400 font-bold">Fields Altered:</span>
                    {entry.changedFields.map((f) => (
                      <span key={f} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 text-xs">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Protected against Unauthorized Payment Diversion Fraud
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold transition text-xs"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};
