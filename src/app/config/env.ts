import type { SupportedLanguage } from '../../shared/contracts';

export type AppEnvironment = 'development' | 'staging' | 'production';

export interface PublicAppConfig {
  appEnv: AppEnvironment;
  defaultLanguage: SupportedLanguage;
  supabaseUrl: string | null;
  supabaseAnonKeyConfigured: boolean;
}

function readEnvString(key: string): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.[key]?.trim() ?? '';
}

/**
 * Validates and normalizes public client configuration at startup.
 * Never logs or exposes secret keys.
 */
export function loadPublicAppConfig(): PublicAppConfig {
  const rawEnv = readEnvString('VITE_APP_ENV');
  const appEnv: AppEnvironment =
    rawEnv === 'staging' || rawEnv === 'production' ? rawEnv : 'development';

  const rawLang = readEnvString('VITE_DEFAULT_LANGUAGE');
  const defaultLanguage: SupportedLanguage = rawLang === 'hi' ? 'hi' : 'en';

  const rawSupabaseUrl = readEnvString('VITE_SUPABASE_URL');
  let supabaseUrl: string | null = null;
  if (rawSupabaseUrl) {
    try {
      const parsed = new URL(rawSupabaseUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        supabaseUrl = rawSupabaseUrl;
      } else {
        console.warn('VITE_SUPABASE_URL must use http(s) protocol; ignoring invalid value.');
      }
    } catch {
      console.warn('VITE_SUPABASE_URL is not a valid URL; ignoring invalid value.');
    }
  }

  const supabaseAnonKeyConfigured = readEnvString('VITE_SUPABASE_ANON_KEY').length > 0;

  return {
    appEnv,
    defaultLanguage,
    supabaseUrl,
    supabaseAnonKeyConfigured,
  };
}

export const publicAppConfig = loadPublicAppConfig();
