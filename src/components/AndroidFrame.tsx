import React from 'react';
import { motion } from 'motion/react';
import { ThemeToggleButton } from './ThemeToggleButton';

interface AndroidFrameProps {
  isAndroidView?: boolean;
  setIsAndroidView?: (val: boolean) => void;
  activeRole?: 'landlord' | 'tenant' | 'register';
  setActiveRole?: (role: 'landlord' | 'tenant' | 'register') => void;
  unreadEmailCount?: number;
  subscriptionStatus?: string;
  children: React.ReactNode;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({ children }) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="w-screen min-h-screen h-screen bg-[#FAF8F5] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col overflow-y-auto font-sans selection:bg-blue-500 selection:text-white transition-colors duration-200"
    >
      {children}
      <ThemeToggleButton variant="floating" id="global-floating-theme-toggle" />
    </motion.div>
  );
};

