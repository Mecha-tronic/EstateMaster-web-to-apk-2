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
  deleteProperty,
  fetchUnits,
  fetchTenants,
  fetchInvoices,
  fetchQuotes,
  fetchPayments,
  fetchMaintenance,
  fetchEmails,
  createInvoice,
  createQuote,
  recordPayment,
  updateMaintenanceStatus
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
  LogOut
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
        setSignedInLandlord((prev) => prev || lData[0]);
      }
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

  const activeLandlord = landlords.find((l) => l.id === activeLandlordId) || landlords[0];

  const checkLandlordSubscriptionActive = (landlord?: Landlord): boolean => {
    if (!landlord) return true;
    if (landlord.subscriptionStatus !== 'Active') return false;
    if (!landlord.subscriptionExpiry) return false;

    const expiryDate = new Date(landlord.subscriptionExpiry);
    expiryDate.setHours(23, 59, 59, 999);
    const now = new Date();
    return expiryDate >= now;
  };

  const isSubscriptionActive = checkLandlordSubscriptionActive(activeLandlord);

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
      {!isSubscriptionActive ? (
        <SubscriptionLockScreen
          activeLandlord={activeLandlord}
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
                  onLandlordSuccess={(landlord) => {
                    setSignedInLandlord(landlord);
                    setActiveLandlordId(landlord.id);
                  }}
                  onTenantSuccess={(tenant) => {
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
                      <Building2 className="w-3.5 h-3.5" /> Properties ({units.length})
                    </button>

                    <button
                      onClick={() => setLandlordTab('tenants')}
                      className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                        landlordTab === 'tenants'
                          ? 'bg-blue-600 text-white shadow-sm font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" /> Tenants ({tenants.length})
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
                      <Wrench className="w-3.5 h-3.5" /> Maintenance ({maintenance.length})
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

                {/* Active Tab View Rendering */}
                <div className="flex-1 pb-16">
                  {landlordTab === 'dashboard' && (
                    <LandlordDashboard
                      properties={properties}
                      units={units}
                      tenants={tenants}
                      invoices={invoices}
                      quotes={quotes}
                      maintenance={maintenance}
                      emails={emails}
                      signedInLandlord={signedInLandlord}
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
                      activeLandlordId={activeLandlordId}
                      onSelectLandlord={setActiveLandlordId}
                      onLandlordUpdated={() => loadAllData()}
                      onOpenRegisterModal={() => setShowLandlordRegModal(true)}
                    />
                  )}

                  {landlordTab === 'properties' && (
                    <PropertiesView
                      properties={properties}
                      units={units}
                      onAddProperty={(p) => {
                        fetch('/api/properties', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(p)
                        }).then(() => loadAllData());
                      }}
                      onRemoveProperty={(propertyId) => {
                        deleteProperty(propertyId).then(() => loadAllData());
                      }}
                      onAddUnit={(u) => {
                        fetch('/api/units', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(u)
                        }).then(() => loadAllData());
                      }}
                      onSelectUnitForRegister={() => setActiveRole('register')}
                      onRefreshData={() => loadAllData()}
                    />
                  )}

                  {landlordTab === 'tenants' && (
                    <TenantsLeasesView
                      tenants={tenants}
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
                      invoices={invoices}
                      quotes={quotes}
                      tenants={tenants}
                      units={units}
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
                      payments={payments}
                      invoices={invoices}
                      onRecordPayment={handleRecordPayment}
                    />
                  )}

                  {landlordTab === 'maintenance' && (
                    <MaintenanceView
                      maintenance={maintenance}
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
              <TenantRegistrationView
                properties={properties}
                units={units}
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
