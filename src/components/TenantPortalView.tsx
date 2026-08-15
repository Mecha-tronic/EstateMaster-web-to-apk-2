import React, { useState, useEffect } from 'react';
import { Tenant, Invoice, Payment, Quote, MaintenanceRequest, EmailLog, Landlord, Unit, Property } from '../types';
import { formatKSH } from '../lib/formatters';
import { calculateTenantArrears } from '../lib/arrears';
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
  User,
  Bot,
  MessageSquare,
  AlertTriangle,
  HelpCircle,
  Copy,
  Check,
  Smartphone,
  Building2,
  CreditCard,
  Receipt,
  TrendingDown,
  AlertCircle
} from 'lucide-react';
import { createMaintenance, recordPayment, fetchEmails, updateTenantDetails, sendMaintenanceAiChat } from '../lib/api';

interface TenantPortalViewProps {
  tenants: Tenant[];
  landlords?: Landlord[];
  units?: Unit[];
  properties?: Property[];
  invoices: Invoice[];
  payments?: Payment[];
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
  payments = [],
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

  // AI Maintenance Chatbot Assistant state
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; time: string }>>([
    {
      sender: 'ai',
      text: '👋 Hello! I am your 24/7 AI Maintenance & Safety Assistant. Describe any problem in your apartment or tap a topic below for instant diagnostic guidance!',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);

  // Email Inbox state
  const [tenantEmails, setTenantEmails] = useState<EmailLog[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailLog | null>(null);

  // Payment state
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [payAmountInput, setPayAmountInput] = useState<string>('');
  const [payNotesInput, setPayNotesInput] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'M-Pesa' | 'Bank Transfer' | 'Credit Card'>('M-Pesa');
  const [payRef, setPayRef] = useState('MPESA-92810');
  const [isProcessingPay, setIsProcessingPay] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(label);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

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

  const activeLandlord = landlords.find((l) => l.id === currentTenant?.landlordId) || landlords[0];

  const landlordMpesaTill = activeLandlord?.mpesaTillNumber || '781920';
  const landlordMpesaPaybill = activeLandlord?.mpesaPaybill || '247247';
  const landlordMpesaPhone = activeLandlord?.mpesaPhoneNumber || activeLandlord?.phone || '+254 712 345 678';

  const landlordBankName = activeLandlord?.bankName || 'Equity Bank Kenya';
  const landlordAccountName = activeLandlord?.accountName || activeLandlord?.companyName || activeLandlord?.name || 'Mwangi Premier Estates Ltd';
  const landlordAccountNumber = activeLandlord?.accountNumber || '0110293847561';
  const landlordBranchName = activeLandlord?.branchName || 'Kilimani Branch';
  const landlordSwiftCode = activeLandlord?.swiftCode || 'EQBLKENX';

  const tenantInvoices = invoices.filter((i) => i.tenantId === currentTenant?.id || i.tenantEmail?.toLowerCase() === currentTenant?.email?.toLowerCase());
  const tenantQuotes = quotes.filter((q) => q.tenantEmail?.toLowerCase() === currentTenant?.email?.toLowerCase());
  const tenantMaintenance = maintenance.filter((m) => m.tenantId === currentTenant?.id || m.tenantEmail?.toLowerCase() === currentTenant?.email?.toLowerCase());
  const tenantPayments = payments.filter((p) => p.tenantId === currentTenant?.id || p.tenantName?.toLowerCase().trim() === currentTenant?.fullName?.toLowerCase().trim());
  const tenantArrears = calculateTenantArrears(currentTenant, invoices, payments);

  const handleSendAiChat = async (userPrompt?: string) => {
    const promptToSubmit = userPrompt || chatInput;
    if (!promptToSubmit.trim() || isChatSending) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatMessages((prev) => [...prev, { sender: 'user', text: promptToSubmit, time: timeStr }]);
    if (!userPrompt) setChatInput('');
    setIsChatSending(true);

    try {
      const reply = await sendMaintenanceAiChat({
        message: promptToSubmit,
        category: maintCategory,
        unitNumber: currentTenant?.unitNumber || 'Apartment',
        tenantName: currentTenant?.fullName || 'Resident'
      });
      setChatMessages((prev) => [
        ...prev,
        { sender: 'ai', text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: '🔧 **AI Assistant Note:** Please ensure water or power isolators are secured if leaking or sparking, and fill out the maintenance request form below.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsChatSending(false);
    }
  };

  const handleCreateMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintTitle || !maintDesc) return;
    setIsSubmittingMaint(true);

    try {
      await createMaintenance({
        tenantId: currentTenant?.id,
        tenantName: currentTenant?.fullName,
        tenantEmail: currentTenant?.email,
        unitId: currentTenant?.unitId,
        unitNumber: currentTenant?.unitNumber,
        propertyName: currentTenant?.propertyName,
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

    const dueRemaining = payingInvoice.totalAmount - (payingInvoice.amountPaid || 0);
    const parsedAmount = parseFloat(payAmountInput);
    const finalAmount = !isNaN(parsedAmount) && parsedAmount > 0 ? parsedAmount : dueRemaining;

    try {
      await recordPayment({
        invoiceId: payingInvoice.id,
        amount: finalAmount,
        paymentMethod,
        referenceCode: payRef || `REF-${Math.floor(Math.random() * 899999 + 100000)}`,
        notes: payNotesInput || `Tenant portal payment via ${paymentMethod} (Amount: KSh ${finalAmount.toLocaleString()})`
      });

      setPayingInvoice(null);
      setPayAmountInput('');
      setPayNotesInput('');
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
          {/* Rent Collection & Arrears Record Banner */}
          <div className={`p-5 rounded-2xl border shadow-sm space-y-4 text-slate-900 ${
            tenantArrears.totalArrears > 0 
              ? 'bg-amber-50/90 border-amber-300' 
              : 'bg-emerald-50/90 border-emerald-300'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 border-slate-200/80">
              <div className="flex items-center gap-2.5">
                {tenantArrears.totalArrears > 0 ? (
                  <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-xs">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    {tenantArrears.totalArrears > 0 ? 'Outstanding Rent & Arrears Record' : 'Rent Account Status: Up to Date'}
                  </h3>
                  <p className="text-xs text-slate-600 font-medium">
                    Shared record of rent billed, partial settlements, skipped months, and current arrears balance.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  tenantArrears.status === 'Up-To-Date' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                  tenantArrears.status === 'Partial Arrears' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                  'bg-rose-100 text-rose-800 border border-rose-300'
                }`}>
                  {tenantArrears.status}
                </span>
                {tenantArrears.totalArrears > 0 && (
                  <button
                    onClick={() => setPortalTab('invoices')}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <DollarSign className="w-3.5 h-3.5" /> Pay Rent / Arrears
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Outstanding Arrears</span>
                <span className={`text-lg font-black ${tenantArrears.totalArrears > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {formatKSH(tenantArrears.totalArrears)}
                </span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Rent Billed</span>
                <span className="text-lg font-bold text-slate-900">{formatKSH(tenantArrears.totalInvoiced)}</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Paid to Date</span>
                <span className="text-lg font-bold text-emerald-600">{formatKSH(tenantArrears.totalPaid)}</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Unpaid / Skipped Months</span>
                <span className="text-lg font-bold text-slate-800">
                  {tenantArrears.skippedMonthsCount + tenantArrears.partialMonthsCount} Month(s)
                </span>
              </div>
            </div>
          </div>

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
        <div className="space-y-6">
          {/* LANDLORD SHARED PAYMENT OPTIONS BANNER */}
          <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-5 shadow-md border border-blue-900/60 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-800/60 pb-3">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-400" /> Landlord Payment Accounts & Billing Channels
                </h3>
                <p className="text-xs text-blue-200/80">
                  Official payment details configured by <strong className="text-white">{activeLandlord?.companyName || activeLandlord?.name || 'Landlord'}</strong> for fast rent & utilities payment.
                </p>
              </div>
              {copiedKey && (
                <span className="px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm">
                  <Check className="w-3.5 h-3.5" /> Copied {copiedKey}!
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* M-PESA CHANNEL */}
              <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                  <span className="font-extrabold text-emerald-400 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                    <Smartphone className="w-4 h-4" /> M-Pesa Mobile Money
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-500/30">
                    Instant Till / Paybill
                  </span>
                </div>

                <div className="space-y-2 text-slate-200 font-medium text-[11px]">
                  {landlordMpesaTill && (
                    <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Buy Goods Till Number:</span>
                        <strong className="text-white text-sm font-mono">{landlordMpesaTill}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(landlordMpesaTill, 'Till Number')}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 transition cursor-pointer"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                  )}

                  {landlordMpesaPaybill && (
                    <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <div>
                        <span className="text-slate-400 block text-[10px]">M-Pesa Paybill Number:</span>
                        <strong className="text-white text-sm font-mono">{landlordMpesaPaybill}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(landlordMpesaPaybill, 'Paybill')}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 transition cursor-pointer"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Account Reference:</span>
                      <strong className="text-emerald-300 font-mono text-xs">Unit {currentTenant.unitNumber}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(`Unit ${currentTenant.unitNumber}`, 'Account Ref')}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px] flex items-center gap-1 transition cursor-pointer"
                    >
                      <Copy className="w-3 h-3" /> Copy Ref
                    </button>
                  </div>
                </div>
              </div>

              {/* BANK TRANSFER CHANNEL */}
              <div className="bg-slate-900/90 border border-blue-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-blue-500/20 pb-2">
                  <span className="font-extrabold text-blue-400 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                    <Building2 className="w-4 h-4" /> Bank Account Details
                  </span>
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 font-bold px-2 py-0.5 rounded border border-blue-500/30">
                    Direct Wire / EFT
                  </span>
                </div>

                <div className="space-y-2 text-slate-200 font-medium text-[11px]">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Bank Name:</span>
                      <strong className="text-white">{landlordBankName}</strong>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Branch Name:</span>
                      <strong className="text-white">{landlordBranchName}</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Account Name:</span>
                      <strong className="text-white text-xs">{landlordAccountName}</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Account Number:</span>
                      <strong className="text-blue-300 text-sm font-mono">{landlordAccountNumber}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(landlordAccountNumber, 'Account Number')}
                      className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] flex items-center gap-1 transition cursor-pointer"
                    >
                      <Copy className="w-3 h-3" /> Copy A/C
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <h3 className="font-bold text-slate-900 text-sm">My Monthly Invoices</h3>
          <div className="space-y-3">
            {tenantInvoices.map((inv) => {
              const isPaid = inv.status === 'Paid';
              const prop = properties.find((p) => p.id === inv.propertyId || p.name === inv.propertyName);
              const targetLandlord = landlords.find((l) => l.id === (inv.landlordId || currentTenant?.landlordId || prop?.landlordId)) || activeLandlord;

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
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                        >
                          <DollarSign className="w-4 h-4" /> Pay Bill Now
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Payment Options Bar */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-2 text-slate-700">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-900 flex items-center gap-1.5">
                        💳 Direct Payment Options for Invoice {inv.invoiceNumber}:
                      </p>
                      {!isPaid && (
                        <button
                          type="button"
                          onClick={() => setPayingInvoice(inv)}
                          className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-1"
                        >
                          Open Checkout <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                        <p className="font-bold text-emerald-700 flex items-center justify-between">
                          <span>📱 M-Pesa Express</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(targetLandlord?.mpesaTillNumber || landlordMpesaTill, 'Till')}
                            className="text-[10px] text-emerald-600 hover:underline flex items-center gap-0.5 font-bold"
                          >
                            <Copy className="w-2.5 h-2.5" /> Copy Till
                          </button>
                        </p>
                        <p className="text-slate-600">Till Number: <strong className="text-slate-900 font-mono">{targetLandlord?.mpesaTillNumber || landlordMpesaTill}</strong></p>
                        <p className="text-slate-600">Paybill: <strong className="text-slate-900 font-mono">{targetLandlord?.mpesaPaybill || landlordMpesaPaybill}</strong></p>
                        <p className="text-slate-500 text-[10px]">Account Ref: <strong className="text-slate-800">Unit {currentTenant.unitNumber}</strong></p>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1">
                        <p className="font-bold text-blue-700 flex items-center justify-between">
                          <span>Banking Options</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(targetLandlord?.accountNumber || landlordAccountNumber, 'Bank Account')}
                            className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 font-bold"
                          >
                            <Copy className="w-2.5 h-2.5" /> Copy A/C
                          </button>
                        </p>
                        <p className="text-slate-600">{targetLandlord?.bankName || landlordBankName} &bull; <strong className="text-slate-900 font-mono">{targetLandlord?.accountNumber || landlordAccountNumber}</strong></p>
                        <p className="text-slate-600">A/C Name: <strong className="text-slate-800">{targetLandlord?.accountName || landlordAccountName}</strong></p>
                      </div>
                    </div>
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
          {/* 24/7 AI Maintenance Assistant Chatbot Widget */}
          <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white rounded-2xl p-5 space-y-4 shadow-lg border border-blue-900/50">
            <div className="flex items-center justify-between border-b border-blue-800/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                    AI Maintenance & Safety Assistant <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  </h3>
                  <p className="text-[11px] text-blue-200/80">Instant diagnostic guidance, DIY advice, and safety shutoff instructions</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                24/7 Active
              </span>
            </div>

            {/* Quick Diagnostic Pill Shortcuts */}
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => handleSendAiChat('Water leaking under kitchen sink')}
                className="px-2.5 py-1 rounded-lg bg-blue-900/60 hover:bg-blue-800 border border-blue-700/50 text-blue-200 transition flex items-center gap-1"
              >
                🚿 Leaking Water Tap / Pipe
              </button>
              <button
                type="button"
                onClick={() => handleSendAiChat('Main circuit breaker tripped')}
                className="px-2.5 py-1 rounded-lg bg-blue-900/60 hover:bg-blue-800 border border-blue-700/50 text-blue-200 transition flex items-center gap-1"
              >
                ⚡ Tripped Circuit Breaker
              </button>
              <button
                type="button"
                onClick={() => handleSendAiChat('Air conditioner blowing warm air')}
                className="px-2.5 py-1 rounded-lg bg-blue-900/60 hover:bg-blue-800 border border-blue-700/50 text-blue-200 transition flex items-center gap-1"
              >
                ❄️ AC Not Cooling
              </button>
              <button
                type="button"
                onClick={() => handleSendAiChat('Key stuck in front door lock')}
                className="px-2.5 py-1 rounded-lg bg-blue-900/60 hover:bg-blue-800 border border-blue-700/50 text-blue-200 transition flex items-center gap-1"
              >
                🔑 Door Lock Jammed
              </button>
            </div>

            {/* Chat Conversation History */}
            <div className="bg-slate-950/80 rounded-xl p-3 max-h-56 overflow-y-auto space-y-3 text-xs border border-blue-900/40 font-sans">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.sender === 'ai' && (
                    <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-xl p-3 space-y-1 ${
                      msg.sender === 'user'
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-bl-none'
                    }`}
                  >
                    <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>
                    <span className="text-[9px] opacity-60 block text-right">{msg.time}</span>
                  </div>
                </div>
              ))}
              {isChatSending && (
                <div className="flex gap-2 items-center text-blue-300 text-xs italic">
                  <Bot className="w-3.5 h-3.5 animate-spin" />
                  <span>AI Assistant analyzing maintenance diagnostic...</span>
                </div>
              )}
            </div>

            {/* Input Row */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAiChat();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask AI Assistant about a repair issue or safety tip..."
                className="flex-1 bg-slate-900/90 border border-blue-800/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={isChatSending || !chatInput.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition shadow"
              >
                <Send className="w-3.5 h-3.5" /> Ask AI
              </button>
            </form>
          </div>

          {/* Submit New Request Form */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm text-slate-900">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Wrench className="w-4 h-4 text-rose-600" /> Report Maintenance Request to Landlord
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
                <Sparkles className="w-4 h-4" /> Submit Request & Trigger AI Safety Diagnosis
              </button>
            </form>
          </div>

          {/* List of Previous Requests */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">My Reported Issues ({tenantMaintenance.length})</h3>
            {tenantMaintenance.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                No maintenance requests logged yet. Use the form above to submit an issue.
              </div>
            ) : (
              tenantMaintenance.map((m) => (
                <div key={m.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 text-xs shadow-sm text-slate-900">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-medium">Category: {m.category || 'General'} • Urgency: {m.urgency || 'Medium'}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                      {m.status}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/90 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <span className="text-blue-700 font-extrabold uppercase text-[10px] bg-blue-100 px-2 py-0.5 rounded border border-blue-200 shrink-0">
                        Issue Title:
                      </span>
                      <span>{m.title || `${m.category || 'Maintenance'} Request`}</span>
                    </div>
                    <div className="text-xs text-slate-700 leading-relaxed pt-1 border-t border-slate-200/60">
                      <strong className="text-slate-900 font-bold">Issue Description: </strong>
                      <span>{m.description}</span>
                    </div>
                  </div>
                  
                  {/* AI Triage Diagnosis Card */}
                  <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 space-y-2 text-blue-950 font-medium">
                    <div className="flex items-center justify-between text-blue-800 border-b border-blue-200/60 pb-1.5">
                      <strong className="flex items-center gap-1.5 text-xs">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" /> AI Diagnostic Triage Assessment:
                      </strong>
                      {m.aiEstimatedCost && (
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-bold">
                          Cost: {m.aiEstimatedCost}
                        </span>
                      )}
                    </div>
                    {m.aiTriageSummary && (
                      <p className="text-[11px] text-blue-900">
                        <strong>Technical Summary:</strong> {m.aiTriageSummary}
                      </p>
                    )}
                    {m.aiSuggestedDiy && (
                      <div className="bg-white/90 p-2 rounded-lg border border-blue-200 text-[11px] text-slate-800">
                        <strong className="text-blue-700 block mb-0.5">💡 Recommended DIY Action / Safety Tip:</strong>
                        {m.aiSuggestedDiy}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
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
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 overflow-y-auto p-2 sm:p-4 flex items-start sm:items-center justify-center">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full my-auto p-4 sm:p-5 space-y-4 text-xs shadow-xl text-slate-900 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" /> Rent & Bill Payment Checkout
              </h3>
              <button onClick={() => setPayingInvoice(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 text-slate-700 font-medium text-xs">
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                <span>Invoice #: <strong className="text-slate-900 font-mono">{payingInvoice.invoiceNumber}</strong></span>
                <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded">Unit {currentTenant.unitNumber}</span>
              </div>
              <p><strong>Building / Property:</strong> {currentTenant.propertyName || 'Property Premises'}</p>
              <p>Period: <strong className="text-slate-900">{payingInvoice.periodMonth}</strong></p>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 font-bold text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Total Invoiced:</span>
                  <span className="text-slate-900">{formatKSH(payingInvoice.totalAmount)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Current Remaining Due:</span>
                  <span className="text-amber-700">{formatKSH(Math.max(0, payingInvoice.totalAmount - (payingInvoice.amountPaid || 0)))}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2">
                <label className="block text-slate-800 font-extrabold text-xs">
                  Amount to Pay Now (KSh)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={payAmountInput !== '' ? payAmountInput : (payingInvoice.totalAmount - (payingInvoice.amountPaid || 0))}
                    onChange={(e) => setPayAmountInput(e.target.value)}
                    placeholder={(payingInvoice.totalAmount - (payingInvoice.amountPaid || 0)).toString()}
                    className="w-full bg-white border border-blue-300 rounded-lg p-2.5 text-slate-900 font-extrabold text-sm shadow-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
                  <button
                    type="button"
                    onClick={() => setPayAmountInput((payingInvoice.totalAmount - (payingInvoice.amountPaid || 0)).toString())}
                    className="text-blue-700 hover:underline font-bold"
                  >
                    Pay Full Due ({formatKSH(Math.max(0, payingInvoice.totalAmount - (payingInvoice.amountPaid || 0)))})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayAmountInput((Math.round((payingInvoice.totalAmount - (payingInvoice.amountPaid || 0)) / 2)).toString())}
                    className="text-slate-600 hover:underline"
                  >
                    Pay 50% Fraction
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Select Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm font-semibold"
                >
                  <option value="M-Pesa">M-Pesa Mobile Money</option>
                  <option value="Bank Transfer">Bank Transfer / EFT</option>
                  <option value="Credit Card">Credit / Debit Card</option>
                </select>
              </div>

              {/* Dynamic Landlord Account Information Box for Selected Method */}
              {paymentMethod === 'M-Pesa' && (
                <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 space-y-2 text-slate-800 text-[11px]">
                  <p className="font-bold text-emerald-900 flex items-center gap-1.5 text-xs">
                    <Smartphone className="w-4 h-4 text-emerald-600" /> Landlord M-Pesa Receiving Channels:
                  </p>
                  
                  {landlordMpesaTill && (
                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-emerald-200">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Buy Goods Till No:</span>
                        <strong className="text-slate-900 font-mono text-xs">{landlordMpesaTill}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(landlordMpesaTill, 'Till Number')}
                        className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" /> Copy Till
                      </button>
                    </div>
                  )}

                  {landlordMpesaPaybill && (
                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-emerald-200">
                      <div>
                        <span className="text-slate-500 block text-[10px] font-semibold">M-Pesa Paybill Business No:</span>
                        <strong className="text-slate-900 font-mono text-xs">{landlordMpesaPaybill}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(landlordMpesaPaybill, 'Paybill Business No')}
                        className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" /> Copy Paybill
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-emerald-200">
                    <div>
                      <span className="text-slate-500 block text-[10px] font-semibold">M-Pesa Account No (Unit Number):</span>
                      <strong className="text-emerald-700 font-mono text-xs">Unit {currentTenant.unitNumber}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(`Unit ${currentTenant.unitNumber}`, 'Account Number')}
                      className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-[10px] flex items-center gap-1 cursor-pointer border border-emerald-300"
                    >
                      <Copy className="w-3 h-3" /> Copy Account No
                    </button>
                  </div>
                </div>
              )}

              {paymentMethod === 'Bank Transfer' && (
                <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 space-y-2 text-slate-800 text-[11px]">
                  <p className="font-bold text-blue-900 flex items-center gap-1.5 text-xs">
                    <Building2 className="w-4 h-4 text-blue-600" /> Landlord Bank Receiving Details:
                  </p>
                  
                  <div className="bg-white p-2 rounded-lg border border-blue-200 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500 text-[10px]">Bank:</span>
                      <strong className="text-slate-900">{landlordBankName}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 text-[10px]">A/C Name:</span>
                      <strong className="text-slate-900">{landlordAccountName}</strong>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Account Number:</span>
                        <strong className="text-blue-700 font-mono text-xs">{landlordAccountNumber}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(landlordAccountNumber, 'Account Number')}
                        className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" /> Copy A/C
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  {paymentMethod === 'M-Pesa' ? 'Enter M-Pesa Transaction Code' : 'Payment Confirmation Reference'}
                </label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="e.g. QJK812930A or EFT-78192"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Payment Notes / Arrears Reason (Optional)
                </label>
                <input
                  type="text"
                  value={payNotesInput}
                  onChange={(e) => setPayNotesInput(e.target.value)}
                  placeholder="e.g. Partial payment for August, remaining KSh 10,000 next week"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 shadow-sm text-xs"
                />
              </div>

              <button
                onClick={handlePayInvoice}
                disabled={isProcessingPay}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-white shadow-sm transition flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                {isProcessingPay ? (
                  'Confirming Transaction...'
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Confirm & Record Payment of {formatKSH(parseFloat(payAmountInput) || (payingInvoice.totalAmount - (payingInvoice.amountPaid || 0)))}
                  </>
                )}
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
