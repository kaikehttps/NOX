import {
  FieldPath,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  LIMITS,
  extractMentions,
  messagePreview,
  type Category,
  type Channel,
  type Community,
  type CommunityMember,
  type Conversation,
  type FriendRequest,
  type Friendship,
  type Membership,
  type MessageReply,
  type MessageScope,
  type UserProfile,
  type UserSettings,
  type VoiceState,
  type Block,
} from '@nox/shared';
import { profileSetupSchema, messageTextSchema, firstIssue } from '@nox/validation';
import type { NoxClient } from './client';
import {
  toBlock,
  toCategory,
  toChannel,
  toCommunity,
  toConversation,
  toFriendRequest,
  toFriendship,
  toMember,
  toMembership,
  toMessage,
  toProfile,
  toVoiceState,
  type MessageView,
} from './convert';

export type Listener<T> = (value: T) => void;
export type ErrorListener = (err: Error) => void;

/* ───────────── perfil ───────────── */

/**
 * `null` só quando o servidor confirma que o perfil não existe. Um "não existe"
 * vindo do cache local (offline) é ignorado para não mandar quem já tem perfil
 * de volta ao onboarding.
 */
export function subscribeProfile(c: NoxClient, uid: string, cb: Listener<UserProfile | null>, onError?: ErrorListener): Unsubscribe {
  return onSnapshot(
    doc(c.db, 'users', uid),
    { includeMetadataChanges: true },
    (s) => {
      if (s.exists()) cb(toProfile(s));
      else if (!s.metadata.fromCache) cb(null);
    },
    onError,
  );
}

export async function isUsernameAvailable(c: NoxClient, username: string): Promise<boolean> {
  return !(await getDoc(doc(c.db, 'usernames', username))).exists();
}

export class ProfileSetupError extends Error {}

/** Cria perfil e reserva o nome de usuário atomicamente (as regras verificam ambos). */
export async function createProfile(
  c: NoxClient,
  uid: string,
  input: { username: string; displayName: string; avatarUrl?: string | null },
): Promise<void> {
  const parsed = profileSetupSchema.safeParse(input);
  if (!parsed.success) throw new ProfileSetupError(firstIssue(parsed.error));
  const { username, displayName } = parsed.data;
  if (!(await isUsernameAvailable(c, username))) throw new ProfileSetupError('Esse nome de usuário já está em uso.');
  const batch = writeBatch(c.db);
  batch.set(doc(c.db, 'users', uid), {
    uid,
    username,
    displayName,
    avatarUrl: input.avatarUrl ?? null,
    bio: '',
    createdAt: serverTimestamp(),
  });
  batch.set(doc(c.db, 'usernames', username), { uid });
  try {
    await batch.commit();
  } catch {
    throw new ProfileSetupError('Esse nome de usuário acabou de ser usado. Escolha outro.');
  }
}

export const updateProfile = (c: NoxClient, uid: string, patch: Partial<Pick<UserProfile, 'displayName' | 'bio' | 'avatarUrl'>>) =>
  updateDoc(doc(c.db, 'users', uid), patch);

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  accent: '#B7FF5A',
  fontScale: 1,
  density: 'cozy',
  reducedMotion: false,
  uiSounds: true,
  allowFriendRequests: true,
  allowDmsFromNonFriends: false,
};

export function subscribeSettings(c: NoxClient, uid: string, cb: Listener<UserSettings>): Unsubscribe {
  return onSnapshot(doc(c.db, 'users', uid, 'private', 'settings'), (s) => cb({ ...DEFAULT_SETTINGS, ...(s.data() ?? {}) }));
}

export const saveSettings = (c: NoxClient, uid: string, patch: Partial<UserSettings>) =>
  setDoc(doc(c.db, 'users', uid, 'private', 'settings'), patch, { merge: true });

/* ───────────── social ───────────── */

export const subscribeFriends = (c: NoxClient, uid: string, cb: Listener<Friendship[]>): Unsubscribe =>
  onSnapshot(collection(c.db, 'users', uid, 'friends'), (s) => cb(s.docs.map(toFriendship)));

export const subscribeBlocks = (c: NoxClient, uid: string, cb: Listener<Block[]>): Unsubscribe =>
  onSnapshot(collection(c.db, 'users', uid, 'blocks'), (s) => cb(s.docs.map(toBlock)));

export const subscribeFriendRequests = (
  c: NoxClient,
  uid: string,
  direction: 'incoming' | 'outgoing',
  cb: Listener<FriendRequest[]>,
): Unsubscribe =>
  onSnapshot(
    query(collection(c.db, 'friendRequests'), where(direction === 'incoming' ? 'to' : 'from', '==', uid), orderBy('createdAt', 'desc'), limit(100)),
    (s) => cb(s.docs.map(toFriendRequest)),
  );

export const subscribeConversations = (c: NoxClient, uid: string, cb: Listener<Conversation[]>): Unsubscribe =>
  onSnapshot(
    query(collection(c.db, 'conversations'), where('memberIds', 'array-contains', uid), orderBy('lastMessageAt', 'desc'), limit(100)),
    (s) => cb(s.docs.map(toConversation)),
  );

export const subscribeConversation = (c: NoxClient, id: string, cb: Listener<Conversation | null>): Unsubscribe =>
  onSnapshot(doc(c.db, 'conversations', id), (s) => cb(s.exists() ? toConversation(s) : null));

/* ───────────── comunidades ───────────── */

export const subscribeMemberships = (c: NoxClient, uid: string, cb: Listener<Membership[]>): Unsubscribe =>
  onSnapshot(collection(c.db, 'users', uid, 'memberships'), (s) => cb(s.docs.map(toMembership)));

export const subscribeCommunity = (c: NoxClient, cid: string, cb: Listener<Community | null>, onError?: ErrorListener): Unsubscribe =>
  onSnapshot(doc(c.db, 'communities', cid), (s) => cb(s.exists() ? toCommunity(s) : null), onError);

export const subscribeChannels = (c: NoxClient, cid: string, cb: Listener<Channel[]>): Unsubscribe =>
  onSnapshot(query(collection(c.db, 'communities', cid, 'channels'), orderBy('position')), (s) => cb(s.docs.map((d) => toChannel(d, cid))));

export const subscribeCategories = (c: NoxClient, cid: string, cb: Listener<Category[]>): Unsubscribe =>
  onSnapshot(query(collection(c.db, 'communities', cid, 'categories'), orderBy('position')), (s) => cb(s.docs.map(toCategory)));

export const subscribeMembers = (c: NoxClient, cid: string, cb: Listener<CommunityMember[]>): Unsubscribe =>
  onSnapshot(collection(c.db, 'communities', cid, 'members'), (s) => cb(s.docs.map(toMember)));

export const subscribeVoiceStates = (
  c: NoxClient,
  scope: { communityId: string } | { conversationId: string },
  cb: Listener<VoiceState[]>,
): Unsubscribe => {
  const col =
    'communityId' in scope
      ? collection(c.db, 'communities', scope.communityId, 'voiceStates')
      : collection(c.db, 'conversations', scope.conversationId, 'voiceStates');
  return onSnapshot(col, (s) => cb(s.docs.map(toVoiceState)));
};

export async function previewInvite(c: NoxClient, code: string) {
  const s = await getDoc(doc(c.db, 'invites', code));
  if (!s.exists()) return null;
  const d = s.data();
  return { code, communityId: d.communityId as string, communityName: d.communityName as string, revoked: d.revoked === true };
}

/* ───────────── mensagens ───────────── */

export function messagesCollection(c: NoxClient, scope: MessageScope) {
  return scope.kind === 'conversation'
    ? collection(c.db, 'conversations', scope.conversationId, 'messages')
    : collection(c.db, 'communities', scope.communityId, 'channels', scope.channelId, 'messages');
}

export function scopeKey(scope: MessageScope): string {
  return scope.kind === 'conversation' ? `cv:${scope.conversationId}` : `ch:${scope.communityId}:${scope.channelId}`;
}

export interface MessagePage {
  messages: MessageView[];
  /** Cursor para buscar mensagens mais antigas. */
  cursor: DocumentSnapshot | null;
}

/** Janela "ao vivo" com as mensagens mais recentes (ordem decrescente do servidor, devolvida crescente). */
export function subscribeRecentMessages(
  c: NoxClient,
  scope: MessageScope,
  cb: Listener<MessagePage>,
  onError?: ErrorListener,
  pageSize: number = LIMITS.message.pageSize,
): Unsubscribe {
  const q = query(messagesCollection(c, scope), orderBy('createdAt', 'desc'), limit(pageSize));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (s) => {
      const docs = s.docs;
      cb({
        messages: docs.map(toMessage).reverse(),
        cursor: docs.length === pageSize ? (docs[docs.length - 1] ?? null) : null,
      });
    },
    onError,
  );
}

/** Página estática de mensagens anteriores ao cursor. */
export async function fetchOlderMessages(
  c: NoxClient,
  scope: MessageScope,
  cursor: DocumentSnapshot,
  pageSize: number = LIMITS.message.pageSize,
): Promise<MessagePage> {
  const s = await getDocs(query(messagesCollection(c, scope), orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize)));
  return {
    messages: s.docs.map(toMessage).reverse(),
    cursor: s.docs.length === pageSize ? (s.docs[s.docs.length - 1] ?? null) : null,
  };
}

export class MessageValidationError extends Error {}

/** ID gerado no cliente: reenviar a mesma mensagem nunca cria duplicatas. */
export function newMessageId(c: NoxClient, scope: MessageScope): string {
  return doc(messagesCollection(c, scope)).id;
}

/**
 * Envia mensagem. A promessa só resolve quando o servidor confirma a escrita;
 * até lá a mensagem aparece como `pending` na assinatura.
 */
export async function sendMessage(
  c: NoxClient,
  scope: MessageScope,
  input: { id: string; text: string; replyTo?: MessageReply | null },
): Promise<void> {
  const uid = c.auth.currentUser?.uid;
  if (!uid) throw new MessageValidationError('Sessão expirada.');
  const parsed = messageTextSchema.safeParse(input.text);
  if (!parsed.success) throw new MessageValidationError(firstIssue(parsed.error));

  const batch = writeBatch(c.db);
  batch.set(doc(messagesCollection(c, scope), input.id), {
    authorId: uid,
    text: input.text,
    createdAt: serverTimestamp(),
    editedAt: null,
    replyTo: input.replyTo ?? null,
    mentions: extractMentions(input.text).slice(0, LIMITS.message.mentionsMax),
    attachments: [],
    reactions: {},
    pinned: false,
  });
  if (scope.kind === 'conversation') {
    batch.update(doc(c.db, 'conversations', scope.conversationId), {
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: messagePreview(input.text, 120),
      lastMessageAuthorId: uid,
    });
  }
  await batch.commit();
}

export async function editMessage(c: NoxClient, scope: MessageScope, id: string, text: string): Promise<void> {
  const parsed = messageTextSchema.safeParse(text);
  if (!parsed.success) throw new MessageValidationError(firstIssue(parsed.error));
  await updateDoc(doc(messagesCollection(c, scope), id), {
    text,
    editedAt: serverTimestamp(),
    mentions: extractMentions(text).slice(0, LIMITS.message.mentionsMax),
  });
}

export const deleteMessage = (c: NoxClient, scope: MessageScope, id: string) => deleteDoc(doc(messagesCollection(c, scope), id));

export const setPinned = (c: NoxClient, scope: MessageScope, id: string, pinned: boolean) =>
  updateDoc(doc(messagesCollection(c, scope), id), { pinned });

/** Alterna a reação do usuário atual. `lastReaction` permite às regras validar a mudança. */
export async function toggleReaction(c: NoxClient, scope: MessageScope, id: string, emoji: string, active: boolean): Promise<void> {
  const uid = c.auth.currentUser?.uid;
  if (!uid) return;
  await updateDoc(
    doc(messagesCollection(c, scope), id),
    new FieldPath('reactions', emoji, uid),
    active ? true : deleteField(),
    'lastReaction',
    { uid, emoji },
  );
}

export type { MessageView };
