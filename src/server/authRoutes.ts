/**
 * Authentication routes.
 *
 *  POST /api/auth/login                 email+password (+role hint) -> session, or 2FA challenge
 *  POST /api/auth/2fa/verify            challenge handle + emailed OTP -> session
 *  POST /api/auth/2fa/resend            new OTP for an open challenge (rate limited)
 *  POST /api/auth/2fa/toggle            enable/disable email 2FA (requires current password)
 *  POST /api/auth/change-password       current + new password; revokes all other sessions
 *  POST /api/auth/step-up-challenge     OTP for a sensitive action
 *  POST /api/auth/step-up-verify        verify that OTP -> single-use grant
 *  GET  /api/auth/me                    who am I (session restore)
 *  POST /api/auth/logout
 *  POST /api/auth/sessions/revoke       revoke one / all-other sessions (own only)
 *  GET  /api/security/status/:userId    own security posture only
 *  GET  /api/security/logs              own security events only
 *
 * Security properties:
 *  - Generic failure message for unknown email / wrong password (no account enumeration).
 *  - Lockout is tracked per e-mail address in the database for existing AND non-existing accounts, so it
 *    survives restarts, works across instances and looks identical either way.
 *  - No master password, no "password instead of OTP" bypass, no OTP echoed to the client.
 *  - Scrypt hashes; legacy hashes upgraded transparently after a successful login.
 */
import crypto from 'crypto';
import { getStore, DELETE_FIELD } from './store.js';
import { COLLECTIONS } from './db.js';
import {
  AuthContext, ReqLike, ResLike, clientIp, createChallenge, createSession, createStepUpGrant,
  globalLimiter, listSessionsForUser, rateLimit, refreshChallengeOtp, revokeAllSessionsForUser, revokeSessionById,
  revokeSessionByToken, verifyChallenge, LOCKOUT_PLACEHOLDER
} from './auth.js';
import { App, body, h, str } from './http.js';
import { findAccountByEmail, loadAccount, colFor, maskEmail, maskPhoneNumber } from './accounts.js';
import { sendOtpEmail, dispatchSystemEmail } from './mailer.js';
import { logSecurityEvent } from './audit.js';
import {
  LOCKOUT_DURATION_MS, LOCKOUT_THRESHOLD, calculateAccountSecurityScore, createPasswordCredential,
  escapeHtml, getAccountLockoutInfo, isValidEmail, normalizeEmail, sanitizeUserForClient, sha256Hex,
  validatePasswordStrength, verifyPasswordCredential
} from '../lib/security.js';
import type { Landlord, SecurityStatus, Tenant } from '../types.js';

const GENERIC_LOGIN_ERROR = 'Invalid email or password.';
const isProd = () => process.env.NODE_ENV === 'production';

interface AttemptRec { id: string; failed: number; lockoutUntil: number; lastAttemptAt: number }

async function getAttempts(emailLower: string): Promise<AttemptRec> {
  const id = sha256Hex(`login:${emailLower}`);
  const rec = await getStore().get<AttemptRec>(COLLECTIONS.LOGIN_ATTEMPTS, id);
  return rec || { id, failed: 0, lockoutUntil: 0, lastAttemptAt: 0 };
}
async function saveAttempts(rec: AttemptRec) {
  await getStore().set(COLLECTIONS.LOGIN_ATTEMPTS, rec.id, rec);
}

function publicUser(user: Landlord | Tenant) {
  return sanitizeUserForClient(user as any);
}

async function issueSession(req: ReqLike, res: ResLike, account: { user: Landlord | Tenant; role: 'landlord' | 'tenant' }) {
  const { user, role } = account;
  const { token, session } = await createSession(req, user, role);
  const ip = clientIp(req);
  await getStore().update(colFor(role), user.id, {
    lastLoginAt: new Date().toISOString(),
    lastLoginIp: ip,
    failedLoginAttempts: 0,
    lockoutUntil: LOCKOUT_PLACEHOLDER
  }).catch(() => undefined);
  await logSecurityEvent('LOGIN_SUCCESS', 'LOW', `Signed in (${session.device})`, req, user.email, user.id, role);
  const fresh = (await loadAccount(role, user.id)) || user;
  return res.json({
    success: true,
    role,
    user: publicUser(fresh),
    sessionToken: token,
    sessionId: session.sessionId,
    mustChangePassword: Boolean((fresh as any).mustChangePassword)
  });
}

export function registerAuthRoutes(app: App) {
  // ------------------------------------------------------------------ login
  app.post(
    '/api/auth/login',
    rateLimit({ name: 'login-ip', max: 40, windowMs: 15 * 60_000 }),
    h(async (req, res) => {
      const b = body(req);
      const emailLower = normalizeEmail(b.email);
      const password = typeof b.password === 'string' ? b.password : '';
      const roleHint = b.role === 'tenant' ? 'tenant' : b.role === 'landlord' ? 'landlord' : undefined;
      if (!emailLower || !password) return res.status(400).json({ error: 'Email and password are required.' });
      if (password.length > 256 || emailLower.length > 254) return res.status(400).json({ error: GENERIC_LOGIN_ERROR });

      const attempts = await getAttempts(emailLower);
      const now = Date.now();
      if (attempts.lockoutUntil > now) {
        const remainingSeconds = Math.ceil((attempts.lockoutUntil - now) / 1000);
        await logSecurityEvent('ACCOUNT_LOCKED', 'HIGH', `Login attempt while locked (${remainingSeconds}s left)`, req, emailLower);
        return res.status(429).json({
          error: `Too many failed attempts. Please wait ${remainingSeconds} seconds before trying again.`,
          isLocked: true,
          remainingSeconds
        });
      }

      const account = await findAccountByEmail(emailLower, roleHint);
      const verdict = await verifyPasswordCredential(password, account?.user);

      if (!account || !verdict.valid) {
        attempts.failed = now - attempts.lastAttemptAt > LOCKOUT_DURATION_MS * 2 ? 1 : attempts.failed + 1;
        attempts.lastAttemptAt = now;
        let locked = false;
        if (attempts.failed >= LOCKOUT_THRESHOLD) {
          attempts.lockoutUntil = now + LOCKOUT_DURATION_MS;
          attempts.failed = 0;
          locked = true;
        }
        await saveAttempts(attempts);
        if (account) {
          await getStore().update(colFor(account.role), account.user.id, {
            failedLoginAttempts: attempts.failed,
            lockoutUntil: locked ? new Date(attempts.lockoutUntil).toISOString() : (account.user as any).lockoutUntil || LOCKOUT_PLACEHOLDER
          }).catch(() => undefined);
        }
        await logSecurityEvent(locked ? 'ACCOUNT_LOCKED' : 'FAILED_LOGIN', locked ? 'HIGH' : 'MEDIUM',
          locked ? 'Account locked after repeated failures' : 'Failed sign-in attempt', req, emailLower, account?.user.id, account?.role || 'system');
        if (locked) {
          return res.status(429).json({
            error: `Too many failed attempts. Please wait ${Math.ceil(LOCKOUT_DURATION_MS / 1000)} seconds before trying again.`,
            isLocked: true,
            remainingSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000)
          });
        }
        return res.status(401).json({ error: GENERIC_LOGIN_ERROR, remainingAttempts: Math.max(0, LOCKOUT_THRESHOLD - attempts.failed) });
      }

      // Correct password: clear counters, upgrade legacy hash.
      attempts.failed = 0;
      attempts.lockoutUntil = 0;
      await saveAttempts(attempts);
      const { user, role } = account;
      if (verdict.needsUpgrade) {
        const cred = await createPasswordCredential(password);
        await getStore().update(colFor(role), user.id, { ...cred, password: DELETE_FIELD }).catch(() => undefined);
      }

      if (user.twoFactorEnabled) {
        const ch = await createChallenge({ kind: 'login-2fa', user, role });
        const delivered = await sendOtpEmail({ to: user.email, name: (user as any).name || (user as any).fullName, otp: ch.otp, purpose: 'sign-in', landlordId: role === 'landlord' ? user.id : (user as Tenant).landlordId });
        if (!delivered && isProd()) {
          return res.status(503).json({ error: 'We could not send your verification code right now. Please try again shortly.' });
        }
        return res.json({
          success: true,
          requires2FA: true,
          tempToken: ch.handle,
          emailMasked: maskEmail(user.email),
          phoneMasked: maskPhoneNumber(user.phone),
          message: `A 6-digit verification code was sent to ${maskEmail(user.email)}.`
        });
      }
      return issueSession(req, res, account);
    })
  );

  // -------------------------------------------------------------- 2FA verify
  app.post(
    '/api/auth/2fa/verify',
    rateLimit({ name: '2fa-verify-ip', max: 30, windowMs: 15 * 60_000 }),
    h(async (req, res) => {
      const b = body(req);
      const handle = str(b.tempToken, 200);
      const otp = str(b.otp, 12);
      if (!handle || !/^\d{6}$/.test(otp.replace(/\s+/g, ''))) return res.status(400).json({ error: 'Enter the 6-digit code from your email.' });
      const r = await verifyChallenge(handle, otp, 'login-2fa');
      if (!r.ok) {
        const msg =
          r.reason === 'expired' ? 'This code has expired. Please sign in again.' :
          r.reason === 'too-many-attempts' ? 'Too many incorrect codes. Please sign in again.' :
          r.reason === 'wrong-code' ? `Incorrect code. ${r.attemptsLeft ?? 0} attempt(s) left.` :
          'This verification session is no longer valid. Please sign in again.';
        await logSecurityEvent('FAILED_LOGIN', 'MEDIUM', `2FA failure (${r.reason})`, req, 'unknown');
        return res.status(401).json({ error: msg, remainingAttempts: r.reason === 'wrong-code' ? r.attemptsLeft : 0 });
      }
      const user = await loadAccount(r.rec.role, r.rec.userId);
      if (!user) return res.status(401).json({ error: 'Account not found.' });
      return issueSession(req, res, { user, role: r.rec.role });
    })
  );

  app.post(
    '/api/auth/2fa/resend',
    rateLimit({ name: '2fa-resend', max: 4, windowMs: 10 * 60_000 }),
    h(async (req, res) => {
      const handle = str(body(req).tempToken, 200);
      if (!handle) return res.status(400).json({ error: 'Verification session missing.' });
      const refreshed = await refreshChallengeOtp(handle);
      // Same response whether or not the handle exists (no oracle).
      if (refreshed) {
        const user = await loadAccount(refreshed.rec.role, refreshed.rec.userId);
        if (user) await sendOtpEmail({ to: user.email, name: (user as any).name || (user as any).fullName, otp: refreshed.otp, purpose: 'sign-in' });
      }
      return res.json({ success: true, message: 'If the session is still open, a new code has been sent.' });
    })
  );

  // ---------------------------------------------------------- 2FA toggle
  app.post(
    '/api/auth/2fa/toggle',
    rateLimit({ name: '2fa-toggle', max: 10, windowMs: 15 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }),
    h(async (req, res) => {
      const auth = req.auth as AuthContext;
      const b = body(req);
      const enable = Boolean(b.enable);
      const pw = typeof b.currentPassword === 'string' ? b.currentPassword : '';
      const v = await verifyPasswordCredential(pw, auth.user);
      if (!v.valid) {
        await logSecurityEvent('SUSPICIOUS_ACTIVITY', 'MEDIUM', 'Wrong password while changing 2FA', req, auth.user.email, auth.userId, auth.role);
        return res.status(403).json({ error: 'Your current password is required to change two-factor settings.' });
      }
      await getStore().update(colFor(auth.role), auth.userId, { twoFactorEnabled: enable });
      const fresh = (await loadAccount(auth.role, auth.userId))!;
      const score = calculateAccountSecurityScore(fresh);
      await getStore().update(colFor(auth.role), auth.userId, { securityScore: score });
      await logSecurityEvent(enable ? '2FA_ENABLED' : '2FA_DISABLED', enable ? 'LOW' : 'MEDIUM', `Two-factor authentication ${enable ? 'enabled' : 'disabled'}`, req, auth.user.email, auth.userId, auth.role);
      return res.json({ success: true, twoFactorEnabled: enable, securityScore: score, message: `Two-factor authentication ${enable ? 'activated' : 'deactivated'}.` });
    })
  );

  // ----------------------------------------------------- change password
  app.post(
    '/api/auth/change-password',
    rateLimit({ name: 'change-pw', max: 8, windowMs: 15 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }),
    h(async (req, res) => {
      const auth = req.auth as AuthContext;
      const b = body(req);
      const current = typeof b.currentPassword === 'string' ? b.currentPassword : '';
      const next = typeof b.newPassword === 'string' ? b.newPassword : '';
      const v = await verifyPasswordCredential(current, auth.user);
      if (!v.valid) {
        await logSecurityEvent('SUSPICIOUS_ACTIVITY', 'MEDIUM', 'Wrong current password on password change', req, auth.user.email, auth.userId, auth.role);
        return res.status(403).json({ error: 'Your current password is incorrect.' });
      }
      const problem = validatePasswordStrength(next, { email: auth.user.email, name: (auth.user as any).name || (auth.user as any).fullName });
      if (problem) return res.status(400).json({ error: problem });
      if (next === current) return res.status(400).json({ error: 'Choose a password different from your current one.' });

      const cred = await createPasswordCredential(next);
      await getStore().update(colFor(auth.role), auth.userId, {
        ...cred, password: DELETE_FIELD, mustChangePassword: false, passwordChangedAt: new Date().toISOString()
      });
      const revoked = await revokeAllSessionsForUser(auth.userId, auth.tokenHash);
      const fresh = (await loadAccount(auth.role, auth.userId))!;
      const score = calculateAccountSecurityScore(fresh);
      await getStore().update(colFor(auth.role), auth.userId, { securityScore: score });
      await logSecurityEvent('PASSWORD_CHANGED', 'MEDIUM', `Password changed; ${revoked} other session(s) signed out`, req, auth.user.email, auth.userId, auth.role);
      dispatchSystemEmail({
        recipientEmail: auth.user.email, recipientName: (auth.user as any).name || (auth.user as any).fullName || 'Account holder',
        subject: 'Your EstateMaster password was changed', emailType: 'Security Alert', prefix: 'SEC', sensitive: true,
        bodyHtml: `<p>The password on your EstateMaster account was just changed and all other devices were signed out.</p><p>If this was not you, contact support immediately.</p>`
      }).catch(() => undefined);
      return res.json({ success: true, securityScore: score, message: 'Password updated. Other devices have been signed out.' });
    })
  );

  // ------------------------------------------------------------- step-up
  app.post(
    '/api/auth/step-up-challenge',
    rateLimit({ name: 'stepup-req', max: 6, windowMs: 10 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }),
    h(async (req, res) => {
      const auth = req.auth as AuthContext;
      const action = str(body(req).action, 80) || 'sensitive-action';
      const ch = await createChallenge({ kind: 'step-up', user: auth.user, role: auth.role, action });
      const delivered = await sendOtpEmail({ to: auth.user.email, name: (auth.user as any).name || (auth.user as any).fullName, otp: ch.otp, purpose: action });
      if (!delivered && isProd()) return res.status(503).json({ error: 'We could not send your verification code right now. Please try again shortly.' });
      return res.json({ challengeId: ch.handle, emailMasked: maskEmail(auth.user.email), expiresAt: ch.expiresAt, message: `Verification code sent to ${maskEmail(auth.user.email)}.` });
    })
  );

  app.post(
    '/api/auth/step-up-verify',
    rateLimit({ name: 'stepup-verify', max: 20, windowMs: 10 * 60_000, key: (r) => r.auth?.userId || clientIp(r) }),
    h(async (req, res) => {
      const auth = req.auth as AuthContext;
      const b = body(req);
      const r = await verifyChallenge(str(b.challengeId, 200), str(b.otp, 12), 'step-up');
      if (!r.ok || r.rec.userId !== auth.userId || r.rec.role !== auth.role) {
        return res.status(403).json({ verified: false, error: r.ok ? 'This code does not belong to your account.' : r.reason === 'wrong-code' ? `Incorrect code. ${r.attemptsLeft ?? 0} attempt(s) left.` : 'Code expired or invalid. Request a new one.' });
      }
      const grant = await createStepUpGrant(auth, r.rec.action || 'sensitive-action');
      await logSecurityEvent('STEP_UP_VERIFIED', 'LOW', `Step-up verified for ${r.rec.action}`, req, auth.user.email, auth.userId, auth.role);
      return res.json({ verified: true, grant, message: 'Verified.' });
    })
  );

  // ------------------------------------------------------ password reset
  // Same response for known and unknown e-mails (no enumeration). The "token" is an opaque challenge handle.
  app.post(
    '/api/auth/forgot-password',
    rateLimit({ name: 'forgot-ip', max: 8, windowMs: 60 * 60_000 }),
    h(async (req, res) => {
      const emailLower = normalizeEmail(body(req).email);
      if (!emailLower || !isValidEmail(emailLower)) return res.status(400).json({ error: 'Enter a valid email address.' });
      const lim = globalLimiter.hit(`forgot-email:${emailLower}`, 3, 60 * 60_000);
      const account = lim.allowed ? await findAccountByEmail(emailLower) : null;
      let handle = crypto.randomBytes(24).toString('hex'); // decoy for unknown accounts
      if (account) {
        const ch = await createChallenge({ kind: 'forced-reset', user: account.user, role: account.role, ttlMs: 15 * 60_000, maxAttempts: 5 });
        handle = ch.handle;
        const ok = await sendOtpEmail({ to: account.user.email, name: (account.user as any).name || (account.user as any).fullName, otp: ch.otp, purpose: 'resetting your password', minutes: 15 });
        await logSecurityEvent('PASSWORD_RESET_REQUIRED', 'MEDIUM', `Password reset requested${ok ? '' : ' (email not delivered)'}`, req, account.user.email, account.user.id, account.role);
      }
      return res.json({ resetToken: handle, message: 'If that email belongs to an account, a 6-digit code has been sent to it.' });
    })
  );

  app.post(
    '/api/auth/reset-password',
    rateLimit({ name: 'reset-ip', max: 15, windowMs: 60 * 60_000 }),
    h(async (req, res) => {
      const b = body(req);
      const r = await verifyChallenge(str(b.resetToken, 200), str(b.otp, 12), 'forced-reset');
      if (!r.ok) {
        return res.status(400).json({ error: r.reason === 'wrong-code' ? `Incorrect code. ${r.attemptsLeft ?? 0} attempt(s) left.` : 'This reset request is invalid or has expired. Please start again.' });
      }
      const user = await loadAccount(r.rec.role, r.rec.userId);
      if (!user) return res.status(400).json({ error: 'This reset request is invalid or has expired. Please start again.' });
      const problem = validatePasswordStrength(b.newPassword, { email: user.email, name: (user as any).name || (user as any).fullName });
      if (problem) {
        // The code was consumed; issue a fresh challenge so the user can retry without restarting.
        const ch = await createChallenge({ kind: 'forced-reset', user, role: r.rec.role, ttlMs: 15 * 60_000 });
        await sendOtpEmail({ to: user.email, name: (user as any).name || (user as any).fullName, otp: ch.otp, purpose: 'resetting your password', minutes: 15 });
        return res.status(400).json({ error: problem, resetToken: ch.handle, newCodeSent: true });
      }
      const cred = await createPasswordCredential(b.newPassword);
      await getStore().update(colFor(r.rec.role), user.id, { ...cred, password: DELETE_FIELD, mustChangePassword: false, lockoutUntil: LOCKOUT_PLACEHOLDER, failedLoginAttempts: 0, passwordChangedAt: new Date().toISOString() });
      await getStore().delete(COLLECTIONS.LOGIN_ATTEMPTS, sha256Hex(`login:${normalizeEmail(user.email)}`)).catch(() => undefined);
      const revoked = await revokeAllSessionsForUser(user.id);
      await logSecurityEvent('PASSWORD_CHANGED', 'HIGH', `Password reset by e-mail code; ${revoked} session(s) signed out`, req, user.email, user.id, r.rec.role);
      dispatchSystemEmail({
        recipientEmail: user.email, recipientName: (user as any).name || (user as any).fullName || 'Account holder', subject: 'Your EstateMaster password was reset',
        emailType: 'Security Alert', prefix: 'SEC', sensitive: true,
        bodyHtml: '<p>The password on your EstateMaster account was just reset and all devices were signed out. If this was not you, contact support immediately.</p>'
      }).catch(() => undefined);
      return res.json({ success: true, message: 'Password updated. You can now sign in.' });
    })
  );

  // ------------------------------------------------------- me / logout
  app.get('/api/auth/me', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    return res.json({ role: auth.role, user: publicUser(auth.user), mustChangePassword: auth.mustChangePassword, sessionId: auth.sessionId });
  }));

  app.post('/api/auth/logout', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    await revokeSessionByToken(auth.tokenHash);
    return res.json({ success: true });
  }));

  // ----------------------------------------------------------- sessions
  app.post('/api/auth/sessions/revoke', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const b = body(req);
    if (b.revokeAllOther) {
      const n = await revokeAllSessionsForUser(auth.userId, auth.tokenHash);
      await logSecurityEvent('SESSION_REVOKED', 'MEDIUM', `Signed out ${n} other session(s)`, req, auth.user.email, auth.userId, auth.role);
      return res.json({ success: true, message: `Signed out ${n} other device(s).` });
    }
    const sessionId = str(b.sessionId, 64);
    if (!sessionId) return res.status(400).json({ error: 'Session id required.' });
    // Own sessions only (revokeSessionById filters by the caller's userId).
    const ok = await revokeSessionById(auth.userId, sessionId);
    if (!ok) return res.status(404).json({ error: 'Session not found.' });
    await logSecurityEvent('SESSION_REVOKED', 'LOW', 'Device session terminated', req, auth.user.email, auth.userId, auth.role);
    return res.json({ success: true, message: 'Session terminated.' });
  }));

  // ------------------------------------------------- security dashboard
  app.get('/api/security/status/:userId', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const wanted = String((req as any).params?.userId || '');
    if (wanted !== auth.userId && normalizeEmail(wanted) !== normalizeEmail(auth.user.email)) {
      await logSecurityEvent('ACCESS_DENIED', 'MEDIUM', 'Tried to read another account\'s security status', req, auth.user.email, auth.userId, auth.role);
      return res.status(403).json({ error: 'You can only view your own security status.' });
    }
    const user = auth.user;
    const lock = getAccountLockoutInfo(user);
    const logs = (await getStore().where<any>(COLLECTIONS.SECURITY_LOGS, 'userId', auth.userId))
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, 25);
    const status: SecurityStatus = {
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      failedLoginAttempts: user.failedLoginAttempts || 0,
      isLocked: lock.isLocked,
      lockoutRemainingSeconds: lock.remainingSeconds,
      securityScore: calculateAccountSecurityScore(user),
      recentLogs: logs,
      activeSessions: await listSessionsForUser(auth.userId, auth.tokenHash)
    };
    return res.json(status);
  }));

  app.get('/api/security/logs', h(async (req, res) => {
    const auth = req.auth as AuthContext;
    const logs = (await getStore().where<any>(COLLECTIONS.SECURITY_LOGS, 'userId', auth.userId))
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, 200);
    return res.json(logs);
  }));
}
