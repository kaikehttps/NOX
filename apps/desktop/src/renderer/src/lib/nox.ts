import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import { persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';
import { createNoxClient, type NoxClient, type NoxConfig } from '@nox/firebase';
import { VoiceSession } from '@nox/realtime';
import { createWebVoicePlatform } from '@nox/realtime/web';

const env = import.meta.env;
const useEmulators = env.VITE_USE_EMULATORS === 'true';

/** Variáveis obrigatórias ausentes (exibidas na tela de configuração). */
export const missingConfig: string[] = useEmulators
  ? []
  : (
      [
        ['VITE_FIREBASE_API_KEY', env.VITE_FIREBASE_API_KEY],
        ['VITE_FIREBASE_PROJECT_ID', env.VITE_FIREBASE_PROJECT_ID],
        ['VITE_FIREBASE_APP_ID', env.VITE_FIREBASE_APP_ID],
        ['VITE_FIREBASE_DATABASE_URL', env.VITE_FIREBASE_DATABASE_URL],
        ['VITE_API_BASE_URL', env.VITE_API_BASE_URL],
      ] as const
    )
      .filter(([, v]) => !v)
      .map(([k]) => k);

function buildConfig(): NoxConfig {
  const projectId = env.VITE_FIREBASE_PROJECT_ID || 'demo-nox';
  return {
    firebase: {
      apiKey: env.VITE_FIREBASE_API_KEY || 'demo-api-key',
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
      appId: env.VITE_FIREBASE_APP_ID || 'demo-app',
      // Com emuladores, o namespace é derivado desta URL e o tráfego vai para 127.0.0.1:9000.
      databaseURL: env.VITE_FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`,
      ...(env.VITE_FIREBASE_MESSAGING_SENDER_ID ? { messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID } : {}),
    },
    apiBaseUrl: env.VITE_API_BASE_URL || 'http://127.0.0.1:8787',
    emulatorHost: useEmulators ? '127.0.0.1' : null,
  };
}

export const usingEmulators = useEmulators;

export const nox: NoxClient | null =
  missingConfig.length > 0
    ? null
    : createNoxClient(buildConfig(), {
        createAuth: (app) => initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }),
        // Cache persistente: abrir o app mostra conversas recentes instantaneamente, mesmo offline.
        firestoreSettings: { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }) },
      });

export function client(): NoxClient {
  if (!nox) throw new Error('NOX não configurado');
  return nox;
}

const VOICE_SETTINGS_KEY = 'nox.voice.settings';

function loadVoiceSettings() {
  try {
    return JSON.parse(localStorage.getItem(VOICE_SETTINGS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** Sessão de voz única do aplicativo: sobrevive à navegação entre telas. */
export const voice = new VoiceSession({
  fetchGrant: (ref) => client().api.voiceToken(ref),
  platform: createWebVoicePlatform(),
  settings: loadVoiceSettings(),
});

voice.subscribe(() => {
  try {
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(voice.getSnapshot().settings));
  } catch {
    /* armazenamento indisponível */
  }
});
