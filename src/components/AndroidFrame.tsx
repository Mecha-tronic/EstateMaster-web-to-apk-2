import React from 'react';

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
    <div className="w-screen min-h-screen h-screen bg-slate-50 text-slate-900 flex flex-col overflow-y-auto font-sans">
      {children}
    </div>
  );
};

