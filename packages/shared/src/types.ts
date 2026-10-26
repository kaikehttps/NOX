/**
 * Tipos de domínio do NOX, independentes de plataforma.
 * Datas são milissegundos desde a época (UTC). `null` em `createdAt` indica
 * escrita ainda não confirmada pelo servidor (estado otimista local).
 */

export type Uid = string;

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';

export interface UserProfile {
  uid: Uid;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  createdAt: number | null;
}

export interface FriendRequest {
  id: string;
  from: Uid;
  to: Uid;
  createdAt: number | null;
}

export interface Friendship {
  uid: Uid;
  since: number | null;
  conversationId: string;
}

export interface Block {
  uid: Uid;
  createdAt: number | null;
}

export type ConversationType = 'dm' | 'group';

export interface Conversation {
  id: string;
  type: ConversationType;
  memberIds: Uid[];
  name: string | null;
  ownerId: Uid | null;
  /** Conversas bloqueadas aceitam leitura, mas não novas mensagens. */
  locked: boolean;
  createdAt: number | null;
  lastMessageAt: number | null;
  lastMessagePreview: string | null;
  lastMessageAuthorId: Uid | null;
}

export type CommunityRole = 'owner' | 'admin' | 'moderator' | 'member';

export interface Community {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  ownerId: Uid;
  createdAt: number | null;
}

export interface CommunityMember {
  uid: Uid;
  role: CommunityRole;
  joinedAt: number | null;
}

/** Índice reverso em `users/{uid}/memberships/{communityId}`. */
export interface Membership {
  communityId: string;
  role: CommunityRole;
  joinedAt: number | null;
}

export interface Category {
  id: string;
  name: string;
  position: number;
}

export type ChannelType = 'text' | 'voice';

/** Papel mínimo exigido para cada operação no canal. */
export interface ChannelAccess {
  view: CommunityRole;
  send: CommunityRole;
  attach: CommunityRole;
  connect: CommunityRole;
}

export interface Channel {
  id: string;
  communityId: string;
  categoryId: string | null;
  name: string;
  type: ChannelType;
  topic: string;
  position: number;
  access: ChannelAccess;
}

export interface Invite {
  code: string;
  communityId: string;
  communityName: string;
  createdBy: Uid;
  createdAt: number | null;
  expiresAt: number | null;
  maxUses: number | null;
  uses: number;
  revoked: boolean;
}

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  contentType: string;
  size: number;
  storagePath: string;
  width?: number;
  height?: number;
}

export interface MessageReply {
  id: string;
  authorId: Uid;
  preview: string;
}

/** emoji → (uid → true). Mapa permite validar nas regras que cada usuário altera apenas a própria reação. */
export type ReactionMap = Record<string, Record<Uid, true>>;

export interface Message {
  id: string;
  authorId: Uid;
  text: string;
  createdAt: number | null;
  editedAt: number | null;
  replyTo: MessageReply | null;
  mentions: Uid[];
  attachments: Attachment[];
  reactions: ReactionMap;
  pinned: boolean;
}

export type MessageScope =
  | { kind: 'conversation'; conversationId: string }
  | { kind: 'channel'; communityId: string; channelId: string };

/** Quem está conectado em qual canal de voz (alimentado pelos webhooks do LiveKit). */
export interface VoiceState {
  uid: Uid;
  channelId: string;
  joinedAt: number | null;
}

export interface UserSettings {
  theme: 'dark' | 'light';
  accent: string;
  fontScale: number;
  density: 'compact' | 'cozy';
  reducedMotion: boolean;
  uiSounds: boolean;
  allowFriendRequests: boolean;
  allowDmsFromNonFriends: boolean;
}
