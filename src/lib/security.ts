import crypto from 'crypto';
import { promisify } from 'util';
import type { Landlord, Tenant } from '../types';

/**
 * Credential & input-hardening helpers (server-side only).
 *
 * Password storage:
 *   - New hashes use scrypt (memory-hard, built into Node) -> algo tag "scrypt-v1".
 *   - Legacy hashes (PBKDF2-SHA512 @ 10,000 iterations, no algo tag) are still *verifiable*
 *     so existing users can sign in once, and are transparently upgraded to scrypt.
 *   - Plaintext passwords are NEVER accepted. There is no "master" or "recovery" password.
 */

const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions
) => Promise<Buffer>;
const pbkdf2Async = promisify(crypto.pbkdf2);

export const PASSWORD_ALGO_CURRENT = 'scrypt-v1';
const SCRYPT_PARAMS: crypto.ScryptOptions = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SCRYPT_KEYLEN = 64;

const LEGACY_PBKDF2_ITERATIONS = 10000;
const LEGACY_PBKDF2_KEYLEN = 64;
const LEGACY_PBKDF2_DIGEST = 'sha512';

export const LOCKOUT_THRESHOLD = 5; // Max failed attempts before account lock
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Passwords that must never be accepted or kept (demo / trivially guessable). */
const WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd',
  '123456', '1234567', '12345678', '123456789', '1234567890', '0123456789',
  'qwerty', 'qwerty123', 'qwertyuiop', 'abc123', 'abcd1234', 'letmein', 'welcome',
  'welcome1', 'admin', 'admin123', 'iloveyou', 'monkey', 'dragon', 'estatemaster',
  'estatemaster123', 'changeme', 'kenya123', 'nairobi123'
]);

export function isWeakPassword(password: string): boolean {
  return WEAK_PASSWORDS.has((password || '').trim().toLowerCase());
}

/**
 * Validates password strength. Returns an error message, or null when acceptable.
 * Passwords are NOT trimmed/modified: what the user typed is what is hashed.
 */
export function validatePasswordStrength(password: unknown, context?: { email?: string; name?: string }): string | null {
  if (typeof password !== 'string' || !password) return 'A password is required.';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`;
  }
  if (isWeakPassword(password)) {
    return 'This password is too common. Please choose a less guessable password.';
  }
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigitOrSymbol = /[^A-Za-z]/.test(password);
  if (!hasLetter || !hasDigitOrSymbol) {
    return 'Password must contain letters and at least one number or symbol.';
  }
  const lower = password.toLowerCase();
  const emailLocal = context?.email ? context.email.split('@')[0].toLowerCase() : '';
  if (emailLocal.length >= 4 && lower.includes(emailLocal)) {
    return 'Password must not contain your email address.';
  }
  if (/^(.)\1+$/.test(password)) {
    return 'Password must not be a single repeated character.';
  }
  return null;
}

/**
 * Generates a random cryptographic salt
 */
export function generateSalt(length = 16): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hashes a password with scrypt. Returns the credential fields to persist.
 */
export async function createPasswordCredential(password: string): Promise<{
  passwordHash: string;
  passwordSalt: string;
  passwordAlgo: string;
}> {
  const salt = generateSalt(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return { passwordHash: derived.toString('hex'), passwordSalt: salt, passwordAlgo: PASSWORD_ALGO_CURRENT };
}

type CredentialFields = {
  passwordHash?: string;
  passwordSalt?: string;
  passwordAlgo?: string;
};

function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length > 0 && bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Verifies a password against stored credential fields.
 * - Never accepts plaintext, never accepts a universal/master password.
 * - `needsUpgrade` is true when the stored hash uses a legacy algorithm.
 */
export async function verifyPasswordCredential(
  password: string,
  user: CredentialFields | undefined | null
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (typeof password !== 'string' || !password) return { valid: false, needsUpgrade: false };

  // Always spend comparable CPU time, even for unknown users / missing hashes (timing equalisation).
  if (!user || !user.passwordHash || !user.passwordSalt) {
    await scryptAsync(password, 'estatemaster-dummy-salt', SCRYPT_KEYLEN, SCRYPT_PARAMS).catch(() => undefined);
    return { valid: false, needsUpgrade: false };
  }

  if (user.passwordAlgo === PASSWORD_ALGO_CURRENT) {
    const derived = await scryptAsync(password, user.passwordSalt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
    return { valid: safeEqualHex(derived.toString('hex'), user.passwordHash), needsUpgrade: false };
  }

  // Legacy PBKDF2 (pre-hardening)
  const legacy = await pbkdf2Async(
    password,
    user.passwordSalt,
    LEGACY_PBKDF2_ITERATIONS,
    LEGACY_PBKDF2_KEYLEN,
    LEGACY_PBKDF2_DIGEST
  );
  const ok = safeEqualHex(legacy.toString('hex'), user.passwordHash);
  return { valid: ok, needsUpgrade: ok };
}

/**
 * True if a stored credential is the PBKDF2/legacy variety of a weak password.
 * Used by the startup migration to find accounts still protected by demo passwords.
 */
export async function credentialMatchesWeakPassword(user: CredentialFields): Promise<boolean> {
  for (const weak of WEAK_PASSWORDS) {
    const r = await verifyPasswordCredential(weak, user);
    if (r.valid) return true;
  }
  return false;
}

/**
 * Generates a 6-digit cryptographic numeric OTP (uniform, CSPRNG).
 */
export function generateSecurityOtp(): string {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

/**
 * Hashes a short-lived secret (OTP / session token) for at-rest storage.
 */
export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Constant-time string comparison for secrets of possibly different length.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a ?? '').digest();
  const hb = crypto.createHash('sha256').update(b ?? '').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Generates a secure session token (256-bit).
 */
export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Official document serial, e.g. SN-RCT-2026-4F9A1C2B (CSPRNG; unique per document).
 */
export function generateSerial(prefix: 'INV' | 'RCT' | 'OTP' | 'SEC' | 'QTE' | 'WLC' | 'MNT' | 'SUB' = 'SEC'): string {
  return `SN-${prefix}-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Collision-resistant identifier with a readable prefix, e.g. pay-9f2c1a...
 */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Checks if an account is currently locked due to too many failed attempts
 */
export function getAccountLockoutInfo(user: Landlord | Tenant): { isLocked: boolean; remainingSeconds: number } {
  if (!user.lockoutUntil) {
    return { isLocked: false, remainingSeconds: 0 };
  }

  const lockoutExpiry = new Date(user.lockoutUntil).getTime();
  const now = Date.now();

  if (now < lockoutExpiry) {
    const remainingSeconds = Math.ceil((lockoutExpiry - now) / 1000);
    return { isLocked: true, remainingSeconds };
  }

  return { isLocked: false, remainingSeconds: 0 };
}

/**
 * Calculates security score (0 - 100) based on enabled defenses
 */
export function calculateAccountSecurityScore(user: Landlord | Tenant): number {
  let score = 40; // Base score

  // Has strong hashed password
  if (user.passwordHash && user.passwordAlgo === PASSWORD_ALGO_CURRENT) {
    score += 20;
  } else if (user.passwordHash) {
    score += 10;
  }
  // Has 2FA enabled
  if (user.twoFactorEnabled) {
    score += 30;
  }
  // Has registered Kenyan phone / verified ID
  if (user.phone && user.phone.replace(/\s+/g, '').startsWith('+254')) {
    score += 10;
  }

  return Math.min(100, score);
}

/**
 * Sanitizes a user object so NO secret material ever leaves the server.
 * Allow-list style removal of every credential-bearing field.
 */
const SECRET_USER_FIELDS = [
  'password',
  'passwordHash',
  'passwordSalt',
  'passwordAlgo',
  'twoFactorSecret',
  'mustChangePassword',
  'lockoutUntil',
  'failedLoginAttempts',
  'lastLoginIp'
] as const;

export function sanitizeUserForClient<T extends Landlord | Tenant>(user: T): T {
  const sanitized: any = { ...user };
  for (const f of SECRET_USER_FIELDS) delete sanitized[f];
  return sanitized as T;
}

/**
 * Minimal public view of a landlord that a *tenant* needs in order to pay rent
 * (where to send money). No contact secrets, no subscription/financial audit data.
 */
export function landlordPaymentView(l: Landlord): Partial<Landlord> {
  return {
    id: l.id,
    name: l.name,
    companyName: l.companyName,
    email: l.email,
    phone: l.phone,
    mpesaPaybill: l.mpesaPaybill,
    mpesaTillNumber: l.mpesaTillNumber,
    mpesaPhoneNumber: l.mpesaPhoneNumber,
    bankName: l.bankName,
    accountName: l.accountName,
    accountNumber: l.accountNumber,
    branchName: l.branchName,
    swiftCode: l.swiftCode
  };
}

/**
 * Escapes text for safe interpolation into HTML (emails, PDFs-as-HTML, etc).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Input normaliser for free-text fields: strips control characters and trims.
 * (Output encoding via escapeHtml is the actual XSS defence; this just keeps data tidy.)
 */
export function sanitizeInputString(input: string): string {
  if (!input || typeof input !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

/**
 * Normalises an email for lookups / uniqueness checks.
 */
export function normalizeEmail(input: unknown): string {
  return sanitizeInputString(String(input ?? '')).toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}
