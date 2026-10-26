import { Platform } from 'react-native';
import type { NoxConfig } from '@nox/firebase';

export interface ConfigResult {
  config: NoxConfig | null;
  /** Variáveis obrigatórias ausentes (vazio quando a configuração está completa). */
  missing: string[];
  usingEmulators: boolean;
}

const clean = (v: string | undefined) => (v ?? '').trim();

/**
 * Lê a configuração pública do app. O Expo só embute `process.env.EXPO_PUBLIC_*`
 * quando o acesso é estático, por isso cada variável é lida explicitamente.
 */
export function readConfig(): ConfigResult {
  const env = {
    EXPO_PUBLIC_FIREBASE_API_KEY: clean(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: clean(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: clean(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: clean(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
    EXPO_PUBLIC_FIREBASE_APP_ID: clean(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
    EXPO_PUBLIC_FIREBASE_DATABASE_URL: clean(process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL),
    EXPO_PUBLIC_API_BASE_URL: clean(process.env.EXPO_PUBLIC_API_BASE_URL),
  };
  const messagingSenderId = clean(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID);
  const usingEmulators = clean(process.env.EXPO_PUBLIC_USE_EMULATORS).toLowerCase() === 'true';
  const host = clean(process.env.EXPO_PUBLIC_EMULATOR_HOST) || (Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1');

  if (usingEmulators) {
    // Com o Emulator Suite, valores de demonstração bastam (projeto demo-*).
    const projectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'demo-nox';
    env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = projectId;
    env.EXPO_PUBLIC_FIREBASE_API_KEY ||= 'demo-api-key';
    env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||= `${projectId}.firebaseapp.com`;
    env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||= `${projectId}.appspot.com`;
    env.EXPO_PUBLIC_FIREBASE_APP_ID ||= '1:000000000000:web:demo';
    env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ||= `http://${host}:9000?ns=${projectId}`;
    env.EXPO_PUBLIC_API_BASE_URL ||= `http://${host}:8787`;
  }

  const required: (keyof typeof env)[] = [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
    'EXPO_PUBLIC_FIREBASE_DATABASE_URL',
    'EXPO_PUBLIC_API_BASE_URL',
  ];
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) return { config: null, missing, usingEmulators };

  return {
    usingEmulators,
    missing: [],
    config: {
      firebase: {
        apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
        authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || `${env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || `${env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`,
        appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
        databaseURL: env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
        ...(messagingSenderId ? { messagingSenderId } : {}),
      },
      apiBaseUrl: env.EXPO_PUBLIC_API_BASE_URL,
      emulatorHost: usingEmulators ? host : null,
    },
  };
}

export const googleConfig = {
  webClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  iosClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
};
