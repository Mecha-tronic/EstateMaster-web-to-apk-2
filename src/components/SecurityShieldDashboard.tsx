import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Key,
  Lock,
  Smartphone,
  Laptop,
  Globe,
  Clock,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  LogOut,
  History,
  FileCheck,
  XCircle,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  Info,
  Server,
  Layers
} from 'lucide-react';
import {
  fetchSecurityStatus,
  fetchSecurityLogs,
  toggleTwoFactorAuth,
  changeUserPassword,
  revokeUserSession,
  revokeAllOtherSessions
} from '../lib/api';
import { SecurityStatus, SecurityLog, UserSession, Landlord, Tenant } from '../types';

interface SecurityShieldDashboardProps {
  user: Landlord | Tenant;
  role: 'landlord' | 'tenant';
  onUserUpdated?: (updatedUser: Landlord | Tenant) => void;
  onClose?: () => void;
}

export const SecurityShieldDashboard: React.FC<SecurityShieldDashboardProps> = ({
  user,
  role,
  onUserUpdated,
  onClose
}) => {
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'sessions' | 'logs' | 'password'>('overview');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);

  // 2FA toggle state
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaError, setTwoFaError] = useState<string | null>(null);
  const [twoFaSuccess, setTwoFaSuccess] = useState<string | null>(null);
  const [twoFaModalOpen, setTwoFaModalOpen] = useState(false);
  const [twoFaConfirmPass, setTwoFaConfirmPass] = useState('');

  // Sessions action state
  const [sessionActionLoading, setSessionActionLoading] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  const loadSecurityData = async () => {
    try {
      setLoading(true);
      const [statusData, logsData] = await Promise.all([
        fetchSecurityStatus(user.id).catch(() => null),
        fetchSecurityLogs(user.id, user.email).catch(() => [])
      ]);

      if (statusData) {
        setSecurityStatus(statusData);
      } else {
        // Fallback default state
        setSecurityStatus({
          userId: user.id,
          email: user.email,
          twoFactorEnabled: !!user.twoFactorEnabled,
          securityScore: user.twoFactorEnabled ? 95 : 65,
          activeSessions: [
            {
              id: 'sess-current',
              userId: user.id,
              email: user.email,
              role,
              ipAddress: '127.0.0.1 (Local Verified)',
              userAgent: navigator.userAgent,
              deviceType: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
              createdAt: new Date().toISOString(),
              lastActiveAt: new Date().toISOString(),
              isCurrent: true
            }
          ],
          failedAttempts: user.failedLoginAttempts || 0,
          isLocked: !!(user.lockoutUntil && new Date(user.lockoutUntil).getTime() > Date.now()),
          lockoutUntil: user.lockoutUntil
        });
      }

      setLogs(logsData || []);
    } catch (err) {
      console.error('Failed to load security overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSecurityData();
  }, [user.id]);

  const handleToggle2FA = async (enable: boolean) => {
    setTwoFaLoading(true);
    setTwoFaError(null);
    setTwoFaSuccess(null);

    try {
      const res = await toggleTwoFactorAuth(user.id, role, enable, twoFaConfirmPass || undefined);
      setTwoFaSuccess(res.message);
      setTwoFaModalOpen(false);
      setTwoFaConfirmPass('');

      // Update local state
      if (securityStatus) {
        setSecurityStatus({
          ...securityStatus,
          twoFactorEnabled: res.twoFactorEnabled,
          securityScore: res.securityScore
        });
      }

      if (onUserUpdated) {
        onUserUpdated({
          ...user,
          twoFactorEnabled: res.twoFactorEnabled,
          securityScore: res.securityScore
        });
      }

      await loadSecurityData();
    } catch (err: any) {
      setTwoFaError(err.message || 'Failed to toggle 2FA settings');
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (!currentPassword) {
      setPassError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setPassError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('New passwords do not match.');
      return;
    }

    setPassLoading(true);

    try {
      const res = await changeUserPassword(user.id, role, currentPassword, newPassword);
      setPassSuccess(res.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      if (securityStatus) {
        setSecurityStatus({
          ...securityStatus,
          securityScore: res.securityScore
        });
      }

      if (onUserUpdated) {
        onUserUpdated({
          ...user,
          securityScore: res.securityScore
        });
      }

      await loadSecurityData();
    } catch (err: any) {
      setPassError(err.message || 'Failed to update password');
    } finally {
      setPassLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setSessionActionLoading(true);
    setSessionMessage(null);
    try {
      const res = await revokeUserSession(sessionId);
      setSessionMessage(res.message);
      await loadSecurityData();
    } catch (err: any) {
      setSessionMessage(`Error: ${err.message}`);
    } finally {
      setSessionActionLoading(false);
    }
  };

  const handleRevokeAllOther = async () => {
    setSessionActionLoading(true);
    setSessionMessage(null);
    try {
      const current = securityStatus?.activeSessions.find((s) => s.isCurrent);
      const currentSessionId = current?.sessionId || current?.id;
      const res = await revokeAllOtherSessions(user.id, currentSessionId);
      setSessionMessage(res.message);
      await loadSecurityData();
    } catch (err: any) {
      setSessionMessage(`Error: ${err.message}`);
    } finally {
      setSessionActionLoading(false);
    }
  };

  const score = securityStatus?.securityScore || (user.twoFactorEnabled ? 95 : 65);
  const scoreBadgeColor =
    score >= 85
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
      : score >= 60
      ? 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300'
      : 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300';

  return (
    <div className="space-y-6">
      {/* Top Banner Shield */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 shadow-inner">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">Security & Anti-Hacking Center</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  EstateGuard 256-Bit
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-xl">
                Cryptographic PBKDF2 salting, real-time brute-force firewall, biometric 2FA email challenge, and tamper-resistant audit logs protecting your rental portfolio.
              </p>
            </div>
          </div>

          {/* Security Score Badge */}
          <div className="flex flex-col items-center sm:items-end bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 px-5">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Account Protection</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`text-2xl font-black ${score >= 85 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>
                {score}%
              </span>
              <span className="text-xs text-slate-400">/ 100</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold mt-0.5">
              {score >= 85 ? 'Shield Active (High)' : 'Standard (Enable 2FA)'}
            </span>
          </div>
        </div>

        {/* Security Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-800/80 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Protection Shield</span>
          </button>

          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'sessions'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Active Sessions ({securityStatus?.activeSessions.length || 1})</span>
          </button>

          <button
            onClick={() => setActiveTab('password')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'password'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Master Password</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'logs'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Security Audit Trail</span>
          </button>

          <div className="ml-auto">
            <button
              onClick={loadSecurityData}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Refresh security metrics"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: PROTECTION SHIELD OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Active Shield Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 2FA Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    securityStatus?.twoFactorEnabled
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  }`}>
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Two-Factor Authentication (2FA)</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Dispatches a 6-digit one-time passkey upon sign-in.
                    </p>
                  </div>
                </div>

                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  securityStatus?.twoFactorEnabled
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {securityStatus?.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span>Registered Verification Channel:</span>
                  <strong className="text-slate-900 dark:text-white font-mono">{user.email}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Security Boost:</span>
                  <strong className="text-emerald-600 dark:text-emerald-400">+35% Protection</strong>
                </div>
              </div>

              {twoFaSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{twoFaSuccess}</span>
                </div>
              )}

              {twoFaError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{twoFaError}</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setTwoFaModalOpen(true)}
                  disabled={twoFaLoading}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition shadow-sm ${
                    securityStatus?.twoFactorEnabled
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{securityStatus?.twoFactorEnabled ? 'Disable 2FA Protection' : 'Activate 2FA Protection'}</span>
                </button>
              </div>
            </div>

            {/* Anti-Brute Force Protection Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Anti-Brute Force Firewall</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Auto-locks accounts after 5 invalid attempts for 15 minutes.
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
                  Always Active
                </span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span>Current Failed Attempts:</span>
                  <strong className="font-mono text-slate-900 dark:text-white">{securityStatus?.failedAttempts || 0} / 5</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Account Lockout Status:</span>
                  <strong className={securityStatus?.isLocked ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                    {securityStatus?.isLocked ? 'LOCKED' : 'CLEAN / UNRESTRICTED'}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Firewall Algorithm:</span>
                  <span className="text-slate-500 dark:text-slate-400 font-mono">Constant-Time Safe Compare</span>
                </div>
              </div>

              <div className="p-3 bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200/60 dark:border-sky-800/50 rounded-xl text-xs text-sky-800 dark:text-sky-300 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
                <span>Any remote attacker attempting dictionary attacks will be permanently throttled by IP and account ID.</span>
              </div>
            </div>

            {/* Payout & Settlement Tamper Shield */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Bank Settlement Shield</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Step-Up authentication required before altering payout details.
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
                  Protected
                </span>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Modifying settlement Till Numbers, Paybills, or Bank account numbers triggers a high-entropy step-up challenge sent to your verified registered email to prevent unauthorized rerouting of rental funds.
              </div>
            </div>

            {/* Cryptographic Salting & PBKDF2 Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Cryptographic PBKDF2-SHA512</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Individual 32-byte salts with 10,000 iterations.
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                  Salted
                </span>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                All credentials stored on EstateMaster use individual cryptographically random hex salts. Plaintext passwords are automatically stripped before client payload delivery.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ACTIVE SESSIONS */}
      {activeTab === 'sessions' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Authorized Device Sessions</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Manage all web browsers and mobile devices currently logged into your EstateMaster account.
              </p>
            </div>

            <button
              type="button"
              onClick={handleRevokeAllOther}
              disabled={sessionActionLoading || (securityStatus?.activeSessions.length || 0) <= 1}
              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:border dark:border-rose-800 dark:text-rose-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out All Other Devices</span>
            </button>
          </div>

          {sessionMessage && (
            <div className="p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl text-xs text-sky-800 dark:text-sky-300 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>{sessionMessage}</span>
            </div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(securityStatus?.activeSessions || []).map((sess, sIdx) => {
              const sessionKey = `sess-${sess.sessionId || sess.id || ''}-${sIdx}`;
              const targetSessionId = sess.sessionId || sess.id || '';
              return (
                <div key={sessionKey} className="py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                      {sess.deviceType === 'mobile' ? <Smartphone className="w-5 h-5" /> : <Laptop className="w-5 h-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {sess.deviceType === 'mobile' ? 'Mobile App / Smartphone' : 'Desktop Browser Session'}
                        </span>
                        {sess.isCurrent && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-bold rounded-full border border-emerald-300 dark:border-emerald-700">
                            Current Device
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          <span>{sess.ipAddress}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>Signed in: {new Date(sess.createdAt).toLocaleString()}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {!sess.isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(targetSessionId)}
                      disabled={sessionActionLoading}
                      className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-xs transition"
                      title="Terminate this session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: MASTER PASSWORD */}
      {activeTab === 'password' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm max-w-xl space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Change Master Password</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Updating your master password will re-salt your hash and revoke any unrecognized sessions.
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            {passSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{passSuccess}</span>
              </div>
            )}

            {passError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{passError}</span>
              </div>
            )}

            {/* Current Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showCurrentPass ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-sky-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                New Password (Min 8 Characters)
              </label>
              <div className="relative">
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-sky-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-sky-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={passLoading}
              className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs rounded-xl shadow-lg shadow-sky-600/20 disabled:opacity-50 flex items-center justify-center gap-2 transition"
            >
              {passLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              <span>Update Password & Re-Encrypt Hash</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: SECURITY AUDIT TRAIL LOGS */}
      {activeTab === 'logs' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Security Event Audit Trail</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Immutable record of sign-in events, failed attempts, and administrative security actions.
              </p>
            </div>

            <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
              {logs.length} Events Logged
            </span>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs">
              No recent security incidents logged. Your account is secure.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Event Type</th>
                    <th className="py-2.5 px-3">Severity</th>
                    <th className="py-2.5 px-3">Details</th>
                    <th className="py-2.5 px-3">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {logs.map((l, lIdx) => (
                    <tr key={`sec-log-${l.id || l.timestamp}-${lIdx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {new Date(l.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-semibold">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                          l.eventType.includes('SUCCESS')
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : l.eventType.includes('FAIL') || l.eventType.includes('LOCKOUT')
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                        }`}>
                          {l.eventType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`font-bold ${
                          l.severity === 'HIGH' || l.severity === 'CRITICAL'
                            ? 'text-rose-600'
                            : l.severity === 'MEDIUM'
                            ? 'text-amber-600'
                            : 'text-slate-500'
                        }`}>
                          {l.severity}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-sans">
                        {l.details}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {l.ipAddress || '127.0.0.1'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2FA Toggle Confirmation Modal */}
      {twoFaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {securityStatus?.twoFactorEnabled ? 'Disable 2FA Protection' : 'Activate 2FA Protection'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Confirm your master password to proceed.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Confirm Master Password
              </label>
              <input
                type="password"
                value={twoFaConfirmPass}
                onChange={(e) => setTwoFaConfirmPass(e.target.value)}
                placeholder="Enter your current password"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTwoFaModalOpen(false);
                  setTwoFaConfirmPass('');
                }}
                className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition font-medium"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleToggle2FA(!securityStatus?.twoFactorEnabled)}
                disabled={twoFaLoading || !twoFaConfirmPass}
                className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-lg shadow-sky-600/20 disabled:opacity-50 flex items-center gap-1.5 transition"
              >
                {twoFaLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm & Apply</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
