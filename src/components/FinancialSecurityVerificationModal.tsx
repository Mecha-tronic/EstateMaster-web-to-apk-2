import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  Lock,
  Key,
  Smartphone,
  AlertTriangle,
  RefreshCw,
  X,
  CheckCircle2,
  Mail,
  Eye,
  EyeOff,
  Building2,
  CreditCard,
  Send
} from 'lucide-react';
import { Landlord } from '../types';
import { requestFinancialOtp } from '../lib/api';

interface FinancialSecurityVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  landlord: Landlord;
  pendingChanges: {
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    branchName?: string;
    swiftCode?: string;
    mpesaTillNumber?: string;
    mpesaPaybill?: string;
    mpesaPhoneNumber?: string;
  };
  onConfirm: (auth: { confirmationPassword?: string; otp?: string; challengeId?: string }) => Promise<void>;
}

export const FinancialSecurityVerificationModal: React.FC<FinancialSecurityVerificationModalProps> = ({
  isOpen,
  onClose,
  landlord,
  pendingChanges,
  onConfirm
}) => {
  const [authMethod, setAuthMethod] = useState<'password' | 'otp'>('password');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP state
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSuccessMessage, setOtpSuccessMessage] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSendOtp = async () => {
    setOtpLoading(true);
    setErrorMessage(null);
    try {
      const res = await requestFinancialOtp(landlord.id);
      setChallengeId(res.challengeId);
      setOtpRequested(true);
      setOtpSuccessMessage(`Security code sent to ${res.emailMasked}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to dispatch security code. Please try using your password.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (authMethod === 'password' && !password.trim()) {
      setErrorMessage('Please enter your landlord account password to authorize this financial change.');
      return;
    }

    if (authMethod === 'otp' && (!otpCode.trim() || !challengeId)) {
      setErrorMessage('Please enter the 6-digit authorization code sent to your email.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (authMethod === 'password') {
        await onConfirm({ confirmationPassword: password.trim() });
      } else {
        await onConfirm({ otp: otpCode.trim(), challengeId: challengeId! });
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Authorization failed. Please check your credentials and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const maskAcc = (val?: string) => (val && val.length > 4 ? `****${val.slice(-4)}` : val || 'Not set');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden text-slate-900"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-5 border-b border-blue-900/60 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">Landlord Security Authorization</h3>
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px] uppercase tracking-wider">
                  High-Risk Financial Action
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Bank & M-Pesa Settlement Details Protection for <strong className="text-white">{landlord.name}</strong>
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Warning Banner */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed">
              <strong className="block text-xs font-bold text-amber-950">Payment Diversion Prevention Protection</strong>
              <span>
                To ensure that <strong>only you (the verified property owner)</strong> can change where rent payments are deposited, please verify your landlord identity before these payout destinations are saved.
              </span>
            </div>
          </div>

          {/* Pending Changes Comparison */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              Pending Settlement Destination Updates:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Bank Account</span>
                <p className="font-bold text-slate-800 truncate">
                  {pendingChanges.bankName || landlord.bankName || 'N/A'}
                </p>
                <p className="text-slate-600 font-mono text-[11px]">
                  A/C: {pendingChanges.accountNumber || landlord.accountNumber || 'N/A'}
                </p>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">M-Pesa Channels</span>
                <p className="font-bold text-slate-800 truncate">
                  Till: {pendingChanges.mpesaTillNumber || landlord.mpesaTillNumber || 'None'}
                </p>
                <p className="text-slate-600 font-mono text-[11px]">
                  Paybill: {pendingChanges.mpesaPaybill || landlord.mpesaPaybill || 'None'}
                </p>
              </div>
            </div>
          </div>

          {/* Verification Method Tabs */}
          <div className="space-y-2">
            <label className="block text-slate-700 font-bold">Select Authorization Method:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('password');
                  setErrorMessage(null);
                }}
                className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 cursor-pointer ${
                  authMethod === 'password'
                    ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/20 text-blue-900 font-bold'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Key className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-xs">Landlord Password</div>
                  <div className="text-[10px] text-slate-400 font-normal">Fastest confirmation</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMethod('otp');
                  setErrorMessage(null);
                  if (!otpRequested) {
                    handleSendOtp();
                  }
                }}
                className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 cursor-pointer ${
                  authMethod === 'otp'
                    ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/20 text-blue-900 font-bold'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-xs">2FA Security Code</div>
                  <div className="text-[10px] text-slate-400 font-normal">SMS / Email OTP</div>
                </div>
              </button>
            </div>
          </div>

          {/* Method A: Password Input */}
          {authMethod === 'password' && (
            <div className="space-y-1.5 animate-fade-in">
              <label className="block text-slate-700 font-bold">
                Enter Current Landlord Password for <span className="font-mono text-blue-700 font-normal">{landlord.email}</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your landlord password"
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 pr-10 text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Method B: 2FA OTP Input */}
          {authMethod === 'otp' && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex items-center justify-between">
                <label className="block text-slate-700 font-bold">
                  Enter 6-Digit Authorization Code
                </label>
                <button
                  type="button"
                  disabled={otpLoading}
                  onClick={handleSendOtp}
                  className="text-[11px] text-blue-600 hover:text-blue-800 font-bold disabled:opacity-50 flex items-center gap-1"
                >
                  {otpLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  {otpRequested ? 'Resend Code' : 'Send Code'}
                </button>
              </div>

              {otpSuccessMessage && (
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  {otpSuccessMessage}
                </div>
              )}

              <input
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • • • •"
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-center text-xl tracking-[0.5em] font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2 animate-fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Security Footnote */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3 text-blue-600" />
              Instant tamper alert will be emailed to {landlord.email}
            </span>
            <span className="font-mono text-slate-400">Vault Protected</span>
          </div>

          {/* Submit buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (authMethod === 'password' && !password.trim()) || (authMethod === 'otp' && otpCode.length < 6)}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold transition text-xs shadow-md flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Verifying & Applying Changes...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" /> Authorize & Save Settlement Details
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
