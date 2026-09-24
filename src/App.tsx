import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
import { SecurityShieldDashboard } from './components/SecurityShieldDashboard';
import { ServerConnectionModal } from './components/ServerConnectionModal';
import { InactivityWarningBanner } from './components/InactivityWarningBanner';
import { App as CapApp } from '@capacitor/app';
import { registerBackHandler, executeBackHandlers, exitAppSafely } from './lib/backNavigation';
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
  registerTenant,
  fetchInvoices,
  fetchQuotes,
  fetchPayments,
  fetchMaintenance,
  fetchEmails,
  createInvoice,
  createQuote,
  recordPayment,
  updateMaintenanceStatus,
  getApiUrl,
  subscribeToLandlords,
  subscribeToTenants,
  subscribeToProperties,
  subscribeToUnits,
  subscribeToInvoices,
  subscribeToQuotes,
  subscribeToPayments,
  subscribeToMaintenance,
  subscribeToEmails
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
  ReceiptText,
  WalletCards,
  Wrench,
  UserPlus,
  Key,
  Landmark,
  CreditCard,
  LogOut,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Server,
  Clock
} from 'lucide-react';

export default function App() {
  const [isAndroidView, setIsAndroidView] = useState<boolean>(true);
  const [activeRole, setActiveRole] = useState<'landlord' | 'tenant' | 'register'>('landlord');
  const [landlordTab, setLandlordTab] = useState<string>('dashboard');
  const [preselectedUnitId, setPreselectedUnitId] = useState<string>('');
  const [showServerSyncModal, setShowServerSyncModal] = useState<boolean>(false);

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

  // Native Android Back Navigation & Double-Tap to Exit Guard
  const [showExitToast, setShowExitToast] = useState(false);
  const lastExitPressRef = useRef<number>(0);
  const activeRoleRef = useRef(activeRole);
  const landlordTabRef = useRef(landlordTab);
  const navigationHistoryRef = useRef<Array<{ role: 'landlord' | 'tenant' | 'register'; tab: string }>>([
    { role: 'landlord', tab: 'dashboard' }
  ]);

  useEffect(() => {
    activeRoleRef.current = activeRole;
  }, [activeRole]);

  useEffect(() => {
    landlordTabRef.current = landlordTab;
  }, [landlordTab]);

  const navigateTab = useCallback((newTab: string) => {
    if (newTab === landlordTabRef.current && activeRoleRef.current === 'landlord') return;
    setLandlordTab(newTab);
    navigationHistoryRef.current.push({ role: activeRoleRef.current, tab: newTab });
  }, []);

  const navigateRole = useCallback((newRole: 'landlord' | 'tenant' | 'register', newTab?: string) => {
    setActiveRole(newRole);
    const targetTab = newTab || (newRole === 'landlord' ? 'dashboard' : landlordTabRef.current);
    setLandlordTab(targetTab);
    navigationHistoryRef.current.push({ role: newRole, tab: targetTab });
  }, []);

  // Back Button-aware Modal Handlers (Phone back button dismisses modal without exiting)
  const openInvoiceModal = () => setShowCreateInvoiceModal(true);
  const closeInvoiceModal = () => setShowCreateInvoiceModal(false);

  const openQuoteModal = () => setShowCreateQuoteModal(true);
  const closeQuoteModal = () => setShowCreateQuoteModal(false);

  const openLandlordRegModal = () => setShowLandlordRegModal(true);
  const closeLandlordRegModal = () => setShowLandlordRegModal(false);

  const openRenewSubscriptionModal = () => setShowRenewSubscriptionModal(true);
  const closeRenewSubscriptionModal = () => setShowRenewSubscriptionModal(false);

  const openServerSyncModal = () => setShowServerSyncModal(true);
  const closeServerSyncModal = () => setShowServerSyncModal(false);

  // Register Back Handlers for Root Modals (LIFO execution)
  useEffect(() => {
    if (!showCreateInvoiceModal) return;
    return registerBackHandler(() => {
      setShowCreateInvoiceModal(false);
      return true;
    });
  }, [showCreateInvoiceModal]);

  useEffect(() => {
    if (!showCreateQuoteModal) return;
    return registerBackHandler(() => {
      setShowCreateQuoteModal(false);
      return true;
    });
  }, [showCreateQuoteModal]);

  useEffect(() => {
    if (!showLandlordRegModal) return;
    return registerBackHandler(() => {
      setShowLandlordRegModal(false);
      return true;
    });
  }, [showLandlordRegModal]);

  useEffect(() => {
    if (!showRenewSubscriptionModal) return;
    return registerBackHandler(() => {
      setShowRenewSubscriptionModal(false);
      return true;
    });
  }, [showRenewSubscriptionModal]);

  useEffect(() => {
    if (!showServerSyncModal) return;
    return registerBackHandler(() => {
      setShowServerSyncModal(false);
      return true;
    });
  }, [showServerSyncModal]);

  // Central Universal Back Handler (Works for hardware Android back button in APK and browser popstate)
  const handleUniversalBack = useCallback(() => {
    // 1. Check local registered modal / drawer / sub-view back handlers
    if (executeBackHandlers()) {
      return;
    }

    // 2. Step back through screen navigation history if the user moved between pages/tabs
    if (navigationHistoryRef.current.length > 1) {
      // Pop current screen
      navigationHistoryRef.current.pop();
      const prevScreen = navigationHistoryRef.current[navigationHistoryRef.current.length - 1];
      if (prevScreen) {
        setActiveRole(prevScreen.role);
        setLandlordTab(prevScreen.tab);
        return;
      }
    }

    // If on a sub-tab in Landlord mode (e.g. Invoices, Tenants), go back to Dashboard
    if (activeRoleRef.current === 'landlord' && landlordTabRef.current !== 'dashboard') {
      setLandlordTab('dashboard');
      navigationHistoryRef.current = [{ role: 'landlord', tab: 'dashboard' }];
      return;
    }

    // If on Tenant or Register role, return to Landlord Dashboard
    if (activeRoleRef.current !== 'landlord') {
      setActiveRole('landlord');
      setLandlordTab('dashboard');
      navigationHistoryRef.current = [{ role: 'landlord', tab: 'dashboard' }];
      return;
    }

    // 3. User is at the root screen (Dashboard or Sign In) -> Double-tap to exit guard
    const now = Date.now();
    if (now - lastExitPressRef.current < 2500) {
      exitAppSafely();
    } else {
      lastExitPressRef.current = now;
      setShowExitToast(true);
      setTimeout(() => setShowExitToast(false), 2500);
    }
  }, []);

  useEffect(() => {
    // 1. Android Native Back Button via Capacitor App Plugin
    let capListenerHandle: any = null;
    try {
      CapApp.addListener('backButton', () => {
        handleUniversalBack();
      }).then((handle) => {
        capListenerHandle = handle;
      });
    } catch {
      // Not running in Capacitor
    }

    // 2. Web Browser Popstate Handler
    const onPopState = (e: PopStateEvent) => {
      e.preventDefault();
      handleUniversalBack();
      window.history.pushState({ app: true }, '', window.location.pathname);
    };

    window.history.pushState({ app: true }, '', window.location.pathname);
    window.addEventListener('popstate', onPopState);

    return () => {
      if (capListenerHandle && typeof capListenerHandle.remove === 'function') {
        capListenerHandle.remove();
      }
      window.removeEventListener('popstate', onPopState);
    };
  }, [handleUniversalBack]);

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

    // Attach Firestore real-time cloud sync listeners (instant multi-device/multi-phone updates)
    const unsubL = subscribeToLandlords((data) => {
      if (data && data.length > 0) {
        setLandlords(data);
        localStorage.setItem('estatemaster_landlords', JSON.stringify(data));
      }
    });
    const unsubP = subscribeToProperties((data) => {
      if (data && data.length > 0) {
        setProperties(data);
        localStorage.setItem('estatemaster_properties', JSON.stringify(data));
      }
    });
    const unsubU = subscribeToUnits((data) => {
      if (data && data.length > 0) {
        setUnits(data);
        localStorage.setItem('estatemaster_units', JSON.stringify(data));
      }
    });
    const unsubT = subscribeToTenants((data) => {
      if (data && data.length > 0) {
        setTenants(data);
        localStorage.setItem('estatemaster_tenants', JSON.stringify(data));
      }
    });
    const unsubI = subscribeToInvoices((data) => {
      if (data && data.length > 0) {
        setInvoices(data);
        localStorage.setItem('estatemaster_invoices', JSON.stringify(data));
      }
    });
    const unsubQ = subscribeToQuotes((data) => {
      if (data && data.length > 0) {
        setQuotes(data);
        localStorage.setItem('estatemaster_quotes', JSON.stringify(data));
      }
    });
    const unsubPay = subscribeToPayments((data) => {
      if (data && data.length > 0) {
        setPayments(data);
        localStorage.setItem('estatemaster_payments', JSON.stringify(data));
      }
    });
    const unsubM = subscribeToMaintenance((data) => {
      if (data && data.length > 0) {
        setMaintenance(data);
        localStorage.setItem('estatemaster_maintenance', JSON.stringify(data));
      }
    });
    const unsubE = subscribeToEmails((data) => {
      if (data && data.length > 0) {
        setEmails(data);
        localStorage.setItem('estatemaster_emails', JSON.stringify(data));
      }
    });

    return () => {
      unsubL();
      unsubP();
      unsubU();
      unsubT();
      unsubI();
      unsubQ();
      unsubPay();
      unsubM();
      unsubE();
    };
  }, []);

  // High-Performance Inactivity Engine (2-Minute Wall-Clock Guard)
  // Completely eliminates touch/scroll jank and handles APK wake/backgrounding seamlessly
  const [inactivityDeadline, setInactivityDeadline] = useState<number | null>(null);
  const lastActivityTimeRef = useRef<number>(Date.now());

  const resetInactivity = useCallback(() => {
    lastActivityTimeRef.current = Date.now();
    setInactivityDeadline(null);
  }, []);

  const handleAutoLogout = useCallback(() => {
    setSignedInLandlord(null);
    setSignedInTenant(null);
    setInactivityDeadline(null);
    setInactivityNotice('⚡ You were automatically signed out due to 2 minutes of inactivity for security.');
  }, []);

  useEffect(() => {
    if (!signedInLandlord && !signedInTenant) {
      setInactivityDeadline(null);
      return;
    }

    const INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 120,000 ms (2 minutes)
    const WARNING_THRESHOLD = 20 * 1000; // 20 seconds remaining

    lastActivityTimeRef.current = Date.now();

    // Discrete user interactions only (touchstart, mousedown, keydown).
    // Intentionally NEVER touchmove, pointermove, or scroll to maintain 60/120Hz smooth scrolling in Android APK.
    const onUserActivity = () => {
      lastActivityTimeRef.current = Date.now();
      setInactivityDeadline((prev) => (prev !== null ? null : prev));
    };

    const activityEvents = ['touchstart', 'mousedown', 'keydown'];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, onUserActivity, { passive: true });
    });

    // Check on phone wake / tab focus / visibility change / Capacitor appStateChange
    const checkElapsed = () => {
      if (document.visibilityState === 'visible' || document.hasFocus()) {
        const elapsed = Date.now() - lastActivityTimeRef.current;
        if (elapsed >= INACTIVITY_TIMEOUT) {
          handleAutoLogout();
        }
      }
    };

    document.addEventListener('visibilitychange', checkElapsed);
    window.addEventListener('focus', checkElapsed);

    let appStateHandle: any = null;
    try {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) checkElapsed();
      }).then((h) => {
        appStateHandle = h;
      });
    } catch {}

    // 1-second interval to evaluate wall-clock elapsed time
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - lastActivityTimeRef.current;
      const remainingMs = INACTIVITY_TIMEOUT - elapsed;

      if (remainingMs <= 0) {
        handleAutoLogout();
      } else if (remainingMs <= WARNING_THRESHOLD) {
        setInactivityDeadline((prev) => (prev !== null ? prev : lastActivityTimeRef.current + INACTIVITY_TIMEOUT));
      } else {
        setInactivityDeadline((prev) => (prev !== null ? null : prev));
      }
    }, 1000);

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, onUserActivity);
      });
      document.removeEventListener('visibilitychange', checkElapsed);
      window.removeEventListener('focus', checkElapsed);
      if (appStateHandle && typeof appStateHandle.remove === 'function') {
        appStateHandle.remove();
      }
      clearInterval(intervalId);
    };
  }, [signedInLandlord, signedInTenant, handleAutoLogout]);

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

  const handleUpdateMaintenance = async (id: string, status: string, tech?: string, extra?: { cost?: number; isBilled?: boolean; billedToInvoiceId?: string }) => {
    try {
      await updateMaintenanceStatus(id, status, tech, extra);
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

  const handleSeedSampleDataForLandlord = async () => {
    if (!currentLandlord) return;
    try {
      const newProp = await createProperty({
        landlordId: currentLandlord.id,
        name: `${currentLandlord.name.split(' ')[0]}'s Crest Heights`,
        address: '540 Ngong Road, Kilimani',
        city: 'Nairobi',
        type: 'Apartment Complex',
        totalUnits: 6,
        imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
        description: 'Modern executive apartments with high-speed fiber internet, 24/7 manned security gate, borehole, and automatic generator.',
        amenities: ['Elevator', '24/7 Security', 'Parking', 'Fiber Wi-Fi', 'Borehole Water']
      });

      const u1 = await createUnit({
        propertyId: newProp.id,
        propertyName: newProp.name,
        unitNumber: 'A-101',
        bedrooms: 2,
        bathrooms: 2,
        sqft: 850,
        monthlyRent: 55000,
        depositAmount: 55000,
        status: 'Occupied',
        features: ['Master En-suite', 'Spacious Balcony', 'Granite Tops']
      });

      await registerTenant({
        landlordId: currentLandlord.id,
        fullName: 'Grace Wambui',
        email: `grace.wambui.${Math.floor(100 + Math.random() * 900)}@example.com`,
        phone: '+254 712 998 877',
        unitId: u1.id,
        propertyId: newProp.id,
        propertyName: newProp.name,
        unitNumber: u1.unitNumber,
        monthlyRent: 55000,
        depositAmount: 55000,
        moveInDate: new Date().toISOString().split('T')[0],
        leaseTermMonths: '12'
      });

      await loadAllData();
    } catch (err) {
      console.error('Error seeding sample estate data:', err);
    }
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
  const currentLandlordEmail = (currentLandlord?.email || '').trim().toLowerCase();
  const matchingLandlordIds = new Set<string>();
  if (currentLandlord?.id) matchingLandlordIds.add(currentLandlord.id);
  if (currentLandlordEmail) {
    landlords
      .filter((l) => l.email && l.email.trim().toLowerCase() === currentLandlordEmail)
      .forEach((l) => matchingLandlordIds.add(l.id));
    // Known aliases and database IDs for Allan Mokua
    if (currentLandlordEmail === 'mokuaallan89@gmail.com' || currentLandlordEmail === 'mk@gmail.com') {
      matchingLandlordIds.add('landlord-1786370548593');
      matchingLandlordIds.add('landlord-mokua');
      matchingLandlordIds.add('landlord-raha');
      matchingLandlordIds.add('landlord-1786381154173');
      matchingLandlordIds.add('landlord-1789304633125');
    }
  }

  const scopedProperties = properties.filter((p) => {
    if (!currentLandlord) return true;
    if (p.landlordId && matchingLandlordIds.has(p.landlordId)) return true;
    if (!p.landlordId && currentLandlord.id === 'landlord-1') return true;
    if (!p.landlordId && (currentLandlordEmail === 'mokuaallan89@gmail.com' || currentLandlordEmail === 'mk@gmail.com')) return true;
    return false;
  });
  const scopedUnits = units.filter((u) => scopedProperties.some((p) => p.id === u.propertyId) || properties.length === 0);
  const scopedTenants = tenants.filter(
    (t) =>
      (t.landlordId && matchingLandlordIds.has(t.landlordId)) ||
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
      setActiveRole={navigateRole}
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
                <div className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 sm:py-3.5 flex items-center justify-between gap-2 overflow-x-auto text-sm sticky top-0 z-20 shadow-xs">
                  <div className="flex items-center gap-2 sm:gap-2.5 font-bold text-sm w-full">
                    <button
                      onClick={() => navigateTab('dashboard')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm cursor-pointer ${
                        landlordTab === 'dashboard'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-extrabold scale-[1.02]'
                          : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50/70 font-semibold'
                      }`}
                    >
                      <LayoutDashboard className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> Overview
                    </button>

                    <button
                      onClick={() => navigateTab('properties')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm cursor-pointer ${
                        landlordTab === 'properties'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-extrabold scale-[1.02]'
                          : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50/70 font-semibold'
                      }`}
                    >
                      <Building2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> Properties ({scopedUnits.length})
                    </button>

                    <button
                      onClick={() => navigateTab('tenants')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm cursor-pointer ${
                        landlordTab === 'tenants'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-extrabold scale-[1.02]'
                          : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50/70 font-semibold'
                      }`}
                    >
                      <Users className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> Tenants ({scopedTenants.length})
                    </button>

                    <button
                      onClick={() => navigateTab('invoices')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm cursor-pointer ${
                        landlordTab === 'invoices'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-extrabold scale-[1.02]'
                          : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50/70 font-semibold'
                      }`}
                    >
                      <ReceiptText className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> Invoices & Quotes
                    </button>

                    <button
                      onClick={() => navigateTab('payments')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm cursor-pointer ${
                        landlordTab === 'payments'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-extrabold scale-[1.02]'
                          : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50/70 font-semibold'
                      }`}
                    >
                      <WalletCards className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> Payment Ledger
                    </button>

                    <button
                      onClick={() => navigateTab('maintenance')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm cursor-pointer ${
                        landlordTab === 'maintenance'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-extrabold scale-[1.02]'
                          : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50/70 font-semibold'
                      }`}
                    >
                      <Wrench className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> Maintenance ({scopedMaintenance.length})
                    </button>

                    <button
                      onClick={() => navigateTab('landlord-accounts')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm cursor-pointer ${
                        landlordTab === 'landlord-accounts'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-extrabold scale-[1.02]'
                          : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50/70 font-semibold'
                      }`}
                    >
                      <Landmark className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-emerald-500" /> Bank & M-Pesa Accounts
                    </button>

                    <button
                      onClick={() => navigateTab('security')}
                      className={`px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm cursor-pointer ${
                        landlordTab === 'security'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-extrabold scale-[1.02]'
                          : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50/70 font-semibold'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-sky-500" /> Security & 2FA
                    </button>

                    <button
                      onClick={openServerSyncModal}
                      className="px-3.5 py-2.5 rounded-xl text-slate-700 hover:text-blue-600 hover:bg-blue-50/70 font-semibold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                      title="Backend & Mobile APK Server Connectivity"
                    >
                      <Server className="w-4 h-4 text-blue-600" /> Sync Server
                    </button>

                    <button
                      onClick={openRenewSubscriptionModal}
                      className="px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg shadow-emerald-600/20 whitespace-nowrap ml-auto cursor-pointer hover:scale-[1.02]"
                    >
                      <Sparkles className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-emerald-200 animate-spin-slow" /> Renew Subscription ({formatKSH(20000)}/yr)
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
                      payments={scopedPayments}
                      signedInLandlord={currentLandlord}
                      onSignOut={() => setSignedInLandlord(null)}
                      onNavigate={(tab) => {
                        if (tab === 'register') navigateRole('register');
                        else navigateTab(tab);
                      }}
                      onOpenNewInvoice={() => {
                        navigateTab('invoices');
                        openInvoiceModal();
                      }}
                      onOpenNewQuote={() => {
                        navigateTab('invoices');
                        openQuoteModal();
                      }}
                      onSeedSampleData={handleSeedSampleDataForLandlord}
                    />
                  )}

                  {landlordTab === 'landlord-accounts' && (
                    <LandlordProfileView
                      landlords={landlords}
                      activeLandlordId={currentLandlord?.id || activeLandlordId}
                      onSelectLandlord={setActiveLandlordId}
                      onLandlordUpdated={() => loadAllData()}
                      onOpenRegisterModal={openLandlordRegModal}
                    />
                  )}

                  {landlordTab === 'security' && currentLandlord && (
                    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
                      <SecurityShieldDashboard
                        user={currentLandlord}
                        role="landlord"
                        onUserUpdated={(updated) => {
                          setSignedInLandlord(updated as Landlord);
                          loadAllData();
                        }}
                      />
                    </div>
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
                        openInvoiceModal();
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
                      setShowCreateInvoiceModal={(show) => (show ? openInvoiceModal() : closeInvoiceModal())}
                      showCreateQuoteModal={showCreateQuoteModal}
                      setShowCreateQuoteModal={(show) => (show ? openQuoteModal() : closeQuoteModal())}
                    />
                  )}

                  {landlordTab === 'payments' && (
                    <PaymentTrackerView
                      payments={scopedPayments}
                      invoices={scopedInvoices}
                      tenants={scopedTenants}
                      properties={scopedProperties}
                      signedInLandlord={currentLandlord}
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
                payments={payments}
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

      {/* Floating 20-Second Inactivity Warning Notification */}
      <AnimatePresence>
        {inactivityDeadline !== null && (
          <InactivityWarningBanner
            deadlineMs={inactivityDeadline}
            onStaySignedIn={resetInactivity}
            onLogoutNow={handleAutoLogout}
          />
        )}
      </AnimatePresence>

      {/* Android Back-Press Toast */}
      <AnimatePresence>
        {showExitToast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white text-xs sm:text-sm font-semibold px-5 py-2.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 border border-slate-700/80 pointer-events-none"
          >
            <span>Press back again to exit EstateMaster</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Landlord Registration & KSH 20,000 Annual Subscription Modal */}
      <LandlordRegistrationModal
        isOpen={showLandlordRegModal}
        onClose={closeLandlordRegModal}
        onRegistered={(newLandlord) => {
          setLandlords((prev) => [newLandlord, ...prev]);
          setActiveLandlordId(newLandlord.id);
          loadAllData();
        }}
      />

      {/* Annual Subscription Renewal Modal */}
      <SubscriptionRenewalModal
        isOpen={showRenewSubscriptionModal}
        onClose={closeRenewSubscriptionModal}
        activeLandlord={currentLandlord}
        onSubscriptionRenewed={() => loadAllData()}
      />

      {/* Backend & Mobile Sync Server Modal */}
      <ServerConnectionModal
        isOpen={showServerSyncModal}
        onClose={closeServerSyncModal}
        onConnectionUpdated={() => loadAllData()}
      />
    </AndroidFrame>
  );
}
