import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Lock, AlertCircle, RefreshCw, KeyRound, CheckCircle2, ArrowRight, Key, Eye, EyeOff } from 'lucide-react';
import { verify2FaLogin, resend2FaOtp, LoginResponse } from '../lib/api';
import { Tenant, Landlord } from '../types';

interface TwoFactorModalProps {
  isOpen: boolean;
  tempToken: string;
  emailMasked?: string;
  phoneMasked?: string;
  initialOtpSimulation?: string;
  userEmail?: string;
  onSuccess: (role: 'tenant' | 'landlord', user: Tenant | Landlord, sessionToken?: string) => void;
  onCancel: () => void;
}

export const TwoFactorModal: React.FC<TwoFactorModalProps> = ({
  isOpen,
  tempToken,
  emailMasked,
  phoneMasked,
  initialOtpSimulation,
  userEmail,
  onSuccess,
  onCancel,
}) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(300); // 5 mins
  const [otpSimulation, setOtpSimulation] = useState<string | undefined>(initialOtpSimulation);
  const [usePasswordFallback, setUsePasswordFallback] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setDigits(['', '', '', '', '', '']);
    setError(null);
    setResendSuccess(null);
    setSecondsRemaining(300);
    setOtpSimulation(initialOtpSimulation);
    setUsePasswordFallback(false);
    setPassword('');

    // Focus first input box
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen, initialOtpSimulation]);

  useEffect(() => {
    if (!isOpen || secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, secondsRemaining]);

  if (!isOpen) return null;

  const handleDigitChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste of whole 6-digit code
      const pasted = value.replace(/\D/g, '').slice(0, 6).split('');
      const newDigits = [...digits];
      pasted.forEach((char, i) => {
        if (i < 6) newDigits[i] = char;
      });
      setDigits(newDigits);
      const nextFocus = Math.min(pasted.length, 5);
      inputRefs.current[nextFocus]?.focus();

      if (pasted.length === 6) {
        submitOtp(newDigits.join(''));
      }
      return;
    }

    const clean = value.replace(/\D/g, '');
    const newDigits = [...digits];
    newDigits[index] = clean;
    setDigits(newDigits);

    if (clean && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // If all filled, auto submit
    if (clean && index === 5 && newDigits.every((d) => d !== '')) {
      submitOtp(newDigits.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const submitOtp = async (otpCode: string) => {
    if (otpCode.length < 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await verify2FaLogin(tempToken, otpCode);
      if (res.success && res.role && res.user) {
        onSuccess(res.role, res.user, res.sessionToken);
      } else {
        throw new Error(res.message || 'Verification failed');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid or expired 2FA code. Please check the code shown or try resending.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your account password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await verify2FaLogin(tempToken, undefined, password);
      if (res.success && res.role && res.user) {
        onSuccess(res.role, res.user, res.sessionToken);
      } else {
        throw new Error(res.message || 'Password verification failed');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid password. Please enter your valid account password.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    setResendSuccess(null);

    try {
      const res = await resend2FaOtp(tempToken);
      if (res.otpSimulation) {
        setOtpSimulation(res.otpSimulation);
      }
      setResendSuccess(res.message || 'New code sent to your registered email.');
      setSecondsRemaining(300);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timerFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-sky-600 to-blue-700 p-6 text-white text-center relative">
          <div className="mx-auto w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 mb-3 shadow-inner">
            <ShieldCheck className="w-6 h-6 text-sky-100" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Two-Factor Authentication</h2>
          <p className="text-xs text-sky-100/90 mt-1">Anti-Hacking Shield • Identity Verification</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-center space-y-1">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              A 6-digit verification code has been dispatched to your authorized email address:
            </p>
            {emailMasked && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-semibold text-sky-700 dark:text-sky-400 mt-1">
                <Lock className="w-3 h-3" />
                <span>{emailMasked}</span>
              </div>
            )}
          </div>

          {/* Development / Immediate OTP Simulation Banner */}
          {otpSimulation && !usePasswordFallback && (
            <div className="p-3.5 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800/80 rounded-xl space-y-2 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span className="text-xs text-sky-950 dark:text-sky-200">
                    Security Code: <strong className="font-mono text-sm tracking-widest text-sky-700 dark:text-sky-300 font-bold">{otpSimulation}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const arr = otpSimulation.split('').slice(0, 6);
                    setDigits(arr);
                    submitOtp(otpSimulation);
                  }}
                  className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white rounded-lg font-bold text-xs transition shrink-0 cursor-pointer shadow-xs"
                >
                  Auto-Fill Code
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed border-t border-sky-100 dark:border-sky-900/60 pt-1.5">
                ℹ️ <strong>External Delivery Notice:</strong> In this cloud sandbox, external emails to your personal inbox require SMTP credentials (such as a Gmail App Password or Resend API key) in your project environment settings. Your code is provided above for instant access.
              </p>
            </div>
          )}

          {!usePasswordFallback ? (
            <>
              {/* 6-Digit OTP Inputs */}
              <div className="flex justify-center items-center gap-2 sm:gap-3 py-1">
                {digits.map((digit, idx) => (
                  <input
                    key={`otp-slot-${idx}`}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    disabled={loading || secondsRemaining === 0}
                    className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-2xl font-bold rounded-xl border transition-all outline-none ${
                      digit
                        ? 'border-sky-500 bg-sky-50/40 dark:bg-sky-950/30 text-sky-900 dark:text-sky-100 ring-2 ring-sky-500/20'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20'
                    }`}
                    placeholder="•"
                  />
                ))}
              </div>

              {/* Timer & Resend */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                <span className="flex items-center gap-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${secondsRemaining > 60 ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-ping'}`} />
                  Code expires in: <strong className="font-mono text-slate-700 dark:text-slate-200">{timerFormatted}</strong>
                </span>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending || loading}
                  className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-medium disabled:opacity-50 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
                  <span>Resend Code</span>
                </button>
              </div>

              {/* Action Button: Verify OTP */}
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => submitOtp(digits.join(''))}
                  disabled={loading || digits.some((d) => !d) || secondsRemaining === 0}
                  className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-medium text-sm rounded-xl shadow-lg shadow-sky-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Code...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Verify & Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUsePasswordFallback(true);
                    setError(null);
                  }}
                  className="w-full py-2 text-xs text-slate-600 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-300 transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Didn't receive email? Sign in with Master Password</span>
                </button>
              </div>
            </>
          ) : (
            /* Backup: Master Password Fallback Verification */
            <form onSubmit={handlePasswordSubmit} className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Master Password Fallback Verification
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your account password"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 pr-10 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Default demo account password is <strong className="font-mono">password123</strong>
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="submit"
                  disabled={loading || !password}
                  className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-medium text-sm rounded-xl shadow-lg shadow-sky-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Password...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Verify Password & Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUsePasswordFallback(false);
                    setError(null);
                  }}
                  className="w-full py-2 text-xs text-sky-600 dark:text-sky-400 hover:underline transition cursor-pointer"
                >
                  Back to 6-digit OTP code entry
                </button>
              </div>
            </form>
          )}

          {/* Error / Success Notifications */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs text-rose-700 dark:text-rose-300"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            {resendSuccess && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-700 dark:text-emerald-300"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{resendSuccess}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Cancel button */}
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer"
          >
            Cancel and Return to Sign In
          </button>
        </div>
      </motion.div>
    </div>
  );
};
