import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Sparkles, LogOut } from 'lucide-react';

interface InactivityWarningBannerProps {
  deadlineMs: number;
  onStaySignedIn: () => void;
  onLogoutNow: () => void;
}

export const InactivityWarningBanner: React.FC<InactivityWarningBannerProps> = ({
  deadlineMs,
  onStaySignedIn,
  onLogoutNow,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    return Math.max(1, Math.ceil((deadlineMs - Date.now()) / 1000));
  });

  useEffect(() => {
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        onLogoutNow();
      }
    };

    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [deadlineMs, onLogoutNow]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-[100] bg-slate-900/95 dark:bg-slate-900/98 backdrop-blur-md text-white border-2 border-amber-400/80 rounded-2xl p-4 shadow-2xl shadow-amber-950/40"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5 border border-amber-500/30">
          <ShieldAlert className="w-5 h-5 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-extrabold text-sm text-amber-300 flex items-center gap-1.5">
              <span>Security Inactivity Alert</span>
            </h4>
            <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-black border border-amber-400/30">
              {secondsRemaining}s
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            You will be automatically signed out in{' '}
            <strong className="text-white font-mono text-sm underline decoration-amber-400 decoration-2">
              {secondsRemaining}
            </strong>{' '}
            seconds due to 2 minutes of inactivity.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onStaySignedIn}
              className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Stay Signed In
            </button>
            <button
              type="button"
              onClick={onLogoutNow}
              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
