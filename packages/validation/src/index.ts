import { z } from 'zod';
import { LIMITS, USERNAME_PATTERN, ROLES, INVITE_ALPHABET, INVITE_CODE_LENGTH } from '@nox/shared';
import type { CommunityRole } from '@nox/shared';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, 'identificador inválido');

export const usernameSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@/, '').toLowerCase())
  .pipe(
    z
      .string()
      .min(LIMITS.username.min, `mínimo de ${LIMITS.username.min} caracteres`)
      .max(LIMITS.username.max, `máximo de ${LIMITS.username.max} caracteres`)
      .regex(USERNAME_PATTERN, 'use letras minúsculas, números, _ ou .')
      .refine((s) => !s.startsWith('.') && !s.endsWith('.') && !s.includes('..'), 'pontos não podem ficar nas pontas ou repetidos'),
  );

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'informe um nome')
  .max(LIMITS.displayName.max, `máximo de ${LIMITS.displayName.max} caracteres`);

export const profileSetupSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
});

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
  bio: z.string().max(LIMITS.bio.max).optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
});

export const roleSchema = z.enum(ROLES as [CommunityRole, ...CommunityRole[]]);

export const messageTextSchema = z
  .string()
  .max(LIMITS.message.textMax, `máximo de ${LIMITS.message.textMax} caracteres`)
  .refine((s) => s.trim().length > 0, 'mensagem vazia');

/* ─────────────── Payloads da API (Cloud Run) ─────────────── */

export const friendRequestCreateSchema = z.object({ username: usernameSchema });
export const friendRequestActionSchema = z.object({ requestId: z.string().min(3).max(260) });
export const userTargetSchema = z.object({ uid: id });

export const communityCreateSchema = z.object({
  name: z.string().trim().min(LIMITS.community.nameMin).max(LIMITS.community.nameMax),
  description: z.string().trim().max(LIMITS.community.descriptionMax).default(''),
});

export const communityUpdateSchema = z.object({
  communityId: id,
  name: z.string().trim().min(LIMITS.community.nameMin).max(LIMITS.community.nameMax).optional(),
  description: z.string().trim().max(LIMITS.community.descriptionMax).optional(),
  iconUrl: z.string().url().max(2048).nullable().optional(),
});

const channelNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.channel.nameMax)
  .transform((s) => s.toLowerCase().replace(/\s+/g, '-'));

export const channelAccessSchema = z.object({
  view: roleSchema,
  send: roleSchema,
  attach: roleSchema,
  connect: roleSchema,
});

export const channelCreateSchema = z.object({
  communityId: id,
  name: channelNameSchema,
  type: z.enum(['text', 'voice']),
  categoryId: id.nullable().default(null),
  topic: z.string().trim().max(LIMITS.channel.topicMax).default(''),
  access: channelAccessSchema.partial().default({}),
});

export const channelUpdateSchema = z.object({
  communityId: id,
  channelId: id,
  name: channelNameSchema.optional(),
  topic: z.string().trim().max(LIMITS.channel.topicMax).optional(),
  categoryId: id.nullable().optional(),
  access: channelAccessSchema.partial().optional(),
});

export const channelDeleteSchema = z.object({ communityId: id, channelId: id });

export const categoryCreateSchema = z.object({
  communityId: id,
  name: z.string().trim().min(1).max(LIMITS.channel.nameMax),
});

export const reorderSchema = z.object({
  communityId: id,
  kind: z.enum(['channels', 'categories']),
  /** IDs na nova ordem; posições são atribuídas pelo índice. */
  order: z.array(id).min(1).max(LIMITS.community.channelsMax),
});

export const inviteCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^.*\//, '').toLowerCase())
  .pipe(z.string().length(INVITE_CODE_LENGTH).regex(new RegExp(`^[${INVITE_ALPHABET}]+$`), 'código inválido'));

export const inviteCreateSchema = z.object({
  communityId: id,
  maxUses: z.number().int().min(1).max(LIMITS.invite.maxUsesCap).nullable().default(null),
  maxAgeSeconds: z.number().int().min(60).max(LIMITS.invite.maxAgeSeconds).nullable().default(60 * 60 * 24 * 7),
});

export const inviteRedeemSchema = z.object({ code: inviteCodeSchema });
export const inviteRevokeSchema = z.object({ code: inviteCodeSchema });

export const memberRoleSchema = z.object({ communityId: id, uid: id, role: roleSchema });
export const memberRemoveSchema = z.object({ communityId: id, uid: id });

export const groupCreateSchema = z.object({
  name: z.string().trim().max(LIMITS.group.nameMax).nullable().default(null),
  memberIds: z.array(id).min(2).max(LIMITS.group.membersMax - 1),
});

export const voiceTokenRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('channel'), communityId: id, channelId: id }),
  z.object({ kind: z.literal('conversation'), conversationId: id }),
]);

export type CommunityCreateInput = z.input<typeof communityCreateSchema>;
export type ChannelCreateInput = z.input<typeof channelCreateSchema>;
export type InviteCreateInput = z.input<typeof inviteCreateSchema>;
export type VoiceTokenRequest = z.infer<typeof voiceTokenRequestSchema>;

/** Primeira mensagem de erro legível para exibição na interface. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'dados inválidos';
}

export { z };
