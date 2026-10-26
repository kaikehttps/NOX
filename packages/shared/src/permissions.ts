import type { Channel, ChannelAccess, CommunityRole } from './types';

/**
 * Modelo de permissões baseado em hierarquia de papéis.
 * A mesma tabela é espelhada em `firebase/firestore.rules` (função `rank`).
 * Se alterar aqui, altere lá e rode `npm run test:rules`.
 */
export const ROLE_RANK: Readonly<Record<CommunityRole, number>> = {
  member: 0,
  moderator: 1,
  admin: 2,
  owner: 3,
};

export const ROLES: readonly CommunityRole[] = ['owner', 'admin', 'moderator', 'member'];

export const ROLE_LABEL: Readonly<Record<CommunityRole, string>> = {
  owner: 'proprietário',
  admin: 'admin',
  moderator: 'moderador',
  member: 'membro',
};

export type CommunityAction =
  | 'community.edit'
  | 'community.delete'
  | 'invites.create'
  | 'invites.revoke'
  | 'members.remove'
  | 'members.assignRole'
  | 'channels.manage'
  | 'messages.manage'
  | 'messages.pin';

const ACTION_MIN_ROLE: Readonly<Record<CommunityAction, CommunityRole>> = {
  'community.edit': 'admin',
  'community.delete': 'owner',
  'invites.create': 'moderator',
  'invites.revoke': 'moderator',
  'members.remove': 'moderator',
  'members.assignRole': 'admin',
  'channels.manage': 'admin',
  'messages.manage': 'moderator',
  'messages.pin': 'moderator',
};

export const DEFAULT_CHANNEL_ACCESS: Readonly<ChannelAccess> = {
  view: 'member',
  send: 'member',
  attach: 'member',
  connect: 'member',
};

export function atLeast(role: CommunityRole | null | undefined, min: CommunityRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export function can(role: CommunityRole | null | undefined, action: CommunityAction): boolean {
  return atLeast(role, ACTION_MIN_ROLE[action]);
}

export type ChannelOperation = keyof ChannelAccess;

/** Toda operação exige também permissão de visualização. */
export function canOnChannel(
  role: CommunityRole | null | undefined,
  channel: Pick<Channel, 'access'>,
  op: ChannelOperation,
): boolean {
  const access = { ...DEFAULT_CHANNEL_ACCESS, ...channel.access };
  return atLeast(role, access.view) && atLeast(role, access[op]);
}

/** Um membro só pode agir (remover, rebaixar) sobre quem está estritamente abaixo dele. */
export function outranks(actor: CommunityRole, target: CommunityRole): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

export function canAssignRole(
  actor: CommunityRole,
  targetCurrent: CommunityRole,
  next: CommunityRole,
): boolean {
  if (next === 'owner') return false; // transferência de propriedade é uma operação separada
  if (!can(actor, 'members.assignRole')) return false;
  return outranks(actor, targetCurrent) && outranks(actor, next);
}

export function canRemoveMember(actor: CommunityRole, target: CommunityRole): boolean {
  return can(actor, 'members.remove') && outranks(actor, target);
}
