import React, { useState } from 'react';
import { Mail, KeyRound, Lock, ArrowLeft, CheckCircle2, ShieldAlert, RefreshCw } from 'lucide-react';
import { requestPasswordReset, resetPassword } from '../lib/api';

interface ForgotPasswordPanelProps {
  initialEmail?: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}

/**
 * Two-step password recovery: (1) ask for a code by e-mail, (2) enter the code and a new password.
 * The server answers identically for known and unknown e-mails, so this screen never reveals which accounts exist.
 */
export const ForgotPasswordPanel: React.FC<ForgotPasswordPanelProps> = ({ initialEmail = '', onDone, onCancel }) => {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [resetToken, setResetToken] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await requestPasswordReset(email);
      setResetToken(r.resetToken);
      setInfo(r.message);
      setStep('code');
    } catch (err: any) {
      setError(err.message || 'Could not start the password reset. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) { setError('The two passwords do not match.'); return; }
    setLoading(true);
    try {
      await resetPassword(resetToken, otp, newPassword);
      onDone('Password updated. Please sign in with your new password.');
    } catch (err: any) {
      // A weak password consumes the code; the server then issues a fresh one and a new token.
      if (err?.data?.resetToken) { setResetToken(err.data.resetToken); setOtp(''); setInfo('A new 6-digit code was sent to your email.'); }
      setError(err.message || 'Could not reset the password.');
    } finally {
      setLoading(false);
    }
  };

  const field = 'w-full bg-slate-50 border border-slate-300 focus:border-blue-500 focus:bg-white rounded-xl py-3 pl-10 pr-3 text-slate-900 font-semibold text-xs shadow-xs focus:outline-none transition';

  return (
    <div className="space-y-4 text-xs font-medium">
      <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-blue-700 font-bold">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
      </button>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 flex items-start gap-2.5">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <span>
          Resetting your password signs you out of every device. EstateMaster staff will never ask you for the 6-digit code.
        </span>
      </div>

      {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold">{error}</div>}
      {info && !error && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> <span>{info}</span>
        </div>
      )}

      {step === 'email' ? (
        <form onSubmit={requestCode} className="space-y-4">
          <div>
            <label className="block text-slate-700 font-bold mb-1.5">Account email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="you@example.com" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending code…</> : 'Email me a reset code'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitReset} className="space-y-4">
          <div>
            <label className="block text-slate-700 font-bold mb-1.5">6-digit code</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input inputMode="numeric" autoComplete="one-time-code" required maxLength={7} value={otp} onChange={(e) => setOtp(e.target.value.replace(/[^\d ]/g, ''))} className={`${field} tracking-[0.4em] font-mono`} placeholder="000000" />
            </div>
          </div>
          <div>
            <label className="block text-slate-700 font-bold mb-1.5">New password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="password" required autoComplete="new-password" minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={field} placeholder="At least 10 characters" />
            </div>
          </div>
          <div>
            <label className="block text-slate-700 font-bold mb-1.5">Confirm new password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Updating…</> : 'Set new password'}
          </button>
          <button type="button" onClick={() => { setStep('email'); setError(null); setInfo(null); }} className="w-full text-slate-500 hover:text-slate-800 font-bold">
            Use a different email / request a new code
          </button>
        </form>
      )}
    </div>
  );
};
