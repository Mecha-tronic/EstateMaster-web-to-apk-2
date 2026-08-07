import React, { useState } from 'react';
import { Landlord } from '../types';
import { registerLandlordAccount } from '../lib/api';
import { formatKSH } from '../lib/formatters';
import {
  Building2,
  UserCheck,
  CreditCard,
  Smartphone,
  CheckCircle2,
  X,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Lock
} from 'lucide-react';

interface LandlordRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegistered: (newLandlord: Landlord) => void;
}

export const LandlordRegistrationModal: React.FC<LandlordRegistrationModalProps> = ({
  isOpen,
  onClose,
  onRegistered
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+254 ');
  const [idNumber, setIdNumber] = useState('');

  // Payment & Bank Details
  const [mpesaTillNumber, setMpesaTillNumber] = useState('');
  const [mpesaPaybill, setMpesaPaybill] = useState('');
  const [bankName, setBankName] = useState('Equity Bank Kenya');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [paymentPhone, setPaymentPhone] = useState('+254 ');
  const [paymentMethod, setPaymentMethod] = useState<'M-Pesa Express' | 'Bank Transfer'>('M-Pesa Express');

  if (!isOpen) return null;

  const handleNextToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !phone || !companyName) {
      setErrorMessage('Please fill in all required personal and company details.');
      return;
    }
    setErrorMessage(null);
    setPaymentPhone(phone);
    setAccountName(companyName);
    setStep(2);
  };

  const handleRegisterAndSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await registerLandlordAccount({
        name,
        companyName,
        email,
        phone,
        idNumber,
        mpesaTillNumber,
        mpesaPaybill,
        bankName,
        accountName: accountName || companyName,
        accountNumber,
        paymentMethod,
        paymentPhone
      });

      setSuccessMessage(`✅ Subscription Active! Ref: ${res.receiptCode}. Welcome to EstateMaster.`);
      setTimeout(() => {
        onRegistered(res.landlord);
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 text-slate-900 shadow-2xl relative my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Pitch */}
        <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
          <div className="p-3 bg-blue-100 rounded-xl text-blue-700">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Register EstateMaster Account</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider border border-emerald-200">
                Commercial SaaS
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Annual Subscription Fee: <strong className="text-emerald-600 font-bold">KSH 20,000 / year</strong> for Landlords
            </p>
          </div>
        </div>

        {/* Progress Stepper */}
        <div className="flex items-center justify-between my-4 text-xs font-semibold">
          <div
            className={`flex items-center gap-2 ${
              step === 1 ? 'text-blue-600 font-bold' : 'text-emerald-600'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === 1
                  ? 'bg-blue-600 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              1
            </span>
            Landlord & Company Info
          </div>

          <div className="h-0.5 w-12 bg-slate-200" />

          <div
            className={`flex items-center gap-2 ${
              step === 2 ? 'text-blue-600 font-bold' : 'text-slate-400'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              2
            </span>
            Subscription Payment (KSH 20,000)
          </div>
        </div>

        {/* Alert Messages */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {successMessage}
          </div>
        )}

        {/* Step 1: Personal & Business Info Form */}
        {step === 1 && (
          <form onSubmit={handleNextToPayment} className="space-y-4 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> EstateMaster Landlord Features Included:
              </span>
              <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-0.5">
                <li>Automated M-Pesa Express Rent Collections (Till / Paybill)</li>
                <li>Tenant Registration & Auto Emailing of Quotes and Monthly Invoices</li>
                <li>AI Maintenance Triage Copilot powered by Gemini 3.6 Flash</li>
                <li>Full Multi-Property & Tenant Financial Ledger</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Hon. Peter Njuguna"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Estate / Company Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Njuguna Estate Holdings Ltd"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. peter.njuguna@njugunaestates.co.ke"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Phone Number (+254) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+254 712 345 678"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono focus:outline-none focus:border-blue-500 shadow-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-700 font-semibold mb-1">
                  National ID / KRA PIN Number
                </label>
                <input
                  type="text"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="e.g. ID-29182031 or KRA A019283710Z"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono focus:outline-none focus:border-blue-500 shadow-sm"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                Continue to Subscription Payment (KSH 20,000) &rarr;
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Banking Setup & KSH 20,000 Annual Subscription */}
        {step === 2 && (
          <form onSubmit={handleRegisterAndSubscribe} className="space-y-4 text-xs">
            {/* Till / Bank Config for collecting rent */}
            <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200 space-y-2">
              <h3 className="font-bold text-blue-900 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-blue-600" /> Your Rent Collection Setup (Shared on Invoices)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">M-Pesa Buy Goods Till Number</label>
                  <input
                    type="text"
                    value={mpesaTillNumber}
                    onChange={(e) => setMpesaTillNumber(e.target.value)}
                    placeholder="e.g. 781920"
                    className="w-full bg-white border border-blue-200 rounded-lg p-2 text-slate-900 font-mono shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">M-Pesa Paybill Number</label>
                  <input
                    type="text"
                    value={mpesaPaybill}
                    onChange={(e) => setMpesaPaybill(e.target.value)}
                    placeholder="e.g. 247247"
                    className="w-full bg-white border border-blue-200 rounded-lg p-2 text-slate-900 font-mono shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. Equity Bank Kenya"
                    className="w-full bg-white border border-blue-200 rounded-lg p-2 text-slate-900 shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Bank Account Number</label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="e.g. 0110293847"
                    className="w-full bg-white border border-blue-200 rounded-lg p-2 text-slate-900 font-mono shadow-xs"
                  />
                </div>
              </div>
            </div>

            {/* EstateMaster Annual Plan Summary */}
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 space-y-3">
              <div className="flex justify-between items-center border-b border-emerald-200 pb-2">
                <div>
                  <h4 className="font-extrabold text-emerald-950 text-sm">EstateMaster Annual Commercial License</h4>
                  <p className="text-[11px] text-emerald-700">1 Year Unlimited Access • 24/7 Support</p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-emerald-700">{formatKSH(20000)}</span>
                  <span className="text-[10px] text-emerald-800 block">/ year</span>
                </div>
              </div>

              <div>
                <label className="block text-emerald-900 font-bold mb-1">Select Checkout Method</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('M-Pesa Express')}
                    className={`p-2.5 rounded-xl border text-left font-bold transition flex items-center gap-2 ${
                      paymentMethod === 'M-Pesa Express'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" /> M-Pesa Express STK
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Bank Transfer')}
                    className={`p-2.5 rounded-xl border text-left font-bold transition flex items-center gap-2 ${
                      paymentMethod === 'Bank Transfer'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" /> Bank Direct Transfer
                  </button>
                </div>
              </div>

              {paymentMethod === 'M-Pesa Express' && (
                <div>
                  <label className="block text-emerald-900 font-bold mb-1">M-Pesa Phone Number (+254)</label>
                  <input
                    type="text"
                    required
                    value={paymentPhone}
                    onChange={(e) => setPaymentPhone(e.target.value)}
                    placeholder="+254 712 345 678"
                    className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold shadow-xs"
                  />
                  <p className="text-[10px] text-emerald-800 mt-1">
                    An M-Pesa prompt for <strong>KSH 20,000</strong> will be sent directly to this phone number.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition"
              >
                &larr; Back
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Processing KSH 20,000 STK Push...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" /> Pay {formatKSH(20000)} & Activate Account
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
