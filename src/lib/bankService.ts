/**
 * Kenyan bank integration layer (server-side).
 *
 *   - Equity Bank  : Jenga API (OAuth2 token, IPN webhook, balance / statement / transaction query)
 *   - KCB Bank     : KCB Buni (OAuth2 token, IPN webhook "instant-payment-notification")
 *   - Co-op Bank   : Co-op Open API (OAuth2 token, account-notification webhook, transactions inquiry)
 *   - PesaLink     : IPSL interbank credits (arrive via the receiving bank or an aggregator)
 *   - M-Pesa       : Daraja callbacks are normalised to the same model
 *
 * Everything is mapped to ONE internal model (NormalizedBankTxn) which feeds the payment
 * ledger. This file is pure logic + HTTP drivers: no database access, no Express. That makes
 * the security-critical parts (signature verification, normalisation, matching) unit-testable.
 *
 * IMPORTANT - what is verified and what must be confirmed with each bank
 * ----------------------------------------------------------------------
 * Bank APIs are gated behind merchant onboarding; exact credentials, base URLs, endpoint paths
 * and the webhook signing recipe are issued per merchant. Defaults below follow the public
 * documentation / SDKs where available (Jenga token endpoints, KCB Buni IPN field list and
 * `Signature` header, Co-op base hosts). Anything that varies per merchant is configurable via
 * environment variables (see .env.example) and flagged "CONFIRM" in comments.
 */
import crypto from 'crypto';

export type BankId = 'equity' | 'kcb' | 'coop' | 'pesalink';
export type RailId = BankId | 'mpesa';

// ===========================================================================
// 1. Canonical model ("Payment entity" for every inbound rail)
// ===========================================================================
export interface NormalizedBankTxn {
  /** Rail that delivered / confirmed the money. */
  bank: RailId;
  /** Provider-unique transaction reference. The anti-double-entry key. */
  reference: string;
  amount: number; // major units (KES)
  currency: string; // ISO 4217
  direction: 'credit' | 'debit';
  status: 'success' | 'pending' | 'failed';
  /** BANK_TRANSFER | PESALINK | PAYBILL | TILL | EQUITEL | MPESA | CARD | ... */
  channel: string;
  narration: string;
  /** Account / bill reference the payer typed (the best matching signal). */
  customerReference: string;
  payerName?: string;
  payerPhone?: string; // normalised 2547XXXXXXXX when possible
  payerAccount?: string;
  /** Collection account / paybill / till that was credited. */
  creditAccount?: string;
  transactionDate: string; // ISO-8601
  /** Where the facts came from. */
  origin: 'webhook' | 'api-query' | 'statement' | 'daraja';
}

// ===========================================================================
// 2. Configuration
// ===========================================================================
export interface WebhookSecurityConfig {
  /** Shared secret for HMAC-SHA256 over the RAW request body. */
  hmacSecret?: string;
  hmacHeader: string;
  hmacEncoding: 'hex' | 'base64';
  /** Bank's public key (PEM) for RSA-SHA256 signatures over the RAW body. */
  rsaPublicKeyPem?: string;
  rsaHeader: string;
  /** HTTP Basic credentials the bank was told to present to our callback. */
  basicUser?: string;
  basicPass?: string;
  /** Optional source-IP allowlist (exact IPv4 or CIDR). */
  ipAllowlist: string[];
  /** Optional replay window for a signed timestamp header. */
  timestampHeader?: string;
  maxSkewSeconds: number;
}

export interface BankOAuthConfig {
  baseUrl: string;
  tokenPath: string;
  clientId?: string; // consumer key / merchant code
  clientSecret?: string; // consumer secret
  apiKey?: string; // Jenga: pre-encoded Authorization value
  extra: Record<string, string>;
}

export interface BankConfig {
  id: BankId;
  label: string;
  oauth: BankOAuthConfig;
  webhook: WebhookSecurityConfig;
  /** Our collection account at the bank (for balance / statement queries). */
  accountNumber?: string;
  countryCode: string;
  /** Endpoint templates ({reference} / {account} / {country} placeholders). CONFIRM per merchant. */
  paths: { balance?: string; txnQuery?: string; miniStatement?: string };
  privateKeyPem?: string; // Jenga request signing
}

type Env = Record<string, string | undefined>;

function csv(v?: string): string[] {
  return (v || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function pem(v?: string): string | undefined {
  if (!v) return undefined;
  const t = v.trim().replace(/\\n/g, '\n');
  if (t.includes('BEGIN')) return t;
  // allow base64-encoded PEM in env for platforms that dislike newlines
  try {
    const dec = Buffer.from(t, 'base64').toString('utf8');
    return dec.includes('BEGIN') ? dec : undefined;
  } catch {
    return undefined;
  }
}

function webhookCfg(env: Env, p: string, defaults: { hmacHeader: string; rsaHeader: string }): WebhookSecurityConfig {
  return {
    hmacSecret: env[`${p}_WEBHOOK_HMAC_SECRET`] || undefined,
    hmacHeader: (env[`${p}_WEBHOOK_HMAC_HEADER`] || defaults.hmacHeader).toLowerCase(),
    hmacEncoding: (env[`${p}_WEBHOOK_HMAC_ENCODING`] || 'hex').toLowerCase() === 'base64' ? 'base64' : 'hex',
    rsaPublicKeyPem: pem(env[`${p}_WEBHOOK_PUBLIC_KEY`]),
    rsaHeader: (env[`${p}_WEBHOOK_SIGNATURE_HEADER`] || defaults.rsaHeader).toLowerCase(),
    basicUser: env[`${p}_WEBHOOK_BASIC_USER`] || undefined,
    basicPass: env[`${p}_WEBHOOK_BASIC_PASS`] || undefined,
    ipAllowlist: csv(env[`${p}_WEBHOOK_IP_ALLOWLIST`]),
    timestampHeader: env[`${p}_WEBHOOK_TIMESTAMP_HEADER`]?.toLowerCase() || undefined,
    maxSkewSeconds: Number(env[`${p}_WEBHOOK_MAX_SKEW_SECONDS`] || 600)
  };
}

export function loadBankConfigs(env: Env = process.env): Record<BankId, BankConfig> {
  const prod = (env.BANKS_ENVIRONMENT || env.NODE_ENV === 'production' ? 'production' : 'sandbox').toLowerCase() === 'production' ||
    (env.BANKS_ENVIRONMENT || '').toLowerCase() === 'production';

  const equity: BankConfig = {
    id: 'equity',
    label: 'Equity Bank (Jenga)',
    oauth: {
      baseUrl: env.JENGA_BASE_URL || (prod ? 'https://api.jengahq.io' : 'https://sandbox.jengahq.io'),
      // Public SDKs: sandbox /identity-test/v2/token, production /identity/v2/token
      tokenPath: env.JENGA_TOKEN_PATH || (prod ? '/identity/v2/token' : '/identity-test/v2/token'),
      clientId: env.JENGA_MERCHANT_CODE,
      clientSecret: env.JENGA_CONSUMER_SECRET,
      apiKey: env.JENGA_API_KEY,
      extra: {}
    },
    webhook: webhookCfg(env, 'JENGA', { hmacHeader: 'x-jenga-signature', rsaHeader: 'signature' }),
    accountNumber: env.JENGA_ACCOUNT_NUMBER,
    countryCode: env.JENGA_COUNTRY_CODE || 'KE',
    paths: {
      // CONFIRM against your Jenga onboarding pack.
      balance: env.JENGA_BALANCE_PATH || '/v3-apis/account-api/v3.0/accounts/balances/{country}/{account}',
      miniStatement: env.JENGA_MINI_STATEMENT_PATH || '/v3-apis/account-api/v3.0/accounts/miniStatement/{country}/{account}',
      txnQuery: env.JENGA_TXN_QUERY_PATH || '/v3-apis/transaction-api/v3.0/payments/details/{reference}'
    },
    privateKeyPem: pem(env.JENGA_PRIVATE_KEY_PEM)
  };

  const kcb: BankConfig = {
    id: 'kcb',
    label: 'KCB Bank (Buni)',
    oauth: {
      baseUrl: env.KCB_BASE_URL || (prod ? 'https://buni.kcbgroup.com' : 'https://sandbox.buni.kcbgroup.com'),
      tokenPath: env.KCB_TOKEN_PATH || '/token?grant_type=client_credentials',
      clientId: env.KCB_APP_KEY,
      clientSecret: env.KCB_APP_SECRET,
      extra: {}
    },
    // KCB documents a `Signature` header on IPN calls (algorithm/key are issued with the IPN account docs).
    webhook: webhookCfg(env, 'KCB', { hmacHeader: 'signature', rsaHeader: 'signature' }),
    accountNumber: env.KCB_ACCOUNT_NUMBER,
    countryCode: 'KE',
    paths: {
      balance: env.KCB_BALANCE_PATH || undefined, // CONFIRM; not assumed
      txnQuery: env.KCB_TXN_QUERY_PATH || undefined
    }
  };

  const coop: BankConfig = {
    id: 'coop',
    label: 'Co-operative Bank (Co-op Open API)',
    oauth: {
      baseUrl: env.COOP_BASE_URL || (prod ? 'https://developer.co-opbank.co.ke:8243' : 'http://developer.co-opbank.co.ke:8280'),
      tokenPath: env.COOP_TOKEN_PATH || '/token',
      clientId: env.COOP_CONSUMER_KEY,
      clientSecret: env.COOP_CONSUMER_SECRET,
      extra: {}
    },
    webhook: webhookCfg(env, 'COOP', { hmacHeader: 'x-coop-signature', rsaHeader: 'x-coop-signature' }),
    accountNumber: env.COOP_ACCOUNT_NUMBER,
    countryCode: 'KE',
    paths: {
      balance: env.COOP_BALANCE_PATH || undefined,
      txnQuery: env.COOP_TXN_QUERY_PATH || undefined, // account transactions inquiry; CONFIRM path
      miniStatement: env.COOP_ACCOUNT_TRANSACTIONS_PATH || undefined
    }
  };

  const pesalink: BankConfig = {
    id: 'pesalink',
    label: 'PesaLink (IPSL)',
    oauth: { baseUrl: '', tokenPath: '', extra: {} },
    webhook: webhookCfg(env, 'PESALINK', { hmacHeader: 'x-pesalink-signature', rsaHeader: 'x-pesalink-signature' }),
    countryCode: 'KE',
    paths: {}
  };

  return { equity, kcb, coop, pesalink };
}

export function isWebhookSecurityConfigured(w: WebhookSecurityConfig): boolean {
  return Boolean(w.hmacSecret || w.rsaPublicKeyPem || (w.basicUser && w.basicPass));
}

// ===========================================================================
// 3. Webhook authenticity (fail closed)
// ===========================================================================
export type WebhookAuthResult =
  | { ok: true; methods: string[] }
  | { ok: false; reason: string; status: 401 | 403 | 503 };

function headerOf(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function ipAllowed(ip: string, allowlist: string[]): boolean {
  const clean = ip.replace(/^::ffff:/, '');
  for (const entry of allowlist) {
    if (entry === clean) return true;
    const [net, bitsRaw] = entry.split('/');
    if (bitsRaw === undefined) continue;
    const bits = Number(bitsRaw);
    const a = ipv4ToInt(clean);
    const b = ipv4ToInt(net);
    if (a === null || b === null || !(bits >= 0 && bits <= 32)) continue;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if (((a & mask) >>> 0) === ((b & mask) >>> 0)) return true;
  }
  return false;
}

function safeEq(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function stripSigPrefix(sig: string): string {
  return sig.trim().replace(/^(sha256=|v1=|hmac-sha256=|rsa-sha256=)/i, '');
}

export function verifyHmac(rawBody: Buffer, signatureHeader: string, secret: string, encoding: 'hex' | 'base64'): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest(encoding);
  const given = stripSigPrefix(signatureHeader);
  // Accept the other common encoding too (some banks send base64 where hex was configured)
  const expectedOther = crypto.createHmac('sha256', secret).update(rawBody).digest(encoding === 'hex' ? 'base64' : 'hex');
  return safeEq(expected, given) || safeEq(expectedOther, given);
}

export function verifyRsa(rawBody: Buffer, signatureHeader: string, publicKeyPem: string): boolean {
  const sig = stripSigPrefix(signatureHeader);
  const candidates: Buffer[] = [];
  try { candidates.push(Buffer.from(sig, 'base64')); } catch { /* ignore */ }
  if (/^[0-9a-fA-F]+$/.test(sig) && sig.length % 2 === 0) candidates.push(Buffer.from(sig, 'hex'));
  for (const c of candidates) {
    try {
      if (c.length > 0 && crypto.verify('RSA-SHA256', rawBody, publicKeyPem, c)) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

/**
 * Authenticates a provider callback. EVERY configured control must pass (defence in depth):
 *   basic-auth credentials, source IP allowlist, HMAC-SHA256 signature, RSA-SHA256 signature,
 *   timestamp freshness. If none of the cryptographic controls is configured the request is
 *   rejected (503): an unauthenticated payment webhook would let anyone mint "payments".
 */
export function authenticateWebhook(input: {
  cfg: WebhookSecurityConfig;
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
  sourceIp: string;
  /** Local development only: accept unsigned callbacks. Ignored in production. */
  allowInsecureDev?: boolean;
  isProduction: boolean;
}): WebhookAuthResult {
  const { cfg, rawBody, headers, sourceIp } = input;
  const methods: string[] = [];

  if (!isWebhookSecurityConfigured(cfg)) {
    if (input.allowInsecureDev && !input.isProduction) return { ok: true, methods: ['insecure-dev'] };
    return { ok: false, status: 503, reason: 'Webhook security is not configured for this provider (set an HMAC secret, public key or basic-auth credentials).' };
  }
  if (!rawBody || rawBody.length === 0) return { ok: false, status: 401, reason: 'Empty body' };

  if (cfg.ipAllowlist.length > 0) {
    if (!ipAllowed(sourceIp, cfg.ipAllowlist)) return { ok: false, status: 403, reason: 'Source IP not allowed' };
    methods.push('ip-allowlist');
  }

  if (cfg.basicUser && cfg.basicPass) {
    const auth = headerOf(headers, 'authorization') || '';
    const m = /^Basic\s+(.+)$/i.exec(auth);
    const decoded = m ? Buffer.from(m[1], 'base64').toString('utf8') : '';
    if (!m || !safeEq(decoded, `${cfg.basicUser}:${cfg.basicPass}`)) {
      return { ok: false, status: 401, reason: 'Invalid basic credentials' };
    }
    methods.push('basic');
  }

  if (cfg.hmacSecret) {
    const sig = headerOf(headers, cfg.hmacHeader);
    if (!sig || !verifyHmac(rawBody, sig, cfg.hmacSecret, cfg.hmacEncoding)) {
      return { ok: false, status: 401, reason: 'Invalid HMAC signature' };
    }
    methods.push('hmac-sha256');
  }

  if (cfg.rsaPublicKeyPem) {
    const sig = headerOf(headers, cfg.rsaHeader);
    if (!sig || !verifyRsa(rawBody, sig, cfg.rsaPublicKeyPem)) {
      return { ok: false, status: 401, reason: 'Invalid RSA signature' };
    }
    methods.push('rsa-sha256');
  }

  if (cfg.timestampHeader) {
    const ts = headerOf(headers, cfg.timestampHeader);
    const t = ts ? (/^\d+$/.test(ts) ? Number(ts) * (ts.length <= 10 ? 1000 : 1) : Date.parse(ts)) : NaN;
    if (!Number.isFinite(t) || Math.abs(Date.now() - t) > cfg.maxSkewSeconds * 1000) {
      return { ok: false, status: 401, reason: 'Stale or missing timestamp' };
    }
    methods.push('timestamp');
  }

  return { ok: true, methods };
}

// ===========================================================================
// 4. Normalisation helpers
// ===========================================================================
export function normalizeKenyanPhone(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  let d = String(raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('254') && d.length === 12) return d;
  if (d.startsWith('2540') && d.length === 13) return '254' + d.slice(4);
  if (d.startsWith('0') && d.length === 10) return '254' + d.slice(1);
  if ((d.startsWith('7') || d.startsWith('1')) && d.length === 9) return '254' + d;
  return d.length >= 9 ? d : '';
}

export function parseAmount(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const n = Number(v.replace(/[,\s]/g, '').replace(/^(KES|KSH|KSHS)/i, ''));
  return Number.isFinite(n) ? n : NaN;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Canonical form of a transaction reference (used as the dedupe key everywhere). */
export function canonicalReference(ref: unknown): string {
  return String(ref ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '') // zero-width / invisible characters
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** Real bank / M-Pesa references are plain printable ASCII. Anything else (homoglyphs, emoji) is refused outright. */
export function isPlainReference(canonical: string): boolean {
  return /^[\x21-\x7E]+$/.test(canonical) && canonical.replace(/[^A-Z0-9]/g, '').length >= 4;
}

/**
 * The anti-double-entry identity of a reference: letters and digits only, so "FT26301ABC", "ft-26301-abc"
 * and "FT 26301 ABC" are one and the same reference.
 */
export function referenceIdentity(ref: unknown): string {
  return canonicalReference(ref).replace(/[^A-Z0-9]/g, '');
}

function toIso(v: unknown, assumeEat = true): string {
  if (!v) return new Date().toISOString();
  const s = String(v).trim();
  // "2026-10-28 11:54:03" (no zone) -> interpret as East Africa Time
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/.exec(s);
  if (m && assumeEat) {
    const d = new Date(`${m[1]}T${m[2]}+03:00`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(/^\d{13}$/.test(s) ? Number(s) : s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function pick(obj: any, ...keys: string[]): any {
  for (const k of keys) {
    const parts = k.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur === null || cur === undefined) break;
      cur = cur[p];
    }
    if (cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return undefined;
}

function detectChannel(...hints: unknown[]): string {
  const h = hints.filter(Boolean).join(' ').toUpperCase();
  if (/PESALINK|IPSL/.test(h)) return 'PESALINK';
  if (/EQUITEL/.test(h)) return 'EQUITEL';
  if (/PAYBILL/.test(h)) return 'PAYBILL';
  if (/TILL|BUYGOODS/.test(h)) return 'TILL';
  if (/MPESA|M-PESA/.test(h)) return 'MPESA';
  if (/CARD|VISA|MASTERCARD/.test(h)) return 'CARD';
  if (/RTGS|EFT|IFT|TRANSFER|DEPOSIT|CASH/.test(h)) return 'BANK_TRANSFER';
  return 'BANK_TRANSFER';
}

export class PayloadError extends Error {}

function finalize(t: NormalizedBankTxn): NormalizedBankTxn {
  const reference = canonicalReference(t.reference);
  if (!reference) throw new PayloadError('Missing transaction reference');
  if (reference.length > 64) throw new PayloadError('Transaction reference too long');
  if (!isPlainReference(reference)) throw new PayloadError('Transaction reference contains unsupported characters');
  if (!Number.isFinite(t.amount) || t.amount <= 0) throw new PayloadError('Invalid amount');
  if (t.amount > 100_000_000) throw new PayloadError('Amount exceeds sanity limit');
  return {
    ...t,
    reference,
    amount: round2(t.amount),
    currency: (t.currency || 'KES').toUpperCase(),
    narration: String(t.narration || '').slice(0, 300),
    customerReference: String(t.customerReference || '').slice(0, 120),
    payerName: t.payerName ? String(t.payerName).slice(0, 120) : undefined,
    payerPhone: t.payerPhone ? normalizeKenyanPhone(t.payerPhone) || undefined : undefined
  };
}

function statusFrom(v: unknown, defaultStatus: 'success' | 'pending' = 'success'): 'success' | 'pending' | 'failed' {
  if (v === undefined || v === null || v === '') return defaultStatus;
  const s = String(v).toUpperCase();
  if (/(FAIL|REJECT|REVERS|CANCEL|DECLIN|ERROR)/.test(s)) return 'failed';
  if (/(PEND|PROCESS|INITIAT)/.test(s)) return 'pending';
  return 'success';
}

// ---------------------------------------------------------------------------
// Equity / Jenga IPN
//   { callbackType, customer:{name,mobileNumber,reference}, transaction:{date,reference,paymentMode,
//     amount,billNumber,orderAmount,serviceCharge,additionalInfo,status,remarks}, bank:{reference,transactionType,account} }
// CONFIRM exact field names for your merchant's IPN type (Paybill / Equitel / account credit).
// ---------------------------------------------------------------------------
export function normalizeJengaIpn(body: any): NormalizedBankTxn {
  const tx = body?.transaction || {};
  const cust = body?.customer || {};
  const bank = body?.bank || {};
  const reference = pick(body, 'transaction.reference', 'bank.reference', 'transactionReference', 'reference');
  const txType = String(pick(body, 'bank.transactionType', 'transactionType') || 'C').toUpperCase();
  const amount = parseAmount(pick(body, 'transaction.amount', 'amount', 'transaction.orderAmount'));
  return finalize({
    bank: 'equity',
    reference: String(reference ?? ''),
    amount,
    currency: String(pick(body, 'transaction.currency', 'currency') || 'KES'),
    direction: txType.startsWith('D') ? 'debit' : 'credit',
    status: statusFrom(tx.status),
    channel: detectChannel(tx.paymentMode, body?.callbackType, tx.additionalInfo, tx.remarks),
    narration: String([tx.remarks, tx.additionalInfo, tx.paymentMode].filter(Boolean).join(' ') || ''),
    customerReference: String(pick(body, 'customer.reference', 'transaction.billNumber', 'billNumber') || ''),
    payerName: cust.name,
    payerPhone: cust.mobileNumber,
    creditAccount: String(bank.account || tx.till || tx.billNumber || ''),
    transactionDate: toIso(tx.date),
    origin: 'webhook'
  });
}

// ---------------------------------------------------------------------------
// KCB Buni IPN (documented, all fields mandatory):
// transactionReference, requestId, channelCode, timestamp, transactionAmount, currency,
// customerReference, customerName, customerMobileNumber, balance, narration,
// creditAccountIdentifier, organizationShortCode, tillNumber
// ---------------------------------------------------------------------------
export function normalizeKcbIpn(body: any): NormalizedBankTxn {
  return finalize({
    bank: 'kcb',
    reference: String(pick(body, 'transactionReference', 'requestId') ?? ''),
    amount: parseAmount(pick(body, 'transactionAmount', 'amount')),
    currency: String(pick(body, 'currency') || 'KES'),
    direction: 'credit', // IPN = inbound credit notification
    status: 'success',
    channel: detectChannel(body?.channelCode, body?.narration, body?.tillNumber ? 'TILL' : ''),
    narration: String(body?.narration || ''),
    customerReference: String(body?.customerReference || ''),
    payerName: body?.customerName,
    payerPhone: body?.customerMobileNumber,
    creditAccount: String(pick(body, 'creditAccountIdentifier', 'tillNumber', 'organizationShortCode') || ''),
    transactionDate: toIso(body?.timestamp),
    origin: 'webhook'
  });
}

/** KCB expects this acknowledgement shape (statusCode 0 = success). */
export function kcbAck(transactionId: string, ok: boolean, message: string) {
  return { transactionID: transactionId, statusCode: ok ? 0 : 1, statusMessage: message };
}

// ---------------------------------------------------------------------------
// Co-op Bank account notification. CONFIRM field names with the Co-op developer portal; the mapper
// accepts the PascalCase names used in Co-op response messages plus common camelCase variants.
// ---------------------------------------------------------------------------
export function normalizeCoopNotification(body: any): NormalizedBankTxn {
  const b = body?.Body || body?.body || body;
  const dr = String(pick(b, 'DrCr', 'CreditDebitIndicator', 'TransactionType', 'Type') || 'CR').toUpperCase();
  return finalize({
    bank: 'coop',
    reference: String(pick(b, 'TransactionId', 'TransactionReference', 'MessageReference', 'transactionId', 'reference') ?? ''),
    amount: parseAmount(pick(b, 'Amount', 'TransactionAmount', 'amount')),
    currency: String(pick(b, 'Currency', 'TransactionCurrency', 'currency') || 'KES'),
    direction: /^D/.test(dr) ? 'debit' : 'credit',
    status: statusFrom(pick(b, 'Status', 'ResponseDescription', 'MessageDescription', 'status')),
    channel: detectChannel(pick(b, 'Channel', 'PaymentMode', 'channel'), pick(b, 'Narration', 'narration')),
    narration: String(pick(b, 'Narration', 'Description', 'narration') || ''),
    customerReference: String(pick(b, 'CustomerReference', 'BillRefNumber', 'AccountReference', 'customerReference') || ''),
    payerName: pick(b, 'SenderName', 'CustomerName', 'AccountName', 'senderName'),
    payerPhone: pick(b, 'SenderPhone', 'PhoneNumber', 'MobileNumber', 'senderPhone'),
    payerAccount: pick(b, 'SenderAccount', 'SourceAccount'),
    creditAccount: String(pick(b, 'AcctNo', 'AccountNumber', 'CreditAccount', 'accountNumber') || ''),
    transactionDate: toIso(pick(b, 'TransactionDate', 'MessageDateTime', 'ValueDate', 'transactionDate')),
    origin: 'webhook'
  });
}

// ---------------------------------------------------------------------------
// PesaLink / IPSL inbound credit (generic aggregator or receiving-bank relay)
// ---------------------------------------------------------------------------
export function normalizePesalink(body: any): NormalizedBankTxn {
  return finalize({
    bank: 'pesalink',
    reference: String(pick(body, 'transactionId', 'pesalinkReference', 'reference', 'paymentId') ?? ''),
    amount: parseAmount(pick(body, 'amount', 'instructedAmount', 'settlementAmount')),
    currency: String(pick(body, 'currency') || 'KES'),
    direction: 'credit',
    status: statusFrom(pick(body, 'status', 'settlementStatus')),
    channel: 'PESALINK',
    narration: String(pick(body, 'narration', 'remittanceInformation', 'description') || ''),
    customerReference: String(pick(body, 'customerReference', 'endToEndId', 'billRef') || ''),
    payerName: pick(body, 'senderName', 'debtorName'),
    payerPhone: pick(body, 'senderPhone', 'debtorPhone'),
    payerAccount: pick(body, 'senderAccount', 'debtorAccount'),
    creditAccount: String(pick(body, 'creditAccount', 'creditorAccount', 'accountNumber') || ''),
    transactionDate: toIso(pick(body, 'valueDate', 'settlementDate', 'timestamp')),
    origin: 'webhook'
  });
}

// ---------------------------------------------------------------------------
// M-Pesa Daraja (STK callback metadata or C2B confirmation) -> same model
// ---------------------------------------------------------------------------
export function normalizeMpesaStk(callback: any, accountRef = ''): NormalizedBankTxn {
  const items: any[] = callback?.CallbackMetadata?.Item || [];
  const get = (n: string) => items.find((i) => i?.Name === n)?.Value;
  const ts = String(get('TransactionDate') ?? '');
  const iso = /^\d{14}$/.test(ts)
    ? new Date(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}+03:00`).toISOString()
    : new Date().toISOString();
  return finalize({
    bank: 'mpesa',
    reference: String(get('MpesaReceiptNumber') ?? ''),
    amount: parseAmount(get('Amount')),
    currency: 'KES',
    direction: 'credit',
    status: Number(callback?.ResultCode) === 0 ? 'success' : 'failed',
    channel: 'MPESA',
    narration: String(callback?.ResultDesc || ''),
    customerReference: accountRef,
    payerPhone: get('PhoneNumber') !== undefined ? String(get('PhoneNumber')) : undefined,
    transactionDate: iso,
    origin: 'daraja'
  });
}

/**
 * Safaricom Daraja C2B confirmation (paybill / till payments made outside an STK push).
 *   { TransactionType, TransID, TransTime(yyyyMMddHHmmss, EAT), TransAmount, BusinessShortCode,
 *     BillRefNumber, MSISDN, FirstName, MiddleName, LastName }
 */
export function normalizeMpesaC2B(body: any): NormalizedBankTxn {
  if (!body || typeof body !== 'object') throw new PayloadError('Body must be JSON');
  const ts = String(body.TransTime ?? '');
  const iso = /^\d{14}$/.test(ts)
    ? new Date(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}+03:00`).toISOString()
    : new Date().toISOString();
  const name = [body.FirstName, body.MiddleName, body.LastName].filter(Boolean).join(' ').trim();
  const tType = String(body.TransactionType || '').toLowerCase();
  return finalize({
    bank: 'mpesa',
    reference: String(body.TransID ?? ''),
    amount: parseAmount(body.TransAmount),
    currency: 'KES',
    direction: 'credit',
    status: 'success',
    channel: tType.includes('buy goods') ? 'TILL' : 'PAYBILL',
    narration: `M-Pesa ${body.TransactionType || 'payment'} ${body.BillRefNumber || ''}`.trim(),
    customerReference: String(body.BillRefNumber ?? ''),
    payerName: name || undefined,
    payerPhone: body.MSISDN !== undefined ? String(body.MSISDN) : undefined,
    creditAccount: body.BusinessShortCode !== undefined ? String(body.BusinessShortCode) : undefined,
    transactionDate: iso,
    origin: 'webhook'
  });
}

/** A row of a bank statement a landlord uploaded (evidence supplied by the landlord, NOT signed by the bank). */
export function normalizeStatementRow(row: {
  referenceCode: string; amount: number; description?: string; date?: string; bankName?: string; senderPhone?: string; senderName?: string;
}): NormalizedBankTxn {
  const n = String(row.bankName || '').toLowerCase();
  const bank: RailId = /equity/.test(n) ? 'equity' : /kcb/.test(n) ? 'kcb' : /co-?op/.test(n) ? 'coop' : /pesalink/.test(n) ? 'pesalink' : /m-?pesa|safaricom/.test(n) ? 'mpesa' : 'equity';
  const d = row.date && !isNaN(Date.parse(row.date)) ? new Date(row.date).toISOString() : new Date().toISOString();
  return finalize({
    bank,
    reference: String(row.referenceCode ?? ''),
    amount: parseAmount(row.amount),
    currency: 'KES',
    direction: 'credit',
    status: 'success',
    channel: bank === 'pesalink' ? 'PESALINK' : 'BANK_TRANSFER',
    narration: String(row.description || ''),
    customerReference: '',
    payerName: row.senderName,
    payerPhone: row.senderPhone,
    transactionDate: d,
    origin: 'statement'
  });
}

export function normalizeByBank(bank: BankId, body: any): NormalizedBankTxn {
  switch (bank) {
    case 'equity': return normalizeJengaIpn(body);
    case 'kcb': return normalizeKcbIpn(body);
    case 'coop': return normalizeCoopNotification(body);
    case 'pesalink': return normalizePesalink(body);
  }
}

/** Channel override: a Jenga/KCB/Co-op credit that is really a PesaLink settlement keeps the bank but is tagged PESALINK. */
export function describeSource(t: NormalizedBankTxn): string {
  const names: Record<RailId, string> = { equity: 'Equity Bank', kcb: 'KCB Bank', coop: 'Co-operative Bank', pesalink: 'PesaLink', mpesa: 'M-Pesa' };
  return `${names[t.bank]}${t.channel && t.channel !== 'BANK_TRANSFER' ? ` · ${t.channel}` : ''}`;
}

// ===========================================================================
// 5. Auto-matching: inbound deposit -> open invoice
// ===========================================================================
export interface MatchInvoice {
  id: string;
  invoiceNumber: string;
  paymentReference?: string;
  landlordId?: string;
  tenantId: string;
  tenantName: string;
  tenantPhone?: string;
  unitNumber?: string;
  propertyName?: string;
  totalAmount: number;
  amountPaid?: number;
  status: string;
}

export interface MatchLandlord {
  id: string;
  accountNumber?: string;
  mpesaPaybill?: string;
  mpesaTillNumber?: string;
}

export type MatchMethod = 'invoice-reference' | 'unit-number' | 'phone-number';

export interface MatchResult {
  decision: 'auto' | 'queue';
  invoice?: MatchInvoice;
  method?: MatchMethod;
  confidence: number; // 0-100
  reason: string;
  /** Best candidate even when queued (shown as a suggestion to the landlord). */
  suggestion?: { invoice: MatchInvoice; confidence: number; method: MatchMethod };
  ambiguous?: boolean;
}

const AUTO_POST_MIN_CONFIDENCE = 80;
const AMBIGUITY_MARGIN = 15;

function alnum(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function digits(s: string): string {
  return s.replace(/\D/g, '');
}

export function remainingBalance(inv: { totalAmount: number; amountPaid?: number; carriedForwardToInvoiceId?: string }): number {
  // A balance that was rolled into a later invoice is collected there, never twice.
  if (inv.carriedForwardToInvoiceId) return 0;
  return round2(Math.max(0, (inv.totalAmount || 0) - (inv.amountPaid || 0)));
}

function containsToken(haystackUpper: string, tokenUpper: string): boolean {
  if (!tokenUpper) return false;
  const esc = tokenUpper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Not glued to other alphanumerics on the left, not followed by another digit on the right.
  return new RegExp(`(?<![A-Z0-9])${esc}(?![0-9])`).test(haystackUpper);
}

/** Resolve which landlord(s) an inbound credit belongs to from the credited account. */
export function resolveLandlordIds(txn: NormalizedBankTxn, landlords: MatchLandlord[]): string[] | undefined {
  const acct = alnum(txn.creditAccount || '');
  if (!acct) return undefined;
  const hits = landlords.filter(
    (l) => (l.accountNumber && alnum(l.accountNumber) === acct) ||
      (l.mpesaPaybill && alnum(l.mpesaPaybill) === acct) ||
      (l.mpesaTillNumber && alnum(l.mpesaTillNumber) === acct)
  );
  return hits.length ? hits.map((h) => h.id) : undefined;
}

/**
 * Matches an inbound credit to an OPEN invoice using (in order of strength):
 *   1. invoice number / payment reference in the account-reference or narration  (100)
 *   2. unit number in the narration/reference + corroboration (amount or phone)  (85 / 70)
 *   3. payer phone == tenant phone, single open invoice                          (80)
 * Auto-posting needs confidence >= 80, a single clear winner, and an amount that does not exceed
 * the invoice balance. Everything else is queued for the landlord with the best suggestion attached.
 */
export function matchTransaction(
  txn: NormalizedBankTxn,
  openInvoices: MatchInvoice[],
  landlords: MatchLandlord[] = []
): MatchResult {
  const landlordIds = resolveLandlordIds(txn, landlords);
  const candidates = openInvoices.filter(
    (i) => remainingBalance(i) > 0 && (!landlordIds || (i.landlordId && landlordIds.includes(i.landlordId)))
  );
  if (candidates.length === 0) {
    return { decision: 'queue', confidence: 0, reason: 'No open invoice found for the credited account.' };
  }

  const text = alnum(`${txn.customerReference} ${txn.narration}`.trim());
  const textSpaced = `${txn.customerReference} ${txn.narration}`.toUpperCase();
  const refUpper = txn.customerReference.toUpperCase().trim();
  const payerPhone = normalizeKenyanPhone(txn.payerPhone);
  const phonesInText = new Set<string>();
  (textSpaced.match(/(?:\+?254|0)?[17]\d{8}/g) || []).forEach((m) => {
    const p = normalizeKenyanPhone(m);
    if (p) phonesInText.add(p);
  });
  if (payerPhone) phonesInText.add(payerPhone);

  type Scored = { invoice: MatchInvoice; confidence: number; method: MatchMethod; reason: string };
  const scored: Scored[] = [];

  for (const inv of candidates) {
    let best: Scored | null = null;
    const bump = (confidence: number, method: MatchMethod, reason: string) => {
      if (!best || confidence > best.confidence) best = { invoice: inv, confidence, method, reason };
    };

    // 1. Invoice number / payment reference
    const invNo = inv.invoiceNumber?.toUpperCase();
    const payRef = inv.paymentReference?.toUpperCase();
    if ((invNo && (containsToken(textSpaced, invNo) || alnum(invNo) === alnum(refUpper) || (alnum(invNo).length >= 7 && text.includes(alnum(invNo))))) ||
        (payRef && (containsToken(textSpaced, payRef) || alnum(payRef) === alnum(refUpper) || (alnum(payRef).length >= 7 && text.includes(alnum(payRef)))))) {
      bump(100, 'invoice-reference', `Invoice reference ${invNo || payRef} found in the payment reference/narration.`);
    }

    // 2. Unit number
    const unit = inv.unitNumber ? inv.unitNumber.toUpperCase().trim() : '';
    if (unit) {
      const numericOnly = /^\d+$/.test(unit);
      const exactRef = alnum(refUpper) === alnum(unit);
      const prefixed = numericOnly
        ? new RegExp(`(?:UNIT|HSE|HOUSE|APT|APARTMENT|FLAT|ROOM|NO)\\.?\\s*#?\\s*${unit}(?![0-9])`).test(textSpaced)
        : containsToken(textSpaced, unit);
      if (exactRef || prefixed) {
        const amountMatches = Math.abs(txn.amount - remainingBalance(inv)) <= 1 || Math.abs(txn.amount - inv.totalAmount) <= 1;
        const phoneMatches = Boolean(inv.tenantPhone && phonesInText.has(normalizeKenyanPhone(inv.tenantPhone)));
        if (amountMatches || phoneMatches) bump(85, 'unit-number', `Unit ${inv.unitNumber} referenced${amountMatches ? ' and amount equals the balance' : ' and payer phone matches the tenant'}.`);
        else bump(70, 'unit-number', `Unit ${inv.unitNumber} referenced, but nothing else corroborates it.`);
      }
    }

    // 3. Phone number
    if (inv.tenantPhone && phonesInText.has(normalizeKenyanPhone(inv.tenantPhone))) {
      bump(80, 'phone-number', 'Payer phone number matches the tenant.');
    }

    if (best) scored.push(best);
  }

  if (scored.length === 0) {
    return { decision: 'queue', confidence: 0, reason: 'The payment reference/narration did not identify any tenant, unit or invoice.' };
  }

  scored.sort((a, b) => b.confidence - a.confidence || remainingBalance(b.invoice) - remainingBalance(a.invoice));
  const top = scored[0];

  // Tenant-level ambiguity: several different tenants tie closely
  // A unit-number reference that fits several tenants (e.g. "A101" at two landlords sharing a collection
  // account) is ambiguous regardless of amounts: a coincidental amount must never decide whose money it is.
  const rival = scored.find(
    (s) =>
      s.invoice.tenantId !== top.invoice.tenantId &&
      (top.confidence - s.confidence < AMBIGUITY_MARGIN || (top.method === 'unit-number' && s.method === 'unit-number'))
  );
  if (rival) {
    return {
      decision: 'queue',
      confidence: Math.min(top.confidence, 60),
      reason: 'Reference matches more than one tenant; landlord must choose.',
      suggestion: { invoice: top.invoice, confidence: top.confidence, method: top.method },
      ambiguous: true
    };
  }

  // Same tenant with several open invoices: pay the OLDEST first unless a specific invoice was referenced.
  let chosen = top;
  if (top.method !== 'invoice-reference') {
    const sameTenant = scored.filter((s) => s.invoice.tenantId === top.invoice.tenantId);
    if (sameTenant.length > 1) {
      sameTenant.sort((a, b) => a.invoice.invoiceNumber.localeCompare(b.invoice.invoiceNumber));
      chosen = sameTenant[0];
    }
  }

  const balance = remainingBalance(chosen.invoice);
  if (txn.amount > balance + 1) {
    return {
      decision: 'queue',
      confidence: chosen.confidence,
      reason: `Amount KSh ${txn.amount.toLocaleString()} exceeds the invoice balance KSh ${balance.toLocaleString()}; landlord must confirm the allocation.`,
      suggestion: { invoice: chosen.invoice, confidence: chosen.confidence, method: chosen.method }
    };
  }

  if (chosen.confidence >= AUTO_POST_MIN_CONFIDENCE) {
    return { decision: 'auto', invoice: chosen.invoice, method: chosen.method, confidence: chosen.confidence, reason: chosen.reason };
  }
  return {
    decision: 'queue',
    confidence: chosen.confidence,
    reason: `${chosen.reason} Confidence ${chosen.confidence}% is below the auto-post threshold.`,
    suggestion: { invoice: chosen.invoice, confidence: chosen.confidence, method: chosen.method }
  };
}

/** Would this txn convincingly belong to this specific tenant/invoice? Used for tenant-initiated claims. */
export function txnCorroboratesInvoice(
  txn: NormalizedBankTxn,
  inv: MatchInvoice
): { ok: boolean; method?: MatchMethod; confidence: number; reason: string } {
  const r = matchTransaction(txn, [inv], []);
  if (r.invoice && r.decision === 'auto') return { ok: true, method: r.method, confidence: r.confidence, reason: r.reason };
  const s = r.suggestion;
  if (s && s.invoice.id === inv.id && s.confidence >= 80) return { ok: true, method: s.method, confidence: s.confidence, reason: r.reason };
  return { ok: false, confidence: r.confidence, reason: r.reason };
}

// ===========================================================================
// 6. Masking (receipts / logs must not carry full account or phone numbers)
// ===========================================================================
export function maskAccount(acct?: string): string | undefined {
  if (!acct) return undefined;
  const a = String(acct).replace(/\s+/g, '');
  return a.length <= 4 ? '****' : `${'*'.repeat(Math.max(0, a.length - 4))}${a.slice(-4)}`;
}

export function maskPhone(phone?: string): string | undefined {
  const p = normalizeKenyanPhone(phone);
  if (!p) return undefined;
  return `${p.slice(0, 5)}***${p.slice(-3)}`;
}

// ===========================================================================
// 7. OAuth + query drivers
// ===========================================================================
export interface DriverResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

const HTTP_TIMEOUT_MS = Number(process.env.BANK_HTTP_TIMEOUT_MS || 10_000);

async function httpJson(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; ok: boolean; json: any; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json: any;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    return { status: res.status, ok: res.ok, json, text };
  } finally {
    clearTimeout(timer);
  }
}

/** Never put secrets or full upstream bodies in logs / API responses. */
function safeErr(prefix: string, status?: number, text?: string): string {
  const snippet = (text || '').replace(/[\r\n]+/g, ' ').slice(0, 120);
  return `${prefix}${status ? ` (HTTP ${status})` : ''}${snippet ? `: ${snippet.replace(/(token|secret|password|key)[^,}]*/gi, '$1=***')}` : ''}`;
}

export class BankOAuthClient {
  private cache: { token: string; expiresAt: number } | null = null;
  private inflight: Promise<DriverResult<string>> | null = null;

  constructor(private cfg: BankConfig) {}

  isConfigured(): boolean {
    const o = this.cfg.oauth;
    if (!o.baseUrl) return false;
    if (this.cfg.id === 'equity') return Boolean(o.clientId && o.clientSecret && o.apiKey);
    return Boolean(o.clientId && o.clientSecret);
  }

  /** OAuth 2.0 client-credential/password exchange. Tokens are cached until ~60s before expiry. */
  async getToken(force = false): Promise<DriverResult<string>> {
    if (!this.isConfigured()) return { ok: false, error: `${this.cfg.label} credentials are not configured.` };
    if (!force && this.cache && this.cache.expiresAt > Date.now() + 60_000) return { ok: true, data: this.cache.token };
    if (this.inflight) return this.inflight;

    this.inflight = (async (): Promise<DriverResult<string>> => {
      try {
        const o = this.cfg.oauth;
        const url = `${o.baseUrl.replace(/\/$/, '')}${o.tokenPath}`;
        let headers: Record<string, string>;
        let body: string;
        if (this.cfg.id === 'equity') {
          // Jenga: Authorization = merchant API key ("Basic ..."), form body username=<merchant code>, password=<consumer secret>
          const key = o.apiKey!.trim();
          headers = { Authorization: /^basic\s/i.test(key) ? key : `Basic ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' };
          body = new URLSearchParams({ username: o.clientId!, password: o.clientSecret!, grant_type: 'password' }).toString();
        } else {
          // KCB Buni / Co-op (WSO2 API manager): HTTP Basic(consumerKey:consumerSecret), grant_type=client_credentials
          headers = {
            Authorization: `Basic ${Buffer.from(`${o.clientId}:${o.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          };
          body = 'grant_type=client_credentials';
        }
        const res = await httpJson(url, { method: 'POST', headers, body });
        const token = res.json?.access_token;
        if (!res.ok || !token) return { ok: false, status: res.status, error: safeErr(`${this.cfg.label} token request failed`, res.status, res.text) };
        const ttl = Number(res.json?.expires_in) || 3000;
        this.cache = { token: String(token), expiresAt: Date.now() + ttl * 1000 };
        return { ok: true, data: this.cache.token };
      } catch (err: any) {
        return { ok: false, error: `${this.cfg.label} token request error: ${err?.name === 'AbortError' ? 'timeout' : err?.message || 'network'}` };
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  invalidate() {
    this.cache = null;
  }
}

function fill(path: string, vars: Record<string, string>): string {
  return path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(vars[k] ?? ''));
}

function signJenga(privateKeyPem: string | undefined, message: string): string | undefined {
  if (!privateKeyPem) return undefined;
  try {
    return crypto.sign('RSA-SHA256', Buffer.from(message), privateKeyPem).toString('base64');
  } catch {
    return undefined;
  }
}

export class BankDriver {
  readonly oauth: BankOAuthClient;
  constructor(readonly cfg: BankConfig) {
    this.oauth = new BankOAuthClient(cfg);
  }

  capabilities() {
    const configured = this.oauth.isConfigured();
    return {
      oauth: configured,
      webhook: isWebhookSecurityConfigured(this.cfg.webhook),
      balance: configured && Boolean(this.cfg.paths.balance && this.cfg.accountNumber),
      transactionQuery: configured && Boolean(this.cfg.paths.txnQuery || this.cfg.paths.miniStatement)
    };
  }

  private async authedGet(path: string, extraHeaders: Record<string, string> = {}): Promise<DriverResult<any>> {
    const tok = await this.oauth.getToken();
    if (!tok.ok) return { ok: false, error: tok.error };
    const url = `${this.cfg.oauth.baseUrl.replace(/\/$/, '')}${path}`;
    let res = await httpJson(url, { method: 'GET', headers: { Authorization: `Bearer ${tok.data}`, Accept: 'application/json', ...extraHeaders } });
    if (res.status === 401) {
      // token may have been revoked early: refresh once
      this.oauth.invalidate();
      const t2 = await this.oauth.getToken(true);
      if (!t2.ok) return { ok: false, error: t2.error };
      res = await httpJson(url, { method: 'GET', headers: { Authorization: `Bearer ${t2.data}`, Accept: 'application/json', ...extraHeaders } });
    }
    if (!res.ok) return { ok: false, status: res.status, error: safeErr(`${this.cfg.label} request failed`, res.status, res.text) };
    return { ok: true, data: res.json, status: res.status };
  }

  /** OAuth handshake health: acquires a token and reports success without exposing it. */
  async health(): Promise<{ configured: boolean; handshake: boolean; error?: string; latencyMs?: number }> {
    if (!this.oauth.isConfigured()) return { configured: false, handshake: false };
    const t0 = Date.now();
    const r = await this.oauth.getToken(true);
    return { configured: true, handshake: r.ok, error: r.ok ? undefined : r.error, latencyMs: Date.now() - t0 };
  }

  async getBalance(): Promise<DriverResult<{ available?: number; actual?: number; currency?: string }>> {
    const { balance } = this.cfg.paths;
    if (!balance || !this.cfg.accountNumber) return { ok: false, error: 'Balance endpoint/account not configured.' };
    const path = fill(balance, { country: this.cfg.countryCode, account: this.cfg.accountNumber });
    const headers: Record<string, string> = {};
    if (this.cfg.id === 'equity') {
      const sig = signJenga(this.cfg.privateKeyPem, `${this.cfg.countryCode}${this.cfg.accountNumber}`);
      if (sig) headers['signature'] = sig;
    }
    const r = await this.authedGet(path, headers);
    if (!r.ok) return r as DriverResult<any>;
    const d = r.data?.data || r.data || {};
    const balances: any[] = Array.isArray(d.balances) ? d.balances : [];
    const find = (t: string) => balances.find((b) => String(b.type).toLowerCase().includes(t))?.amount;
    return {
      ok: true,
      data: {
        available: parseAmount(find('available') ?? d.availableBalance),
        actual: parseAmount(find('current') ?? find('actual') ?? d.currentBalance),
        currency: d.currency || 'KES'
      }
    };
  }

  /**
   * Looks a deposit up at the bank by reference. Returns a normalised CREDIT only if the bank
   * itself confirms it. Never trusts anything the tenant typed except the reference string.
   */
  async queryTransactionByReference(reference: string): Promise<DriverResult<NormalizedBankTxn | null>> {
    const ref = canonicalReference(reference);
    if (!ref) return { ok: false, error: 'Reference is required.' };
    const { txnQuery, miniStatement } = this.cfg.paths;
    if (!txnQuery && !miniStatement) return { ok: false, error: `${this.cfg.label}: live transaction query is not configured; relying on webhook notifications.` };

    // 1. Direct lookup by reference
    if (txnQuery) {
      const path = fill(txnQuery, { reference: ref, account: this.cfg.accountNumber || '', country: this.cfg.countryCode });
      const r = await this.authedGet(path);
      if (r.ok) {
        const t = this.fromQueryPayload(r.data, ref);
        if (t) return { ok: true, data: t };
        if (!miniStatement) return { ok: true, data: null };
      } else if (r.status !== 404 && !miniStatement) {
        return r as DriverResult<any>;
      }
    }

    // 2. Fall back to scanning recent account activity for the reference
    if (miniStatement && this.cfg.accountNumber) {
      const path = fill(miniStatement, { account: this.cfg.accountNumber, country: this.cfg.countryCode });
      const r = await this.authedGet(path);
      if (!r.ok) return r as DriverResult<any>;
      const rows: any[] = r.data?.data?.transactions || r.data?.transactions || r.data?.Transactions || r.data?.data || [];
      if (Array.isArray(rows)) {
        const hit = rows.find((row) => canonicalReference(pick(row, 'reference', 'transactionReference', 'TransactionId', 'TransactionReference', 'id')) === ref);
        if (hit) {
          const t = this.fromStatementRow(hit, ref);
          if (t) return { ok: true, data: t };
        }
      }
    }
    return { ok: true, data: null };
  }

  private fromQueryPayload(payload: any, ref: string): NormalizedBankTxn | null {
    const d = payload?.data || payload;
    if (!d || typeof d !== 'object') return null;
    try {
      const found = canonicalReference(pick(d, 'transactionReference', 'reference', 'transaction.reference', 'TransactionId'));
      if (found && found !== ref) return null; // bank returned a different transaction: reject
      const status = statusFrom(pick(d, 'status', 'transactionStatus', 'transaction.status'));
      if (status !== 'success') return null;
      const amount = parseAmount(pick(d, 'amount', 'transactionAmount', 'transaction.amount', 'Amount'));
      return finalize({
        bank: this.cfg.id,
        reference: ref,
        amount,
        currency: String(pick(d, 'currency', 'Currency') || 'KES'),
        direction: /^D/i.test(String(pick(d, 'type', 'transactionType', 'DrCr') || 'C')) ? 'debit' : 'credit',
        status,
        channel: detectChannel(pick(d, 'paymentMode', 'channel', 'Channel'), pick(d, 'narration', 'description')),
        narration: String(pick(d, 'narration', 'description', 'remarks', 'Narration') || ''),
        customerReference: String(pick(d, 'customerReference', 'billNumber', 'reference2', 'BillRefNumber') || ''),
        payerName: pick(d, 'customerName', 'senderName', 'payerName'),
        payerPhone: pick(d, 'customerMobileNumber', 'mobileNumber', 'senderPhone'),
        creditAccount: String(pick(d, 'creditAccount', 'accountNumber', 'AcctNo') || this.cfg.accountNumber || ''),
        transactionDate: toIso(pick(d, 'date', 'transactionDate', 'postedDate', 'TransactionDate')),
        origin: 'api-query'
      });
    } catch {
      return null;
    }
  }

  private fromStatementRow(row: any, ref: string): NormalizedBankTxn | null {
    const type = String(pick(row, 'type', 'DrCr', 'creditDebit', 'transactionType') || '').toUpperCase();
    if (type && /^D/.test(type)) return null; // only inbound credits can settle rent
    try {
      return finalize({
        bank: this.cfg.id,
        reference: ref,
        amount: parseAmount(pick(row, 'amount', 'Amount', 'credit', 'Credit')),
        currency: String(pick(row, 'currency', 'Currency') || 'KES'),
        direction: 'credit',
        status: 'success',
        channel: detectChannel(pick(row, 'channel', 'description', 'narration', 'Narration')),
        narration: String(pick(row, 'description', 'narration', 'Narration', 'remarks') || ''),
        customerReference: String(pick(row, 'customerReference', 'reference2', 'BillRefNumber') || ''),
        payerName: pick(row, 'customerName', 'senderName'),
        creditAccount: this.cfg.accountNumber,
        transactionDate: toIso(pick(row, 'date', 'postedDateTime', 'TransactionDate', 'valueDate')),
        origin: 'statement'
      });
    } catch {
      return null;
    }
  }
}

export function createBankDrivers(env: Env = process.env): Record<'equity' | 'kcb' | 'coop', BankDriver> & { configs: Record<BankId, BankConfig> } {
  const configs = loadBankConfigs(env);
  return {
    equity: new BankDriver(configs.equity),
    kcb: new BankDriver(configs.kcb),
    coop: new BankDriver(configs.coop),
    configs
  };
}
