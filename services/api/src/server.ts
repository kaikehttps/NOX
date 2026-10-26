import { serve } from '@hono/node-server';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createApp } from './app';
import { loadConfig } from './config';
import { RateLimiter } from './rate-limit';

const config = loadConfig();

// Em produção (Cloud Run) usa a conta de serviço do próprio serviço (ADC).
// Com FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST definidos, conecta aos emuladores.
const usingEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const firebase =
  getApps()[0] ??
  initializeApp({
    projectId: config.projectId,
    ...(config.storageBucket ? { storageBucket: config.storageBucket } : {}),
    ...(usingEmulators ? {} : { credential: applicationDefault() }),
  });

const app = createApp({
  db: getFirestore(firebase),
  auth: getAuth(firebase),
  storage: config.storageBucket ? getStorage(firebase) : null,
  config,
  limiter: new RateLimiter(),
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    JSON.stringify({
      severity: 'INFO',
      message: `nox-api ouvindo em :${info.port}`,
      emulators: usingEmulators,
      voice: config.livekit !== null,
    }),
  );
});
