import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';
import { memoryLocalCache } from 'firebase/firestore';
import { createNoxClient, type NoxClient } from '@nox/firebase';
import { readConfig, type ConfigResult } from './config';

export interface ClientBoot extends ConfigResult {
  client: NoxClient | null;
  error: string | null;
}

let boot: ClientBoot | null = null;

/**
 * Cria o cliente Firebase do NOX uma única vez. Auth persiste a sessão no AsyncStorage;
 * Firestore usa cache em memória (o app reconecta e reassina ao abrir).
 */
export function bootClient(): ClientBoot {
  if (boot) return boot;
  const cfg = readConfig();
  if (!cfg.config) {
    boot = { ...cfg, client: null, error: null };
    return boot;
  }
  try {
    const client = createNoxClient(cfg.config, {
      createAuth: (app): Auth => {
        try {
          return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
        } catch {
          // Recarregamento rápido em desenvolvimento: o Auth já foi inicializado.
          return getAuth(app);
        }
      },
      firestoreSettings: { localCache: memoryLocalCache() },
    });
    boot = { ...cfg, client, error: null };
  } catch (err) {
    boot = { ...cfg, client: null, error: (err as Error)?.message ?? 'Falha ao iniciar o Firebase.' };
  }
  return boot;
}
