import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Server,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Mail,
  Smartphone,
  Info,
  X
} from 'lucide-react';
import {
  getServerConfig,
  setServerUrl,
  testServerConnection,
  ServerStatusInfo,
  DEFAULT_PRODUCTION_API_URL
} from '../lib/api';

interface ServerConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectionUpdated?: () => void;
}

export const ServerConnectionModal: React.FC<ServerConnectionModalProps> = ({
  isOpen,
  onClose,
  onConnectionUpdated
}) => {
  const [currentConfig, setCurrentConfig] = useState(getServerConfig());
  const [urlInput, setUrlInput] = useState(currentConfig.currentUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ServerStatusInfo | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const cfg = getServerConfig();
      setCurrentConfig(cfg);
      setUrlInput(cfg.currentUrl);
      setTestResult(null);
      setSaveSuccess(false);
      // Auto-run test on open
      runTest(cfg.currentUrl);
    }
  }, [isOpen]);

  const runTest = async (urlToTest: string) => {
    setTesting(true);
    try {
      const res = await testServerConnection(urlToTest);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        connected: false,
        latencyMs: 0,
        message: err.message || 'Connection failed',
        serverTime: ''
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    setServerUrl(urlInput);
    const updated = getServerConfig();
    setCurrentConfig(updated);
    setSaveSuccess(true);
    runTest(updated.currentUrl);
    if (onConnectionUpdated) {
      onConnectionUpdated();
    }
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleSetPreset = (presetUrl: string) => {
    setUrlInput(presetUrl);
    setServerUrl(presetUrl);
    const updated = getServerConfig();
    setCurrentConfig(updated);
    runTest(presetUrl);
    if (onConnectionUpdated) {
      onConnectionUpdated();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden font-sans flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 p-5 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20">
                <Server className="w-6 h-6 text-cyan-300" />
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-white">
                  Backend & Mobile Sync
                </h3>
                <p className="text-xs text-blue-200">
                  Configure API, 2FA & SMTP email server connectivity
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
            {/* Status Card */}
            <div
              className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
                testResult?.connected
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
              }`}
            >
              <div className="mt-0.5">
                {testing ? (
                  <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                ) : testResult?.connected ? (
                  <Wifi className="w-5 h-5 text-emerald-600" />
                ) : (
                  <WifiOff className="w-5 h-5 text-amber-600" />
                )}
              </div>
              <div className="space-y-1 text-xs sm:text-sm">
                <div className="flex items-center gap-2 font-extrabold">
                  <span>
                    {testing
                      ? 'Pinging Server...'
                      : testResult?.connected
                      ? 'Connected to Live Server'
                      : 'Standalone Mobile / Offline Mode'}
                  </span>
                  {testResult?.latencyMs ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-200/70 dark:bg-emerald-800/60 text-emerald-900 dark:text-emerald-100 font-bold text-[11px]">
                      {testResult.latencyMs}ms
                    </span>
                  ) : null}
                </div>
                <p className="opacity-90 leading-relaxed text-xs">
                  {testResult?.message ||
                    'EstateMaster functions smoothly offline using secure on-device storage. To send real emails or sync across multiple phones, connect to your live backend server.'}
                </p>
                {testResult?.emailConfigured !== undefined && (
                  <div className="pt-1 flex items-center gap-1.5 font-semibold text-xs">
                    <Mail className="w-3.5 h-3.5" />
                    <span>
                      Email Service:{' '}
                      {testResult.emailConfigured
                        ? `Active (${testResult.emailProvider?.toUpperCase()})`
                        : 'Simulated (Set SMTP in server env)'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Why APK differs from Web Explanation */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Why does an APK require a Backend Server?
              </div>
              <p className="leading-relaxed">
                When running in a web browser, the app connects directly to the Node.js Express server. An Android APK runs on your phone’s local processor; it needs network access to your hosted server to dispatch real SMTP emails and sync multi-device accounts.
              </p>
              <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-medium">
                <ShieldCheck className="w-4 h-4" />
                <span>
                  <strong>Offline Mode Active:</strong> 2FA codes, login, and email alerts are simulated locally on this phone when no server is connected.
                </span>
              </div>
            </div>

            {/* Server URL Input */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                Backend Server URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://your-domain.com or http://192.168.1.xxx:3000"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => runTest(urlInput)}
                  disabled={testing}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                  Test
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Leave empty for same-origin web server or local standalone operation.
              </p>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Quick Presets:
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSetPreset(DEFAULT_PRODUCTION_API_URL)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Official Cloud Run Backend Server"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live Cloud Server (Cloud Run)
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPreset('')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  Auto / On-Device Standalone
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPreset('http://10.0.2.2:3000')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  title="Android Emulator Host loopback"
                >
                  Android Emulator (10.0.2.2:3000)
                </button>
              </div>
            </div>

            {saveSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Server settings saved successfully!
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md shadow-blue-500/20 transition-all scale-[1.01] hover:scale-[1.02]"
            >
              Save & Apply Settings
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
