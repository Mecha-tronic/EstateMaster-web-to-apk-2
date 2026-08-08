import React, { useState, useEffect } from 'react';
import { Tenant, Invoice, Quote, MaintenanceRequest, EmailLog, Landlord, Unit, Property } from '../types';
import { formatKSH } from '../lib/formatters';
import { SignInView } from './SignInView';
import {
  Key,
  Home,
  FileText,
  DollarSign,
  Wrench,
  Mail,
  CheckCircle2,
  Clock,
  Send,
  Plus,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  X,
  LogOut,
  UserCheck,
  Camera,
  Upload,
  User
} from 'lucide-react';
import { createMaintenance, recordPayment, fetchEmails, updateTenantDetails } from '../lib/api';

interface TenantPortalViewProps {
  tenants: Tenant[];
  landlords?: Landlord[];
  units?: Unit[];
  properties?: Property[];
  invoices: Invoice[];
  quotes: Quote[];
  maintenance: MaintenanceRequest[];
  initialTenantEmail?: string;
  signedInTenant?: Tenant | null;
  onSignIn?: (tenant: Tenant) => void;
  onSignOut?: () => void;
  onLandlordSuccess?: (landlord: Landlord) => void;
  onRefreshData: () => void;
  onSwitchToRegister?: () => void;
}

export const TenantPortalView: React.FC<TenantPortalViewProps> = ({
  tenants,
  landlords = [],
  units = [],
  properties = [],
  invoices,
  quotes,
  maintenance,
  initialTenantEmail,
  signedInTenant,
  onSignIn,
  onSignOut,
  onLandlordSuccess,
  onRefreshData,
  onSwitchToRegister,
}) => {
  const [portalTab, setPortalTab] = useState<'dashboard' | 'invoices' | 'maintenance' | 'inbox'>('dashboard');

  // Maintenance form state
  const [maintTitle, setMaintTitle] = useState('');
  const [maintCategory, setMaintCategory] = useState<'Plumbing' | 'Electrical' | 'HVAC' | 'Appliance' | 'Structural' | 'Locks & Keys' | 'Other'>('Plumbing');
  const [maintDesc, setMaintDesc] = useState('');
  const [maintUrgency, setMaintUrgency] = useState<'Emergency' | 'High' | 'Medium' | 'Low'>('Medium');
  const [isSubmittingMaint, setIsSubmittingMaint] = useState(false);

  // Email Inbox state
  const [tenantEmails, setTenantEmails] = useState<EmailLog[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailLog | null>(null);

  // Payment state
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'M-Pesa' | 'Bank Transfer' | 'Credit Card'>('M-Pesa');
  const [payRef, setPayRef] = useState('MPESA-92810');
  const [isProcessingPay, setIsProcessingPay] = useState(false);

  // Tenant Profile Photo state
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);

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
          setPhotoUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfilePhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoUrl || !currentTenant) return;
    setIsUpdatingPhoto(true);
    try {
      const updated = await updateTenantDetails(currentTenant.id, { profilePictureUrl: photoUrl });
      if (onSignIn) onSignIn(updated);
      onRefreshData();
      setShowPhotoModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  useEffect(() => {
    if (signedInTenant?.email) {
      fetchEmails(signedInTenant.email).then((data) => setTenantEmails(data)).catch(() => {});
    }
  }, [signedInTenant, portalTab]);

  if (!signedInTenant) {
    return (
      <SignInView
        initialRole="tenant"
        tenants={tenants}
        landlords={landlords}
        units={units}
        properties={properties}
        onTenantSuccess={(tenant) => onSignIn?.(tenant)}
        onLandlordSuccess={(landlord) => onLandlordSuccess?.(landlord)}
        onSwitchToRegister={onSwitchToRegister}
        onRefreshData={onRefreshData}
      />
    );
  }

  const currentTenant = signedInTenant;

  const tenantInvoices = invoices.filter((i) => i.tenantId === currentTenant?.id || i.tenantEmail?.toLowerCase() === currentTenant?.email?.toLowerCase());
  const tenantQuotes = quotes.filter((q) => q.tenantEmail?.toLowerCase() === currentTenant?.email?.toLowerCase());
  const tenantMaintenance = maintenance.filter((m) => m.tenantId === currentTenant?.id || m.tenantEmail?.toLowerCase() === currentTenant?.email?.toLowerCase());

  const handleCreateMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintTitle || !maintDesc) return;
    setIsSubmittingMaint(true);

    try {
      await createMaintenance({
        tenantId: currentTenant?.id,
        title: maintTitle,
        description: maintDesc,
        category: maintCategory,
        urgency: maintUrgency,
      });

      setMaintTitle('');
      setMaintDesc('');
      onRefreshData();
      setPortalTab('maintenance');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingMaint(false);
    }
  };

  const handlePayInvoice = async () => {
    if (!payingInvoice) return;
    setIsProcessingPay(true);

    try {
      await recordPayment({
        invoiceId: payingInvoice.id,
        amount: payingInvoice.totalAmount - (payingInvoice.amountPaid || 0),
        paymentMethod,
        referenceCode: payRef || `REF-${Math.floor(Math.random() * 899999 + 100000)}`,
        notes: `Online tenant portal checkout payment via ${paymentMethod}`
      });

      setPayingInvoice(null);
      onRefreshData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessingPay(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header & User Authentication Status */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm text-slate-900">
        <div className="flex items-center gap-3">
          {/* Tenant Profile Avatar with camera edit trigger */}
          <div className="relative group shrink-0">
            <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-blue-500 bg-blue-50 text-blue-800 font-bold text-xl flex items-center justify-center shadow-xs">
              {currentTenant.profilePictureUrl ? (
                <img src={currentTenant.profilePictureUrl} alt={currentTenant.fullName} className="w-full h-full object-cover" />
              ) : (
                <span>{currentTenant.fullName.charAt(0)}</span>
              )}
            </div>
            <button
              onClick={() => {
                setPhotoUrl(currentTenant.profilePictureUrl || PRESET_TENANT_AVATARS[0]);
                setShowPhotoModal(true);
              }}
              className="absolute -bottom-1 -right-1 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-md transition"
              title="Upload/Change Profile Picture"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">{currentTenant.fullName}</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                {currentTenant.status}
              </span>
            </div>
            <p className="text-xs text-blue-700 font-semibold">
              Unit {currentTenant.unitNumber} &bull; {currentTenant.propertyName}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              Signed in as: <strong className="text-slate-800">{currentTenant.email}</strong>
            </p>
          </div>
        </div>

        {/* Action Controls & Sign Out */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setPhotoUrl(currentTenant.profilePictureUrl || PRESET_TENANT_AVATARS[0]);
              setShowPhotoModal(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
          >
            <Camera className="w-3.5 h-3.5 text-blue-600" /> Upload Profile Photo
          </button>
          {onSwitchToRegister && (
            <button
              onClick={onSwitchToRegister}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Self-Register New Lease
            </button>
          )}

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              title="Sign out of tenant portal"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" /> Sign Out
            </button>
          )}
        </div>
      </div>

      {/* Portal Tabs Navigation */}
      <div className="flex border-b border-slate-200 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setPortalTab('dashboard')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            portalTab === 'dashboard'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Home className="w-4 h-4" /> My Apartment Overview
        </button>
        <button
          onClick={() => setPortalTab('invoices')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            portalTab === 'invoices'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" /> Invoices & Payments ({tenantInvoices.length})
        </button>
        <button
          onClick={() => setPortalTab('maintenance')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            portalTab === 'maintenance'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wrench className="w-4 h-4" /> Maintenance ({tenantMaintenance.length})
        </button>
        <button
          onClick={() => setPortalTab('inbox')}
          className={`pb-3 px-4 border-b-2 transition flex items-center gap-2 whitespace-nowrap relative ${
            portalTab === 'inbox'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Mail className="w-4 h-4" /> Personal Email Inbox ({tenantEmails.length})
        </button>
      </div>

      {/* DASHBOARD TAB */}
      {portalTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Lease Info Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-sm text-slate-900">
            <div>
              <p className="text-[11px] text-slate-500 uppercase font-bold">Monthly Rent</p>
              <p className="text-2xl font-black text-emerald-600">{formatKSH(currentTenant.monthlyRent)}/month</p>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">Due on 5th of each month</p>
            </div>

            <div>
              <p className="text-[11px] text-slate-500 uppercase font-bold">Lease Term</p>
              <p className="text-base font-bold text-slate-900">
                {currentTenant.leaseStartDate} &rarr; {currentTenant.leaseEndDate}
              </p>
              <p className="text-xs text-blue-700 font-semibold mt-0.5">Deposit Paid: Yes</p>
            </div>

            <div>
              <p className="text-[11px] text-slate-500 uppercase font-bold">Registered Personal Email</p>
              <p className="text-sm font-bold text-slate-900 truncate" title={currentTenant.email}>
                {currentTenant.email}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium">All invoices & quotes delivered here</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div
              onClick={() => setPortalTab('invoices')}
              className="bg-white border border-slate-200 hover:border-blue-500 p-4 rounded-2xl transition cursor-pointer flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-blue-50 text-blue-700">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Pay Rent & View Statements</h4>
                  <p className="text-slate-500 font-medium">Complete monthly invoice checkout</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </div>

            <div
              onClick={() => setPortalTab('maintenance')}
              className="bg-white border border-slate-200 hover:border-blue-500 p-4 rounded-2xl transition cursor-pointer flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-rose-50 text-rose-700">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Report Maintenance Issue</h4>
                  <p className="text-slate-500 font-medium">Get instant AI troubleshooting advice</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </div>
          </div>
        </div>
      )}

      {/* INVOICES & PAYMENTS TAB */}
      {portalTab === 'invoices' && (
        <div className="space-y-4">
          <h3 className="font-bold text-slate-900 text-sm">My Monthly Invoices</h3>
          <div className="space-y-3">
            {tenantInvoices.map((inv) => {
              const isPaid = inv.status === 'Paid';
              const prop = properties.find((p) => p.id === inv.propertyId || p.name === inv.propertyName);
              const targetLandlord = landlords.find((l) => l.id === (inv.landlordId || currentTenant?.landlordId || prop?.landlordId)) || landlords[0];

              return (
                <div
                  key={inv.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-slate-900 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-700 text-sm">{inv.invoiceNumber}</span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isPaid ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 font-medium">
                        Month: {inv.periodMonth} | Due Date: {inv.dueDate || '10th of Month'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Rent: {formatKSH(inv.rentAmount || inv.totalAmount * 0.85)} + Water: {formatKSH(inv.waterFee || 0)} + Trash: {formatKSH(inv.trashFee || 0)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-0 border-slate-200 pt-2 sm:pt-0">
                      <div className="text-left sm:text-right">
                        <p className="text-[10px] text-slate-500 font-medium">Total Amount</p>
                        <p className="text-lg font-extrabold text-slate-900">{formatKSH(inv.totalAmount)}</p>
                      </div>

                      {!isPaid && (
                        <button
                          onClick={() => setPayingInvoice(inv)}
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                        >
                          <DollarSign className="w-4 h-4" /> Pay Now
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Registered Landlord Payment Instructions */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1 text-slate-700">
                    <p className="font-bold text-slate-900 flex items-center gap-1.5">
                      💳 Landlord Rent Payment Instructions
                    </p>
                    {targetLandlord ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                          <p className="font-bold text-emerald-700 mb-0.5">📱 M-Pesa Mobile Money:</p>
                          {targetLandlord.mpesaPaybill && <p>Paybill: <strong className="text-slate-900">{targetLandlord.mpesaPaybill}</strong></p>}
                          {targetLandlord.mpesaTillNumber && <p>Till No: <strong className="text-slate-900">{targetLandlord.mpesaTillNumber}</strong></p>}
                          {targetLandlord.mpesaPhoneNumber && <p>Phone: <strong className="text-slate-900">{targetLandlord.mpesaPhoneNumber}</strong></p>}
                          <p className="text-slate-500 mt-0.5">Account Ref: <strong className="text-slate-800">Unit {inv.unitNumber || currentTenant?.unitNumber || 'Rent'}</strong></p>
                        </div>
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                          <p className="font-bold text-blue-700 mb-0.5">🏦 Bank Account Details:</p>
                          {targetLandlord.bankName && <p>Bank: <strong className="text-slate-900">{targetLandlord.bankName}</strong></p>}
                          {targetLandlord.accountName && <p>A/C Name: <strong className="text-slate-900">{targetLandlord.accountName}</strong></p>}
                          {targetLandlord.accountNumber && <p>A/C No: <strong className="text-slate-900">{targetLandlord.accountNumber}</strong></p>}
                          {targetLandlord.branchName && <p>Branch: <strong className="text-slate-900">{targetLandlord.branchName}</strong></p>}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">Pay directly to landlord account via M-Pesa or Bank transfer.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MAINTENANCE TAB */}
      {portalTab === 'maintenance' && (
        <div className="space-y-6">
          {/* Submit New Request Form */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm text-slate-900">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Wrench className="w-4 h-4 text-rose-600" /> Report Maintenance Request
            </h3>

            <form onSubmit={handleCreateMaintenanceSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Issue Title</label>
                <input
                  type="text"
                  required
                  value={maintTitle}
                  onChange={(e) => setMaintTitle(e.target.value)}
                  placeholder="e.g. Kitchen tap leaking onto counter"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Category</label>
                  <select
                    value={maintCategory}
                    onChange={(e) => setMaintCategory(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  >
                    <option value="Plumbing">Plumbing</option>
                    <option value="Electrical">Electrical</option>
                    <option value="HVAC">HVAC / AC</option>
                    <option value="Appliance">Appliance</option>
                    <option value="Locks & Keys">Locks & Keys</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Urgency</label>
                  <select
                    value={maintUrgency}
                    onChange={(e) => setMaintUrgency(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                  >
                    <option value="Low">Low - Cosmetic</option>
                    <option value="Medium">Medium - Routine</option>
                    <option value="High">High - Urgent</option>
                    <option value="Emergency">Emergency - Water/Safety</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Description of Problem</label>
                <textarea
                  required
                  value={maintDesc}
                  onChange={(e) => setMaintDesc(e.target.value)}
                  placeholder="Provide details about when it started and location in apartment..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 h-20 shadow-sm"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingMaint}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold flex items-center gap-2 transition shadow-sm"
              >
                <Sparkles className="w-4 h-4" /> Submit & Run AI Safety Diagnosis
              </button>
            </form>
          </div>

          {/* List of Previous Requests */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">My Reported Issues</h3>
            {tenantMaintenance.map((m) => (
              <div key={m.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 text-xs shadow-sm text-slate-900">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-slate-900 text-sm">{m.title}</h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {m.status}
                  </span>
                </div>
                <p className="text-slate-600 font-medium">{m.description}</p>
                {m.aiSuggestedDiy && (
                  <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl text-blue-900 font-medium">
                    <strong className="text-blue-700 flex items-center gap-1 mb-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" /> AI DIY Troubleshooting Tip:
                    </strong>
                    {m.aiSuggestedDiy}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PERSONAL EMAIL INBOX TAB */}
      {portalTab === 'inbox' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" /> Personal Inbox ({currentTenant.email})
            </h3>
            <span className="text-[10px] text-slate-500 font-medium">Simulated live email delivery</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Email List */}
            <div className="space-y-2 lg:col-span-1">
              {tenantEmails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition ${
                    selectedEmail?.id === email.id
                      ? 'bg-blue-50 border-blue-500 text-slate-900 font-bold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
                  }`}
                >
                  <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-medium">
                    <span className="font-bold text-blue-700">{email.emailType}</span>
                    <span>{new Date(email.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="font-bold text-slate-900 line-clamp-1">{email.subject}</p>
                </div>
              ))}
            </div>

            {/* Email Body Reader */}
            <div className="lg:col-span-2 bg-slate-50 border border-slate-200 rounded-2xl p-4 min-h-[300px]">
              {selectedEmail ? (
                <div className="space-y-3">
                  <div className="border-b border-slate-200 pb-3">
                    <h4 className="font-bold text-slate-900 text-sm">{selectedEmail.subject}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                      From: EstateMaster Property Management &bull; To: {selectedEmail.recipientEmail}
                    </p>
                  </div>

                  <div
                    className="p-3 bg-white text-slate-900 rounded-xl overflow-x-auto text-xs border border-slate-200 shadow-xs"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                  />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-12 font-medium">
                  <Mail className="w-8 h-8 mb-2 opacity-50" />
                  Select an email from your inbox to view full contents
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT CHECKOUT MODAL */}
      {payingInvoice && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 text-xs shadow-xl text-slate-900">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" /> Rent Payment Checkout
              </h3>
              <button onClick={() => setPayingInvoice(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 text-slate-700 font-medium">
              <p>Invoice #: <strong className="text-slate-900">{payingInvoice.invoiceNumber}</strong></p>
              <p>Period: <strong className="text-slate-900">{payingInvoice.periodMonth}</strong></p>
              <p className="text-base font-extrabold text-emerald-600">
                Amount Due: {formatKSH(payingInvoice.totalAmount)}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                >
                  <option value="M-Pesa">M-Pesa Mobile Money</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Credit Card">Credit / Debit Card</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">M-Pesa Code / Reference</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm"
                />
              </div>

              <button
                onClick={handlePayInvoice}
                disabled={isProcessingPay}
                className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 font-bold text-white shadow-sm transition"
              >
                {isProcessingPay ? 'Processing Payment...' : `Complete Payment of ${formatKSH(payingInvoice.totalAmount)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TENANT PROFILE PHOTO UPDATE MODAL */}
      {showPhotoModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 space-y-4 text-xs shadow-2xl text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" /> Upload Profile Picture
              </h3>
              <button onClick={() => setShowPhotoModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Upload a profile picture for <strong className="text-slate-900">{currentTenant.fullName}</strong> or select a sample avatar.
            </p>

            <form onSubmit={handleSaveProfilePhoto} className="space-y-4">
              <div className="flex justify-center my-2">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-blue-500 bg-slate-100 shadow-md relative group">
                  {photoUrl ? (
                    <img src={photoUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-blue-50 text-blue-500 font-bold text-3xl">
                      {currentTenant.fullName.charAt(0)}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="cursor-pointer py-2.5 px-4 border border-dashed border-blue-400 rounded-xl bg-blue-50/70 hover:bg-blue-100/70 transition flex items-center justify-center gap-2 text-blue-700 font-bold text-xs">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>Choose Photo File from Device</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-slate-700 mb-2">Or choose a preset profile avatar:</p>
                <div className="flex items-center justify-center gap-3">
                  {PRESET_TENANT_AVATARS.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPhotoUrl(url)}
                      className={`w-12 h-12 rounded-full overflow-hidden border-2 transition ${
                        photoUrl === url ? 'border-blue-600 ring-2 ring-blue-400 scale-105' : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <img src={url} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPhoto}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isUpdatingPhoto ? 'Saving...' : 'Save Profile Picture'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
