/**
 * Limites operacionais. Não são limites artificiais de expressão: existem para
 * proteger custo, armazenamento e o serviço contra abuso. Ajuste conforme o uso real.
 * Os limites de tamanho também são aplicados em `firebase/storage.rules` e
 * `firebase/firestore.rules` — mantenha os valores sincronizados.
 */
export const LIMITS = {
  username: { min: 3, max: 24 },
  displayName: { max: 48 },
  bio: { max: 300 },
  message: {
    textMax: 4000,
    attachmentsMax: 10,
    mentionsMax: 50,
    /** Janela anti-spam aplicada no cliente e verificável no servidor. */
    burst: { count: 10, windowMs: 5_000 },
    pageSize: 50,
  },
  community: {
    nameMin: 2,
    nameMax: 64,
    descriptionMax: 500,
    channelsMax: 200,
    categoriesMax: 50,
    ownedMax: 50,
  },
  channel: { nameMax: 48, topicMax: 300 },
  group: { membersMax: 25, nameMax: 64 },
  invite: {
    maxUsesCap: 1000,
    maxAgeSeconds: 60 * 60 * 24 * 30,
    activePerCommunity: 100,
  },
  upload: {
    avatarBytes: 4 * 1024 * 1024,
    attachmentBytes: 50 * 1024 * 1024,
    emojiBytes: 512 * 1024,
    stickerBytes: 1024 * 1024,
  },
  voice: {
    /** Validade do token de mídia. O LiveKit renova tokens de sessões conectadas automaticamente. */
    tokenTtlSeconds: 60 * 60,
  },
} as const;

export const USERNAME_PATTERN = /^[a-z0-9_.]+$/;
