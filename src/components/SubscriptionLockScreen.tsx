import React, { useState } from 'react';
import { Landlord } from '../types';
import { formatKSH } from '../lib/formatters';
import { updateLandlordDetails, triggerMpesaStkPush } from '../lib/api';
import {
  Lock,
  ShieldAlert,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  Building2,
  CreditCard,
  Building
} from 'lucide-react';

interface SubscriptionLockScreenProps {
  activeLandlord: Landlord;
  landlords: Landlord[];
  onSelectLandlord: (id: string) => void;
  onSubscriptionRenewed: () => void;
  activePlatformName: 'EstateMaster Landlord' | 'EstateMaster Tenant';
}

export const SubscriptionLockScreen: React.FC<SubscriptionLockScreenProps> = ({
  activeLandlord,
  landlords,
  onSelectLandlord,
  onSubscriptionRenewed,
  activePlatformName
}) => {
  const [paymentPhone, setPaymentPhone] = useState(activeLandlord.phone || '+254 712 345 678');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handlePaySubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      // Trigger STK Push simulation
      await triggerMpesaStkPush({
        phone: paymentPhone,
        amount: 20000,
        invoiceId: `SUB-${Date.now()}`,
        accountRef: activeLandlord.companyName || 'EstateMaster License'
      });

      // Calculate new expiry date (1 year from now)
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      const newExpiry = nextYear.toISOString().split('T')[0];

      // Update Landlord subscription to Active
      await updateLandlordDetails(activeLandlord.id, {
        subscriptionStatus: 'Active',
        subscriptionExpiry: newExpiry,
        subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)'
      });

      setStatusMessage('✅ KSH 20,000 Payment Received! Annual License Activated.');
      setTimeout(() => {
        onSubscriptionRenewed();
      }, 1500);
    } catch (err: any) {
      setStatusMessage(`Payment error: ${err.message || 'Failed to process M-Pesa STK push'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickActivateDemo = async () => {
    setIsSubmitting(true);
    try {
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      await updateLandlordDetails(activeLandlord.id, {
        subscriptionStatus: 'Active',
        subscriptionExpiry: nextYear.toISOString().split('T')[0]
      });
      onSubscriptionRenewed();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 min-h-[500px] flex items-center justify-center p-4 bg-slate-950 text-white relative overflow-hidden">
      {/* Background Decorative Rings */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-slate-900 border border-rose-900/50 rounded-3xl p-6 shadow-2xl space-y-5 relative z-10 my-auto">
        {/* Header Icon */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-rose-950 border border-rose-800 text-rose-500 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8 animate-pulse" />
          </div>
          <span className="px-3 py-1 rounded-full bg-rose-950 text-rose-400 border border-rose-800 font-extrabold text-[10px] uppercase tracking-wider inline-block">
            Subscription Expired &bull; Access Locked
          </span>
          <h2 className="text-xl font-black text-white">
            {activePlatformName} Access Suspended
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed px-2">
            Services for both Landlord and Tenants are temporarily locked until the landlord clears the annual platform license fee.
          </p>
        </div>

        {/* Landlord Info Summary */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-xs space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <span>Landlord Account:</span>
            <span className="font-bold text-white">{activeLandlord.name}</span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>Company / Estate:</span>
            <span className="font-bold text-blue-400">{activeLandlord.companyName}</span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>License Expiry Date:</span>
            <span className="font-mono font-bold text-rose-400">{activeLandlord.subscriptionExpiry || 'Expired'}</span>
          </div>
          <div className="flex justify-between items-center border-t border-slate-800 pt-2 font-bold">
            <span className="text-slate-300">Annual License Renewal:</span>
            <span className="text-amber-400 text-sm">{formatKSH(20000)} / year</span>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className="p-3 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs font-bold text-center">
            {statusMessage}
          </div>
        )}

        {/* M-Pesa Subscription Checkout */}
        <form onSubmit={handlePaySubscription} className="space-y-3">
          <div>
            <label className="block text-slate-300 font-bold text-xs mb-1">
              M-Pesa Phone Number (+254)
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={paymentPhone}
                onChange={(e) => setPaymentPhone(e.target.value)}
                placeholder="+254 712 345 678"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
              />
              <Smartphone className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Processing M-Pesa STK Push...
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" /> Pay {formatKSH(20000)} via M-Pesa STK & Unlock
              </>
            )}
          </button>
        </form>

        {/* Landlord Switcher & Quick Demo Unlock */}
        <div className="border-t border-slate-800 pt-4 space-y-3">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-400">Switch Landlord Account:</span>
            <div className="flex gap-1 overflow-x-auto max-w-[200px]">
              {landlords.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onSelectLandlord(l.id)}
                  className={`px-2 py-1 rounded text-[10px] font-bold ${
                    l.id === activeLandlord.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {l.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleQuickActivateDemo}
            disabled={isSubmitting}
            className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            [Demo Mode] Instant Unlock (Set Active Expiry 2027)
          </button>
        </div>
      </div>
    </div>
  );
};
