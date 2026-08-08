import React, { useState } from 'react';
import { Tenant, Landlord, Unit, Property } from '../types';
import { loginUser, registerTenant, registerLandlordAccount } from '../lib/api';
import { formatKSH } from '../lib/formatters';
import {
  Key,
  Building2,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  AlertCircle,
  PlusCircle,
  UserPlus,
  CreditCard,
  Smartphone,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Phone,
  Briefcase,
  DollarSign,
  FileText
} from 'lucide-react';

interface SignInViewProps {
  initialRole?: 'tenant' | 'landlord';
  tenants: Tenant[];
  landlords: Landlord[];
  units?: Unit[];
  properties?: Property[];
  onTenantSuccess: (tenant: Tenant) => void;
  onLandlordSuccess: (landlord: Landlord) => void;
  onSwitchToRegister?: () => void;
  onOpenLandlordRegister?: () => void;
  onRefreshData?: () => void;
  inactivityNotice?: string | null;
}

export const SignInView: React.FC<SignInViewProps> = ({
  initialRole = 'tenant',
  tenants,
  landlords,
  units = [],
  properties = [],
  onTenantSuccess,
  onLandlordSuccess,
  onSwitchToRegister,
  onOpenLandlordRegister,
  onRefreshData,
  inactivityNotice,
}) => {
  const [activeTab, setActiveTab] = useState<'tenant' | 'landlord'>(initialRole);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  // Common Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Tenant Sign Up state
  const [tenantFullName, setTenantFullName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('+254 ');
  const [tenantIdNumber, setTenantIdNumber] = useState('');
  const [tenantOccupation, setTenantOccupation] = useState('');
  const [tenantIncome, setTenantIncome] = useState('180000');
  const [selectedUnitId, setSelectedUnitId] = useState<string>(units[0]?.id || '');

  // Landlord Sign Up state
  const [landlordStep, setLandlordStep] = useState<1 | 2>(1);
  const [landlordName, setLandlordName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('+254 ');
  const [landlordIdNumber, setLandlordIdNumber] = useState('');

  // Landlord Payment & Collection Details
  const [mpesaTillNumber, setMpesaTillNumber] = useState('');
  const [mpesaPaybill, setMpesaPaybill] = useState('');
  const [bankName, setBankName] = useState('Equity Bank Kenya');
  const [accountNumber, setAccountNumber] = useState('');
  const [paymentPhone, setPaymentPhone] = useState('+254 ');
  const [paymentMethod, setPaymentMethod] = useState<'M-Pesa Express' | 'Bank Transfer'>('M-Pesa Express');

  const availableUnits = units.filter((u) => u.status === 'Available');

  // Handle standard Sign In
  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const cleanPassword = password ? password.trim() : '';
    if (!cleanEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await loginUser(cleanEmail, cleanPassword, activeTab);
      if (res.role === 'tenant') {
        onTenantSuccess(res.user as Tenant);
      } else if (res.role === 'landlord') {
        onLandlordSuccess(res.user as Landlord);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Tenant Account Creation
  const handleTenantSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const cleanName = tenantFullName ? tenantFullName.trim() : '';
    if (!cleanName || !cleanEmail) {
      setErrorMessage('Full Name and Email Address are required.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const payload = {
        fullName: cleanName,
        email: cleanEmail,
        password: password ? password.trim() : 'password123',
        phone: tenantPhone ? tenantPhone.trim() : '',
        idNumber: tenantIdNumber ? tenantIdNumber.trim() : '',
        occupation: tenantOccupation ? tenantOccupation.trim() : 'Resident',
        income: tenantIncome,
        unitId: selectedUnitId || units[0]?.id || '',
        moveInDate: new Date().toISOString().split('T')[0],
        leaseTermMonths: '12'
      };

      const result = await registerTenant(payload);
      setSuccessMessage(`Account created successfully! Welcome ${result.tenant.fullName}. Dispatched quotes & invoices to ${result.tenant.email}`);
      if (onRefreshData) await onRefreshData();

      setTimeout(() => {
        onTenantSuccess(result.tenant);
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Tenant account creation failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle Landlord Account Creation & KSH 20,000 Subscription Fee
  const handleLandlordNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    if (!landlordName.trim() || !companyName.trim() || !cleanEmail || !landlordPhone.trim()) {
      setErrorMessage('Please fill in all required landlord and estate details.');
      return;
    }
    setErrorMessage(null);
    setPaymentPhone(landlordPhone.trim());
    setLandlordStep(2);
  };

  const handleLandlordPayAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const cleanPassword = password ? password.trim() : 'password123';

    try {
      const res = await registerLandlordAccount({
        name: landlordName.trim(),
        companyName: companyName.trim(),
        email: cleanEmail,
        phone: landlordPhone.trim(),
        password: cleanPassword,
        idNumber: landlordIdNumber.trim(),
        mpesaTillNumber,
        mpesaPaybill,
        bankName,
        accountName: companyName.trim(),
        accountNumber,
        paymentMethod,
        paymentPhone
      });

      setSuccessMessage(`✅ KSH 20,000 Subscription Payment Received! Ref: ${res.receiptCode}. Welcome to EstateMaster.`);
      if (onRefreshData) await onRefreshData();

      setTimeout(() => {
        onLandlordSuccess(res.landlord);
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Landlord registration & payment failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickTenantLogin = async (tenant: Tenant) => {
    setEmail(tenant.email);
    setPassword(tenant.password || 'password123');
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await loginUser(tenant.email, tenant.password || 'password123', 'tenant');
      onTenantSuccess(res.user as Tenant);
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLandlordLogin = async (landlord: Landlord) => {
    setEmail(landlord.email);
    setPassword(landlord.password || 'password123');
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await loginUser(landlord.email, landlord.password || 'password123', 'landlord');
      onLandlordSuccess(res.user as Landlord);
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header Branding */}
      <div className="text-center space-y-2">
        <div className="inline-flex p-3 rounded-2xl bg-blue-600 text-white shadow-md">
          <Key className="w-8 h-8" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          EstateMaster Authentication
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto font-medium">
          Sign in to your account or create a new account to access individual portal records.
        </p>
      </div>

      {/* Role Selector Tabs */}
      <div className="bg-slate-200 p-1.5 rounded-2xl flex items-center text-xs font-bold shadow-inner">
        <button
          type="button"
          onClick={() => {
            setActiveTab('tenant');
            setErrorMessage(null);
            setSuccessMessage(null);
            setEmail('');
            setMode('signin');
          }}
          className={`flex-1 py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'tenant'
              ? 'bg-white text-blue-700 shadow-md font-extrabold scale-[1.01]'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <UserCheck className="w-4 h-4 text-sky-600" />
          Tenant Platform
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('landlord');
            setErrorMessage(null);
            setSuccessMessage(null);
            setEmail('');
            setMode('signin');
            setLandlordStep(1);
          }}
          className={`flex-1 py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'landlord'
              ? 'bg-white text-blue-700 shadow-md font-extrabold scale-[1.01]'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4 text-blue-600" />
          Landlord Platform
        </button>
      </div>

      {/* Main Authentication Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5 text-slate-900">
        {/* Card Header & Mode Switcher (Sign In vs Create Account) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${activeTab === 'tenant' ? 'bg-sky-100 text-sky-700' : 'bg-blue-100 text-blue-700'}`}>
              {activeTab === 'tenant' ? <UserCheck className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {activeTab === 'tenant'
                  ? mode === 'signin' ? 'Tenant Account Sign In' : 'Create New Tenant Account'
                  : mode === 'signin' ? 'Landlord Account Sign In' : 'Register Landlord & Pay Subscription'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {activeTab === 'tenant'
                  ? mode === 'signin'
                    ? 'Access your unit statements, invoices, and maintenance requests.'
                    : 'Register your details to obtain an apartment and receive rental invoices.'
                  : mode === 'signin'
                    ? 'Manage your property portfolio, leases, and tenant accounts.'
                    : 'Complete registration and pay KSH 20,000 annual subscription fee.'}
              </p>
            </div>
          </div>

          {/* Mode Switcher Pill */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-bold shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`px-3 py-1.5 rounded-lg transition ${
                mode === 'signin' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`px-3 py-1.5 rounded-lg transition ${
                mode === 'signup' ? 'bg-emerald-600 text-white shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Create Account
            </button>
          </div>
        </div>

        {/* Feedback Alerts */}
        {inactivityNotice && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2.5 shadow-2xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{inactivityNotice}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* --- SIGN IN FORM MODE --- */}
        {mode === 'signin' && (
          <form onSubmit={handleSignInSubmit} className="space-y-4 text-xs font-medium">
            <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 text-blue-900 flex items-center gap-2.5">
              <Smartphone className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <strong className="block text-xs text-blue-950 font-bold">Cross-Device Sign In Active:</strong>
                <span className="text-[11px] text-blue-800">
                  You can sign in to your EstateMaster account from any smartphone, tablet, or laptop using your registered Email & Password.
                </span>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={
                    activeTab === 'tenant'
                      ? 'e.g. jane.wanjiku@example.com'
                      : 'e.g. james.mwangi@mwangiestates.co.ke'
                  }
                  className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 focus:bg-white rounded-xl py-3 pl-10 pr-3 text-slate-900 font-semibold text-xs shadow-xs focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-slate-700 font-bold">Password / PIN</label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 focus:bg-white rounded-xl py-3 pl-10 pr-3 text-slate-900 font-semibold text-xs shadow-xs focus:outline-none transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 px-4 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition ${
                activeTab === 'tenant'
                  ? 'bg-sky-600 hover:bg-sky-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              } disabled:opacity-50`}
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In to {activeTab === 'tenant' ? 'Tenant Portal' : 'Landlord Platform'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* --- CREATE TENANT ACCOUNT MODE --- */}
        {mode === 'signup' && activeTab === 'tenant' && (
          <form onSubmit={handleTenantSignUpSubmit} className="space-y-4 text-xs font-medium">
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-sky-900 flex items-center gap-2 text-xs">
              <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
              <span>Fill in your details below to create your tenant account. Official quotes & invoices will be emailed automatically.</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Full Legal Name *</label>
                <input
                  type="text"
                  required
                  value={tenantFullName}
                  onChange={(e) => setTenantFullName(e.target.value)}
                  placeholder="e.g. Mercy Chebet"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Personal Email Address *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. mercy.chebet@example.com"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Account Password *</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Phone Number (+254) *</label>
                <input
                  type="text"
                  required
                  value={tenantPhone}
                  onChange={(e) => setTenantPhone(e.target.value)}
                  placeholder="+254 700 123 456"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-mono focus:outline-none focus:border-blue-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">National ID / Passport Number</label>
                <input
                  type="text"
                  value={tenantIdNumber}
                  onChange={(e) => setTenantIdNumber(e.target.value)}
                  placeholder="e.g. ID-39201928"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Select Apartment Unit *</label>
                <select
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-bold focus:outline-none focus:border-blue-500 shadow-xs"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id} disabled={u.status === 'Occupied'}>
                      Unit {u.unitNumber} ({u.propertyName}) &bull; {formatKSH(u.monthlyRent)}/mo {u.status === 'Occupied' ? '[Occupied]' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Creating Tenant Account...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" /> Create Tenant Account & Access Portal
                </>
              )}
            </button>
          </form>
        )}

        {/* --- CREATE LANDLORD ACCOUNT MODE (WITH MANDATORY KSH 20,000 SUBSCRIPTION) --- */}
        {mode === 'signup' && activeTab === 'landlord' && (
          <div className="space-y-4 text-xs font-medium">
            {/* Subscription Required Banner */}
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5 text-emerald-950">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-xs uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-emerald-600" /> Commercial Landlord License
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-black text-xs">
                  {formatKSH(20000)} / year
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 font-medium">
                New landlords must trigger and settle the annual subscription fee before accessing the management platform.
              </p>
            </div>

            {/* Stepper Progress */}
            <div className="flex items-center justify-between my-2 text-[11px] font-bold">
              <span className={`px-3 py-1 rounded-full ${landlordStep === 1 ? 'bg-blue-600 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                1. Landlord Details
              </span>
              <span className="text-slate-300">&rarr;</span>
              <span className={`px-3 py-1 rounded-full ${landlordStep === 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                2. KSH 20,000 Subscription Fee
              </span>
            </div>

            {/* Step 1: Landlord Profile Details */}
            {landlordStep === 1 && (
              <form onSubmit={handleLandlordNextStep} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Full Legal Name *</label>
                    <input
                      type="text"
                      required
                      value={landlordName}
                      onChange={(e) => setLandlordName(e.target.value)}
                      placeholder="e.g. Eng. Duncan Mutua"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Estate / Company Name *</label>
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Mutua Crest Properties Ltd"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Work Email Address *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. duncan.mutua@mutuacrest.co.ke"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Password *</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a secure password"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Phone Number (+254) *</label>
                    <input
                      type="text"
                      required
                      value={landlordPhone}
                      onChange={(e) => setLandlordPhone(e.target.value)}
                      placeholder="+254 712 345 678"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-mono focus:outline-none focus:border-blue-500 shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">National ID / KRA PIN</label>
                    <input
                      type="text"
                      value={landlordIdNumber}
                      onChange={(e) => setLandlordIdNumber(e.target.value)}
                      placeholder="e.g. ID-28910293"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-mono focus:outline-none focus:border-blue-500 shadow-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md transition flex items-center justify-center gap-2"
                >
                  <span>Continue to Subscription Fee Payment (KSH 20,000)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* Step 2: Rent Accounts & KSH 20,000 Payment */}
            {landlordStep === 2 && (
              <form onSubmit={handleLandlordPayAndRegister} className="space-y-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-blue-600" /> Rent Collection Accounts Setup (Optional Now)
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <label className="block text-slate-600 mb-0.5">M-Pesa Till Number</label>
                      <input
                        type="text"
                        value={mpesaTillNumber}
                        onChange={(e) => setMpesaTillNumber(e.target.value)}
                        placeholder="e.g. 892019"
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-mono shadow-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-0.5">M-Pesa Paybill</label>
                      <input
                        type="text"
                        value={mpesaPaybill}
                        onChange={(e) => setMpesaPaybill(e.target.value)}
                        placeholder="e.g. 247247"
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-mono shadow-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-300 space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                    <div>
                      <span className="font-extrabold text-emerald-950 text-xs block">EstateMaster Subscription Checkout</span>
                      <span className="text-[10px] text-emerald-700">Annual License for {companyName || 'Estate'}</span>
                    </div>
                    <span className="text-lg font-black text-emerald-700">{formatKSH(20000)}</span>
                  </div>

                  <div>
                    <label className="block text-emerald-950 font-bold mb-1">Select Payment Method</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('M-Pesa Express')}
                        className={`p-2.5 rounded-xl border text-left font-bold transition flex items-center gap-2 ${
                          paymentMethod === 'M-Pesa Express'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        <Smartphone className="w-4 h-4" /> M-Pesa STK Push
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('Bank Transfer')}
                        className={`p-2.5 rounded-xl border text-left font-bold transition flex items-center gap-2 ${
                          paymentMethod === 'Bank Transfer'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        <CreditCard className="w-4 h-4" /> Bank Direct
                      </button>
                    </div>
                  </div>

                  {paymentMethod === 'M-Pesa Express' && (
                    <div>
                      <label className="block text-emerald-950 font-bold mb-1">M-Pesa Phone Number (+254)</label>
                      <input
                        type="text"
                        required
                        value={paymentPhone}
                        onChange={(e) => setPaymentPhone(e.target.value)}
                        placeholder="+254 712 345 678"
                        className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold shadow-xs"
                      />
                      <p className="text-[10px] text-emerald-800 mt-1">
                        An STK Push notification for <strong>KSH 20,000</strong> will be sent to this phone.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => setLandlordStep(1)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
                  >
                    &larr; Back
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition flex items-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Processing KSH 20,000 Payment...
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" /> Pay KSH 20,000 & Activate Landlord Account
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Footer info switch */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          {activeTab === 'tenant' ? (
            <div className="flex items-center justify-between w-full">
              <span className="text-slate-500 font-medium">
                {mode === 'signin' ? "Don't have a tenant account yet?" : 'Already registered as a tenant?'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 font-bold transition flex items-center gap-1.5"
              >
                {mode === 'signin' ? (
                  <>
                    <UserPlus className="w-3.5 h-3.5" /> Create Tenant Account
                  </>
                ) : (
                  <>
                    <Key className="w-3.5 h-3.5" /> Sign In Instead
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-slate-500 font-medium">
                {mode === 'signin' ? 'New property owner or landlord?' : 'Already have a landlord account?'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  setLandlordStep(1);
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold transition flex items-center gap-1.5"
              >
                {mode === 'signin' ? (
                  <>
                    <PlusCircle className="w-3.5 h-3.5" /> Create Landlord Account ({'KSH 20,000'}/yr)
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" /> Sign In Instead
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
