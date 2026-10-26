import { Timestamp, type DocumentData, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase/firestore';
import {
  DEFAULT_CHANNEL_ACCESS,
  type Category,
  type Channel,
  type Community,
  type CommunityMember,
  type Conversation,
  type FriendRequest,
  type Friendship,
  type Membership,
  type Message,
  type UserProfile,
  type VoiceState,
  type Block,
} from '@nox/shared';

type Snap = QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>;

export const millis = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);

/** Lê com estimativa local para timestamps pendentes (ordem correta em escritas otimistas). */
const data = (s: Snap) => s.data({ serverTimestamps: 'estimate' }) ?? {};

export const toProfile = (s: Snap): UserProfile => {
  const d = data(s);
  return {
    uid: s.id,
    username: d.username ?? '',
    displayName: d.displayName ?? d.username ?? '',
    avatarUrl: d.avatarUrl ?? null,
    bio: d.bio ?? '',
    createdAt: millis(d.createdAt),
  };
};

export const toFriendship = (s: Snap): Friendship => {
  const d = data(s);
  return { uid: s.id, since: millis(d.since), conversationId: d.conversationId };
};

export const toBlock = (s: Snap): Block => ({ uid: s.id, createdAt: millis(data(s).createdAt) });

export const toFriendRequest = (s: Snap): FriendRequest => {
  const d = data(s);
  return { id: s.id, from: d.from, to: d.to, createdAt: millis(d.createdAt) };
};

export const toConversation = (s: Snap): Conversation => {
  const d = data(s);
  return {
    id: s.id,
    type: d.type,
    memberIds: d.memberIds ?? [],
    name: d.name ?? null,
    ownerId: d.ownerId ?? null,
    locked: d.locked === true,
    createdAt: millis(d.createdAt),
    lastMessageAt: millis(d.lastMessageAt),
    lastMessagePreview: d.lastMessagePreview ?? null,
    lastMessageAuthorId: d.lastMessageAuthorId ?? null,
  };
};

export const toCommunity = (s: Snap): Community => {
  const d = data(s);
  return {
    id: s.id,
    name: d.name,
    description: d.description ?? '',
    iconUrl: d.iconUrl ?? null,
    ownerId: d.ownerId,
    createdAt: millis(d.createdAt),
  };
};

export const toMember = (s: Snap): CommunityMember => {
  const d = data(s);
  return { uid: s.id, role: d.role, joinedAt: millis(d.joinedAt) };
};

export const toMembership = (s: Snap): Membership => {
  const d = data(s);
  return { communityId: s.id, role: d.role, joinedAt: millis(d.joinedAt) };
};

export const toCategory = (s: Snap): Category => {
  const d = data(s);
  return { id: s.id, name: d.name, position: d.position ?? 0 };
};

export const toChannel = (s: Snap, communityId: string): Channel => {
  const d = data(s);
  return {
    id: s.id,
    communityId,
    categoryId: d.categoryId ?? null,
    name: d.name,
    type: d.type,
    topic: d.topic ?? '',
    position: d.position ?? 0,
    access: { ...DEFAULT_CHANNEL_ACCESS, ...(d.access ?? {}) },
  };
};

export const toVoiceState = (s: Snap): VoiceState => {
  const d = data(s);
  return { uid: s.id, channelId: d.channelId, joinedAt: millis(d.joinedAt) };
};

export interface MessageView extends Message {
  /** Ainda não confirmada pelo servidor. */
  pending: boolean;
}

export const toMessage = (s: Snap): MessageView => {
  const d = data(s);
  return {
    id: s.id,
    authorId: d.authorId,
    text: d.text ?? '',
    createdAt: millis(d.createdAt),
    editedAt: millis(d.editedAt),
    replyTo: d.replyTo ?? null,
    mentions: d.mentions ?? [],
    attachments: d.attachments ?? [],
    reactions: d.reactions ?? {},
    pinned: d.pinned === true,
    pending: s.metadata.hasPendingWrites,
  };
};
