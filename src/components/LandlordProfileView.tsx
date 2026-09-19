import React, { useState } from 'react';
import { Landlord } from '../types';
import { formatKSH } from '../lib/formatters';
import {
  Building,
  CreditCard,
  Building2,
  Phone,
  Mail,
  CheckCircle,
  Save,
  Smartphone,
  ShieldCheck,
  RefreshCw,
  UserPlus,
  Sparkles,
  Calendar,
  Award,
  Landmark,
  Check,
  Lock,
  History,
  AlertTriangle
} from 'lucide-react';
import { updateLandlordDetails } from '../lib/api';
import { KENYA_BANKS, getBankByNameOrId } from '../lib/kenyaBanks';
import { FinancialSecurityVerificationModal } from './FinancialSecurityVerificationModal';
import { FinancialAuditTrailModal } from './FinancialAuditTrailModal';

interface LandlordProfileViewProps {
  landlords: Landlord[];
  activeLandlordId: string;
  onSelectLandlord: (id: string) => void;
  onLandlordUpdated: (landlord: Landlord) => void;
  onOpenRegisterModal?: () => void;
}

export const LandlordProfileView: React.FC<LandlordProfileViewProps> = ({
  landlords,
  activeLandlordId,
  onSelectLandlord,
  onLandlordUpdated,
  onOpenRegisterModal,
}) => {
  const activeLandlord = landlords.find((l) => l.id === activeLandlordId) || landlords[0];

  const [name, setName] = useState(activeLandlord?.name || '');
  const [companyName, setCompanyName] = useState(activeLandlord?.companyName || '');
  const [email, setEmail] = useState(activeLandlord?.email || '');
  const [phone, setPhone] = useState(activeLandlord?.phone || '');

  // M-Pesa state
  const [mpesaTillNumber, setMpesaTillNumber] = useState(activeLandlord?.mpesaTillNumber || '');
  const [mpesaPaybill, setMpesaPaybill] = useState(activeLandlord?.mpesaPaybill || '');
  const [mpesaPhoneNumber, setMpesaPhoneNumber] = useState(activeLandlord?.mpesaPhoneNumber || '');

  // Bank state
  const [bankName, setBankName] = useState(activeLandlord?.bankName || '');
  const [accountName, setAccountName] = useState(activeLandlord?.accountName || '');
  const [accountNumber, setAccountNumber] = useState(activeLandlord?.accountNumber || '');
  const [branchName, setBranchName] = useState(activeLandlord?.branchName || '');
  const [swiftCode, setSwiftCode] = useState(activeLandlord?.swiftCode || '');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Security Verification & Audit Modals
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Check whether any financial settlement fields have been edited
  const hasFinancialChanges =
    (mpesaTillNumber || '').trim() !== (activeLandlord?.mpesaTillNumber || '').trim() ||
    (mpesaPaybill || '').trim() !== (activeLandlord?.mpesaPaybill || '').trim() ||
    (mpesaPhoneNumber || '').trim() !== (activeLandlord?.mpesaPhoneNumber || '').trim() ||
    (bankName || '').trim() !== (activeLandlord?.bankName || '').trim() ||
    (accountName || '').trim() !== (activeLandlord?.accountName || '').trim() ||
    (accountNumber || '').trim() !== (activeLandlord?.accountNumber || '').trim() ||
    (branchName || '').trim() !== (activeLandlord?.branchName || '').trim() ||
    (swiftCode || '').trim() !== (activeLandlord?.swiftCode || '').trim();

  // Sync state when active landlord changes
  React.useEffect(() => {
    if (activeLandlord) {
      setName(activeLandlord.name);
      setCompanyName(activeLandlord.companyName);
      setEmail(activeLandlord.email);
      setPhone(activeLandlord.phone);
      setMpesaTillNumber(activeLandlord.mpesaTillNumber || '');
      setMpesaPaybill(activeLandlord.mpesaPaybill || '');
      setMpesaPhoneNumber(activeLandlord.mpesaPhoneNumber || '');
      setBankName(activeLandlord.bankName || '');
      setAccountName(activeLandlord.accountName || '');
      setAccountNumber(activeLandlord.accountNumber || '');
      setBranchName(activeLandlord.branchName || '');
      setSwiftCode(activeLandlord.swiftCode || '');
      setSaveSuccess(false);
      setErrorMessage(null);
    }
  }, [activeLandlordId, activeLandlord]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // If sensitive financial settlement details are being changed, enforce Landlord Verification Modal!
    if (hasFinancialChanges) {
      setIsSecurityModalOpen(true);
      return;
    }

    // Standard profile changes (Name, Company, Email, Phone) without financial impact
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const updated = await updateLandlordDetails(activeLandlord.id, {
        name,
        companyName,
        email,
        phone,
      });

      onLandlordUpdated(updated);
      setSaveSuccess(true);
      setSaveMessage('Profile settings saved successfully.');
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update profile settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmFinancialSave = async (auth: { confirmationPassword?: string; otp?: string; challengeId?: string }) => {
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const updated = await updateLandlordDetails(
        activeLandlord.id,
        {
          name,
          companyName,
          email,
          phone,
          mpesaTillNumber,
          mpesaPaybill,
          mpesaPhoneNumber,
          bankName,
          accountName,
          accountNumber,
          branchName,
          swiftCode,
        },
        auth
      );

      onLandlordUpdated(updated);
      setSaveSuccess(true);
      setSaveMessage('Bank and M-Pesa settlement details securely authorized and saved! Real-time security email notification dispatched.');
      setTimeout(() => setSaveSuccess(false), 6000);
    } catch (err: any) {
      throw err; // Allow modal to display specific error
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building className="w-6 h-6 text-blue-600" /> Landlord Account & EstateMaster Subscription
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Switch between registered landlord accounts, manage your EstateMaster annual software license, and configure M-Pesa Tills.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenRegisterModal && (
            <button
              onClick={onOpenRegisterModal}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" /> Register New Landlord ({formatKSH(20000)}/yr)
            </button>
          )}

          {/* Landlord Switcher Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            {landlords.map((l, lIdx) => {
              const isSelected = l.id === activeLandlordId;
              return (
                <button
                  key={`ll-pill-${l.id}-${lIdx}`}
                  onClick={() => onSelectLandlord(l.id)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap shadow-xs ${
                    isSelected
                      ? 'bg-blue-600 text-white ring-2 ring-blue-500/30'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  {l.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* EstateMaster Annual Subscription Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 rounded-2xl p-5 text-white shadow-lg space-y-3 border border-blue-800">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <h3 className="font-extrabold text-base text-white">EstateMaster Commercial License</h3>
              <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider ${
                activeLandlord.subscriptionStatus === 'Active'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-rose-500 text-white animate-pulse'
              }`}>
                {activeLandlord.subscriptionStatus || 'Active'} Subscription
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Account Holder: <strong className="text-white font-bold">{activeLandlord.name}</strong> ({activeLandlord.companyName})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 text-right">
              <span className="text-xs text-slate-300 block">Annual Subscription Rate</span>
              <span className="text-xl font-black text-amber-300">{formatKSH(20000)}</span>
              <span className="text-[10px] text-slate-300 block">/ year</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10 text-xs">
          <div className="flex items-center gap-2 text-slate-200">
            <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold">Subscription Expiry</p>
              <p className="font-bold text-white">{activeLandlord.subscriptionExpiry || '2027-08-01'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-200">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold">Commercial Package</p>
              <p className="font-bold text-white">Unlimited Properties & M-Pesa Tills</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-200">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold">KRA & ID Reference</p>
              <p className="font-mono font-bold text-white">{activeLandlord.idNumber || 'ID-VERIFIED'}</p>
            </div>
          </div>
        </div>

        {/* Subscription Control Bar */}
        <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="text-[11px] text-slate-300">
            <strong className="text-amber-300">License Policy:</strong> If expired, both EstateMaster Landlord & EstateMaster Tenant services are locked.
          </p>
          <div className="flex items-center gap-2">
            {activeLandlord.subscriptionStatus === 'Active' ? (
              <button
                type="button"
                onClick={async () => {
                  const updated = await updateLandlordDetails(activeLandlord.id, {
                    subscriptionStatus: 'Expired',
                    subscriptionExpiry: '2025-01-01'
                  });
                  onLandlordUpdated(updated);
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-700 text-white font-bold text-[11px] transition shadow-xs"
              >
                Simulate 1-Year Subscription Expiry (Test Lockout)
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const nextYear = new Date();
                  nextYear.setFullYear(nextYear.getFullYear() + 1);
                  const updated = await updateLandlordDetails(activeLandlord.id, {
                    subscriptionStatus: 'Active',
                    subscriptionExpiry: nextYear.toISOString().split('T')[0]
                  });
                  onLandlordUpdated(updated);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition shadow-xs flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Pay {formatKSH(20000)} & Activate License
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {saveSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex items-center gap-2 animate-fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600" /> Landlord bank details and M-Pesa configurations successfully saved!
          </div>
        )}

        {/* Personal & Company Identity */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs text-slate-900">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-200 pb-3">
            <ShieldCheck className="w-4 h-4 text-blue-600" /> Landlord Identity & Contact Details
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">Landlord Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Company / Estate Name</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Contact Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Phone Number (+254)</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Tamper-Proof Financial Settlement Vault Card */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-blue-800/80 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 relative z-10">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-400 shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base text-white">Financial Settlement Security Vault</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[10px] uppercase tracking-wider">
                    Owner Verification Active
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold text-[10px] uppercase tracking-wider">
                    Tamper Protection
                  </span>
                </div>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  Only the verified landlord (<strong className="text-white">{activeLandlord.email}</strong>) can alter Bank or M-Pesa settlement destinations. All modifications strictly require Landlord Master Password or 2FA OTP authorization and generate an immutable audit log and security alert email.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAuditModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition flex items-center gap-1.5 shrink-0"
            >
              <History className="w-4 h-4 text-blue-400" />
              <span>Settlement Audit History</span>
              {activeLandlord.financialAuditTrail && activeLandlord.financialAuditTrail.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-blue-500 text-white text-[10px]">
                  {activeLandlord.financialAuditTrail.length}
                </span>
              )}
            </button>
          </div>

          {hasFinancialChanges && (
            <div className="mt-3.5 p-3 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Unsaved Settlement Modifications Detected:</strong> Landlord password or 2FA authorization will be prompted when you click Save.
                </span>
              </div>
              <span className="font-bold uppercase text-[10px] bg-amber-400/20 px-2 py-0.5 rounded text-amber-300 shrink-0">
                Verification Required
              </span>
            </div>
          )}
        </div>

        {/* M-Pesa Setup Card */}
        <div className="bg-white border border-emerald-200 rounded-2xl p-5 space-y-4 shadow-xs text-slate-900">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-600" /> M-Pesa Collection Channels (Safaricom Daraja)
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold uppercase">
              Instant Rent Collections
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 space-y-1">
              <label className="block text-emerald-950 font-bold mb-1">M-Pesa Buy Goods Till Number</label>
              <input
                type="text"
                value={mpesaTillNumber}
                onChange={(e) => setMpesaTillNumber(e.target.value)}
                placeholder="e.g. 781920"
                className="w-full bg-white border border-emerald-300 rounded-lg p-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-emerald-600 shadow-xs"
              />
              <span className="text-[10px] text-emerald-800">Used for instant mobile rent payments.</span>
            </div>

            <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 space-y-1">
              <label className="block text-emerald-950 font-bold mb-1">M-Pesa Paybill Number</label>
              <input
                type="text"
                value={mpesaPaybill}
                onChange={(e) => setMpesaPaybill(e.target.value)}
                placeholder="e.g. 247247"
                className="w-full bg-white border border-emerald-300 rounded-lg p-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-emerald-600 shadow-xs"
              />
              <span className="text-[10px] text-emerald-800">Account Number will be tenant's Unit #</span>
            </div>

            <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 space-y-1">
              <label className="block text-emerald-950 font-bold mb-1">M-Pesa Express Phone Number</label>
              <input
                type="text"
                value={mpesaPhoneNumber}
                onChange={(e) => setMpesaPhoneNumber(e.target.value)}
                placeholder="+254 7..."
                className="w-full bg-white border border-emerald-300 rounded-lg p-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-emerald-600 shadow-xs"
              />
              <span className="text-[10px] text-emerald-800">Receives Daraja B2C notifications.</span>
            </div>
          </div>
        </div>

        {/* Bank Account Details Card */}
        <div className="bg-white border border-blue-200 rounded-2xl p-5 space-y-4 shadow-xs text-slate-900">
          <div className="flex items-center justify-between border-b border-blue-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Landmark className="w-4 h-4 text-blue-600" /> Commercial Bank Integration & Settlement Account
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Integrate with major Kenyan banks (Equity, Co-op, KCB, National Bank, NCBA, Absa, etc.) to receive direct wire, PesaLink & EFT payments.
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-800 border border-blue-200 font-bold uppercase">
              Shared on Invoices & Portals
            </span>
          </div>

          {/* Quick Bank Preset Badges */}
          <div className="space-y-2">
            <label className="block text-slate-700 font-bold text-[11px]">Select / Auto-configure Kenyan Bank:</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {KENYA_BANKS.slice(0, 12).map((bank, bIdx) => {
                const isSelected = bankName.toLowerCase().includes(bank.shortName.toLowerCase()) || 
                                   bankName.toLowerCase().includes(bank.name.toLowerCase());
                return (
                  <button
                    key={`bank-preset-${bank.id}-${bIdx}`}
                    type="button"
                    onClick={() => {
                      setBankName(bank.name);
                      if (bank.swiftCode) setSwiftCode(bank.swiftCode);
                      if (bank.paybill && !mpesaPaybill) setMpesaPaybill(bank.paybill);
                    }}
                    className={`p-2 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/20 text-blue-900 shadow-xs font-bold'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[11px] font-bold leading-tight line-clamp-1">{bank.shortName}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono">
                      <span>Code: {bank.code}</span>
                      {bank.paybill && <span>&bull; PB: {bank.paybill}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-slate-700 font-medium mb-1">Bank Name</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Equity Bank Kenya / KCB / Co-op / National Bank"
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Bank Account Name</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g. Mwangi Premier Estates Ltd"
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Account Number</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 0110293847561"
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Branch Name</label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g. Westlands Branch / Harambee Avenue"
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">SWIFT Code / BIC</label>
              <input
                type="text"
                value={swiftCode}
                onChange={(e) => setSwiftCode(e.target.value)}
                placeholder="e.g. EQBLKENA / KCBLKENA / KCOO-KENA"
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">PesaLink / Direct Paybill</label>
              <input
                type="text"
                value={mpesaPaybill}
                onChange={(e) => setMpesaPaybill(e.target.value)}
                placeholder="e.g. 247247 (Equity) / 522522 (KCB) / 400200 (Co-op)"
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Alerts & Feedback */}
        {saveSuccess && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2.5 animate-fade-in">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="space-y-0.5">
              <strong className="block text-emerald-950 font-bold">Settlement Settings Successfully Authorized & Saved</strong>
              <p className="text-emerald-800 font-normal">{saveMessage}</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2.5 animate-fade-in">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <div className="space-y-0.5">
              <strong className="block text-rose-950 font-bold">Modification Blocked by Security Vault</strong>
              <p className="text-rose-800 font-normal">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              {hasFinancialChanges ? (
                <strong className="text-amber-700 font-bold">
                  🔐 Modifying payout destinations requires landlord re-authentication.
                </strong>
              ) : (
                'Settlement accounts guarded by EstateMaster Anti-Diversion Shield.'
              )}
            </span>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer ${
              hasFinancialChanges
                ? 'bg-amber-600 hover:bg-amber-700 text-white ring-2 ring-amber-500/20'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Saving Changes...
              </>
            ) : hasFinancialChanges ? (
              <>
                <Lock className="w-4 h-4" /> Authorize & Save Settlement Details
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Save Profile Settings
              </>
            )}
          </button>
        </div>
      </form>

      {/* Gated Financial Security Authorization Modal */}
      <FinancialSecurityVerificationModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        landlord={activeLandlord}
        pendingChanges={{
          bankName,
          accountName,
          accountNumber,
          branchName,
          swiftCode,
          mpesaTillNumber,
          mpesaPaybill,
          mpesaPhoneNumber
        }}
        onConfirm={handleConfirmFinancialSave}
      />

      {/* Immutable Financial Settlement Audit Trail Modal */}
      <FinancialAuditTrailModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        landlord={activeLandlord}
      />
    </div>
  );
};
