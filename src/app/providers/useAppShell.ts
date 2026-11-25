import { createContext, useContext } from 'react';
import type { SupportedLanguage } from '../../shared/contracts';
import type { LocalizedStrings } from '../../types/i18n';

export interface AppShellContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: LocalizedStrings;
  currentPath: string;
  navigate: (to: string) => void;
}

export const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error('useAppShell must be used inside AppProviders');
  }
  return ctx;
}
