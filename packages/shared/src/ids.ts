import type { Uid } from './types';

/** DM determinística: o mesmo par de usuários sempre produz a mesma conversa. */
export function dmConversationId(a: Uid, b: Uid): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `dm_${x}_${y}`;
}

export function friendRequestId(from: Uid, to: Uid): string {
  return `${from}_${to}`;
}

export type VoiceRoomRef =
  | { kind: 'channel'; communityId: string; channelId: string }
  | { kind: 'conversation'; conversationId: string };

const ROOM_PREFIX = 'nox';

export function voiceRoomName(ref: VoiceRoomRef): string {
  return ref.kind === 'channel'
    ? `${ROOM_PREFIX}:ch:${ref.communityId}:${ref.channelId}`
    : `${ROOM_PREFIX}:cv:${ref.conversationId}`;
}

export function parseVoiceRoomName(name: string): VoiceRoomRef | null {
  const parts = name.split(':');
  if (parts[0] !== ROOM_PREFIX) return null;
  if (parts[1] === 'ch' && parts.length === 4 && parts[2] && parts[3]) {
    return { kind: 'channel', communityId: parts[2], channelId: parts[3] };
  }
  if (parts[1] === 'cv' && parts.length === 3 && parts[2]) {
    return { kind: 'conversation', conversationId: parts[2] };
  }
  return null;
}

export function sameVoiceRoom(a: VoiceRoomRef | null, b: VoiceRoomRef | null): boolean {
  if (!a || !b) return a === b;
  return voiceRoomName(a) === voiceRoomName(b);
}

/** Alfabeto sem caracteres ambíguos (0/O, 1/l/I) para códigos de convite legíveis. */
export const INVITE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const INVITE_CODE_LENGTH = 10;
