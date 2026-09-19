import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleButtonProps {
  id?: string;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'pill' | 'icon' | 'floating';
}

export const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({
  id = 'theme-toggle-btn',
  className = '',
  showLabel = false,
  size = 'md',
  variant = 'pill',
}) => {
  const { theme, isDark, toggleTheme } = useTheme();

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs gap-1.5',
    md: 'px-3 py-2 text-xs sm:text-sm gap-2',
    lg: 'px-4 py-2.5 text-sm sm:text-base gap-2.5',
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  if (variant === 'floating') {
    return (
      <button
        id={id}
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Shift to Light Mode' : 'Shift to Dark Mode'}
        className={`fixed bottom-5 right-5 z-50 p-3 rounded-full shadow-lg backdrop-blur-md border transition-all duration-300 cursor-pointer flex items-center justify-center group hover:scale-110 active:scale-95 ${
          isDark
            ? 'bg-slate-800/90 hover:bg-slate-700 text-amber-300 border-slate-700 shadow-slate-950/40 ring-1 ring-amber-400/20'
            : 'bg-white/95 hover:bg-slate-50 text-slate-700 border-slate-200 shadow-slate-300/40 hover:text-indigo-600 ring-1 ring-slate-900/5'
        } ${className}`}
      >
        {isDark ? (
          <Sun className="w-5 h-5 text-amber-400 transition-transform duration-300 rotate-0 group-hover:rotate-45" />
        ) : (
          <Moon className="w-5 h-5 text-indigo-600 transition-transform duration-300 -rotate-12 group-hover:rotate-0" />
        )}
      </button>
    );
  }

  if (variant === 'icon') {
    return (
      <button
        id={id}
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Shift to Light Mode' : 'Shift to Dark Mode'}
        className={`p-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center border shadow-2xs hover:scale-105 active:scale-95 ${
          isDark
            ? 'bg-slate-800 hover:bg-slate-700 text-amber-400 border-slate-700'
            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:text-indigo-600'
        } ${className}`}
      >
        {isDark ? (
          <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300" />
        ) : (
          <Moon className="w-4 h-4 text-indigo-600 transition-transform duration-300" />
        )}
      </button>
    );
  }

  // Default: pill format with optional label
  return (
    <button
      id={id}
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Shift to Light Mode' : 'Shift to Dark Mode'}
      className={`rounded-xl font-bold transition-all duration-200 flex items-center whitespace-nowrap cursor-pointer border shadow-2xs hover:scale-[1.02] active:scale-98 ${
        sizeClasses[size]
      } ${
        isDark
          ? 'bg-slate-800 hover:bg-slate-700/90 text-slate-100 border-slate-700/80 hover:border-slate-600'
          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/90 hover:border-slate-300 hover:text-slate-900'
      } ${className}`}
    >
      {isDark ? (
        <Sun className={`${iconSizes[size]} text-amber-400 transition-transform duration-300`} />
      ) : (
        <Moon className={`${iconSizes[size]} text-indigo-600 transition-transform duration-300`} />
      )}
      {showLabel && (
        <span className="text-xs font-semibold">
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </span>
      )}
    </button>
  );
};
