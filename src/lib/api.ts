/**
 * EstateMaster API client.
 *
 * SECURITY MODEL
 *  - The server is the only source of truth. This module never reads or writes business data in
 *    localStorage / Firestore and never "falls back" to fabricated local records or local logins.
 *  - Authentication is an opaque bearer token issued by POST /api/auth/login. It is kept in memory and in
 *    sessionStorage (cleared when the app/tab closes), never in localStorage.
 *  - A 401 from the server clears the session and notifies the app (see onSessionExpired).
 *
 * The exported function names are unchanged from the previous client so existing screens keep working.
 */
import type {
  Property, Unit, Tenant, Invoice, Quote, Payment, MaintenanceRequest, EmailLog, Landlord,
  SecurityLog, SecurityStatus, FinancialAuditEntry, UnaccountedPayment, BankStatementRecord
} from '../types';

// ===========================================================================
// Server location
// ===========================================================================
export const DEFAULT_PRODUCTION_API_URL = 'https://ais-pre-ezkstodggizsdniqekt6v3-227270690811.europe-west1.run.app';

export interface ServerStatusInfo {
  connected: boolean;
  latencyMs: number;
  message: string;
  serverTime?: string;
  emailConfigured?: boolean;
  emailProvider?: string;
}

const API_URL_KEY = 'estatemaster_api_url';
/** Minimum server API version this app works with (see /api/health). Version 2 = bearer-token server. */
const REQUIRED_API_VERSION = 2;

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
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

/** Only HTTPS servers (or a local development host) may be configured: tokens must never travel in clear text. */
function isAcceptableServerUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '10.0.2.2'].includes(u.hostname);
  } catch {
    return false;
  }
}

export function getServerConfig() {
  const customUrl = safeStorage('local')?.getItem(API_URL_KEY) || '';
  return {
    currentUrl: customUrl,
    activeEndpoint: getApiBaseUrl(),
    isCustom: Boolean(customUrl),
    isCapacitor: isCapacitorPlatform()
  };
}

export function setServerUrl(url: string) {
  const store = safeStorage('local');
  if (!store) return;
  const trimmed = url.trim().replace(/\/$/, '');
  if (!trimmed) { store.removeItem(API_URL_KEY); return; }
  if (!isAcceptableServerUrl(trimmed)) {
    throw new Error('The server address must start with https:// (http:// is only allowed for localhost during development).');
  }
  store.setItem(API_URL_KEY, trimmed);
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = safeStorage('local')?.getItem(API_URL_KEY);
    if (custom && isAcceptableServerUrl(custom)) return custom.replace(/\/$/, '');

    const isLocalhostHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isCapacitor =
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:' ||
      (isLocalhostHost && window.location.port !== '3000' && window.location.port !== '5173') ||
      (typeof navigator !== 'undefined' && !!navigator.userAgent && /android|capacitor/i.test(navigator.userAgent));
    if (isCapacitor) {
      const fromEnv = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
      return (fromEnv || DEFAULT_PRODUCTION_API_URL).replace(/\/$/, '');
    }
  }
  const fromEnv = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
  return fromEnv ? fromEnv.replace(/\/$/, '') : '';
}

export function getApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}

export async function testServerConnection(targetUrl?: string): Promise<ServerStatusInfo> {
  const base = (targetUrl !== undefined ? targetUrl.trim().replace(/\/$/, '') : getApiBaseUrl());
  if (base && !isAcceptableServerUrl(base)) {
    return { connected: false, latencyMs: 0, message: 'The server address must start with https://.' };
  }
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${base}/api/health`, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    const latency = Date.now() - started;
    if (!res.ok) return { connected: false, latencyMs: latency, message: `The address answered with HTTP ${res.status}, so it is not a working EstateMaster server.` };
    const data: any = await res.json().catch(() => null);
    if (!data || data.status !== 'ok') {
      return { connected: false, latencyMs: latency, message: 'That address answered, but it is not an EstateMaster server. Check the address.' };
    }
    if (Number(data.apiVersion || 1) < REQUIRED_API_VERSION) {
      return { connected: false, latencyMs: latency, message: 'This server is running an older EstateMaster version that this app cannot use. Deploy the updated server, then test again.' };
    }
    let emailConfigured = false;
    let emailProvider = 'none';
    try {
      const er = await fetch(`${base}/api/email/status`, { cache: 'no-store' });
      if (er.ok) { const ed = await er.json(); emailConfigured = Boolean(ed.isConfigured); emailProvider = ed.providerType || 'none'; }
    } catch { /* optional */ }
    return { connected: true, latencyMs: latency, message: 'Server connection verified and active.', serverTime: data.time || new Date().toISOString(), emailConfigured, emailProvider };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - started,
      message: err?.name === 'AbortError'
        ? 'Connection timed out after 6 seconds. The server may be asleep, offline or the address may be wrong.'
        : 'Cannot reach this address. The server may be offline or private (requires a Google sign-in), or the address may be wrong.'
    };
  }
}

/** Host name of the server the app is currently talking to (empty when it uses the page's own origin). */
function currentServerHost(): string {
  try {
    const base = getApiBaseUrl();
    return base ? new URL(base).host : '';
  } catch { return ''; }
}

// ===========================================================================
// Session token + request core
// ===========================================================================
const TOKEN_KEY = 'em_session_token';
let memoryToken: string | null = null;
const expiryListeners = new Set<(reason: string) => void>();

export function getSessionToken(): string | null {
  if (memoryToken) return memoryToken;
  try { memoryToken = safeStorage('session')?.getItem(TOKEN_KEY) || null; } catch { memoryToken = null; }
  return memoryToken;
}

export function setSessionToken(token: string | null) {
  memoryToken = token;
  try {
    const s = safeStorage('session');
    if (!s) return;
    if (token) s.setItem(TOKEN_KEY, token); else s.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable: the in-memory token still works */ }
}

export function isSignedIn(): boolean { return Boolean(getSessionToken()); }

/** Subscribe to "your session ended" events (401 from the server). Returns an unsubscribe function. */
export function onSessionExpired(cb: (reason: string) => void): () => void {
  expiryListeners.add(cb);
  return () => { expiryListeners.delete(cb); };
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = data?.code;
    this.data = data || {};
  }
  get requiresVerification(): boolean | undefined { return this.data?.requiresVerification; }
  get incorrectPassword(): boolean | undefined { return this.data?.incorrectPassword; }
  get invalidOtp(): boolean | undefined { return this.data?.invalidOtp; }
  get changedFields(): string[] | undefined { return this.data?.changedFields; }
  get landlordEmailMasked(): string | undefined { return this.data?.landlordEmailMasked; }
}

interface RequestOptions {
  /** Do not treat a 401 as "session expired" (e.g. the login call itself). */
  anonymous?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function request<T = any>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getSessionToken();
  if (token && !opts.anonymous) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  if (opts.signal) opts.signal.addEventListener('abort', () => controller.abort(), { once: true });

  let res: Response;
  try {
    res = await fetch(getApiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: 'no-store' });
  } catch (err: any) {
    const host = currentServerHost();
    throw new ApiError(err?.name === 'AbortError'
      ? 'The server took too long to respond. Please try again.'
      : `Cannot reach the EstateMaster server${host ? ` (${host})` : ''}. Check your internet connection, or open Server settings to check the server address.`, 0);
  } finally {
    clearTimeout(timer);
  }

  let data: any = null;
  const text = await res.text().catch(() => '');
  if (text) { try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; } }

  if (!res.ok) {
    if (res.status === 401 && !opts.anonymous && token) {
      setSessionToken(null);
      expiryListeners.forEach((cb) => { try { cb(data?.error || 'Your session has ended. Please sign in again.'); } catch { /* listener errors must not break the call */ } });
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  }
  return data as T;
}

const get = <T = any>(path: string, o?: RequestOptions) => request<T>('GET', path, undefined, o);
const post = <T = any>(path: string, body?: unknown, o?: RequestOptions) => request<T>('POST', path, body ?? {}, o);
const patch = <T = any>(path: string, body?: unknown, o?: RequestOptions) => request<T>('PATCH', path, body ?? {}, o);
const del = <T = any>(path: string, o?: RequestOptions) => request<T>('DELETE', path, undefined, o);

// ===========================================================================
// Authentication
// ===========================================================================
export interface LoginResponse {
  success?: boolean;
  requires2FA?: boolean;
  tempToken?: string;
  emailMasked?: string;
  phoneMasked?: string;
  message?: string;
  role?: 'tenant' | 'landlord';
  user?: Tenant | Landlord;
  sessionToken?: string;
  sessionId?: string;
  mustChangePassword?: boolean;
  isLocked?: boolean;
  remainingSeconds?: number;
  remainingAttempts?: number;
  error?: string;
}

/** Normalises the server's login payloads (including lock-outs) into one shape; never throws for 401/429. */
async function loginRequest(path: string, body: unknown): Promise<LoginResponse> {
  try {
    const r = await post<LoginResponse>(path, body, { anonymous: true });
    if (r.sessionToken) setSessionToken(r.sessionToken);
    return r;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 429)) {
      return { success: false, error: err.message, message: err.message, isLocked: Boolean(err.data?.isLocked), remainingSeconds: err.data?.remainingSeconds, remainingAttempts: err.data?.remainingAttempts };
    }
    throw err;
  }
}

export async function loginUser(email: string, password?: string, role?: 'tenant' | 'landlord'): Promise<LoginResponse> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !password) throw new Error('Email and password are required.');
  // Signing in as someone else ends the previous session on the server too (best effort).
  const previous = getSessionToken();
  setSessionToken(null);
  if (previous) {
    fetch(getApiUrl('/api/auth/logout'), { method: 'POST', headers: { Authorization: `Bearer ${previous}`, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => undefined);
  }
  return loginRequest('/api/auth/login', { email: cleanEmail, password, role });
}

export async function verify2FaLogin(tempToken: string, otp?: string, _password?: string): Promise<LoginResponse> {
  return loginRequest('/api/auth/2fa/verify', { tempToken, otp: (otp || '').replace(/\s+/g, '') });
}

export async function resend2FaOtp(tempToken: string): Promise<{ success: boolean; message: string }> {
  return post('/api/auth/2fa/resend', { tempToken }, { anonymous: true });
}

export async function fetchMe(): Promise<{ role: 'landlord' | 'tenant'; user: Landlord | Tenant; mustChangePassword: boolean; sessionId: string }> {
  return get('/api/auth/me');
}

export async function logoutUser(): Promise<void> {
  try { if (getSessionToken()) await post('/api/auth/logout', {}); } catch { /* the token is dropped locally regardless */ }
  setSessionToken(null);
}

export async function requestPasswordReset(email: string): Promise<{ resetToken: string; message: string }> {
  return post('/api/auth/forgot-password', { email: (email || '').trim().toLowerCase() }, { anonymous: true });
}

export async function resetPassword(resetToken: string, otp: string, newPassword: string): Promise<{ success: boolean; message: string; resetToken?: string; newCodeSent?: boolean }> {
  return post('/api/auth/reset-password', { resetToken, otp: otp.replace(/\s+/g, ''), newPassword }, { anonymous: true });
}

export async function toggleTwoFactorAuth(
  _userId: string, _role: 'landlord' | 'tenant', enable: boolean, currentPassword?: string
): Promise<{ success: boolean; twoFactorEnabled: boolean; securityScore: number; message: string }> {
  return post('/api/auth/2fa/toggle', { enable: Boolean(enable), currentPassword });
}

export async function changeUserPassword(
  _userId: string, _role: 'landlord' | 'tenant', currentPassword: string, newPassword: string
): Promise<{ success: boolean; securityScore: number; message: string }> {
  return post('/api/auth/change-password', { currentPassword, newPassword });
}

export async function requestStepUpChallenge(_userId: string, _role: 'landlord' | 'tenant', action: string): Promise<{ challengeId: string; emailMasked: string; message: string }> {
  return post('/api/auth/step-up-challenge', { action });
}

export async function verifyStepUpCode(challengeId: string, otp: string): Promise<{ verified: boolean; message: string; grant?: string }> {
  return post('/api/auth/step-up-verify', { challengeId, otp });
}

export async function fetchSecurityStatus(userId: string): Promise<SecurityStatus> {
  return get(`/api/security/status/${encodeURIComponent(userId)}`);
}

export async function fetchSecurityLogs(_userId?: string, _email?: string): Promise<SecurityLog[]> {
  return get('/api/security/logs');
}

export async function revokeUserSession(sessionId: string): Promise<{ success: boolean; message: string }> {
  return post('/api/auth/sessions/revoke', { sessionId });
}

export async function revokeAllOtherSessions(_userId?: string, _currentSessionId?: string): Promise<{ success: boolean; message: string }> {
  return post('/api/auth/sessions/revoke', { revokeAllOther: true });
}

// ===========================================================================
// Landlord account
// ===========================================================================
export async function fetchLandlords(): Promise<Landlord[]> {
  return get('/api/landlords');
}

export async function updateLandlordDetails(
  landlordId: string,
  data: Partial<Landlord>,
  authVerification?: { confirmationPassword?: string; otp?: string; challengeId?: string; callerRole?: string }
): Promise<Landlord> {
  const { confirmationPassword, otp, challengeId } = authVerification || {};
  return patch(`/api/landlords/${encodeURIComponent(landlordId)}`, { ...data, confirmationPassword, otp, challengeId });
}

export async function requestFinancialOtp(landlordId: string): Promise<{ challengeId: string; emailMasked: string; phoneMasked: string; message: string }> {
  return post(`/api/landlords/${encodeURIComponent(landlordId)}/request-financial-otp`, {});
}

export async function fetchFinancialAuditLog(landlordId: string): Promise<{ auditTrail: FinancialAuditEntry[]; lastFinancialUpdateAt?: string; lastFinancialUpdatedBy?: string }> {
  return get(`/api/landlords/${encodeURIComponent(landlordId)}/financial-audit-log`);
}

export interface LandlordRegistrationResult {
  landlord: Landlord;
  receiptCode: string;
  message: string;
  sessionToken?: string;
  subscription?: { amount: number; reference: string; status: string };
}

/** Creates the account (status "Pending Payment") and signs the new landlord in so they can pay the licence. */
export async function registerLandlordAccount(data: any): Promise<LandlordRegistrationResult> {
  if (!data?.password) throw new Error('A secure password is required to create a landlord account.');
  const r = await post<LandlordRegistrationResult>('/api/landlords/register', { ...data, email: String(data.email || '').trim().toLowerCase() }, { anonymous: true });
  if (r.sessionToken) setSessionToken(r.sessionToken);
  return r;
}

// ===========================================================================
// Subscription + M-Pesa
// ===========================================================================
export interface SubscriptionInstructions {
  amount: number;
  reference: string;
  accountName: string;
  channels: { equity?: { paybill: string }; kcb?: { paybill: string }; coop?: { account: string } };
  note: string;
}
export async function fetchSubscriptionInstructions(): Promise<SubscriptionInstructions> {
  return get('/api/banks/subscription-instructions');
}

/** The licence fee is fixed on the server; only the payer's phone is sent. */
export async function triggerSubscriptionStkPush(data: { phone: string; landlordId?: string; amount?: number }) {
  return post('/api/mpesa/subscription-stk-push', { phone: data.phone });
}

export async function triggerMpesaStkPush(data: { phone: string; amount: number; invoiceId?: string; [k: string]: any }) {
  return post('/api/mpesa/stk-push', { phone: data.phone, amount: data.amount, invoiceId: data.invoiceId });
}

export interface MpesaStkStatus {
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  resultDesc?: string;
  receiptCode?: string;
  payment?: Payment;
  message?: string;
  amount?: number;
  phone?: string;
}
export async function queryMpesaStkStatus(checkoutRequestId: string): Promise<MpesaStkStatus> {
  return get(`/api/mpesa/query/${encodeURIComponent(checkoutRequestId)}`);
}
export const queryMpesaStkPushStatus = queryMpesaStkStatus;

export async function fetchMpesaConfigStatus(): Promise<{
  configured: boolean; environment: string; shortcode: string; hasPasskey: boolean; hasCallbackUrl: boolean;
  liveTokenConnected: boolean; platformBeneficiary: { phone: string; name: string }; message: string;
}> {
  try {
    return await get('/api/mpesa/config-status');
  } catch (err: any) {
    return { configured: false, environment: 'unknown', shortcode: '', hasPasskey: false, hasCallbackUrl: false, liveTokenConnected: false, platformBeneficiary: { phone: '', name: '' }, message: err?.message || 'Could not read M-Pesa status.' };
  }
}

/** Landlord helper: has this M-Pesa code already reached the ledger? (Never creates a payment.) */
export async function verifyMpesaReceiptCode(data: { receiptCode: string; [k: string]: any }): Promise<{ success: boolean; message: string; payment?: Payment; status?: string }> {
  return post('/api/mpesa/verify-receipt', { receiptCode: data.receiptCode });
}

// ===========================================================================
// Bank rails: live verification, status, receipts
// ===========================================================================
export type BankRail = 'equity' | 'kcb' | 'coop' | 'pesalink' | 'mpesa';

export interface VerificationStep { key: string; label: string; status: 'done' | 'active' | 'pending' | 'failed' | 'skipped'; at?: string; detail?: string }
export interface BankVerification {
  id: string;
  status: 'checking' | 'verified' | 'pending' | 'awaiting-landlord' | 'rejected' | 'timed-out';
  message: string;
  steps: VerificationStep[];
  bank: BankRail;
  reference: string;
  invoiceId: string;
  paymentId?: string;
  attempts: number;
  createdAt: string;
  lastCheckedAt: string;
}
export const isVerificationFinal = (v: Pick<BankVerification, 'status'>) => ['verified', 'rejected', 'timed-out'].includes(v.status);

/** Ask the server to confirm a bank/M-Pesa reference against the ledger and the bank itself. Nothing is posted unless the bank confirms it. */
export async function verifyBankTransaction(input: { bank: BankRail; reference: string; invoiceId: string }): Promise<BankVerification> {
  try {
    return await post<BankVerification>('/api/banks/verify-transaction', input);
  } catch (err) {
    // A "rejected" verification arrives as HTTP 409 with the record in the body: surface it as data, not as a crash.
    if (err instanceof ApiError && err.status === 409 && err.data?.steps) return err.data as BankVerification;
    throw err;
  }
}

export async function fetchBankVerification(id: string): Promise<BankVerification> {
  return get(`/api/banks/verifications/${encodeURIComponent(id)}`);
}

/**
 * Polls a verification until it is final (verified / rejected / timed-out) or the caller aborts.
 * `onUpdate` receives every snapshot so the UI can render live progress.
 */
export async function pollBankVerification(
  id: string,
  onUpdate: (v: BankVerification) => void,
  opts: { intervalMs?: number; maxMs?: number; signal?: AbortSignal } = {}
): Promise<BankVerification> {
  const interval = opts.intervalMs ?? 4000;
  const deadline = Date.now() + (opts.maxMs ?? 5 * 60_000);
  let last = await fetchBankVerification(id);
  onUpdate(last);
  while (!isVerificationFinal(last) && Date.now() < deadline && !opts.signal?.aborted) {
    await new Promise((r) => setTimeout(r, interval));
    if (opts.signal?.aborted) break;
    last = await fetchBankVerification(id);
    onUpdate(last);
  }
  return last;
}

export interface BankStatusResponse {
  banks: Record<string, { label: string; configured?: boolean; oauthHandshake?: boolean; webhookSecurityConfigured?: boolean; liveTransactionQuery?: boolean; balanceQuery?: boolean; available?: boolean; latencyMs?: number; error?: string; note?: string }>;
  balances?: Record<string, any>;
  environment?: string;
  checkedAt: string;
}
export async function fetchBankStatus(fresh = false): Promise<BankStatusResponse> {
  return get(`/api/banks/status${fresh ? '?fresh=1' : ''}`);
}

export interface BankRailsResponse {
  landlord: Partial<Landlord> | null;
  platform: { equityPaybill?: string; kcbPaybill?: string; coopAccount?: string };
}
export async function fetchBankRails(): Promise<BankRailsResponse> {
  return get('/api/banks/rails');
}

/** PDFs need the bearer token, so they are fetched as a blob and handed to the browser. */
async function fetchPdfBlob(path: string): Promise<Blob> {
  const token = getSessionToken();
  const res = await fetch(getApiUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new ApiError(j?.error || `Could not download the document (${res.status})`, res.status, j);
  }
  return res.blob();
}

export async function downloadReceiptPdf(paymentId: string, filename = 'EstateMaster_Receipt.pdf'): Promise<void> {
  saveBlob(await fetchPdfBlob(`/api/payments/${encodeURIComponent(paymentId)}/receipt-pdf`), filename);
}

export async function downloadStatementPdf(tenantId: string, paymentId?: string, filename = 'EstateMaster_Statement.pdf'): Promise<void> {
  const q = paymentId ? `?paymentId=${encodeURIComponent(paymentId)}` : '';
  saveBlob(await fetchPdfBlob(`/api/tenants/${encodeURIComponent(tenantId)}/statement-pdf${q}`), filename);
}

function saveBlob(blob: Blob, filename: string) {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ===========================================================================
// Properties / units / tenants
// ===========================================================================
export async function fetchProperties(): Promise<Property[]> { return get('/api/properties'); }
export async function createProperty(data: Partial<Property>): Promise<Property> { return post('/api/properties', data); }
export async function updatePropertyDetails(propertyId: string, data: Partial<Property>): Promise<Property> { return patch(`/api/properties/${encodeURIComponent(propertyId)}`, data); }
export async function deleteProperty(propertyId: string): Promise<void> { await del(`/api/properties/${encodeURIComponent(propertyId)}`); }

/** Signed-in users get their own units; visitors see only the public vacancy list. */
export async function fetchUnits(): Promise<Unit[]> {
  if (!isSignedIn()) return (await fetchPublicVacancies()).units;
  return get('/api/units');
}
export async function fetchPublicVacancies(): Promise<{ units: Unit[]; properties: Property[] }> {
  return get('/api/public/vacancies', { anonymous: true });
}
export async function createUnit(data: Partial<Unit>): Promise<Unit> { return post('/api/units', data); }

export async function fetchTenants(): Promise<Tenant[]> { return get('/api/tenants'); }
export async function registerTenant(data: any): Promise<any> {
  return post('/api/tenants/register', { ...data, email: String(data?.email || '').trim().toLowerCase() }, { anonymous: !isSignedIn() });
}
export async function updateTenantDetails(tenantId: string, data: Partial<Tenant>): Promise<Tenant> { return patch(`/api/tenants/${encodeURIComponent(tenantId)}`, data); }
export async function deleteTenantAccount(tenantId: string): Promise<boolean> { await del(`/api/tenants/${encodeURIComponent(tenantId)}`); return true; }

// ===========================================================================
// Invoices, quotes
// ===========================================================================
export async function fetchInvoices(): Promise<Invoice[]> { return get('/api/invoices'); }
export async function createInvoice(data: any): Promise<Invoice> { return post('/api/invoices/generate', data); }
export async function sendInvoiceEmail(invoiceId: string, _recipientEmail?: string): Promise<{
  success: boolean; serialNumber: string; recipientEmail: string; externalDelivered: boolean; invoice?: Invoice; message?: string;
}> {
  // The server always uses the tenant's registered address (the endpoint is not a mail relay).
  return post(`/api/invoices/${encodeURIComponent(invoiceId)}/send-email`, {});
}
export async function fetchQuotes(): Promise<Quote[]> { return get('/api/quotes'); }
export async function createQuote(data: any): Promise<Quote> { return post('/api/quotes/generate', data); }

// ===========================================================================
// Payments & the unaccounted queue
// ===========================================================================
export async function fetchPayments(): Promise<Payment[]> { return get('/api/payments'); }

/**
 * LANDLORD ONLY. Records cash or a reference the landlord vouches for. Tenants cannot record payments:
 * they use verifyBankTransaction() / M-Pesa STK and the server posts the payment once the provider confirms.
 */
export async function recordPayment(data: {
  invoiceId: string; amount: number; paymentMethod: Payment['paymentMethod']; referenceCode?: string; notes?: string; paymentDate?: string; [k: string]: any;
}): Promise<{ success: boolean; payment: Payment; invoice?: Invoice; receiptCode: string; message?: string }> {
  return post('/api/payments/record', {
    invoiceId: data.invoiceId, amount: data.amount, paymentMethod: data.paymentMethod,
    referenceCode: data.referenceCode, notes: data.notes, paymentDate: data.paymentDate
  });
}

export async function reversePayment(paymentId: string, reason: string, confirmationPassword: string): Promise<{ success: boolean; payment?: Payment; message?: string }> {
  return post(`/api/payments/${encodeURIComponent(paymentId)}/reverse`, { reason, confirmationPassword });
}

export async function fetchUnaccountedPayments(): Promise<UnaccountedPayment[]> { return get('/api/payments/unaccounted'); }

export async function assignUnaccountedPayment(
  unaccountedId: string, tenantId: string, invoiceId?: string, notes?: string
): Promise<{ payment: Payment; invoice?: Invoice; unaccounted?: UnaccountedPayment; message?: string }> {
  return post(`/api/payments/unaccounted/${encodeURIComponent(unaccountedId)}/assign`, { tenantId, invoiceId, notes });
}

export async function ignoreUnaccountedPayment(unaccountedId: string, reason?: string): Promise<{ success: boolean; message?: string }> {
  return post(`/api/payments/unaccounted/${encodeURIComponent(unaccountedId)}/ignore`, { reason });
}

export interface ReconcileRowResult { referenceCode: string; outcome: 'posted' | 'queued' | 'duplicate' | 'rejected' | 'ignored' | string; reason: string; paymentId?: string; unaccountedId?: string; matchMethod?: string; confidence?: number }
export interface ReconcileStatementResponse {
  results: ReconcileRowResult[];
  newPayments: Payment[];
  summary: { posted: number; queued: number; duplicate: number; rejected: number };
}

/** The SERVER matches, posts (once per reference) and queues the leftovers. The client only supplies statement rows. */
export async function reconcileStatement(rows: Array<{
  referenceCode: string; amount: number; date?: string; description?: string; bankName?: string; senderPhone?: string; senderName?: string; invoiceId?: string;
}>): Promise<ReconcileStatementResponse> {
  return post('/api/payments/reconcile-statement', { records: rows });
}

/** Compatibility wrapper for the reconciler UI: rows the landlord pinned to an invoice are posted; the rest are matched/queued by the server. */
export async function batchReconcileBankRecords(records: BankStatementRecord[]): Promise<{ reconciledCount: number; newPayments: Payment[]; results: ReconcileRowResult[]; summary: ReconcileStatementResponse['summary'] }> {
  const r = await reconcileStatement(records.filter((x) => !x.isReconciled).map((x) => ({
    referenceCode: x.referenceCode, amount: x.amount, date: x.date, description: x.description, bankName: x.bankName, invoiceId: x.matchedInvoiceId
  })));
  return { reconciledCount: r.summary.posted, newPayments: r.newPayments, results: r.results, summary: r.summary };
}

// ===========================================================================
// Maintenance, e-mail, AI
// ===========================================================================
export async function fetchMaintenance(): Promise<MaintenanceRequest[]> { return get('/api/maintenance'); }
export async function createMaintenance(data: any): Promise<MaintenanceRequest> { return post('/api/maintenance/create', data); }
export async function updateMaintenanceStatus(
  id: string, status: string, assignedTechnician?: string, extra?: { cost?: number; isBilled?: boolean; billedToInvoiceId?: string }
): Promise<MaintenanceRequest> {
  // Billing flags are server-controlled; only status, technician and cost are accepted from the client.
  return patch(`/api/maintenance/${encodeURIComponent(id)}`, { status, assignedTechnician, cost: extra?.cost });
}
export async function sendMaintenanceAiChat(data: { message: string; category?: string; unitNumber?: string; tenantName?: string }): Promise<string> {
  const r = await post<{ reply: string }>('/api/maintenance/ai-chat', { message: data.message, category: data.category });
  return r.reply;
}

export async function fetchEmails(_recipientEmail?: string): Promise<EmailLog[]> { return get('/api/emails'); }
export async function generateAiQuote(data: any) { return post('/api/ai/generate-quote', data); }
export async function sendTestEmail(_recipientEmail?: string, _recipientName?: string): Promise<{ success: boolean; serialNumber: string; externalDelivered: boolean; message: string }> {
  // Always delivered to the signed-in landlord's own address.
  return post('/api/email/send-test', {});
}
