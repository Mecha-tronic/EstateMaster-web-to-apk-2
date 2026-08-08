import React, { useState, useEffect } from 'react';
import { AndroidFrame } from './components/AndroidFrame';
import { LandlordDashboard } from './components/LandlordDashboard';
import { PropertiesView } from './components/PropertiesView';
import { TenantsLeasesView } from './components/TenantsLeasesView';
import { InvoicesQuotesView } from './components/InvoicesQuotesView';
import { PaymentTrackerView } from './components/PaymentTrackerView';
import { MaintenanceView } from './components/MaintenanceView';
import { TenantRegistrationView } from './components/TenantRegistrationView';
import { TenantPortalView } from './components/TenantPortalView';
import { LandlordProfileView } from './components/LandlordProfileView';
import { LandlordRegistrationModal } from './components/LandlordRegistrationModal';
import { SubscriptionLockScreen } from './components/SubscriptionLockScreen';
import { SignInView } from './components/SignInView';
import { formatKSH } from './lib/formatters';

import {
  fetchLandlords,
  fetchProperties,
  createProperty,
  updatePropertyDetails,
  deleteProperty,
  fetchUnits,
  createUnit,
  fetchTenants,
  fetchInvoices,
  fetchQuotes,
  fetchPayments,
  fetchMaintenance,
  fetchEmails,
  createInvoice,
  createQuote,
  recordPayment,
  updateMaintenanceStatus,
  getApiUrl
} from './lib/api';

import {
  Landlord,
  Property,
  Unit,
  Tenant,
  Invoice,
  Quote,
  Payment,
  MaintenanceRequest,
  EmailLog
} from './types';

import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  DollarSign,
  Wrench,
  UserPlus,
  Key,
  CreditCard,
  LogOut,
  ArrowLeft
} from 'lucide-react';

export default function App() {
  const [isAndroidView, setIsAndroidView] = useState<boolean>(true);
  const [activeRole, setActiveRole] = useState<'landlord' | 'tenant' | 'register'>('landlord');
  const [landlordTab, setLandlordTab] = useState<string>('dashboard');

  // Authentication States
  const [signedInTenant, setSignedInTenant] = useState<Tenant | null>(null);
  const [signedInLandlord, setSignedInLandlord] = useState<Landlord | null>(null);

  // Data States
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [activeLandlordId, setActiveLandlordId] = useState<string>('landlord-1');
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRequest[]>([]);
  const [emails, setEmails] = useState<EmailLog[]>([]);

  // Modal States
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
  const [showCreateQuoteModal, setShowCreateQuoteModal] = useState(false);
  const [showLandlordRegModal, setShowLandlordRegModal] = useState(false);
  const [recentRegisteredEmail, setRecentRegisteredEmail] = useState<string>('');
  const [inactivityNotice, setInactivityNotice] = useState<string | null>(null);
  const [hasInitialLoaded, setHasInitialLoaded] = useState(false);

  const loadAllData = async () => {
    try {
      const [lData, pData, uData, tData, iData, qData, payData, mData, eData] = await Promise.all([
        fetchLandlords(),
        fetchProperties(),
        fetchUnits(),
        fetchTenants(),
        fetchInvoices(),
        fetchQuotes(),
        fetchPayments(),
        fetchMaintenance(),
        fetchEmails()
      ]);

      setLandlords(lData);
      if (lData.length > 0) {
        if (!activeLandlordId) setActiveLandlordId(lData[0].id);
        setSignedInLandlord((prev) => {
          if (!prev) return null;
          return lData.find((l) => l.id === prev.id || l.email === prev.email) || prev;
        });
      }
      setHasInitialLoaded(true);
      setProperties(pData);
      setUnits(uData);
      setTenants(tData);
      setSignedInTenant((prevTenant) => {
        if (!prevTenant) return null;
        return tData.find((t) => t.id === prevTenant.id || t.email === prevTenant.email) || prevTenant;
      });
      setInvoices(iData);
      setQuotes(qData);
      setPayments(payData);
      setMaintenance(mData);
      setEmails(eData);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Automatic Sign Out on Inactivity (2 Minutes)
  useEffect(() => {
    if (!signedInLandlord && !signedInTenant) return;

    let timer: any = null;
    const INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes (120,000 ms)

    const resetInactivityTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setSignedInLandlord(null);
        setSignedInTenant(null);
        setInactivityNotice('⚡ You were automatically signed out due to 2 minutes of inactivity for security.');
      }, INACTIVITY_TIMEOUT);
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    activityEvents.forEach((evt) => window.addEventListener(evt, resetInactivityTimer));

    resetInactivityTimer();

    return () => {
      if (timer) clearTimeout(timer);
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetInactivityTimer));
    };
  }, [signedInLandlord, signedInTenant]);

  const handleCreateInvoice = async (data: any) => {
    try {
      await createInvoice(data);
      await loadAllData();
    } catch (err) {
      console.error('Create invoice error:', err);
    }
  };

  const handleCreateQuote = async (data: any) => {
    try {
      await createQuote(data);
      await loadAllData();
    } catch (err) {
      console.error('Create quote error:', err);
    }
  };

  const handleRecordPayment = async (data: any) => {
    try {
      await recordPayment(data);
      await loadAllData();
    } catch (err) {
      console.error('Record payment error:', err);
    }
  };

  const handleUpdateMaintenance = async (id: string, status: string, tech?: string) => {
    try {
      await updateMaintenanceStatus(id, status, tech);
      await loadAllData();
    } catch (err) {
      console.error('Update maintenance error:', err);
    }
  };

  const handleRegistrationComplete = async (result: any) => {
    await loadAllData();
    if (result?.tenant) {
      setRecentRegisteredEmail(result.tenant.email);
      setSignedInTenant(result.tenant);
    }
  };

  const handleGoToPortalFromRegister = (email: string) => {
    setRecentRegisteredEmail(email);
    setActiveRole('tenant');
  };

  const currentLandlord = signedInLandlord || landlords.find((l) => l.id === activeLandlordId) || landlords[0];

  const checkLandlordSubscriptionActive = (landlord?: Landlord): boolean => {
    if (!landlord) return true;
    if (landlord.subscriptionStatus !== 'Active') return false;
    if (!landlord.subscriptionExpiry) return false;

    const expiryDate = new Date(landlord.subscriptionExpiry);
    expiryDate.setHours(23, 59, 59, 999);
    const now = new Date();
    return expiryDate >= now;
  };

  // Only trigger subscription lockout screen if a landlord IS signed in AND their subscription is expired
  const isSignedLandlordSubscriptionExpired = signedInLandlord ? !checkLandlordSubscriptionActive(signedInLandlord) : false;
  const isSubscriptionActive = checkLandlordSubscriptionActive(currentLandlord);

  // Landlord-scoped datasets for multi-tenant isolation
  const scopedProperties = properties.filter((p) => p.landlordId === currentLandlord?.id);
  const scopedUnits = units.filter((u) => scopedProperties.some((p) => p.id === u.propertyId));
  const scopedTenants = tenants.filter(
    (t) => t.landlordId === currentLandlord?.id || scopedProperties.some((p) => p.id === t.propertyId)
  );
  const scopedInvoices = invoices.filter(
    (inv) => scopedTenants.some((t) => t.id === inv.tenantId) || scopedProperties.some((p) => p.id === inv.propertyId)
  );
  const scopedPayments = payments.filter(
    (pay) => scopedInvoices.some((inv) => inv.id === pay.invoiceId) || scopedTenants.some((t) => t.id === pay.tenantId)
  );
  const scopedMaintenance = maintenance.filter(
    (m) => scopedTenants.some((t) => t.id === m.tenantId) || scopedProperties.some((p) => p.id === m.propertyId)
  );

  return (
    <AndroidFrame
      isAndroidView={isAndroidView}
      setIsAndroidView={setIsAndroidView}
      activeRole={activeRole}
      setActiveRole={setActiveRole}
      unreadEmailCount={emails.length}
      subscriptionStatus={isSubscriptionActive ? 'Active' : 'Expired'}
    >
      {/* SUBSCRIPTION LOCKOUT GUARD */}
      {isSignedLandlordSubscriptionExpired ? (
        <SubscriptionLockScreen
          activeLandlord={currentLandlord}
          landlords={landlords}
          onSelectLandlord={setActiveLandlordId}
          onSubscriptionRenewed={() => loadAllData()}
          activePlatformName={activeRole === 'landlord' ? 'EstateMaster Landlord' : 'EstateMaster Tenant'}
        />
      ) : (
        <>
          {/* LANDLORD MODE */}
          {activeRole === 'landlord' && (
            !signedInLandlord ? (
              <div className="flex-1 pb-12">
                <SignInView
                  initialRole="landlord"
                  tenants={tenants}
                  landlords={landlords}
                  units={units}
                  properties={properties}
                  inactivityNotice={inactivityNotice}
                  onLandlordSuccess={(landlord) => {
                    setInactivityNotice(null);
                    setSignedInLandlord(landlord);
                    setActiveLandlordId(landlord.id);
                  }}
                  onTenantSuccess={(tenant) => {
                    setInactivityNotice(null);
                    setSignedInTenant(tenant);
                    setActiveRole('tenant');
                  }}
                  onOpenLandlordRegister={() => setShowLandlordRegModal(true)}
                  onRefreshData={loadAllData}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between">
                {/* Landlord Header Sub-Navigation Bar */}
                <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-1 overflow-x-auto text-xs sticky top-0 z-20 shadow-xs">
                  <div className="flex items-center gap-1 font-semibold">
                    <button
                      onClick={() => setLandlordTab('dashboard')}
                      className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                        landlordTab === 'dashboard'
                          ? 'bg-blue-600 text-white shadow-sm font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <LayoutDashboard className="w-3.5 h-3.5" /> Overview
                    </button>

                    <button
                      onClick={() => setLandlordTab('properties')}
                      className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                        landlordTab === 'properties'
                          ? 'bg-blue-600 text-white shadow-sm font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" /> Properties ({scopedUnits.length})
                    </button>

                    <button
                      onClick={() => setLandlordTab('tenants')}
                      className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                        landlordTab === 'tenants'
                          ? 'bg-blue-600 text-white shadow-sm font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" /> Tenants ({scopedTenants.length})
                    </button>

                    <button
                      onClick={() => setLandlordTab('invoices')}
                      className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                        landlordTab === 'invoices'
                          ? 'bg-blue-600 text-white shadow-sm font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" /> Invoices & Quotes
                    </button>

                    <button
                      onClick={() => setLandlordTab('payments')}
                      className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                        landlordTab === 'payments'
                          ? 'bg-blue-600 text-white shadow-sm font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <DollarSign className="w-3.5 h-3.5" /> Payment Ledger
                    </button>

                    <button
                      onClick={() => setLandlordTab('maintenance')}
                      className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                        landlordTab === 'maintenance'
                          ? 'bg-blue-600 text-white shadow-sm font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <Wrench className="w-3.5 h-3.5" /> Maintenance ({scopedMaintenance.length})
                    </button>

                    <button
                      onClick={() => setLandlordTab('landlord-accounts')}
                      className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                        landlordTab === 'landlord-accounts'
                          ? 'bg-blue-600 text-white shadow-sm font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" /> Bank & M-Pesa Accounts
                    </button>

                    <button
                      onClick={() => setShowLandlordRegModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs whitespace-nowrap ml-auto"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> + Register Landlord ({formatKSH(20000)}/yr)
                    </button>
                  </div>
                </div>

                {/* Back to Overview Banner on Sub-tabs */}
                {landlordTab !== 'dashboard' && (
                  <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                    <button
                      onClick={() => setLandlordTab('dashboard')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-blue-500 hover:text-blue-600 text-slate-800 text-xs font-bold shadow-xs transition"
                    >
                      <ArrowLeft className="w-4 h-4 text-blue-600" />
                      Back to Overview Platform
                    </button>
                    <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider hidden sm:inline">
                      Landlord Operations / {landlordTab.replace('-', ' ')}
                    </span>
                  </div>
                )}

                {/* Active Tab View Rendering */}
                <div className="flex-1 pb-16">
                  {landlordTab === 'dashboard' && (
                    <LandlordDashboard
                      properties={scopedProperties}
                      units={scopedUnits}
                      tenants={scopedTenants}
                      invoices={scopedInvoices}
                      quotes={quotes}
                      maintenance={scopedMaintenance}
                      emails={emails}
                      signedInLandlord={currentLandlord}
                      onSignOut={() => setSignedInLandlord(null)}
                      onNavigate={(tab) => {
                        if (tab === 'register') setActiveRole('register');
                        else setLandlordTab(tab);
                      }}
                      onOpenNewInvoice={() => setShowCreateInvoiceModal(true)}
                      onOpenNewQuote={() => setShowCreateQuoteModal(true)}
                    />
                  )}

                  {landlordTab === 'landlord-accounts' && (
                    <LandlordProfileView
                      landlords={landlords}
                      activeLandlordId={currentLandlord?.id || activeLandlordId}
                      onSelectLandlord={setActiveLandlordId}
                      onLandlordUpdated={() => loadAllData()}
                      onOpenRegisterModal={() => setShowLandlordRegModal(true)}
                    />
                  )}

                  {landlordTab === 'properties' && (
                    <PropertiesView
                      properties={scopedProperties}
                      units={scopedUnits}
                      onAddProperty={async (p) => {
                        try {
                          await createProperty({ ...p, landlordId: currentLandlord?.id });
                          await loadAllData();
                        } catch (err) {
                          console.error('Failed to create property:', err);
                        }
                      }}
                      onRemoveProperty={async (propertyId) => {
                        try {
                          await deleteProperty(propertyId);
                          await loadAllData();
                        } catch (err) {
                          console.error('Failed to remove property:', err);
                        }
                      }}
                      onAddUnit={async (u) => {
                        try {
                          await createUnit(u);
                          await loadAllData();
                        } catch (err) {
                          console.error('Failed to create unit:', err);
                        }
                      }}
                      onSelectUnitForRegister={() => setActiveRole('register')}
                      onRefreshData={() => loadAllData()}
                    />
                  )}

                  {landlordTab === 'tenants' && (
                    <TenantsLeasesView
                      tenants={scopedTenants}
                      onNavigateRegister={() => setActiveRole('register')}
                      onOpenInvoiceModal={() => {
                        setLandlordTab('invoices');
                        setShowCreateInvoiceModal(true);
                      }}
                      onRefreshData={() => loadAllData()}
                    />
                  )}

                  {landlordTab === 'invoices' && (
                    <InvoicesQuotesView
                      invoices={scopedInvoices}
                      quotes={quotes}
                      tenants={scopedTenants}
                      units={scopedUnits}
                      landlords={landlords}
                      signedInLandlord={currentLandlord}
                      onCreateInvoice={handleCreateInvoice}
                      onCreateQuote={handleCreateQuote}
                      showCreateInvoiceModal={showCreateInvoiceModal}
                      setShowCreateInvoiceModal={setShowCreateInvoiceModal}
                      showCreateQuoteModal={showCreateQuoteModal}
                      setShowCreateQuoteModal={setShowCreateQuoteModal}
                    />
                  )}

                  {landlordTab === 'payments' && (
                    <PaymentTrackerView
                      payments={scopedPayments}
                      invoices={scopedInvoices}
                      onRecordPayment={handleRecordPayment}
                    />
                  )}

                  {landlordTab === 'maintenance' && (
                    <MaintenanceView
                      maintenance={scopedMaintenance}
                      onUpdateStatus={handleUpdateMaintenance}
                    />
                  )}
                </div>
              </div>
            )
          )}

          {/* TENANT REGISTRATION MODE */}
          {activeRole === 'register' && (
            <div className="flex-1 pb-12">
              <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                <button
                  onClick={() => {
                    setActiveRole('landlord');
                    setLandlordTab('dashboard');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-blue-500 hover:text-blue-600 text-slate-800 text-xs font-bold shadow-xs transition"
                >
                  <ArrowLeft className="w-4 h-4 text-blue-600" />
                  Back to Landlord Dashboard
                </button>
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider hidden sm:inline">
                  Tenant Registration Module
                </span>
              </div>
              <TenantRegistrationView
                properties={scopedProperties.length > 0 ? scopedProperties : properties}
                units={scopedUnits.length > 0 ? scopedUnits : units}
                onRegistrationComplete={handleRegistrationComplete}
                onGoToPortal={handleGoToPortalFromRegister}
              />
            </div>
          )}

          {/* TENANT PORTAL MODE */}
          {activeRole === 'tenant' && (
            <div className="flex-1 pb-12">
              <TenantPortalView
                tenants={tenants}
                landlords={landlords}
                units={units}
                properties={properties}
                invoices={invoices}
                quotes={quotes}
                maintenance={maintenance}
                initialTenantEmail={recentRegisteredEmail}
                signedInTenant={signedInTenant}
                onSignIn={(tenant) => setSignedInTenant(tenant)}
                onSignOut={() => setSignedInTenant(null)}
                onLandlordSuccess={(landlord) => {
                  setInactivityNotice(null);
                  setSignedInLandlord(landlord);
                  setActiveLandlordId(landlord.id);
                  setActiveRole('landlord');
                }}
                onRefreshData={loadAllData}
                onSwitchToRegister={() => setActiveRole('register')}
              />
            </div>
          )}
        </>
      )}

      {/* Landlord Registration & KSH 20,000 Annual Subscription Modal */}
      <LandlordRegistrationModal
        isOpen={showLandlordRegModal}
        onClose={() => setShowLandlordRegModal(false)}
        onRegistered={(newLandlord) => {
          setLandlords((prev) => [newLandlord, ...prev]);
          setActiveLandlordId(newLandlord.id);
          loadAllData();
        }}
      />
    </AndroidFrame>
  );
}
