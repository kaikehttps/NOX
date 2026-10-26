import { serve } from '@hono/node-server';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createApp } from './app';
import { loadConfig } from './config';
import { RateLimiter } from './rate-limit';

const config = loadConfig();

/**
 * Credencial do Admin SDK:
 * - Cloud Run / GCP: identidade do serviço (ADC), sem arquivo.
 * - Hospedagem fora do Google (ex.: Render): FIREBASE_SERVICE_ACCOUNT_JSON com o JSON da conta
 *   de serviço (puro ou em base64). É um segredo administrativo: só em variável de ambiente do servidor.
 */
function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return applicationDefault();
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return cert(JSON.parse(text));
}

// Em produção (Cloud Run) usa a conta de serviço do próprio serviço (ADC).
// Com FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST definidos, conecta aos emuladores.
const usingEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const firebase =
  getApps()[0] ??
  initializeApp({
    projectId: config.projectId,
    ...(config.storageBucket ? { storageBucket: config.storageBucket } : {}),
    ...(usingEmulators ? {} : { credential: loadCredential() }),
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
