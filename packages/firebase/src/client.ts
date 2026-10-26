import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
  type FirestoreSettings,
} from 'firebase/firestore';
import { connectDatabaseEmulator, getDatabase, type Database } from 'firebase/database';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { ApiClient } from './api';

/** Configuração pública do app Firebase (não contém segredos) + URL da API. */
export interface NoxConfig {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    appId: string;
    databaseURL: string;
    messagingSenderId?: string;
  };
  apiBaseUrl: string;
  /** Host dos emuladores (ex.: 127.0.0.1). Quando definido, todos os serviços usam o Emulator Suite. */
  emulatorHost?: string | null;
}

export interface NoxClient {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  rtdb: Database;
  storage: FirebaseStorage;
  api: ApiClient;
  config: NoxConfig;
}

export interface PlatformAdapters {
  /** Cada plataforma inicializa o Auth com sua persistência (IndexedDB no desktop, AsyncStorage no mobile). */
  createAuth: (app: FirebaseApp) => Auth;
  /** Cache do Firestore. Desktop usa cache persistente; mobile usa memória. */
  firestoreSettings?: FirestoreSettings;
}

let current: NoxClient | null = null;

export function createNoxClient(config: NoxConfig, adapters: PlatformAdapters): NoxClient {
  if (current) return current;
  const app = getApps()[0] ?? initializeApp(config.firebase);
  const auth = adapters.createAuth(app);
  const db = initializeFirestore(app, adapters.firestoreSettings ?? { localCache: memoryLocalCache() });
  const rtdb = getDatabase(app, config.firebase.databaseURL);
  const storage = getStorage(app);

  const host = config.emulatorHost;
  if (host) {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectDatabaseEmulator(rtdb, host, 9000);
    connectStorageEmulator(storage, host, 9199);
  }

  const api = new ApiClient(config.apiBaseUrl, async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('não autenticado');
    return user.getIdToken();
  });

  current = { app, auth, db, rtdb, storage, api, config };
  return current;
}

export function getNoxClient(): NoxClient {
  if (!current) throw new Error('createNoxClient() precisa ser chamado na inicialização do app');
  return current;
}
