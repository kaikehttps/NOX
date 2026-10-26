import { Hono } from 'hono';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { AccessToken, TrackSource, WebhookReceiver } from 'livekit-server-sdk';
import {
  LIMITS,
  canOnChannel,
  parseVoiceRoomName,
  voiceRoomName,
  type ChannelAccess,
  type CommunityRole,
  type VoiceRoomRef,
} from '@nox/shared';
import { voiceTokenRequestSchema } from '@nox/validation';
import type { AppEnv, Deps } from '../context';
import { forbidden, notFound, parse, unauthorized, unavailable } from '../errors';

/** Verifica se o usuário pode entrar na sala; lança erro caso contrário. */
export async function authorizeVoice(db: Firestore, uid: string, ref: VoiceRoomRef): Promise<void> {
  if (ref.kind === 'channel') {
    const [member, channel] = await db.getAll(
      db.doc(`communities/${ref.communityId}/members/${uid}`),
      db.doc(`communities/${ref.communityId}/channels/${ref.channelId}`),
    );
    if (!member!.exists || !channel!.exists) throw notFound('channel_not_found', 'Canal não encontrado.');
    if (channel!.get('type') !== 'voice') throw forbidden('not_voice', 'Este canal não é de voz.');
    const role = member!.get('role') as CommunityRole;
    if (!canOnChannel(role, { access: channel!.get('access') as ChannelAccess }, 'connect')) throw forbidden();
    return;
  }
  const conv = await db.doc(`conversations/${ref.conversationId}`).get();
  const members = (conv.get('memberIds') as string[] | undefined) ?? [];
  if (!conv.exists || !members.includes(uid)) throw notFound('conversation_not_found', 'Conversa não encontrada.');
  if (conv.get('locked') === true) throw forbidden('locked', 'Esta conversa está bloqueada.');
}

function voiceStateDoc(db: Firestore, ref: VoiceRoomRef, uid: string) {
  return ref.kind === 'channel'
    ? db.doc(`communities/${ref.communityId}/voiceStates/${uid}`)
    : db.doc(`conversations/${ref.conversationId}/voiceStates/${uid}`);
}

export function voiceRoutes({ db, config, limiter }: Deps) {
  const app = new Hono<AppEnv>();

  app.post('/voice/token', async (c) => {
    const me = c.get('uid');
    if (!config.livekit) throw unavailable('voice_not_configured', 'Servidor de voz não configurado.');
    limiter.check(`vt:${me}`, 60, 10 * 60_000);
    const ref = parse(voiceTokenRequestSchema, await c.req.json());
    await authorizeVoice(db, me, ref);

    const profile = await db.doc(`users/${me}`).get();
    const room = voiceRoomName(ref);
    const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
      identity: me,
      name: (profile.get('displayName') as string | undefined) ?? 'NOX',
      metadata: JSON.stringify({ avatarUrl: profile.get('avatarUrl') ?? null }),
      ttl: LIMITS.voice.tokenTtlSeconds,
    });
    at.addGrant({
      room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
      canUpdateOwnMetadata: false,
      canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
    });
    return c.json({ serverUrl: config.livekit.url, token: await at.toJwt(), room });
  });

  return app;
}

/**
 * Webhook do LiveKit (sem autenticação Firebase: a assinatura JWT do próprio
 * LiveKit no header Authorization é verificada pelo WebhookReceiver).
 * Mantém `voiceStates` para mostrar quem está em cada canal sem polling.
 */
export function livekitWebhookRoutes({ db, config }: Deps) {
  const app = new Hono<AppEnv>();

  app.post('/livekit/webhook', async (c) => {
    if (!config.livekit) throw unavailable('voice_not_configured', 'Servidor de voz não configurado.');
    const receiver = new WebhookReceiver(config.livekit.apiKey, config.livekit.apiSecret);
    const body = await c.req.text();
    let event;
    try {
      event = await receiver.receive(body, c.req.header('Authorization'));
    } catch {
      throw unauthorized('Assinatura de webhook inválida.');
    }

    const ref = event.room?.name ? parseVoiceRoomName(event.room.name) : null;
    if (!ref) return c.json({ ignored: true });
    const identity = event.participant?.identity;

    switch (event.event) {
      case 'participant_joined':
        if (identity) {
          await voiceStateDoc(db, ref, identity).set({
            uid: identity,
            channelId: ref.kind === 'channel' ? ref.channelId : ref.conversationId,
            joinedAt: FieldValue.serverTimestamp(),
          });
        }
        break;
      case 'participant_left':
      case 'participant_connection_aborted':
        if (identity) await voiceStateDoc(db, ref, identity).delete();
        break;
      case 'room_finished': {
        const col =
          ref.kind === 'channel'
            ? db.collection(`communities/${ref.communityId}/voiceStates`).where('channelId', '==', ref.channelId)
            : db.collection(`conversations/${ref.conversationId}/voiceStates`);
        const snap = await col.get();
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        break;
      }
    }
    return c.json({ ok: true });
  });

  return app;
}
