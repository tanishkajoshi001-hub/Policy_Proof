import React, { useState, useEffect, useCallback, Suspense } from 'react';
import type { SupportedLanguage } from '../../shared/contracts';
import { en } from '../../locales/en';
import { hi } from '../../locales/hi';
import { publicAppConfig } from '../config/env';
import { ErrorBoundary } from '../boundaries/ErrorBoundary';
import { LoadingFallback } from '../boundaries/LoadingFallback';
import { AppShellContext } from './useAppShell';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<SupportedLanguage>(publicAppConfig.defaultLanguage);
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (typeof window !== 'undefined' && window.location.pathname !== to) {
      window.history.pushState({}, '', to);
      setCurrentPath(to);
    }
  }, []);

  const t = language === 'en' ? en : hi;

  return (
    <ErrorBoundary>
      <AppShellContext.Provider
        value={{
          language,
          setLanguage,
          t,
          currentPath,
          navigate,
        }}
      >
        <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
      </AppShellContext.Provider>
    </ErrorBoundary>
  );
};
