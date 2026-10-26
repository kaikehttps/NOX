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
import { DirectApi, type NoxApi } from './direct';

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
  /** Operações de dados (modo direto) + voz pelo servidor, se configurado. */
  api: NoxApi;
  /** true quando há servidor: habilita a voz. */
  hasServer: boolean;
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

  // Dados sempre direto no Firestore (instantâneo, sem depender do servidor acordado).
  // O servidor, quando configurado, é usado só para o que exige segredo: tokens de voz.
  const hasServer = Boolean(config.apiBaseUrl);
  const server = hasServer
    ? new ApiClient(
        config.apiBaseUrl,
        async () => {
          const user = auth.currentUser;
          if (!user) throw new Error('não autenticado');
          return user.getIdToken();
        },
        // Hospedagens gratuitas "dormem": o primeiro pedido pode levar ~1 min.
        75_000,
      )
    : null;
  // Acorda o servidor em segundo plano ao abrir o app, antes de alguém entrar numa sala.
  if (hasServer) void fetch(`${config.apiBaseUrl.replace(/\/$/, '')}/healthz`).catch(() => undefined);
  const api: NoxApi = new DirectApi(db, auth, server);

  current = { app, auth, db, rtdb, storage, api, hasServer, config };
  return current;
}

export function getNoxClient(): NoxClient {
  if (!current) throw new Error('createNoxClient() precisa ser chamado na inicialização do app');
  return current;
}
