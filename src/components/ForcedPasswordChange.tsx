import React, { useState } from 'react';
import { Lock, ShieldAlert, RefreshCw } from 'lucide-react';
import { changeUserPassword, logoutUser } from '../lib/api';

interface ForcedPasswordChangeProps {
  role: 'landlord' | 'tenant';
  userId: string;
  onChanged: () => void;
  onCancel: () => void;
}

/** Shown when the server flags an account as "must change password" (e.g. a temporary or weak password). */
export const ForcedPasswordChange: React.FC<ForcedPasswordChangeProps> = ({ role, userId, onChanged, onCancel }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) { setError('The two new passwords do not match.'); return; }
    setLoading(true);
    try {
      await changeUserPassword(userId, role, current, next);
      onChanged();
    } catch (err: any) {
      setError(err.message || 'Could not change the password.');
    } finally {
      setLoading(false);
    }
  };

  const field = 'w-full bg-slate-50 border border-slate-300 focus:border-blue-500 focus:bg-white rounded-xl py-3 pl-10 pr-3 text-slate-900 font-semibold text-xs shadow-xs focus:outline-none transition';
  return (
    <form onSubmit={submit} className="space-y-4 text-xs font-medium">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 flex items-start gap-2.5">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <strong className="block">Choose a new password to continue</strong>
          <span>For your security this account must set a new password (at least 10 characters, not a common one) before using EstateMaster.</span>
        </div>
      </div>
      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold">{error}</div>}
      {([['Current password', current, setCurrent, 'current-password'], ['New password', next, setNext, 'new-password'], ['Confirm new password', confirm, setConfirm, 'new-password']] as const).map(([label, value, set, ac]) => (
        <div key={label}>
          <label className="block text-slate-700 font-bold mb-1.5">{label}</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="password" required autoComplete={ac} value={value} onChange={(e) => set(e.target.value)} className={field} />
          </div>
        </div>
      ))}
      <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
        {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : 'Save new password & continue'}
      </button>
      <button type="button" onClick={async () => { await logoutUser(); onCancel(); }} className="w-full text-slate-500 hover:text-slate-800 font-bold">
        Sign out
      </button>
    </form>
  );
};
