import React from 'react';
import { Header } from '../../components/layout/Header';
import { APP_ROUTES } from '../../shared/contracts';
import { useAppShell } from '../providers/useAppShell';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { language, setLanguage, t, currentPath, navigate } = useAppShell();

  const navItems = [
    { label: 'Tracking Base (M1)', path: APP_ROUTES.HOME, matchPrefix: APP_ROUTES.TRACKING },
    { label: 'Patient (Reserved)', path: APP_ROUTES.PATIENT, matchPrefix: APP_ROUTES.PATIENT },
    { label: 'Doctor (Reserved)', path: APP_ROUTES.DOCTOR, matchPrefix: APP_ROUTES.DOCTOR },
  ];

  const isRouteActive = (path: string, matchPrefix: string): boolean => {
    if (path === APP_ROUTES.HOME) {
      return currentPath === '/' || currentPath.startsWith(APP_ROUTES.TRACKING);
    }
    return currentPath === path || currentPath.startsWith(`${matchPrefix}/`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header language={language} onLanguageChange={setLanguage} t={t} />

      <nav
        aria-label="Application route slots"
        className="w-full border-b border-slate-900 bg-slate-950/70"
      >
        <div className="max-w-6xl mx-auto px-4 py-1.5 flex items-center gap-2 overflow-x-auto">
          {navItems.map((item) => {
            const active = isRouteActive(item.path, item.matchPrefix);
            return (
              <a
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(item.path);
                }}
                aria-current={active ? 'page' : undefined}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium inline-flex items-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                  active
                    ? 'bg-slate-800 text-brand-300 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-4 flex flex-col">
        {children}
      </main>

      <footer className="w-full border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <p>RehabBuddy © {new Date().getFullYear()} • Privacy-First AI Rehabilitation Assistant</p>
      </footer>
    </div>
  );
};
