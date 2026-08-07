import React, { useState } from 'react';
import { Unit, Property } from '../types';
import { formatKSH } from '../lib/formatters';
import {
  UserCheck,
  Building2,
  Mail,
  Phone,
  Calendar,
  Briefcase,
  DollarSign,
  ShieldCheck,
  CheckCircle2,
  Send,
  FileText,
  Tag,
  ArrowRight,
  Sparkles,
  Camera,
  Upload,
  User,
  X
} from 'lucide-react';
import { registerTenant } from '../lib/api';

interface TenantRegistrationViewProps {
  properties: Property[];
  units: Unit[];
  onRegistrationComplete: (result: any) => void;
  onGoToPortal: (email: string) => void;
}

export const TenantRegistrationView: React.FC<TenantRegistrationViewProps> = ({
  properties,
  units,
  onRegistrationComplete,
  onGoToPortal,
}) => {
  const availableUnits = units.filter((u) => u.status === 'Available');

  const [step, setStep] = useState<number>(1);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(availableUnits[0]?.id || units[0]?.id || '');

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [occupation, setOccupation] = useState('');
  const [income, setIncome] = useState('3500');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [moveInDate, setMoveInDate] = useState('2026-09-01');
  const [leaseTermMonths, setLeaseTermMonths] = useState('12');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [registrationResult, setRegistrationResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const PRESET_TENANT_AVATARS = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setProfilePictureUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const selectedUnit = units.find((u) => u.id === selectedUnitId) || units[0];

  const handleSubmitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      const payload = {
        fullName,
        email,
        phone,
        idNumber,
        occupation,
        income,
        emergencyContactName: emergencyName,
        emergencyContactPhone: emergencyPhone,
        unitId: selectedUnitId,
        moveInDate,
        leaseTermMonths,
        profilePictureUrl: profilePictureUrl || PRESET_TENANT_AVATARS[0],
      };

      const result = await registerTenant(payload);
      setRegistrationResult(result);
      onRegistrationComplete(result);
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold">
          <UserCheck className="w-4 h-4 text-emerald-600" /> Apartment Self-Registration Portal
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Register for Your New Apartment
        </h2>
        <p className="text-xs sm:text-sm text-slate-500">
          Complete your registration in minutes. You will automatically receive your official lease quotation and monthly invoice directly at your personal email address.
        </p>
      </div>

      {!registrationResult ? (
        /* Multi-Step Wizard Form */
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6 shadow-sm text-slate-900">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 text-xs font-bold">
            <span className={step >= 1 ? 'text-emerald-700 font-extrabold' : 'text-slate-400'}>
              1. Choose Apartment
            </span>
            <span className={step >= 2 ? 'text-emerald-700 font-extrabold' : 'text-slate-400'}>
              2. Personal Details
            </span>
            <span className={step >= 3 ? 'text-emerald-700 font-extrabold' : 'text-slate-400'}>
              3. Lease Terms
            </span>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmitRegistration} className="space-y-5 text-xs">
            {/* STEP 1: SELECT APARTMENT UNIT */}
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" /> Select Available Unit
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {units.map((unit) => {
                    const isSelected = unit.id === selectedUnitId;
                    const isOccupied = unit.status === 'Occupied';
                    return (
                      <div
                        key={unit.id}
                        onClick={() => !isOccupied && setSelectedUnitId(unit.id)}
                        className={`p-4 rounded-xl border transition cursor-pointer relative ${
                          isOccupied
                            ? 'opacity-50 border-slate-200 bg-slate-50 cursor-not-allowed'
                            : isSelected
                            ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase font-bold">
                              {unit.propertyName}
                            </span>
                            <h4 className="font-bold text-slate-900 text-base">Unit {unit.unitNumber}</h4>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              isOccupied ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {unit.status}
                          </span>
                        </div>

                        <div className="text-slate-600 space-y-1 my-2 font-medium">
                          <p>{unit.bedrooms} Bedrooms &bull; {unit.bathrooms} Bathrooms &bull; {unit.sqft} sqft</p>
                        </div>

                        <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                          <span className="text-slate-500 text-[10px] font-medium">Monthly Rent:</span>
                          <span className="font-extrabold text-emerald-600 text-sm">{formatKSH(unit.monthlyRent)}/mo</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2 shadow-sm transition"
                  >
                    Next: Personal Details <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: PERSONAL DETAILS */}
            {step === 2 && (
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-blue-600" /> Personal Information
                </h3>

                {/* Profile Picture Upload Section */}
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-3">
                  <label className="block text-slate-900 font-bold text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-blue-600" /> Upload Profile Picture
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal">Tenant Profile Photo</span>
                  </label>

                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-blue-500 bg-white shadow-xs shrink-0 relative group">
                      {profilePictureUrl ? (
                        <img src={profilePictureUrl} alt="Tenant Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-blue-50 text-blue-400 font-bold text-xl">
                          <User className="w-8 h-8 text-blue-400" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 flex-1">
                      <label className="cursor-pointer py-2 px-3 border border-blue-300 rounded-lg bg-white hover:bg-blue-50 transition inline-flex items-center gap-2 text-blue-700 font-bold text-xs shadow-xs">
                        <Upload className="w-3.5 h-3.5 text-blue-600" />
                        <span>Upload Photo File</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </label>

                      <p className="text-[10px] text-slate-500">Or choose a sample tenant profile avatar:</p>
                      <div className="flex items-center gap-2">
                        {PRESET_TENANT_AVATARS.map((url, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setProfilePictureUrl(url)}
                            className={`w-9 h-9 rounded-full overflow-hidden border-2 transition ${
                              profilePictureUrl === url ? 'border-emerald-600 ring-2 ring-emerald-400 scale-105' : 'border-slate-200 hover:border-slate-400'
                            }`}
                          >
                            <img src={url} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Full Legal Name *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Mary Wambui"
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Personal Email Address *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. mary.wambui@gmail.com"
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                    <span className="text-[10px] text-emerald-700 mt-1 block font-semibold">
                      &bull; Invoices & quotes will be dispatched to this email.
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Phone Number *</label>
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+254 7..."
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">National ID / Passport Number</label>
                    <input
                      type="text"
                      required
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      placeholder="e.g. ID-8921029"
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Occupation</label>
                    <input
                      type="text"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      placeholder="e.g. Accountant / Software Engineer"
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Estimated Monthly Income (KSh)</label>
                    <input
                      type="number"
                      value={income}
                      onChange={(e) => setIncome(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Emergency Contact Name</label>
                    <input
                      type="text"
                      value={emergencyName}
                      onChange={(e) => setEmergencyName(e.target.value)}
                      placeholder="Next of kin name"
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Emergency Contact Phone</label>
                    <input
                      type="text"
                      value={emergencyPhone}
                      onChange={(e) => setEmergencyPhone(e.target.value)}
                      placeholder="+254 7..."
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!fullName || !email}
                    onClick={() => setStep(3)}
                    className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold flex items-center gap-2 shadow-sm transition"
                  >
                    Next: Lease Terms <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: LEASE TERMS & CONFIRM */}
            {step === 3 && (
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" /> Move-in Date & Terms
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Preferred Move-in Date</label>
                    <input
                      type="date"
                      value={moveInDate}
                      onChange={(e) => setMoveInDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Lease Duration</label>
                    <select
                      value={leaseTermMonths}
                      onChange={(e) => setLeaseTermMonths(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-sm"
                    >
                      <option value="6">6 Months Lease</option>
                      <option value="12">12 Months Lease (Standard)</option>
                      <option value="24">24 Months Lease</option>
                    </select>
                  </div>
                </div>

                {/* Registration Cost Preview */}
                {selectedUnit && (
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600" /> Automated Document Generation Preview
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-slate-700 text-[11px] pt-1 font-medium">
                      <div>
                        <p className="text-slate-500">Selected Unit:</p>
                        <p className="font-bold text-slate-900">Unit {selectedUnit.unitNumber} ({selectedUnit.propertyName})</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Quoted Monthly Rent:</p>
                        <p className="font-bold text-emerald-600">{formatKSH(selectedUnit.monthlyRent)}/month</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Security Deposit:</p>
                        <p className="font-bold text-slate-900">{formatKSH(selectedUnit.depositAmount)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Total Initial Invoice:</p>
                        <p className="font-bold text-emerald-600">{formatKSH(selectedUnit.monthlyRent + 5000)}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-blue-900 text-xs flex items-center gap-2 font-medium">
                  <Send className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Upon clicking Register, EstateMaster will process your application and automatically email your official <strong>Rental Quote</strong> and <strong>First Month Invoice</strong> to <strong>{email}</strong>.
                  </span>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold flex items-center gap-2 shadow-sm transition"
                  >
                    {isLoading ? 'Processing Registration...' : 'Complete Apartment Registration 🎉'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      ) : (
        /* REGISTRATION SUCCESS CARD */
        <div className="bg-white border border-emerald-200 rounded-2xl p-6 text-center space-y-6 shadow-md text-slate-900 animate-fade-in">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-1">
            <h3 className="text-2xl font-black text-slate-900">Registration Successful!</h3>
            <p className="text-slate-600 text-xs sm:text-sm font-medium">
              Welcome <strong>{registrationResult.tenant.fullName}</strong>! You have been registered for <strong>Unit {registrationResult.tenant.unitNumber}</strong>.
            </p>
          </div>

          {/* Email Sent Confirmation Badge */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs space-y-3">
            <div className="flex items-center gap-2 text-emerald-800 font-bold">
              <Mail className="w-4 h-4 text-emerald-600" /> Documents Dispatched to Personal Email:
            </div>
            <p className="text-slate-800 font-mono text-[11px] bg-white p-2 rounded-lg border border-slate-200">
              Recipient: {registrationResult.tenant.email}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
                <span className="text-blue-700 font-bold flex items-center gap-1 mb-1">
                  <Tag className="w-3.5 h-3.5" /> Official Rental Quote
                </span>
                <p className="text-slate-700 font-medium">Quote #: {registrationResult.quote.quoteNumber}</p>
                <p className="text-emerald-600 font-extrabold">Move-in Total: {formatKSH(registrationResult.quote.totalMoveInCost)}</p>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
                <span className="text-blue-700 font-bold flex items-center gap-1 mb-1">
                  <FileText className="w-3.5 h-3.5" /> First Month Invoice
                </span>
                <p className="text-slate-700 font-medium">Invoice #: {registrationResult.invoice.invoiceNumber}</p>
                <p className="text-emerald-600 font-extrabold">Total Due: {formatKSH(registrationResult.invoice.totalAmount)}</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => onGoToPortal(registrationResult.tenant.email)}
            className="w-full py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-2"
          >
            Open Tenant Portal & Check Personal Email Inbox <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
