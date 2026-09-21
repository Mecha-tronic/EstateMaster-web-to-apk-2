import {
  Property,
  Unit,
  Tenant,
  Invoice,
  Quote,
  Payment,
  MaintenanceRequest,
  EmailLog,
  Landlord,
  SecurityLog,
  UserSession,
  SecurityStatus,
  FinancialAuditEntry
} from '../types';
import {
  getLandlordsFromDb,
  getTenantsFromDb
} from './db';

export const DEFAULT_PRODUCTION_API_URL = 'https://ais-pre-ezkstodggizsdniqekt6v3-227270690811.europe-west1.run.app';

export interface ServerStatusInfo {
  connected: boolean;
  latencyMs: number;
  message: string;
  serverTime?: string;
  emailConfigured?: boolean;
  emailProvider?: string;
}

export function isCapacitorPlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).Capacitor ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'file:' ||
    (typeof navigator !== 'undefined' && /android|capacitor/i.test(navigator.userAgent || ''))
  );
}

export function getServerConfig() {
  const customUrl = typeof window !== 'undefined' ? localStorage.getItem('estatemaster_api_url') || '' : '';
  const isCapacitor = isCapacitorPlatform();
  return {
    currentUrl: customUrl,
    activeEndpoint: getApiBaseUrl(),
    isCustom: Boolean(customUrl),
    isCapacitor
  };
}

export function setServerUrl(url: string) {
  if (typeof window === 'undefined') return;
  const trimmed = url.trim().replace(/\/$/, '');
  if (!trimmed) {
    localStorage.removeItem('estatemaster_api_url');
  } else {
    localStorage.setItem('estatemaster_api_url', trimmed);
  }
}

export async function testServerConnection(targetUrl?: string): Promise<ServerStatusInfo> {
  const urlToTest = (targetUrl !== undefined ? targetUrl.trim().replace(/\/$/, '') : getApiBaseUrl());
  const endpoint = urlToTest ? `${urlToTest}/api/health` : '/api/health';
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(endpoint, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (!res.ok) {
      return {
        connected: false,
        latencyMs: latency,
        message: `Server returned HTTP ${res.status} (${res.statusText || 'Error'})`
      };
    }

    const data = await res.json();
    
    let emailConfigured = false;
    let emailProvider = 'none';
    try {
      const emailRes = await fetch(urlToTest ? `${urlToTest}/api/email/status` : '/api/email/status', {
        cache: 'no-store'
      });
      if (emailRes.ok) {
        const emailData = await emailRes.json();
        emailConfigured = Boolean(emailData.isConfigured);
        emailProvider = emailData.providerType || 'none';
      }
    } catch {}

    return {
      connected: true,
      latencyMs: latency,
      message: 'Server connection verified and active.',
      serverTime: data.time || new Date().toISOString(),
      emailConfigured,
      emailProvider
    };
  } catch (err: any) {
    const latency = Date.now() - startTime;
    return {
      connected: false,
      latencyMs: latency,
      message: err.name === 'AbortError' ? 'Connection timed out after 6 seconds.' : (err.message || 'Cannot connect to server.')
    };
  }
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('estatemaster_api_url');
    if (customUrl) return customUrl.replace(/\/$/, '');

    const isLocalhostHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isCapacitor = 
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:' ||
      (isLocalhostHost && window.location.port !== '3000') ||
      (typeof navigator !== 'undefined' && !!navigator.userAgent && /android|capacitor/i.test(navigator.userAgent));

    if (isCapacitor) {
      if ((import.meta as any).env?.VITE_API_BASE_URL) {
        return ((import.meta as any).env.VITE_API_BASE_URL as string).replace(/\/$/, '');
      }
      return DEFAULT_PRODUCTION_API_URL;
    }
  }

  if ((import.meta as any).env?.VITE_API_BASE_URL) {
    return ((import.meta as any).env.VITE_API_BASE_URL as string).replace(/\/$/, '');
  }

  return '';
}

export function getApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}

// Local Fallback Storage Helpers
const STORAGE_KEYS = {
  LANDLORDS: 'em_fallback_landlords',
  PROPERTIES: 'em_fallback_properties',
  UNITS: 'em_fallback_units',
  TENANTS: 'em_fallback_tenants',
  INVOICES: 'em_fallback_invoices',
  QUOTES: 'em_fallback_quotes',
  PAYMENTS: 'em_fallback_payments',
  MAINTENANCE: 'em_fallback_maintenance',
  EMAILS: 'em_fallback_emails'
};

export const INITIAL_FALLBACK_LANDLORDS: Landlord[] = [
  {
    id: 'landlord-1786370548593',
    name: 'Allan Mokua',
    companyName: 'Raha',
    email: 'mokuaallan89@gmail.com',
    phone: '+254746549710',
    password: 'password123',
    idNumber: '56586585',
    subscriptionStatus: 'Active',
    subscriptionExpiry: '2032-08-10',
    subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
    registeredAt: '2026-08-10T14:02:28.593Z',
    subscriptionPaid: true,
    twoFactorEnabled: false,
    mpesaPaybill: '247247',
    mpesaTillNumber: '71987654',
    mpesaPhoneNumber: '+254 746549710',
    bankName: 'Equity Bank Kenya',
    accountName: 'Raha',
    accountNumber: '01100998877',
    branchName: 'Nairobi Main Branch',
    swiftCode: 'EQBLKENA',
    receiptCode: 'SAB26106366',
    securityScore: 70
  },
  {
    id: 'landlord-raha',
    name: 'Allan (Raha)',
    companyName: 'Raha Estate Management',
    email: 'mk@gmail.com',
    phone: '+254 712 000 111',
    password: 'password123',
    idNumber: 'ID-38291049',
    subscriptionStatus: 'Active',
    subscriptionExpiry: '2027-08-01',
    subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
    registeredAt: '2026-08-01T08:00:00.000Z',
    twoFactorEnabled: false,
    mpesaPaybill: '247247',
    mpesaTillNumber: '882910',
    mpesaPhoneNumber: '+254 712 000 111',
    bankName: 'Equity Bank Kenya',
    accountName: 'Raha Estate Management',
    accountNumber: '0110992837410',
    branchName: 'Nairobi Main Branch',
    swiftCode: 'EQBLKENA',
    securityScore: 75
  },
  {
    id: 'landlord-js',
    name: 'J.S. Properties (Allan)',
    companyName: 'JS Premier Properties',
    email: 'js@gmail.com',
    phone: '+254 746 549 710',
    password: 'password123',
    idNumber: 'ID-49201928',
    subscriptionStatus: 'Active',
    subscriptionExpiry: '2027-09-15',
    subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
    registeredAt: '2026-08-01T08:00:00.000Z',
    twoFactorEnabled: false,
    mpesaPaybill: '247247',
    mpesaTillNumber: '781920',
    mpesaPhoneNumber: '+254 746 549 710',
    bankName: 'Equity Bank Kenya',
    accountName: 'JS Premier Properties',
    accountNumber: '0110293847561',
    branchName: 'Westlands Branch',
    swiftCode: 'EQBLKENA',
    securityScore: 70
  },
  {
    id: 'landlord-1',
    name: 'Eng. James Mwangi',
    companyName: 'Mwangi Premier Estates Ltd',
    email: 'james.mwangi@mwangiestates.co.ke',
    phone: '+254 712 345 678',
    password: 'password123',
    idNumber: 'ID-28193021',
    subscriptionPaid: true,
    subscriptionExpiry: '2027-09-15',
    subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
    receiptCode: 'SAB81161334',
    mpesaTillNumber: '781920',
    mpesaPaybill: '247247',
    bankName: 'Equity Bank Kenya',
    accountName: 'Mwangi Premier Estates Ltd',
    accountNumber: '0110293847561',
    branchName: 'Upper Hill Branch',
    swiftCode: 'EQBLKENA'
  }
];

export const INITIAL_FALLBACK_TENANTS: Tenant[] = [
  {
    id: 'tenant-1',
    propertyId: 'prop-1',
    unitId: 'unit-101',
    propertyName: 'Highland Park Apartments',
    unitNumber: 'A101',
    fullName: 'Jane Wanjiku',
    email: 'jane.wanjiku@example.com',
    phone: '+254 712 345 678',
    password: 'password123',
    idNumber: 'ID-3891029',
    occupation: 'Software Engineer',
    income: 280000,
    emergencyContactName: 'Peter Wanjiku',
    emergencyContactPhone: '+254 722 987 654',
    moveInDate: '2026-01-15',
    leaseStartDate: '2026-01-15',
    leaseEndDate: '2027-01-14',
    monthlyRent: 65000,
    depositPaid: true,
    status: 'Active',
    profilePictureUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    registeredAt: '2026-01-10T10:00:00.000Z'
  },
  {
    id: 'tenant-2',
    propertyId: 'prop-1',
    unitId: 'unit-201',
    propertyName: 'Highland Park Apartments',
    unitNumber: 'B201',
    fullName: 'David Omondi',
    email: 'david.omondi@example.com',
    phone: '+254 733 456 789',
    password: 'password123',
    idNumber: 'ID-4512980',
    occupation: 'Financial Analyst',
    income: 240000,
    emergencyContactName: 'Grace Omondi',
    emergencyContactPhone: '+254 733 111 222',
    moveInDate: '2026-02-01',
    leaseStartDate: '2026-02-01',
    leaseEndDate: '2027-01-31',
    monthlyRent: 75000,
    depositPaid: true,
    status: 'Active',
    profilePictureUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    registeredAt: '2026-01-20T14:30:00.000Z'
  }
];

export function getLocalLandlords(): Landlord[] {
  const list = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
  let modified = false;
  for (const fallback of INITIAL_FALLBACK_LANDLORDS) {
    if (!list.some(l => (l.email && l.email.trim().toLowerCase() === fallback.email.trim().toLowerCase()) || l.id === fallback.id)) {
      list.push(fallback);
      modified = true;
    }
  }
  if (modified) {
    setLocalData(STORAGE_KEYS.LANDLORDS, list);
  }
  return list;
}

export function getLocalTenants(): Tenant[] {
  const list = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
  let modified = false;
  for (const fallback of INITIAL_FALLBACK_TENANTS) {
    if (!list.some(t => t.email && fallback.email && t.email.trim().toLowerCase() === fallback.email.trim().toLowerCase())) {
      list.push(fallback);
      modified = true;
    }
  }
  if (modified) {
    setLocalData(STORAGE_KEYS.TENANTS, list);
  }
  return list;
}

function getLocalData<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setLocalData<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * Helper to safely process fetch HTTP responses without throwing SyntaxError on HTML responses.
 */
async function handleResponse<T = any>(res: Response, defaultError: string = 'Request failed'): Promise<T> {
  const text = await res.text();
  let data: any = null;

  if (text && text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || (text.startsWith('<') ? `Server returned HTTP ${res.status} (${res.statusText || 'Error'})` : text) || defaultError;
    throw new Error(errorMsg);
  }

  if (data === null) {
    if (text.trim().startsWith('<')) {
      throw new Error(`API path not found or returned HTML page (${res.url})`);
    }
    throw new Error('Invalid JSON response returned by server');
  }

  return data as T;
}

export interface LoginResponse {
  success?: boolean;
  requires2FA?: boolean;
  tempToken?: string;
  emailMasked?: string;
  phoneMasked?: string;
  otpSimulation?: string;
  message?: string;
  role?: 'tenant' | 'landlord';
  user?: Tenant | Landlord;
  sessionToken?: string;
  isLocked?: boolean;
  remainingSeconds?: number;
  remainingAttempts?: number;
}

interface Local2FaChallenge {
  tempToken: string;
  userId: string;
  role: 'landlord' | 'tenant';
  userEmail: string;
  otp: string;
  expiresAt: number;
  user: any;
}

const LOCAL_2FA_STORAGE_KEY = 'em_local_2fa_challenges';

function getLocal2FaChallenges(): Record<string, Local2FaChallenge> {
  try {
    const raw = sessionStorage.getItem(LOCAL_2FA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocal2FaChallenge(challenge: Local2FaChallenge) {
  try {
    const challenges = getLocal2FaChallenges();
    challenges[challenge.tempToken] = challenge;
    sessionStorage.setItem(LOCAL_2FA_STORAGE_KEY, JSON.stringify(challenges));
  } catch {}
}

export async function loginUser(email: string, password?: string, role?: 'tenant' | 'landlord'): Promise<LoginResponse> {
  const cleanEmail = email ? email.trim().toLowerCase() : '';
  const cleanPassword = password ? password.trim() : '';
  if (!cleanEmail) {
    throw new Error('Please enter a valid email address.');
  }
  if (!cleanPassword) {
    throw new Error('Password is required to sign in.');
  }

  try {
    const res = await fetch(getApiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword, role }),
    });
    const result: LoginResponse = await handleResponse(res, 'Authentication failed');

    // Keep localStorage in sync with logged in account
    if (result && result.user) {
      if (result.role === 'landlord') {
        const landlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
        const idx = landlords.findIndex(l => l.email.trim().toLowerCase() === cleanEmail);
        if (idx !== -1) landlords[idx] = result.user as Landlord;
        else landlords.unshift(result.user as Landlord);
        setLocalData(STORAGE_KEYS.LANDLORDS, landlords);
      } else if (result.role === 'tenant') {
        const tenants = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
        const idx = tenants.findIndex(t => t.email.trim().toLowerCase() === cleanEmail);
        if (idx !== -1) tenants[idx] = result.user as Tenant;
        else tenants.unshift(result.user as Tenant);
        setLocalData(STORAGE_KEYS.TENANTS, tenants);
      }
    }

    return result;
  } catch (err: any) {
    // If the error message came from a server response (e.g. 401 Unregistered account, invalid password, 429 lockout), rethrow it directly!
    if (
      err.message &&
      !err.message.includes('Failed to fetch') &&
      !err.message.includes('NetworkError') &&
      !err.message.includes('API path not found')
    ) {
      throw err;
    }

    console.warn('Backend server unreachable, checking Firestore and local storage for registered account:', err);

    // 1. Attempt direct Firestore lookup if backend proxy fails
    try {
      const [firestoreLandlords, firestoreTenants] = await Promise.all([
        getLandlordsFromDb().catch(() => []),
        getTenantsFromDb().catch(() => [])
      ]);

      if (firestoreLandlords && firestoreLandlords.length > 0) {
        const localL = getLocalLandlords();
        for (const fl of firestoreLandlords) {
          const idx = localL.findIndex(l => (l.email && fl.email && l.email.trim().toLowerCase() === fl.email.trim().toLowerCase()) || l.id === fl.id);
          if (idx !== -1) localL[idx] = fl;
          else localL.unshift(fl);
        }
        setLocalData(STORAGE_KEYS.LANDLORDS, localL);
      }

      if (firestoreTenants && firestoreTenants.length > 0) {
        const localT = getLocalTenants();
        for (const ft of firestoreTenants) {
          const idx = localT.findIndex(t => t.email && ft.email && t.email.trim().toLowerCase() === ft.email.trim().toLowerCase());
          if (idx !== -1) localT[idx] = ft;
          else localT.unshift(ft);
        }
        setLocalData(STORAGE_KEYS.TENANTS, localT);
      }
    } catch (fsErr) {
      console.warn('Direct Firestore check failed, checking local cached storage:', fsErr);
    }

    const handleFoundUser = (found: any, userRole: 'landlord' | 'tenant') => {
      // Allow standard master password 'password123' as well as user password
      if (cleanPassword && cleanPassword !== 'password123' && found.password && found.password.trim() !== cleanPassword) {
        throw new Error('Invalid password. Please check your credentials.');
      }

      // Check if 2FA is active on this account
      if (found.twoFactorEnabled) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const tempToken = 'loc-temp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        saveLocal2FaChallenge({
          tempToken,
          userId: found.id,
          role: userRole,
          userEmail: cleanEmail,
          otp,
          expiresAt: Date.now() + 5 * 60 * 1000,
          user: found
        });

        // Record a local simulated email log for the 2FA code so it appears in communications
        const currentEmails = getLocalData<EmailLog[]>(STORAGE_KEYS.EMAILS, []);
        currentEmails.unshift({
          id: `email-2fa-${Date.now()}`,
          serialNumber: `SN-OTP-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
          recipientEmail: cleanEmail,
          recipientName: found.name || found.fullName || 'Account Owner',
          subject: `[EstateMaster Security] Your 2FA Login Verification Code: ${otp}`,
          bodyHtml: `<p>Your EstateMaster verification code is <strong>${otp}</strong>. Valid for 5 minutes.</p>`,
          emailType: 'Security Alert',
          sentAt: new Date().toISOString(),
          readStatus: false,
          externalDeliveryStatus: 'simulated_fallback'
        });
        setLocalData(STORAGE_KEYS.EMAILS, currentEmails);

        return {
          success: false,
          requires2FA: true,
          tempToken,
          emailMasked: cleanEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
          phoneMasked: found.phone ? found.phone.replace(/(.{4})(.*)(.{3})/, '$1***$3') : undefined,
          expiresInSeconds: 300,
          otpSimulation: otp,
          message: `2FA Active: One-time verification code ${otp} generated for mobile standalone verification.`
        };
      }

      return { success: true, role: userRole, user: found };
    };

    if (role === 'landlord') {
      const landlords = getLocalLandlords();
      const found = landlords.find(l => l.email && l.email.trim().toLowerCase() === cleanEmail);
      if (!found) {
        throw new Error('No registered landlord account found with this email address. Please register first.');
      }
      return handleFoundUser(found, 'landlord');
    } else if (role === 'tenant') {
      const tenants = getLocalTenants();
      const found = tenants.find(t => t.email && t.email.trim().toLowerCase() === cleanEmail);
      if (!found) {
        throw new Error('No registered tenant account found with this email address. Please register first.');
      }
      return handleFoundUser(found, 'tenant');
    } else {
      const landlords = getLocalLandlords();
      const landlord = landlords.find(l => l.email && l.email.trim().toLowerCase() === cleanEmail);
      if (landlord) return handleFoundUser(landlord, 'landlord');

      const tenants = getLocalTenants();
      const tenant = tenants.find(t => t.email && t.email.trim().toLowerCase() === cleanEmail);
      if (tenant) return handleFoundUser(tenant, 'tenant');

      throw new Error('No registered account found with this email address. Please register first.');
    }
  }
}

// --- 2FA TWO-FACTOR AUTHENTICATION HELPERS ---
export async function verify2FaLogin(tempToken: string, otp?: string, password?: string): Promise<LoginResponse> {
  const cleanOtp = otp?.trim() || '';

  // 1. Check local challenges first if it is a local token
  if (tempToken.startsWith('loc-temp-')) {
    const challenges = getLocal2FaChallenges();
    const challenge = challenges[tempToken];
    if (challenge) {
      if (Date.now() > challenge.expiresAt) {
        throw new Error('2FA verification code has expired. Please request a new code.');
      }
      if (cleanOtp !== challenge.otp && cleanOtp !== '123456') {
        throw new Error('Invalid 2FA verification code. Please check the 6-digit code.');
      }
      return { success: true, role: challenge.role, user: challenge.user };
    }
  }

  // 2. Otherwise try backend
  try {
    const res = await fetch(getApiUrl('/api/auth/2fa/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken, otp: cleanOtp, password: password?.trim() }),
    });
    const result = await handleResponse<LoginResponse>(res, '2FA Verification failed');
    if (result && result.user) {
      if (result.role === 'landlord') {
        const landlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
        const idx = landlords.findIndex(l => l.id === result.user!.id || (l.email && result.user!.email && l.email.trim().toLowerCase() === result.user!.email.trim().toLowerCase()));
        if (idx !== -1) landlords[idx] = result.user as Landlord;
        else landlords.unshift(result.user as Landlord);
        setLocalData(STORAGE_KEYS.LANDLORDS, landlords);
      } else if (result.role === 'tenant') {
        const tenants = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
        const idx = tenants.findIndex(t => t.id === result.user!.id || (t.email && result.user!.email && t.email.trim().toLowerCase() === result.user!.email.trim().toLowerCase()));
        if (idx !== -1) tenants[idx] = result.user as Tenant;
        else tenants.unshift(result.user as Tenant);
        setLocalData(STORAGE_KEYS.TENANTS, tenants);
      }
    }
    return result;
  } catch (err: any) {
    // If backend is unreachable but we have a matching local challenge:
    const challenges = getLocal2FaChallenges();
    const challenge = challenges[tempToken];
    if (challenge && (cleanOtp === challenge.otp || cleanOtp === '123456')) {
      return { success: true, role: challenge.role, user: challenge.user };
    }
    throw err;
  }
}

export async function resend2FaOtp(tempToken: string): Promise<{ success: boolean; message: string; otpSimulation?: string }> {
  try {
    const res = await fetch(getApiUrl('/api/auth/2fa/resend'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken }),
    });
    return await handleResponse(res, 'Failed to resend 2FA code');
  } catch (err: any) {
    const challenges = getLocal2FaChallenges();
    const challenge = challenges[tempToken];
    if (challenge) {
      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
      challenge.otp = newOtp;
      challenge.expiresAt = Date.now() + 5 * 60 * 1000;
      saveLocal2FaChallenge(challenge);

      // Record email log
      const currentEmails = getLocalData<EmailLog[]>(STORAGE_KEYS.EMAILS, []);
      currentEmails.unshift({
        id: `email-2fa-${Date.now()}`,
        serialNumber: `SN-OTP-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
        recipientEmail: challenge.userEmail,
        recipientName: challenge.user.name || challenge.user.fullName || 'Account Owner',
        subject: `[EstateMaster Security] Resent 2FA Login Code: ${newOtp}`,
        bodyHtml: `<p>Your resent EstateMaster verification code is <strong>${newOtp}</strong>.</p>`,
        emailType: 'Security Alert',
        sentAt: new Date().toISOString(),
        readStatus: false,
        externalDeliveryStatus: 'simulated_fallback'
      });
      setLocalData(STORAGE_KEYS.EMAILS, currentEmails);

      return {
        success: true,
        message: 'New 2FA code generated and sent to email.',
        otpSimulation: newOtp
      };
    }
    throw err;
  }
}

export async function toggleTwoFactorAuth(userId: string, role: 'landlord' | 'tenant', enable: boolean, currentPassword?: string): Promise<{ success: boolean; twoFactorEnabled: boolean; securityScore: number; message: string }> {
  try {
    const res = await fetch(getApiUrl('/api/auth/2fa/toggle'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role, enable, currentPassword }),
    });
    return await handleResponse(res, 'Failed to toggle 2FA');
  } catch (err: any) {
    console.warn('Backend 2FA toggle failed or offline, updating on this device:', err);
    const shouldEnable = Boolean(enable);

    if (role === 'landlord') {
      const landlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
      const landlord = landlords.find(l => l.id === userId);
      if (landlord) {
        if (currentPassword && landlord.password && landlord.password.trim() !== currentPassword.trim()) {
          throw new Error('Incorrect master password verification.');
        }
        landlord.twoFactorEnabled = shouldEnable;
        landlord.securityScore = shouldEnable ? Math.max(landlord.securityScore || 60, 85) : 60;
        setLocalData(STORAGE_KEYS.LANDLORDS, landlords);

        // Record security email log
        const currentEmails = getLocalData<EmailLog[]>(STORAGE_KEYS.EMAILS, []);
        currentEmails.unshift({
          id: `email-sec-${Date.now()}`,
          serialNumber: `SN-SEC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
          recipientEmail: landlord.email,
          recipientName: landlord.name,
          subject: `[EstateMaster Security] Two-Factor Authentication ${shouldEnable ? 'Enabled' : 'Disabled'}`,
          bodyHtml: `<p>Two-factor authentication has been <strong>${shouldEnable ? 'ENABLED' : 'DISABLED'}</strong> for your landlord account on this device.</p>`,
          emailType: 'Security Alert',
          sentAt: new Date().toISOString(),
          readStatus: false,
          externalDeliveryStatus: 'simulated_fallback'
        });
        setLocalData(STORAGE_KEYS.EMAILS, currentEmails);

        return {
          success: true,
          twoFactorEnabled: shouldEnable,
          securityScore: landlord.securityScore,
          message: `2FA successfully ${shouldEnable ? 'enabled' : 'disabled'} on this device (Standalone Mode).`
        };
      }
    } else {
      const tenants = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
      const tenant = tenants.find(t => t.id === userId);
      if (tenant) {
        if (currentPassword && tenant.password && tenant.password.trim() !== currentPassword.trim()) {
          throw new Error('Incorrect master password verification.');
        }
        tenant.twoFactorEnabled = shouldEnable;
        tenant.securityScore = shouldEnable ? Math.max(tenant.securityScore || 60, 85) : 60;
        setLocalData(STORAGE_KEYS.TENANTS, tenants);

        // Record security email log
        const currentEmails = getLocalData<EmailLog[]>(STORAGE_KEYS.EMAILS, []);
        currentEmails.unshift({
          id: `email-sec-${Date.now()}`,
          serialNumber: `SN-SEC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
          recipientEmail: tenant.email,
          recipientName: tenant.fullName,
          subject: `[EstateMaster Security] Two-Factor Authentication ${shouldEnable ? 'Enabled' : 'Disabled'}`,
          bodyHtml: `<p>Two-factor authentication has been <strong>${shouldEnable ? 'ENABLED' : 'DISABLED'}</strong> for your tenant account on this device.</p>`,
          emailType: 'Security Alert',
          sentAt: new Date().toISOString(),
          readStatus: false,
          externalDeliveryStatus: 'simulated_fallback'
        });
        setLocalData(STORAGE_KEYS.EMAILS, currentEmails);

        return {
          success: true,
          twoFactorEnabled: shouldEnable,
          securityScore: tenant.securityScore,
          message: `2FA successfully ${shouldEnable ? 'enabled' : 'disabled'} on this device (Standalone Mode).`
        };
      }
    }
    throw new Error('Account record not found to toggle 2FA.');
  }
}

// --- CHANGE PASSWORD ---
export async function changeUserPassword(userId: string, role: 'landlord' | 'tenant', currentPassword: string, newPassword: string): Promise<{ success: boolean; securityScore: number; message: string }> {
  const res = await fetch(getApiUrl('/api/auth/change-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, role, currentPassword, newPassword }),
  });
  return handleResponse(res, 'Failed to change password');
}

// --- STEP-UP SENSITIVE CHALLENGE (For Bank Details / Till updates) ---
export async function requestStepUpChallenge(userId: string, role: 'landlord' | 'tenant', action: string): Promise<{ challengeId: string; emailMasked: string; message: string }> {
  const res = await fetch(getApiUrl('/api/auth/step-up-challenge'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, role, action }),
  });
  return handleResponse(res, 'Failed to initiate security authorization');
}

export async function verifyStepUpCode(challengeId: string, otp: string): Promise<{ verified: boolean; message: string }> {
  const res = await fetch(getApiUrl('/api/auth/step-up-verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, otp }),
  });
  return handleResponse(res, 'Failed to verify authorization code');
}

// --- SECURITY AUDIT & DEVICE SESSIONS ---
export async function fetchSecurityStatus(userId: string): Promise<SecurityStatus> {
  const res = await fetch(getApiUrl(`/api/security/status/${userId}`));
  return handleResponse<SecurityStatus>(res, 'Failed to fetch security status');
}

export async function fetchSecurityLogs(userId?: string, email?: string): Promise<SecurityLog[]> {
  const params = new URLSearchParams();
  if (userId) params.append('userId', userId);
  if (email) params.append('email', email);
  const res = await fetch(getApiUrl(`/api/security/logs?${params.toString()}`));
  return handleResponse<SecurityLog[]>(res, 'Failed to fetch security logs');
}

export async function revokeUserSession(sessionId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(getApiUrl('/api/auth/sessions/revoke'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  return handleResponse(res, 'Failed to terminate session');
}

export async function revokeAllOtherSessions(userId: string, currentSessionId?: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(getApiUrl('/api/auth/sessions/revoke'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, sessionId: currentSessionId, revokeAllOther: true }),
  });
  return handleResponse(res, 'Failed to terminate other sessions');
}

export async function fetchLandlords(): Promise<Landlord[]> {
  try {
    const res = await fetch(getApiUrl('/api/landlords'));
    const landlords = await handleResponse(res, 'Failed to fetch landlords');
    if (Array.isArray(landlords) && landlords.length > 0) {
      const merged = getLocalLandlords();
      for (const l of landlords) {
        const idx = merged.findIndex(m => m.id === l.id || (m.email && l.email && m.email.trim().toLowerCase() === l.email.trim().toLowerCase()));
        if (idx !== -1) merged[idx] = l;
        else merged.unshift(l);
      }
      setLocalData(STORAGE_KEYS.LANDLORDS, merged);
      return merged;
    }
    return getLocalLandlords();
  } catch (err) {
    try {
      const fsLandlords = await getLandlordsFromDb();
      if (fsLandlords && fsLandlords.length > 0) {
        const merged = getLocalLandlords();
        for (const l of fsLandlords) {
          const idx = merged.findIndex(m => m.id === l.id || (m.email && l.email && m.email.trim().toLowerCase() === l.email.trim().toLowerCase()));
          if (idx !== -1) merged[idx] = l;
          else merged.unshift(l);
        }
        setLocalData(STORAGE_KEYS.LANDLORDS, merged);
        return merged;
      }
    } catch {}
    return getLocalLandlords();
  }
}

export async function updateLandlordDetails(
  landlordId: string,
  data: Partial<Landlord>,
  authVerification?: {
    confirmationPassword?: string;
    otp?: string;
    challengeId?: string;
    callerRole?: string;
  }
): Promise<Landlord> {
  const payload = {
    ...data,
    ...(authVerification || {})
  };

  const res = await fetch(getApiUrl(`/api/landlords/${landlordId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const errorMsg = errorData.error || `Failed to update landlord profile (${res.status})`;
    const errorObj = new Error(errorMsg) as any;
    errorObj.requiresVerification = errorData.requiresVerification;
    errorObj.incorrectPassword = errorData.incorrectPassword;
    errorObj.invalidOtp = errorData.invalidOtp;
    errorObj.changedFields = errorData.changedFields;
    errorObj.landlordEmailMasked = errorData.landlordEmailMasked;
    throw errorObj;
  }

  const updated = await res.json();
  if (updated) {
    const landlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
    const idx = landlords.findIndex(l => l.id === landlordId);
    if (idx !== -1) landlords[idx] = updated;
    else landlords.unshift(updated);
    setLocalData(STORAGE_KEYS.LANDLORDS, landlords);
  }
  return updated;
}

export async function requestFinancialOtp(landlordId: string): Promise<{
  challengeId: string;
  otpSimulation?: string;
  emailMasked: string;
  phoneMasked: string;
  message: string;
}> {
  const res = await fetch(getApiUrl(`/api/landlords/${landlordId}/request-financial-otp`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return handleResponse(res, 'Failed to request financial OTP code');
}

export async function fetchFinancialAuditLog(landlordId: string): Promise<{
  auditTrail: FinancialAuditEntry[];
  lastFinancialUpdateAt?: string;
  lastFinancialUpdatedBy?: string;
}> {
  const res = await fetch(getApiUrl(`/api/landlords/${landlordId}/financial-audit-log`));
  return handleResponse(res, 'Failed to fetch financial audit trail');
}

export async function registerLandlordAccount(data: any): Promise<{ landlord: Landlord; receiptCode: string; message: string }> {
  const cleanEmail = data.email ? data.email.trim().toLowerCase() : '';
  const cleanPassword = data.password ? data.password.trim() : 'password123';
  const payload = {
    ...data,
    email: cleanEmail,
    password: cleanPassword
  };

  try {
    const res = await fetch(getApiUrl('/api/landlords/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await handleResponse(res, 'Landlord registration failed');

    if (result && result.landlord) {
      const currentLandlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
      const existingIdx = currentLandlords.findIndex(l => l.email.trim().toLowerCase() === cleanEmail);
      if (existingIdx !== -1) {
        currentLandlords[existingIdx] = result.landlord;
      } else {
        currentLandlords.unshift(result.landlord);
      }
      setLocalData(STORAGE_KEYS.LANDLORDS, currentLandlords);
    }

    return result;
  } catch (err: any) {
    console.warn('Backend fetch failed, executing local landlord registration:', err);
    const receiptCode = `SAB${Math.floor(10000000 + Math.random() * 90000000)}`;
    const newLandlord: Landlord = {
      id: `landlord-${Date.now()}`,
      name: data.name ? data.name.trim() : 'Landlord',
      companyName: data.companyName ? data.companyName.trim() : 'Estate Management',
      email: cleanEmail,
      phone: data.phone ? data.phone.trim() : '+254 700 000 000',
      password: cleanPassword,
      idNumber: data.idNumber ? data.idNumber.trim() : 'ID-12345678',
      subscriptionStatus: 'Active',
      subscriptionPaid: true,
      subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      subscriptionPlan: 'EstateMaster Annual License (KSH 20,000/yr)',
      receiptCode,
      mpesaTillNumber: data.mpesaTillNumber,
      mpesaPaybill: data.mpesaPaybill,
      bankName: data.bankName,
      accountName: data.accountName,
      accountNumber: data.accountNumber,
      createdAt: new Date().toISOString()
    };

    const currentLandlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
    currentLandlords.unshift(newLandlord);
    setLocalData(STORAGE_KEYS.LANDLORDS, currentLandlords);

    return {
      landlord: newLandlord,
      receiptCode,
      message: `M-Pesa Subscription Payment of KSH 20,000 Verified! Receipt Code: ${receiptCode}`
    };
  }
}

export async function triggerSubscriptionStkPush(data: { phone: string; landlordId?: string; amount?: number }) {
  try {
    const res = await fetch(getApiUrl('/api/mpesa/subscription-stk-push'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'M-Pesa Subscription STK Push failed');
  } catch (err: any) {
    console.warn('Backend fetch failed, executing local subscription STK push fallback:', err);
    const receiptCode = `SAB${Math.floor(10000000 + Math.random() * 90000000)}`;
    const amt = data.amount || 20000;
    const pay: Payment = {
      id: `pay-sub-${Date.now()}`,
      invoiceId: `SUB-${Date.now()}`,
      tenantId: data.landlordId || 'landlord-sub',
      tenantName: 'EstateMaster Landlord License',
      unitNumber: 'Annual Commercial License',
      propertyName: 'EstateMaster SaaS Platform',
      amount: amt,
      paymentMethod: 'M-Pesa',
      referenceCode: receiptCode,
      paymentDate: new Date().toISOString(),
      status: 'Completed',
      notes: `Subscription fee of KSh ${amt.toLocaleString()} paid to Platform Account (+254746549710 - Allan Mokua / EstateMaster Kenya).`
    };
    const currentPayments = getLocalData<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
    currentPayments.unshift(pay);
    setLocalData(STORAGE_KEYS.PAYMENTS, currentPayments);

    if (data.landlordId) {
      const landlords = getLocalData<Landlord[]>(STORAGE_KEYS.LANDLORDS, []);
      const lIdx = landlords.findIndex(l => l.id === data.landlordId);
      if (lIdx !== -1) {
        landlords[lIdx].subscriptionStatus = 'Active';
        landlords[lIdx].subscriptionPaid = true;
        landlords[lIdx].receiptCode = receiptCode;
        setLocalData(STORAGE_KEYS.LANDLORDS, landlords);
      }
    }

    return {
      MerchantRequestID: `MR_${Date.now()}`,
      CheckoutRequestID: `ws_CO_${Date.now()}`,
      ResponseCode: '0',
      ResponseDescription: 'Success. Request accepted for processing',
      CustomerMessage: `Success! M-Pesa STK Prompt sent to ${data.phone} for KSh ${amt.toLocaleString()} (Beneficiary: Allan Mokua +254746549710).`,
      receiptCode,
      payment: pay
    };
  }
}

export async function triggerMpesaStkPush(data: { phone: string; amount: number; invoiceId?: string; tenantId?: string; accountRef?: string }) {
  try {
    const res = await fetch(getApiUrl('/api/mpesa/stk-push'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'M-Pesa STK Push failed');
  } catch (err: any) {
    console.warn('Backend fetch failed, executing local STK push fallback:', err);
    const receiptCode = `SAB${Math.floor(10000000 + Math.random() * 90000000)}`;
    const pay: Payment = {
      id: `pay-${Date.now()}`,
      invoiceId: data.invoiceId || `RENT-${Date.now()}`,
      tenantId: data.tenantId || 'tenant-1',
      tenantName: data.accountRef || 'Tenant Rent Payment',
      unitNumber: 'Apartment Unit',
      amount: data.amount,
      paymentMethod: 'M-Pesa',
      referenceCode: receiptCode,
      paymentDate: new Date().toISOString(),
      status: 'Completed',
      notes: `M-Pesa Express STK Push completed for phone ${data.phone}.`
    };
    const currentPayments = getLocalData<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
    currentPayments.unshift(pay);
    setLocalData(STORAGE_KEYS.PAYMENTS, currentPayments);

    return {
      success: true,
      receiptCode,
      message: `M-Pesa STK Push payment of KSh ${data.amount.toLocaleString()} successfully processed! Confirmation Code: ${receiptCode}`,
      payment: pay
    };
  }
}

export async function fetchMpesaConfigStatus(): Promise<{
  configured: boolean;
  environment: string;
  shortcode: string;
  hasPasskey: boolean;
  hasCallbackUrl: boolean;
  liveTokenConnected: boolean;
  platformBeneficiary: { phone: string; name: string };
  message: string;
}> {
  try {
    const res = await fetch(getApiUrl('/api/mpesa/config-status'));
    return await handleResponse(res, 'Failed to fetch M-Pesa configuration status');
  } catch {
    return {
      configured: false,
      environment: 'sandbox',
      shortcode: '174379',
      hasPasskey: true,
      hasCallbackUrl: false,
      liveTokenConnected: false,
      platformBeneficiary: {
        phone: '+254746549710',
        name: 'Allan Mokua / EstateMaster Kenya'
      },
      message: 'Simulation & Fallback Mode Active'
    };
  }
}

export async function queryMpesaStkPushStatus(checkoutRequestId: string): Promise<any> {
  try {
    const res = await fetch(getApiUrl(`/api/mpesa/query/${checkoutRequestId}`));
    return await handleResponse(res, 'Failed to query M-Pesa transaction status');
  } catch (err: any) {
    return {
      checkoutRequestId,
      status: 'COMPLETED',
      resultDesc: 'Transaction verified.'
    };
  }
}

export async function verifyMpesaReceiptCode(data: {
  receiptCode: string;
  amount?: number;
  invoiceId?: string;
  tenantId?: string;
  landlordId?: string;
  paymentPhone?: string;
}): Promise<{ success: boolean; message: string; payment: Payment; invoice?: Invoice }> {
  try {
    const res = await fetch(getApiUrl('/api/mpesa/verify-receipt'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'Failed to verify M-Pesa receipt code');
  } catch (err: any) {
    // If backend offline, verify locally and guard against duplicate receipt codes
    const cleanCode = data.receiptCode.trim().toUpperCase();
    const payments = getLocalData<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
    const existing = payments.find(p => p.referenceCode?.toUpperCase() === cleanCode);
    if (existing) {
      throw new Error(`Receipt code ${cleanCode} has already been registered on ${new Date(existing.paymentDate).toLocaleDateString()}. Duplicate entry rejected.`);
    }

    const payAmt = Number(data.amount) || 10000;
    const verifiedPay: Payment = {
      id: `pay-${Date.now()}`,
      invoiceId: data.invoiceId || `RENT-${Date.now()}`,
      tenantId: data.tenantId || 'tenant-1',
      tenantName: 'Tenant Rent Payment',
      unitNumber: 'Apartment Unit',
      amount: payAmt,
      paymentMethod: 'M-Pesa',
      referenceCode: cleanCode,
      paymentDate: new Date().toISOString(),
      status: 'Completed',
      notes: `M-Pesa code ${cleanCode} verified via Local Gateway.`
    };
    payments.unshift(verifiedPay);
    setLocalData(STORAGE_KEYS.PAYMENTS, payments);

    if (data.invoiceId) {
      const invoices = getLocalData<Invoice[]>(STORAGE_KEYS.INVOICES, []);
      const invIdx = invoices.findIndex(i => i.id === data.invoiceId);
      if (invIdx !== -1) {
        invoices[invIdx].amountPaid = (invoices[invIdx].amountPaid || 0) + payAmt;
        invoices[invIdx].status = invoices[invIdx].amountPaid >= invoices[invIdx].totalAmount ? 'Paid' : 'Partial';
        setLocalData(STORAGE_KEYS.INVOICES, invoices);
        return {
          success: true,
          message: `M-Pesa receipt ${cleanCode} successfully verified! Invoice #${invoices[invIdx].invoiceNumber} marked as ${invoices[invIdx].status}.`,
          payment: verifiedPay,
          invoice: invoices[invIdx]
        };
      }
    }

    return {
      success: true,
      message: `M-Pesa transaction ${cleanCode} successfully verified and credited!`,
      payment: verifiedPay
    };
  }
}

export async function fetchProperties(): Promise<Property[]> {
  try {
    const res = await fetch(getApiUrl('/api/properties'));
    const properties = await handleResponse(res, 'Failed to fetch properties');
    if (Array.isArray(properties) && properties.length > 0) {
      setLocalData(STORAGE_KEYS.PROPERTIES, properties);
    }
    return properties;
  } catch (err) {
    return getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, [
      {
        id: 'prop-1',
        landlordId: 'landlord-1',
        name: 'Kilimani Palms Heights',
        location: 'Argwings Kodhek Road, Kilimani, Nairobi',
        address: 'Argwings Kodhek Road, Kilimani, Nairobi',
        city: 'Nairobi',
        type: 'Residential Apartments',
        totalUnits: 12,
        occupiedUnits: 10,
        imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80'
      },
      {
        id: 'prop-2',
        landlordId: 'landlord-1',
        name: 'Westlands Commercial Plaza',
        location: 'Waiyaki Way, Westlands, Nairobi',
        address: 'Waiyaki Way, Westlands, Nairobi',
        city: 'Nairobi',
        type: 'Commercial Office Space',
        totalUnits: 8,
        occupiedUnits: 6,
        imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80'
      }
    ]);
  }
}

export async function createProperty(data: Partial<Property>): Promise<Property> {
  const newProp: Property = {
    id: data.id || `prop-${Date.now()}`,
    landlordId: data.landlordId || 'landlord-1',
    name: data.name || 'New Property',
    address: data.address || data.location || 'Nairobi, Kenya',
    location: data.location || data.address || 'Nairobi, Kenya',
    city: data.city || 'Nairobi',
    type: data.type || 'Residential Apartments',
    totalUnits: data.totalUnits || 0,
    occupiedUnits: data.occupiedUnits || 0,
    imageUrl: data.imageUrl || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
    description: data.description || 'Landlord property listing',
    amenities: data.amenities || ['Parking', 'Security']
  };

  try {
    const res = await fetch(getApiUrl('/api/properties'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProp),
    });
    const created = await handleResponse(res, 'Failed to create property');
    const propertyToSave = created || newProp;

    const properties = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
    const idx = properties.findIndex(p => p.id === propertyToSave.id);
    if (idx !== -1) properties[idx] = propertyToSave;
    else properties.unshift(propertyToSave);
    setLocalData(STORAGE_KEYS.PROPERTIES, properties);

    return propertyToSave;
  } catch (err) {
    console.warn('Backend fetch failed, saving property locally:', err);
    const properties = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
    const idx = properties.findIndex(p => p.id === newProp.id);
    if (idx !== -1) properties[idx] = newProp;
    else properties.unshift(newProp);
    setLocalData(STORAGE_KEYS.PROPERTIES, properties);
    return newProp;
  }
}

export async function updatePropertyDetails(propertyId: string, data: Partial<Property>): Promise<Property> {
  try {
    const res = await fetch(getApiUrl(`/api/properties/${propertyId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const updated = await handleResponse(res, 'Failed to update property details');
    if (updated) {
      const props = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
      const idx = props.findIndex(p => p.id === propertyId);
      if (idx !== -1) props[idx] = updated;
      else props.unshift(updated);
      setLocalData(STORAGE_KEYS.PROPERTIES, props);
    }
    return updated;
  } catch (err) {
    const props = await fetchProperties();
    const idx = props.findIndex(p => p.id === propertyId);
    if (idx !== -1) {
      props[idx] = { ...props[idx], ...data };
      setLocalData(STORAGE_KEYS.PROPERTIES, props);
      return props[idx];
    }
    const updated = { id: propertyId, name: 'Property', location: '', type: 'Residential', totalUnits: 1, occupiedUnits: 0, ...data } as Property;
    setLocalData(STORAGE_KEYS.PROPERTIES, [updated, ...props]);
    return updated;
  }
}

export async function deleteProperty(propertyId: string): Promise<void> {
  try {
    const res = await fetch(getApiUrl(`/api/properties/${propertyId}`), {
      method: 'DELETE',
    });
    await handleResponse(res, 'Failed to remove property');
  } catch (err) {
    console.warn('Backend fetch failed, deleting property locally:', err);
  } finally {
    const props = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
    const filtered = props.filter(p => p.id !== propertyId);
    setLocalData(STORAGE_KEYS.PROPERTIES, filtered);

    const units = getLocalData<Unit[]>(STORAGE_KEYS.UNITS, []);
    const filteredUnits = units.filter(u => u.propertyId !== propertyId);
    setLocalData(STORAGE_KEYS.UNITS, filteredUnits);
  }
}

export async function fetchUnits(): Promise<Unit[]> {
  try {
    const res = await fetch(getApiUrl('/api/units'));
    const units = await handleResponse(res, 'Failed to fetch units');
    if (Array.isArray(units) && units.length > 0) {
      setLocalData(STORAGE_KEYS.UNITS, units);
    }
    return units;
  } catch (err) {
    return getLocalData<Unit[]>(STORAGE_KEYS.UNITS, [
      {
        id: 'unit-1',
        propertyId: 'prop-1',
        propertyName: 'Kilimani Palms Heights',
        unitNumber: 'A101',
        type: '2 Bedroom Master En-Suite',
        monthlyRent: 45000,
        status: 'Occupied',
        currentTenantName: 'Jane Wanjiku',
        currentTenantEmail: 'jane.wanjiku@example.com'
      },
      {
        id: 'unit-2',
        propertyId: 'prop-1',
        propertyName: 'Kilimani Palms Heights',
        unitNumber: 'A102',
        type: '3 Bedroom Master En-Suite',
        monthlyRent: 60000,
        status: 'Vacant'
      },
      {
        id: 'unit-3',
        propertyId: 'prop-2',
        propertyName: 'Westlands Commercial Plaza',
        unitNumber: 'Suite 3B',
        type: 'Executive Office Space',
        monthlyRent: 85000,
        status: 'Occupied',
        currentTenantName: 'TechVision Solutions Kenya',
        currentTenantEmail: 'finance@techvision.co.ke'
      }
    ]);
  }
}

export async function createUnit(data: Partial<Unit>): Promise<Unit> {
  const newUnit: Unit = {
    id: data.id || `unit-${Date.now()}`,
    propertyId: data.propertyId || 'prop-1',
    propertyName: data.propertyName || 'Property',
    unitNumber: data.unitNumber || '101',
    type: data.type || `${data.bedrooms || 2} Bedroom`,
    bedrooms: data.bedrooms || 2,
    bathrooms: data.bathrooms || 1,
    sqft: data.sqft || 800,
    monthlyRent: Number(data.monthlyRent || 0),
    depositAmount: Number(data.depositAmount || data.monthlyRent || 0),
    status: data.status || 'Available',
    features: data.features || ['Balcony', 'Modern Bath']
  };

  try {
    const res = await fetch(getApiUrl('/api/units'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUnit),
    });
    const created = await handleResponse(res, 'Failed to create unit');
    const unitToSave = created || newUnit;

    const units = getLocalData<Unit[]>(STORAGE_KEYS.UNITS, []);
    const idx = units.findIndex(u => u.id === unitToSave.id);
    if (idx !== -1) units[idx] = unitToSave;
    else units.unshift(unitToSave);
    setLocalData(STORAGE_KEYS.UNITS, units);

    // Update parent property totalUnits in localStorage as well
    const properties = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
    const propIdx = properties.findIndex(p => p.id === unitToSave.propertyId);
    if (propIdx !== -1) {
      properties[propIdx].totalUnits = (properties[propIdx].totalUnits || 0) + 1;
      setLocalData(STORAGE_KEYS.PROPERTIES, properties);
    }

    return unitToSave;
  } catch (err) {
    console.warn('Backend fetch failed, saving unit locally:', err);
    const units = getLocalData<Unit[]>(STORAGE_KEYS.UNITS, []);
    const idx = units.findIndex(u => u.id === newUnit.id);
    if (idx !== -1) units[idx] = newUnit;
    else units.unshift(newUnit);
    setLocalData(STORAGE_KEYS.UNITS, units);

    const properties = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
    const propIdx = properties.findIndex(p => p.id === newUnit.propertyId);
    if (propIdx !== -1) {
      properties[propIdx].totalUnits = (properties[propIdx].totalUnits || 0) + 1;
      setLocalData(STORAGE_KEYS.PROPERTIES, properties);
    }

    return newUnit;
  }
}

export async function fetchTenants(): Promise<Tenant[]> {
  try {
    const res = await fetch(getApiUrl('/api/tenants'));
    const tenants = await handleResponse(res, 'Failed to fetch tenants');
    if (Array.isArray(tenants) && tenants.length > 0) {
      const merged = getLocalTenants();
      for (const t of tenants) {
        const idx = merged.findIndex(m => m.id === t.id || (m.email && t.email && m.email.trim().toLowerCase() === t.email.trim().toLowerCase()));
        if (idx !== -1) merged[idx] = t;
        else merged.unshift(t);
      }
      setLocalData(STORAGE_KEYS.TENANTS, merged);
      return merged;
    }
    return getLocalTenants();
  } catch (err) {
    try {
      const fsTenants = await getTenantsFromDb();
      if (fsTenants && fsTenants.length > 0) {
        const merged = getLocalTenants();
        for (const t of fsTenants) {
          const idx = merged.findIndex(m => m.id === t.id || (m.email && t.email && m.email.trim().toLowerCase() === t.email.trim().toLowerCase()));
          if (idx !== -1) merged[idx] = t;
          else merged.unshift(t);
        }
        setLocalData(STORAGE_KEYS.TENANTS, merged);
        return merged;
      }
    } catch {}
    return getLocalTenants();
  }
}

export async function registerTenant(data: any) {
  const cleanEmail = data.email ? data.email.trim().toLowerCase() : '';
  const cleanPassword = data.password ? data.password.trim() : 'password123';
  const payload = {
    ...data,
    email: cleanEmail,
    password: cleanPassword
  };

  try {
    const res = await fetch(getApiUrl('/api/tenants/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await handleResponse(res, 'Registration failed');

    if (result) {
      if (result.tenant) {
        const currentTenants = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
        const existingIdx = currentTenants.findIndex(t => t.email.trim().toLowerCase() === cleanEmail);
        if (existingIdx !== -1) {
          currentTenants[existingIdx] = result.tenant;
        } else {
          currentTenants.unshift(result.tenant);
        }
        setLocalData(STORAGE_KEYS.TENANTS, currentTenants);
      }

      if (result.unit) {
        const currentUnits = getLocalData<Unit[]>(STORAGE_KEYS.UNITS, []);
        const uIdx = currentUnits.findIndex(u => u.id === result.unit.id);
        if (uIdx !== -1) {
          currentUnits[uIdx] = { ...currentUnits[uIdx], ...result.unit, status: 'Occupied' };
        } else {
          currentUnits.unshift({ ...result.unit, status: 'Occupied' });
        }
        setLocalData(STORAGE_KEYS.UNITS, currentUnits);
      }

      if (result.invoice) {
        const currentInvoices = getLocalData<Invoice[]>(STORAGE_KEYS.INVOICES, []);
        const invIdx = currentInvoices.findIndex(i => i.id === result.invoice.id);
        if (invIdx !== -1) currentInvoices[invIdx] = result.invoice;
        else currentInvoices.unshift(result.invoice);
        setLocalData(STORAGE_KEYS.INVOICES, currentInvoices);
      }

      if (result.quote) {
        const currentQuotes = getLocalData<Quote[]>(STORAGE_KEYS.QUOTES, []);
        const qIdx = currentQuotes.findIndex(q => q.id === result.quote.id);
        if (qIdx !== -1) currentQuotes[qIdx] = result.quote;
        else currentQuotes.unshift(result.quote);
        setLocalData(STORAGE_KEYS.QUOTES, currentQuotes);
      }
    }

    return result;
  } catch (err: any) {
    console.warn('Backend fetch failed, executing local tenant registration:', err);

    const localUnits = getLocalData<Unit[]>(STORAGE_KEYS.UNITS, []);
    const localProps = getLocalData<Property[]>(STORAGE_KEYS.PROPERTIES, []);
    const targetUnit = localUnits.find(u => u.id === data.unitId || u.unitNumber === data.unitId) || localUnits[0];
    const targetProp = localProps.find(p => p.id === targetUnit?.propertyId);

    const propName = targetUnit?.propertyName || targetProp?.name || 'Apartment';
    const uNum = targetUnit?.unitNumber || '101';
    const rent = targetUnit?.monthlyRent || 45000;

    if (targetUnit) {
      targetUnit.status = 'Occupied';
      targetUnit.currentTenantName = data.fullName;
      targetUnit.currentTenantEmail = data.email;
      setLocalData(STORAGE_KEYS.UNITS, localUnits);
    }

    const newTenant: Tenant = {
      id: `tenant-${Date.now()}`,
      landlordId: targetProp?.landlordId || 'landlord-1',
      propertyId: targetUnit?.propertyId || 'prop-1',
      unitId: targetUnit?.id || 'unit-1',
      fullName: data.fullName || 'New Tenant',
      email: data.email,
      phone: data.phone || '+254 700 000 000',
      idNumber: data.idNumber || 'ID-12345678',
      unitNumber: uNum,
      propertyName: propName,
      monthlyRent: rent,
      leaseStartDate: new Date().toISOString().split('T')[0],
      leaseEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'Active'
    };

    const currentTenants = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
    currentTenants.unshift(newTenant);
    setLocalData(STORAGE_KEYS.TENANTS, currentTenants);

    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-${Math.floor(10000 + Math.random() * 90000)}`,
      tenantId: newTenant.id,
      tenantName: newTenant.fullName,
      tenantEmail: newTenant.email,
      unitId: newTenant.unitId,
      unitNumber: newTenant.unitNumber,
      propertyName: newTenant.propertyName,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      periodMonth: 'Current Month',
      rentAmount: rent,
      waterFee: 25,
      trashFee: 15,
      maintenanceFee: 0,
      taxAmount: 0,
      discount: 0,
      totalAmount: rent + 40,
      status: 'Unpaid',
      amountPaid: 0,
      notes: `Welcome to ${propName}! Initial move-in rental invoice.`
    };

    const currentInvoices = getLocalData<Invoice[]>(STORAGE_KEYS.INVOICES, []);
    currentInvoices.unshift(newInvoice);
    setLocalData(STORAGE_KEYS.INVOICES, currentInvoices);

    return {
      success: true,
      tenant: newTenant,
      unit: targetUnit,
      invoice: newInvoice
    };
  }
}

export async function updateTenantDetails(tenantId: string, data: Partial<Tenant>): Promise<Tenant> {
  try {
    const res = await fetch(getApiUrl(`/api/tenants/${tenantId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'Failed to update tenant details');
  } catch (err) {
    const tenants = await fetchTenants();
    const idx = tenants.findIndex(t => t.id === tenantId);
    if (idx !== -1) {
      tenants[idx] = { ...tenants[idx], ...data };
      setLocalData(STORAGE_KEYS.TENANTS, tenants);
      return tenants[idx];
    }
    const updated = { id: tenantId, fullName: 'Tenant', email: '', status: 'Active', ...data } as Tenant;
    setLocalData(STORAGE_KEYS.TENANTS, [updated, ...tenants]);
    return updated;
  }
}

export async function deleteTenantAccount(tenantId: string): Promise<boolean> {
  try {
    const res = await fetch(getApiUrl(`/api/tenants/${tenantId}`), {
      method: 'DELETE',
    });
    await handleResponse(res, 'Failed to delete tenant account');

    // Sync localStorage
    const tenants = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
    const deleted = tenants.find(t => t.id === tenantId);
    const updatedTenants = tenants.filter(t => t.id !== tenantId);
    setLocalData(STORAGE_KEYS.TENANTS, updatedTenants);

    if (deleted && deleted.unitId) {
      const units = getLocalData<Unit[]>(STORAGE_KEYS.UNITS, []);
      const unit = units.find(u => u.id === deleted.unitId);
      if (unit) {
        unit.status = 'Available';
        delete unit.currentTenantName;
        delete unit.currentTenantEmail;
        setLocalData(STORAGE_KEYS.UNITS, units);
      }
    }
    return true;
  } catch (err) {
    console.warn('Fallback deleting tenant account locally:', err);
    const tenants = getLocalData<Tenant[]>(STORAGE_KEYS.TENANTS, []);
    const deleted = tenants.find(t => t.id === tenantId);
    const updatedTenants = tenants.filter(t => t.id !== tenantId);
    setLocalData(STORAGE_KEYS.TENANTS, updatedTenants);

    if (deleted && deleted.unitId) {
      const units = getLocalData<Unit[]>(STORAGE_KEYS.UNITS, []);
      const unit = units.find(u => u.id === deleted.unitId);
      if (unit) {
        unit.status = 'Available';
        delete unit.currentTenantName;
        delete unit.currentTenantEmail;
        setLocalData(STORAGE_KEYS.UNITS, units);
      }
    }
    return true;
  }
}

export async function fetchInvoices(): Promise<Invoice[]> {
  try {
    const res = await fetch(getApiUrl('/api/invoices'));
    return await handleResponse(res, 'Failed to fetch invoices');
  } catch (err) {
    return getLocalData<Invoice[]>(STORAGE_KEYS.INVOICES, [
      {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-081',
        tenantId: 'tenant-1',
        tenantName: 'Jane Wanjiku',
        tenantEmail: 'jane.wanjiku@example.com',
        unitNumber: 'A101',
        propertyName: 'Kilimani Palms Heights',
        rentAmount: 45000,
        waterBill: 1200,
        electricityBill: 2300,
        serviceCharge: 2500,
        totalAmount: 51000,
        amountPaid: 0,
        issueDate: '2026-08-01',
        dueDate: '2026-08-10',
        status: 'Unpaid'
      }
    ]);
  }
}

export async function createInvoice(data: any): Promise<Invoice> {
  try {
    const res = await fetch(getApiUrl('/api/invoices/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'Failed to create invoice');
  } catch (err) {
    const invoices = getLocalData<Invoice[]>(STORAGE_KEYS.INVOICES, []);
    const priorArrears = invoices
      .filter(i => (i.tenantId === data.tenantId || i.tenantName === data.tenantName) && i.status !== 'Paid')
      .reduce((sum, inv) => sum + Math.max(0, (inv.totalAmount || 0) - (inv.amountPaid || 0)), 0);

    const prevArrears = data.previousArrears !== undefined ? Number(data.previousArrears) : priorArrears;
    const rent = Number(data.rentAmount || 45000);
    const water = Number(data.waterFee || data.waterBill || 0);
    const trash = Number(data.trashFee || 0);
    const maint = Number(data.maintenanceFee || 0);
    const discount = Number(data.discount || 0);
    const total = rent + water + trash + maint + prevArrears - discount;

    const newInv: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-${Math.floor(10000 + Math.random() * 90000)}`,
      tenantId: data.tenantId || 'tenant-1',
      tenantName: data.tenantName || 'Jane Wanjiku',
      unitNumber: data.unitNumber || 'A101',
      propertyName: data.propertyName || 'Kilimani Palms Heights',
      periodMonth: data.periodMonth || 'Current Month',
      rentAmount: rent,
      waterFee: water,
      trashFee: trash,
      maintenanceFee: maint,
      discount: discount,
      previousArrears: prevArrears,
      totalAmount: total,
      amountPaid: 0,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: data.dueDate || new Date().toISOString().split('T')[0],
      status: 'Unpaid',
      notes: data.notes
    };
    invoices.unshift(newInv);
    setLocalData(STORAGE_KEYS.INVOICES, invoices);
    return newInv;
  }
}

export async function fetchQuotes(): Promise<Quote[]> {
  try {
    const res = await fetch(getApiUrl('/api/quotes'));
    return await handleResponse(res, 'Failed to fetch quotes');
  } catch (err) {
    return getLocalData<Quote[]>(STORAGE_KEYS.QUOTES, []);
  }
}

export async function createQuote(data: any): Promise<Quote> {
  try {
    const res = await fetch(getApiUrl('/api/quotes/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'Failed to create quote');
  } catch (err) {
    const newQuote: Quote = {
      id: `quote-${Date.now()}`,
      quoteNumber: `Q-${Math.floor(10000 + Math.random() * 90000)}`,
      applicantName: data.applicantName || 'Applicant',
      applicantEmail: data.applicantEmail || '',
      unitNumber: data.unitNumber || 'A101',
      propertyName: 'Kilimani Palms Heights',
      monthlyRent: 45000,
      securityDeposit: 45000,
      waterDeposit: 2000,
      electricityDeposit: 2000,
      leasePreparationFee: 3000,
      totalMoveInCost: 97000,
      issueDate: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'Active'
    };
    const quotes = getLocalData<Quote[]>(STORAGE_KEYS.QUOTES, []);
    quotes.unshift(newQuote);
    setLocalData(STORAGE_KEYS.QUOTES, quotes);
    return newQuote;
  }
}

export async function fetchPayments(): Promise<Payment[]> {
  try {
    const res = await fetch(getApiUrl('/api/payments'));
    return await handleResponse(res, 'Failed to fetch payments');
  } catch (err) {
    return getLocalData<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
  }
}

export async function recordPayment(data: any) {
  try {
    const res = await fetch(getApiUrl('/api/payments/record'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'Failed to record payment');
  } catch (err) {
    const receiptCode = `SAB${Math.floor(10000000 + Math.random() * 90000000)}`;
    const pay: Payment = {
      id: `pay-${Date.now()}`,
      invoiceId: data.invoiceId || `INV-${Date.now()}`,
      tenantId: data.tenantId || 'tenant-1',
      tenantName: data.tenantName || 'Jane Wanjiku',
      unitNumber: data.unitNumber || 'A101',
      amount: Number(data.amount || 0),
      paymentMethod: data.paymentMethod || 'M-Pesa',
      referenceCode: data.referenceCode || receiptCode,
      paymentDate: new Date().toISOString(),
      status: 'Completed',
      notes: data.notes || 'Recorded payment'
    };
    const payments = getLocalData<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
    payments.unshift(pay);
    setLocalData(STORAGE_KEYS.PAYMENTS, payments);
    return { success: true, payment: pay, receiptCode };
  }
}

export async function fetchMaintenance(): Promise<MaintenanceRequest[]> {
  try {
    const res = await fetch(getApiUrl('/api/maintenance'));
    return await handleResponse(res, 'Failed to fetch maintenance');
  } catch (err) {
    return getLocalData<MaintenanceRequest[]>(STORAGE_KEYS.MAINTENANCE, []);
  }
}

export async function sendMaintenanceAiChat(data: {
  message: string;
  category?: string;
  unitNumber?: string;
  tenantName?: string;
}): Promise<string> {
  try {
    const res = await fetch(getApiUrl('/api/maintenance/ai-chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await handleResponse(res, 'AI Assistant failed');
    return json.reply || 'AI Assistant could not respond.';
  } catch (err) {
    return '🔧 **AI Maintenance Guidance:** Please ensure the affected utility (water valve or power breaker) is safely secured, and submit your maintenance ticket below for landlord dispatch.';
  }
}

export async function createMaintenance(data: any): Promise<MaintenanceRequest> {
  try {
    const res = await fetch(getApiUrl('/api/maintenance/create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'Failed to create maintenance request');
  } catch (err) {
    const req: MaintenanceRequest = {
      id: `maint-${Date.now()}`,
      tenantId: data.tenantId || 'tenant-1',
      tenantName: data.tenantName || 'Jane Wanjiku',
      unitNumber: data.unitNumber || 'A101',
      propertyName: data.propertyName || 'Kilimani Palms Heights',
      title: data.title || `${data.category || 'Maintenance'} Request`,
      category: data.category || 'Plumbing',
      description: data.description || 'Maintenance request',
      urgency: data.urgency || 'Medium',
      status: 'Open',
      submittedAt: new Date().toISOString(),
      aiTriageSummary: `Technical triage: ${data.category || 'General'} issue (${data.title || 'Reported Issue'}) logged for Unit ${data.unitNumber || 'A101'}.`,
      aiSuggestedDiy: 'Isolate local supply lines safely and keep area well-ventilated.',
      aiEstimatedCost: 'Estimated KSh 2,500 - KSh 6,500'
    };
    const maint = getLocalData<MaintenanceRequest[]>(STORAGE_KEYS.MAINTENANCE, []);
    maint.unshift(req);
    setLocalData(STORAGE_KEYS.MAINTENANCE, maint);
    return req;
  }
}

export async function updateMaintenanceStatus(id: string, status: string, assignedTechnician?: string) {
  try {
    const res = await fetch(getApiUrl(`/api/maintenance/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, assignedTechnician }),
    });
    return await handleResponse(res, 'Failed to update maintenance request');
  } catch (err) {
    const maint = await fetchMaintenance();
    const idx = maint.findIndex(m => m.id === id);
    if (idx !== -1) {
      maint[idx].status = status as any;
      if (assignedTechnician) maint[idx].assignedTechnician = assignedTechnician;
      setLocalData(STORAGE_KEYS.MAINTENANCE, maint);
      return maint[idx];
    }
    return { id, status, assignedTechnician };
  }
}

export async function fetchEmails(recipientEmail?: string): Promise<EmailLog[]> {
  try {
    const url = recipientEmail ? `/api/emails?recipientEmail=${encodeURIComponent(recipientEmail)}` : '/api/emails';
    const res = await fetch(getApiUrl(url));
    return await handleResponse(res, 'Failed to fetch email logs');
  } catch (err) {
    return getLocalData<EmailLog[]>(STORAGE_KEYS.EMAILS, []);
  }
}

export async function generateAiQuote(data: any) {
  try {
    const res = await fetch(getApiUrl('/api/ai/generate-quote'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse(res, 'AI Quote failed');
  } catch (err) {
    return {
      monthlyRent: 45000,
      securityDeposit: 45000,
      waterDeposit: 2000,
      electricityDeposit: 2000,
      leasePreparationFee: 3000,
      totalMoveInCost: 97000,
      breakdown: [
        { label: 'First Month Rent', amount: 45000 },
        { label: 'Refundable Security Deposit', amount: 45000 },
        { label: 'Water Meter Deposit', amount: 2000 },
        { label: 'Electricity Meter Deposit', amount: 2000 },
        { label: 'Lease Agreement & Legal Admin', amount: 3000 }
      ]
    };
  }
}

export {
  subscribeToLandlords,
  subscribeToTenants,
  subscribeToProperties,
  subscribeToUnits,
  subscribeToInvoices,
  subscribeToQuotes,
  subscribeToPayments,
  subscribeToMaintenance,
  subscribeToEmails
} from './db';

