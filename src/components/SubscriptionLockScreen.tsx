import React from 'react';
import { Landlord } from '../types';
import { Lock } from 'lucide-react';
import { SubscriptionPaymentPanel } from './SubscriptionPaymentPanel';

interface SubscriptionLockScreenProps {
  activeLandlord: Landlord;
  /** Kept for backwards compatibility with callers; a signed-in landlord can only ever see their own account. */
  landlords?: Landlord[];
  onSelectLandlord?: (id: string) => void;
  onSubscriptionRenewed: () => void;
  activePlatformName: 'EstateMaster Landlord' | 'EstateMaster Tenant';
}

/**
 * Shown when the landlord's licence is not active. The licence can ONLY be activated by the server after a
 * confirmed payment; there is no client-side unlock of any kind.
 */
export const SubscriptionLockScreen: React.FC<SubscriptionLockScreenProps> = ({
  activeLandlord,
  onSubscriptionRenewed,
  activePlatformName
}) => {
  const pending = activeLandlord.subscriptionStatus === 'Pending Payment';
  return (
    <div className="flex-1 min-h-[500px] flex items-center justify-center p-4 bg-slate-950 text-white relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-slate-900 border border-rose-900/50 rounded-3xl p-6 shadow-2xl space-y-5 relative z-10 my-auto">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-rose-950 border border-rose-800 text-rose-500 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8 animate-pulse" />
          </div>
          <span className="px-3 py-1 rounded-full bg-rose-950 text-rose-400 border border-rose-800 font-extrabold text-[10px] uppercase tracking-wider inline-block">
            {pending ? 'Licence payment pending' : 'Subscription expired'} &bull; Access locked
          </span>
          <h2 className="text-xl font-black text-white">{activePlatformName} access suspended</h2>
          <p className="text-xs text-slate-400 leading-relaxed px-2">
            Services for the landlord and their tenants are locked until the annual platform licence is paid. Your data is safe and is restored the moment the payment is confirmed.
          </p>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-xs space-y-2">
          <div className="flex justify-between items-center text-slate-400"><span>Landlord account</span><span className="font-bold text-white">{activeLandlord.name}</span></div>
          {activeLandlord.companyName && <div className="flex justify-between items-center text-slate-400"><span>Company / estate</span><span className="font-bold text-blue-400">{activeLandlord.companyName}</span></div>}
          <div className="flex justify-between items-center text-slate-400"><span>Licence expiry</span><span className="font-mono font-bold text-rose-400">{activeLandlord.subscriptionExpiry || (pending ? 'Not yet activated' : 'Expired')}</span></div>
        </div>

        <SubscriptionPaymentPanel landlord={activeLandlord} onActivated={onSubscriptionRenewed} tone="dark" />
      </div>
    </div>
  );
};
