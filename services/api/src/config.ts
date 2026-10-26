export interface LiveKitConfig {
  /** URL WebSocket entregue aos clientes, ex.: wss://nox-xxxx.livekit.cloud */
  url: string;
  apiKey: string;
  apiSecret: string;
}

export interface ApiConfig {
  port: number;
  projectId: string;
  storageBucket: string | null;
  livekit: LiveKitConfig | null;
}

/**
 * Configuração vinda do ambiente. Em produção, segredos (LIVEKIT_API_SECRET) chegam
 * do Secret Manager montado como variável de ambiente pelo Cloud Run — nunca do repositório.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const projectId = env.FIREBASE_PROJECT_ID ?? env.GOOGLE_CLOUD_PROJECT ?? env.GCLOUD_PROJECT;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID não definido');

  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = env;
  const livekit =
    LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET
      ? { url: LIVEKIT_URL, apiKey: LIVEKIT_API_KEY, apiSecret: LIVEKIT_API_SECRET }
      : null;

  return {
    port: Number(env.PORT ?? 8787),
    projectId,
    storageBucket: env.FIREBASE_STORAGE_BUCKET ?? null,
    livekit,
  };
}
