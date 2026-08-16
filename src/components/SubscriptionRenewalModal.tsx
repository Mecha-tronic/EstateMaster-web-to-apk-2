import React, { useState } from 'react';
import { Landlord } from '../types';
import { formatKSH } from '../lib/formatters';
import { updateLandlordDetails, triggerSubscriptionStkPush } from '../lib/api';
import {
  RefreshCw,
  X,
  Smartphone,
  CheckCircle2,
  ShieldCheck,
  Calendar,
  CreditCard,
  Zap
} from 'lucide-react';

interface SubscriptionRenewalModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeLandlord: Landlord;
  onSubscriptionRenewed: () => void;
}

export const SubscriptionRenewalModal: React.FC<SubscriptionRenewalModalProps> = ({
  isOpen,
  onClose,
  activeLandlord,
  onSubscriptionRenewed
}) => {
  const [phone, setPhone] = useState(activeLandlord?.phone || '0746549710');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleMpesaPay = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMsg(null);

    try {
      // 1. Send M-Pesa STK Push Prompt to Platform Account +254746549710
      const res = await triggerSubscriptionStkPush({
        phone: phone.trim(),
        amount: 20000,
        landlordId: activeLandlord?.id
      });

      // 2. Compute 1 year extension from current expiry or today
      const baseDate = activeLandlord?.subscriptionExpiry ? new Date(activeLandlord.subscriptionExpiry) : new Date();
      const now = new Date();
      const startFrom = baseDate > now ? baseDate : now;
      const nextYear = new Date(startFrom);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      const newExpiry = nextYear.toISOString().split('T')[0];

      // 3. Update Landlord Account Status
      await updateLandlordDetails(activeLandlord.id, {
        subscriptionStatus: 'Active',
        subscriptionExpiry: newExpiry,
        subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
        subscriptionPaid: true
      });

      setStatusMsg(`✅ ${res.CustomerMessage || `KSH 20,000 Payment Verified! Annual License renewed until ${newExpiry}.`}`);
      setTimeout(() => {
        onSubscriptionRenewed();
        onClose();
      }, 1800);
    } catch (err: any) {
      console.error('Subscription renewal error:', err);
      setStatusMsg(`Error: ${err.message || 'Failed to process payment.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickDemoRenew = async () => {
    setIsSubmitting(true);
    try {
      const baseDate = activeLandlord?.subscriptionExpiry ? new Date(activeLandlord.subscriptionExpiry) : new Date();
      const now = new Date();
      const startFrom = baseDate > now ? baseDate : now;
      const nextYear = new Date(startFrom);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      const newExpiry = nextYear.toISOString().split('T')[0];

      await updateLandlordDetails(activeLandlord.id, {
        subscriptionStatus: 'Active',
        subscriptionExpiry: newExpiry
      });

      setStatusMsg(`✅ Quick Renew Activated! License extended until ${newExpiry}.`);
      setTimeout(() => {
        onSubscriptionRenewed();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Renew Annual Subscription</h3>
              <p className="text-xs text-slate-400">EstateMaster Commercial Landlord License</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs font-medium text-slate-700">
          {/* Active Account Info Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Account Owner:</span>
              <strong className="text-slate-900 font-bold text-xs">{activeLandlord?.name} ({activeLandlord?.companyName})</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Subscription Rate:</span>
              <strong className="text-emerald-700 font-extrabold text-xs">{formatKSH(20000)} / year</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Current Expiry Date:</span>
              <span className="text-blue-700 font-mono font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {activeLandlord?.subscriptionExpiry || '2026-12-31'}
              </span>
            </div>
          </div>

          {statusMsg && (
            <div className={`p-3 rounded-xl border font-bold text-xs flex items-center gap-2 ${
              statusMsg.startsWith('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
            }`}>
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* M-Pesa Checkout Form */}
          <form onSubmit={handleMpesaPay} className="space-y-3.5">
            <div>
              <label className="block text-slate-800 font-bold mb-1 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-600" /> M-Pesa Phone Number for Renewal Prompt *
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254 712 345 678"
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900 text-sm font-mono focus:outline-none focus:border-emerald-500 shadow-xs"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                An M-Pesa STK push prompt for <strong>KSH 20,000</strong> will be sent to your phone.
              </span>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Processing M-Pesa Renewal...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" /> Pay KSH 20,000 via M-Pesa & Renew License
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleQuickDemoRenew}
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition flex items-center justify-center gap-2 border border-slate-300"
              >
                <ShieldCheck className="w-4 h-4 text-blue-600" /> Quick Demo Renew (Extend License 1 Year)
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
