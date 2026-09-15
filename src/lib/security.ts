import crypto from 'crypto';
import { Landlord, Tenant, SecurityLog, SecurityStatus, UserSession } from '../types';

const PBKDF2_ITERATIONS = 10000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';
const LOCKOUT_THRESHOLD = 5; // Max 5 failed attempts
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

/**
 * Generates a random cryptographic salt
 */
export function generateSalt(length = 16): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hashes password using PBKDF2-HMAC-SHA512
 */
export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
}

/**
 * Cryptographically verifies a password against hash+salt (or legacy plaintext fallback with safe auto-upgrade)
 */
export function verifyPassword(password: string, storedHash?: string, storedSalt?: string, legacyPassword?: string): boolean {
  if (storedHash && storedSalt) {
    const computedHash = hashPassword(password, storedSalt);
    // Constant-time comparison to prevent timing attacks
    const bufA = Buffer.from(computedHash, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  // Fallback to legacy password check
  if (legacyPassword && legacyPassword.trim()) {
    return legacyPassword.trim() === password.trim();
  }

  return false;
}

/**
 * Generates a 6-digit cryptographic numeric OTP
 */
export function generateSecurityOtp(): string {
  return Math.floor(100000 + crypto.randomInt(0, 900000)).toString();
}

/**
 * Generates a secure session token
 */
export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
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
  if (user.passwordHash || (user.password && user.password.length >= 8)) {
    score += 20;
  }
  // Has 2FA enabled
  if (user.twoFactorEnabled) {
    score += 30;
  }
  // Has registered Kenyan phone / verified ID
  if (user.phone && user.phone.startsWith('+254')) {
    score += 10;
  }

  return Math.min(100, score);
}

/**
 * Sanitizes user object to guarantee NO secrets, passwords, or salts are exposed
 */
export function sanitizeUserForClient<T extends Landlord | Tenant>(user: T): T {
  const sanitized: any = { ...user };
  delete sanitized.password;
  delete sanitized.passwordHash;
  delete sanitized.passwordSalt;
  delete sanitized.twoFactorSecret;
  return sanitized as T;
}

/**
 * Simple XSS / injection sanitizer for user input strings
 */
export function sanitizeInputString(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/onload=/gi, '')
    .replace(/onerror=/gi, '')
    .trim();
}

export { LOCKOUT_THRESHOLD, LOCKOUT_DURATION_MS };
