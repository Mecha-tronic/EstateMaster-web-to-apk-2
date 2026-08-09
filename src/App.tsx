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
import { SubscriptionRenewalModal } from './components/SubscriptionRenewalModal';
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
  ArrowLeft,
  RefreshCw
} from 'lucide-react';

export default function App() {
  const [isAndroidView, setIsAndroidView] = useState<boolean>(true);
  const [activeRole, setActiveRole] = useState<'landlord' | 'tenant' | 'register'>('landlord');
  const [landlordTab, setLandlordTab] = useState<string>('dashboard');
  const [preselectedUnitId, setPreselectedUnitId] = useState<string>('');

  // Browser History Management for Samsung/Android Back Button Navigation
  const navigateTab = (newTab: string) => {
    setLandlordTab(newTab);
    window.history.pushState({ activeRole, landlordTab: newTab }, '', window.location.pathname);
  };

  const navigateRole = (newRole: 'landlord' | 'tenant' | 'register', newTab?: string) => {
    setActiveRole(newRole);
    if (newTab) setLandlordTab(newTab);
    window.history.pushState({ activeRole: newRole, landlordTab: newTab || landlordTab }, '', window.location.pathname);
  };

  useEffect(() => {
    if (!window.history.state) {
      window.history.replaceState({ activeRole: 'landlord', landlordTab: 'dashboard' }, '');
    }

    const handlePopState = (event: PopStateEvent) => {
      if (event.state) {
        if (event.state.activeRole) {
          setActiveRole(event.state.activeRole);
        }
        if (event.state.landlordTab) {
          setLandlordTab(event.state.landlordTab);
        }
      } else {
        setActiveRole('landlord');
        setLandlordTab('dashboard');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

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
  const [showRenewSubscriptionModal, setShowRenewSubscriptionModal] = useState(false);
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
    }
  };

  const handleGoToPortalFromRegister = (email: string) => {
    setRecentRegisteredEmail(email);
    navigateRole('landlord', 'tenants');
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
  const scopedProperties = properties.filter((p) => p.landlordId === currentLandlord?.id || (!p.landlordId && currentLandlord?.id === 'landlord-1'));
  const scopedUnits = units.filter((u) => scopedProperties.some((p) => p.id === u.propertyId) || properties.length === 0);
  const scopedTenants = tenants.filter(
    (t) =>
      t.landlordId === currentLandlord?.id ||
      scopedProperties.some((p) => p.id === t.propertyId) ||
      scopedUnits.some((u) => u.id === t.unitId)
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
                    navigateRole('tenant');
                  }}
                  onOpenLandlordRegister={() => setShowLandlordRegModal(true)}
                  onRefreshData={loadAllData}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between">
                {/* Landlord Header Sub-Navigation Bar */}
                <div className="bg-white border-b-2 border-slate-200 px-4 py-3 sm:py-3.5 flex items-center justify-between gap-2 overflow-x-auto text-sm sticky top-0 z-20 shadow-xs">
                  <div className="flex items-center gap-2 sm:gap-2.5 font-bold text-sm w-full">
                    <button
                      onClick={() => navigateTab('dashboard')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm ${
                        landlordTab === 'dashboard'
                          ? 'bg-blue-600 text-white shadow-md font-extrabold'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-bold'
                      }`}
                    >
                      <LayoutDashboard className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-blue-300" /> Overview
                    </button>

                    <button
                      onClick={() => navigateTab('properties')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm ${
                        landlordTab === 'properties'
                          ? 'bg-blue-600 text-white shadow-md font-extrabold'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-bold'
                      }`}
                    >
                      <Building2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> Properties ({scopedUnits.length})
                    </button>

                    <button
                      onClick={() => navigateTab('tenants')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm ${
                        landlordTab === 'tenants'
                          ? 'bg-blue-600 text-white shadow-md font-extrabold'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-bold'
                      }`}
                    >
                      <Users className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> Tenants ({scopedTenants.length})
                    </button>

                    <button
                      onClick={() => navigateTab('invoices')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm ${
                        landlordTab === 'invoices'
                          ? 'bg-blue-600 text-white shadow-md font-extrabold'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-bold'
                      }`}
                    >
                      <FileText className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> Invoices & Quotes
                    </button>

                    <button
                      onClick={() => navigateTab('payments')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm ${
                        landlordTab === 'payments'
                          ? 'bg-blue-600 text-white shadow-md font-extrabold'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-bold'
                      }`}
                    >
                      <DollarSign className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> Payment Ledger
                    </button>

                    <button
                      onClick={() => navigateTab('maintenance')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm ${
                        landlordTab === 'maintenance'
                          ? 'bg-blue-600 text-white shadow-md font-extrabold'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-bold'
                      }`}
                    >
                      <Wrench className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> Maintenance ({scopedMaintenance.length})
                    </button>

                    <button
                      onClick={() => navigateTab('landlord-accounts')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm ${
                        landlordTab === 'landlord-accounts'
                          ? 'bg-blue-600 text-white shadow-md font-extrabold'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-bold'
                      }`}
                    >
                      <CreditCard className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-emerald-500" /> Bank & M-Pesa Accounts
                    </button>

                    <button
                      onClick={() => setShowRenewSubscriptionModal(true)}
                      className="px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm transition flex items-center gap-2 shadow-md hover:shadow-lg whitespace-nowrap ml-auto"
                    >
                      <RefreshCw className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-emerald-200" /> Renew Subscription ({formatKSH(20000)}/yr)
                    </button>
                  </div>
                </div>

                {/* Back to Overview Banner on Sub-tabs */}
                {landlordTab !== 'dashboard' && (
                  <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                    <button
                      onClick={() => navigateTab('dashboard')}
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
                        if (tab === 'register') navigateRole('register');
                        else navigateTab(tab);
                      }}
                      onOpenNewInvoice={() => {
                        navigateTab('invoices');
                        setShowCreateInvoiceModal(true);
                      }}
                      onOpenNewQuote={() => {
                        navigateTab('invoices');
                        setShowCreateQuoteModal(true);
                      }}
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
                      onSelectUnitForRegister={(unitId) => {
                        if (unitId) setPreselectedUnitId(unitId);
                        navigateRole('register');
                      }}
                      onRefreshData={() => loadAllData()}
                    />
                  )}

                  {landlordTab === 'tenants' && (
                    <TenantsLeasesView
                      tenants={scopedTenants}
                      units={scopedUnits}
                      onNavigateRegister={() => navigateRole('register')}
                      onOpenInvoiceModal={() => {
                        navigateTab('invoices');
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
                      properties={scopedProperties}
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
                      tenants={scopedTenants}
                      onRecordPayment={handleRecordPayment}
                    />
                  )}

                  {landlordTab === 'maintenance' && (
                    <MaintenanceView
                      maintenance={scopedMaintenance}
                      tenants={scopedTenants.length > 0 ? scopedTenants : tenants}
                      units={scopedUnits.length > 0 ? scopedUnits : units}
                      properties={scopedProperties.length > 0 ? scopedProperties : properties}
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
                  onClick={() => navigateRole('landlord', 'dashboard')}
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
                initialSelectedUnitId={preselectedUnitId}
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
                  navigateRole('landlord');
                }}
                onRefreshData={loadAllData}
                onSwitchToRegister={() => navigateRole('register')}
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

      {/* Annual Subscription Renewal Modal */}
      <SubscriptionRenewalModal
        isOpen={showRenewSubscriptionModal}
        onClose={() => setShowRenewSubscriptionModal(false)}
        activeLandlord={currentLandlord}
        onSubscriptionRenewed={() => loadAllData()}
      />
    </AndroidFrame>
  );
}
