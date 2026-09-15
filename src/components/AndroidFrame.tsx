import React from 'react';
import { motion } from 'motion/react';

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
      className="w-screen min-h-screen h-screen bg-slate-50/90 text-slate-900 flex flex-col overflow-y-auto font-sans selection:bg-blue-500 selection:text-white"
    >
      {children}
    </motion.div>
  );
};

