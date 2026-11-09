import React from 'react';
import { Landlord } from '../types';
import { RefreshCw, X, Calendar } from 'lucide-react';
import { SubscriptionPaymentPanel } from './SubscriptionPaymentPanel';

interface SubscriptionRenewalModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeLandlord: Landlord;
  onSubscriptionRenewed: () => void;
}

/** Renew early. The licence is extended by the server after the payment is confirmed; nothing is written by the browser. */
export const SubscriptionRenewalModal: React.FC<SubscriptionRenewalModalProps> = ({
  isOpen,
  onClose,
  activeLandlord,
  onSubscriptionRenewed
}) => {
  if (!isOpen || !activeLandlord) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fadeIn" role="dialog" aria-modal="true" aria-label="Renew annual subscription">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto flex flex-col">
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30"><RefreshCw className="w-5 h-5" /></div>
            <div>
              <h3 className="font-bold text-base text-white">Renew annual subscription</h3>
              <p className="text-xs text-slate-400">EstateMaster landlord licence</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 text-xs font-medium text-slate-700">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Account owner</span>
              <strong className="text-slate-900 text-xs">{activeLandlord.name}{activeLandlord.companyName ? ` (${activeLandlord.companyName})` : ''}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Current expiry</span>
              <span className="text-blue-700 font-mono font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {activeLandlord.subscriptionExpiry || 'Not active'}
              </span>
            </div>
          </div>

          <SubscriptionPaymentPanel
            landlord={activeLandlord}
            tone="light"
            onActivated={() => { onSubscriptionRenewed(); setTimeout(onClose, 1500); }}
          />
        </div>
      </div>
    </div>
  );
};
