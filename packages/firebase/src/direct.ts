import type { Auth } from 'firebase/auth';
import {
  FirebaseError,
} from 'firebase/app';
import {
  Timestamp,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import {
  DEFAULT_CHANNEL_ACCESS,
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  LIMITS,
  dmConversationId,
  friendRequestId,
  type ChannelAccess,
  type ChannelType,
  type CommunityRole,
} from '@nox/shared';
import {
  categoryCreateSchema,
  channelCreateSchema,
  channelUpdateSchema,
  communityCreateSchema,
  communityUpdateSchema,
  firstIssue,
  inviteCodeSchema,
  inviteCreateSchema,
  usernameSchema,
  type VoiceTokenRequest,
  type z,
} from '@nox/validation';
import { ApiClientError, type ApiClient, type InviteInfo, type VoiceGrant } from './api';

/** Mesma superfície pública do cliente HTTP: as telas não sabem qual modo está ativo. */
export type NoxApi = { [K in keyof ApiClient]: ApiClient[K] };

const UNAVAILABLE = 'Não foi possível enviar a solicitação para este usuário.';

function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiClientError(400, 'invalid_input', firstIssue(r.error));
  return r.data;
}

function generateInviteCode(): string {
  const bytes = new Uint8Array(INVITE_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const b of bytes) code += INVITE_ALPHABET[b % INVITE_ALPHABET.length];
  return code;
}

/** Traduz recusas das regras de segurança em mensagens legíveis. */
async function guard<T>(fn: () => Promise<T>, denied = 'Você não tem permissão para isso.'): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    if (err instanceof FirebaseError) {
      if (err.code === 'permission-denied') throw new ApiClientError(403, 'forbidden', denied);
      if (err.code === 'unavailable') throw new ApiClientError(0, 'network', 'Sem conexão. Tente novamente.');
    }
    throw err;
  }
}

/**
 * "Modo direto": o app grava no Firestore sem servidor próprio.
 * As regras (firebase/firestore.rules) validam cada operação — esta classe só
 * monta os lotes/transações corretos. Voz exige o servidor (segredo do LiveKit).
 */
export class DirectApi implements NoxApi {
  constructor(
    private readonly db: Firestore,
    private readonly auth: Auth,
    /** Servidor do NOX, usado apenas para tokens de voz. */
    private readonly server: ApiClient | null = null,
  ) {}

  private get me(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new ApiClientError(401, 'unauthorized', 'Sessão expirada.');
    return uid;
  }

  private ref = {
    user: (uid: string) => doc(this.db, 'users', uid),
    friend: (owner: string, other: string) => doc(this.db, 'users', owner, 'friends', other),
    block: (owner: string, other: string) => doc(this.db, 'users', owner, 'blocks', other),
    request: (from: string, to: string) => doc(this.db, 'friendRequests', friendRequestId(from, to)),
    dm: (a: string, b: string) => doc(this.db, 'conversations', dmConversationId(a, b)),
    community: (cid: string) => doc(this.db, 'communities', cid),
    member: (cid: string, uid: string) => doc(this.db, 'communities', cid, 'members', uid),
    membership: (uid: string, cid: string) => doc(this.db, 'users', uid, 'memberships', cid),
    channels: (cid: string) => collection(this.db, 'communities', cid, 'channels'),
    categories: (cid: string) => collection(this.db, 'communities', cid, 'categories'),
    invite: (code: string) => doc(this.db, 'invites', code),
  };

  /** Ler uma DM inexistente é negado pelas regras: tratamos como "não existe". */
  private async dmExists(a: string, b: string): Promise<boolean> {
    try {
      return (await getDoc(this.ref.dm(a, b))).exists();
    } catch (err) {
      if (err instanceof FirebaseError && err.code === 'permission-denied') return false;
      throw err;
    }
  }

  /* ───────────── amizades ───────────── */

  sendFriendRequest = async (username: string) => {
    const me = this.me;
    const name = parse(usernameSchema, username);
    const claim = await getDoc(doc(this.db, 'usernames', name));
    const target = claim.get('uid') as string | undefined;
    if (!target) throw new ApiClientError(404, 'user_not_found', 'Nenhum usuário com esse nome.');
    if (target === me) throw new ApiClientError(400, 'self', 'Você não pode adicionar a si mesmo.');

    const [friend, myBlock, reverse, existing] = await Promise.all([
      getDoc(this.ref.friend(me, target)),
      getDoc(this.ref.block(me, target)),
      getDoc(this.ref.request(target, me)),
      getDoc(this.ref.request(me, target)),
    ]);
    if (friend.exists()) throw new ApiClientError(409, 'already_friends', 'Vocês já são amigos.');
    if (myBlock.exists()) throw new ApiClientError(409, 'blocked', 'Você bloqueou este usuário. Desbloqueie para adicionar.');
    if (reverse.exists()) {
      const r = await this.acceptFriendRequest(reverse.id);
      return { status: 'accepted' as const, uid: target, conversationId: r.conversationId };
    }
    if (existing.exists()) return { status: 'pending' as const, uid: target };

    await guard(
      () => setDoc(this.ref.request(me, target), { from: me, to: target, createdAt: serverTimestamp() }),
      UNAVAILABLE,
    );
    return { status: 'pending' as const, uid: target };
  };

  acceptFriendRequest = async (id: string) => {
    const me = this.me;
    // Pedido de outra pessoa: as regras negam a leitura — tratamos como inexistente.
    const req = await getDoc(doc(this.db, 'friendRequests', id)).catch(() => null);
    if (!req?.exists() || req.get('to') !== me) throw new ApiClientError(404, 'request_not_found', 'Solicitação não encontrada.');
    const from = req.get('from') as string;
    const conversationId = dmConversationId(me, from);
    const [dmExists, mine] = await Promise.all([this.dmExists(me, from), getDoc(this.ref.request(me, from))]);

    const batch = writeBatch(this.db);
    const since = serverTimestamp();
    batch.set(this.ref.friend(me, from), { uid: from, since, conversationId });
    batch.set(this.ref.friend(from, me), { uid: me, since, conversationId });
    if (dmExists) {
      batch.update(this.ref.dm(me, from), { locked: false });
    } else {
      batch.set(this.ref.dm(me, from), {
        type: 'dm',
        memberIds: [me, from].sort(),
        name: null,
        ownerId: null,
        locked: false,
        createdAt: since,
        lastMessageAt: since,
        lastMessagePreview: null,
        lastMessageAuthorId: null,
      });
    }
    batch.delete(req.ref);
    if (mine.exists()) batch.delete(mine.ref);
    await guard(() => batch.commit(), 'Esta solicitação não está mais disponível.');
    return { uid: from, conversationId };
  };

  deleteFriendRequest = async (id: string) => {
    const ref = doc(this.db, 'friendRequests', id);
    const snap = await getDoc(ref).catch(() => null);
    if (!snap?.exists()) throw new ApiClientError(404, 'request_not_found', 'Solicitação não encontrada.');
    await guard(() => writeBatch(this.db).delete(ref).commit());
    return { ok: true as const };
  };

  removeFriend = async (uid: string) => {
    const me = this.me;
    const dm = await this.dmExists(me, uid);
    const batch = writeBatch(this.db);
    batch.delete(this.ref.friend(me, uid));
    batch.delete(this.ref.friend(uid, me));
    if (dm) batch.update(this.ref.dm(me, uid), { locked: true });
    await guard(() => batch.commit());
    return { ok: true as const };
  };

  block = async (uid: string) => {
    const me = this.me;
    if (uid === me) throw new ApiClientError(400, 'self', 'Você não pode bloquear a si mesmo.');
    const [dm, out, inc] = await Promise.all([
      this.dmExists(me, uid),
      getDoc(this.ref.request(me, uid)),
      getDoc(this.ref.request(uid, me)),
    ]);
    const batch = writeBatch(this.db);
    batch.set(this.ref.block(me, uid), { uid, createdAt: serverTimestamp() });
    batch.delete(this.ref.friend(me, uid));
    batch.delete(this.ref.friend(uid, me));
    if (out.exists()) batch.delete(out.ref);
    if (inc.exists()) batch.delete(inc.ref);
    if (dm) batch.update(this.ref.dm(me, uid), { locked: true });
    await guard(() => batch.commit());
    return { ok: true as const };
  };

  unblock = async (uid: string) => {
    await guard(() => writeBatch(this.db).delete(this.ref.block(this.me, uid)).commit());
    return { ok: true as const };
  };

  createGroup = async (memberIds: string[], name: string | null) => {
    const me = this.me;
    const others = [...new Set(memberIds.filter((u) => u !== me))];
    if (others.length < 2) throw new ApiClientError(400, 'too_few_members', 'Um grupo precisa de pelo menos 3 pessoas.');
    if (others.length + 1 > LIMITS.group.membersMax) throw new ApiClientError(400, 'too_many_members', `Máximo de ${LIMITS.group.membersMax} pessoas por grupo.`);
    const ref = doc(collection(this.db, 'conversations'));
    const now = serverTimestamp();
    await guard(
      () =>
        setDoc(ref, {
          type: 'group',
          memberIds: [me, ...others],
          name: name?.trim() || null,
          ownerId: me,
          locked: false,
          createdAt: now,
          lastMessageAt: now,
          lastMessagePreview: null,
          lastMessageAuthorId: null,
        }),
      'Só é possível criar grupos com amigos.',
    );
    return { conversationId: ref.id };
  };

  /* ───────────── comunidades ───────────── */

  createCommunity = async (name: string, description = '') => {
    const me = this.me;
    const input = parse(communityCreateSchema, { name, description });
    const ref = doc(collection(this.db, 'communities'));
    const cid = ref.id;
    const now = serverTimestamp();
    const batch = writeBatch(this.db);
    batch.set(ref, { name: input.name, description: input.description, iconUrl: null, ownerId: me, createdAt: now });
    batch.set(this.ref.member(cid, me), { uid: me, role: 'owner', joinedAt: now });
    batch.set(this.ref.membership(me, cid), { communityId: cid, role: 'owner', joinedAt: now });
    const textCat = doc(this.ref.categories(cid));
    const voiceCat = doc(this.ref.categories(cid));
    batch.set(textCat, { name: 'texto', position: 0 });
    batch.set(voiceCat, { name: 'voz', position: 1 });
    const general = doc(this.ref.channels(cid));
    batch.set(general, { name: 'geral', type: 'text', categoryId: textCat.id, topic: '', position: 0, access: { ...DEFAULT_CHANNEL_ACCESS } });
    batch.set(doc(this.ref.channels(cid)), { name: 'lounge', type: 'voice', categoryId: voiceCat.id, topic: '', position: 1, access: { ...DEFAULT_CHANNEL_ACCESS } });
    await guard(() => batch.commit());
    return { communityId: cid, defaultChannelId: general.id };
  };

  updateCommunity = async (cid: string, patch: { name?: string; description?: string; iconUrl?: string | null }) => {
    const input = parse(communityUpdateSchema, { ...patch, communityId: cid });
    const { communityId, ...rest } = input;
    const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    await guard(() => updateDoc(this.ref.community(communityId), clean));
    return { ok: true as const };
  };

  /** Apaga a comunidade. Membros restantes limpam o próprio índice ao perceber que ela sumiu. */
  deleteCommunity = async (cid: string) => {
    const me = this.me;
    const batch = writeBatch(this.db);
    batch.delete(this.ref.community(cid));
    batch.delete(this.ref.member(cid, me));
    batch.delete(this.ref.membership(me, cid));
    await guard(() => batch.commit(), 'Só o dono pode apagar a comunidade.');
    return { ok: true as const };
  };

  leaveCommunity = async (cid: string) => {
    const me = this.me;
    const member = await getDoc(this.ref.member(cid, me));
    if (member.get('role') === 'owner') {
      throw new ApiClientError(409, 'owner_cannot_leave', 'Transfira a propriedade ou apague a comunidade antes de sair.');
    }
    const batch = writeBatch(this.db);
    batch.delete(this.ref.member(cid, me));
    batch.delete(this.ref.membership(me, cid));
    await guard(() => batch.commit());
    return { ok: true as const };
  };

  createChannel = async (
    cid: string,
    input: { name: string; type: ChannelType; categoryId?: string | null; topic?: string; access?: Partial<ChannelAccess> },
  ) => {
    const v = parse(channelCreateSchema, { ...input, communityId: cid });
    const count = (await getCountFromServer(this.ref.channels(cid))).data().count;
    if (count >= LIMITS.community.channelsMax) throw new ApiClientError(409, 'limit_reached', 'Limite de canais atingido.');
    const ref = doc(this.ref.channels(cid));
    await guard(() =>
      setDoc(ref, {
        name: v.name,
        type: v.type,
        categoryId: v.categoryId,
        topic: v.topic,
        position: count,
        access: { ...DEFAULT_CHANNEL_ACCESS, ...v.access },
      }),
    );
    return { channelId: ref.id };
  };

  updateChannel = async (
    cid: string,
    chid: string,
    patch: { name?: string; topic?: string; categoryId?: string | null; access?: Partial<ChannelAccess> },
  ) => {
    const v = parse(channelUpdateSchema, { ...patch, communityId: cid, channelId: chid });
    const ref = doc(this.ref.channels(cid), chid);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new ApiClientError(404, 'channel_not_found', 'Canal não encontrado.');
    const next: Record<string, unknown> = {};
    if (v.name !== undefined) next.name = v.name;
    if (v.topic !== undefined) next.topic = v.topic;
    if (v.categoryId !== undefined) next.categoryId = v.categoryId;
    if (v.access) next.access = { ...DEFAULT_CHANNEL_ACCESS, ...(snap.get('access') ?? {}), ...v.access };
    await guard(() => updateDoc(ref, next));
    return { ok: true as const };
  };

  /** Remove o canal. As mensagens deixam de ser acessíveis (as regras exigem o canal). */
  deleteChannel = async (cid: string, chid: string) => {
    await guard(() => writeBatch(this.db).delete(doc(this.ref.channels(cid), chid)).commit());
    return { ok: true as const };
  };

  createCategory = async (cid: string, name: string) => {
    const v = parse(categoryCreateSchema, { communityId: cid, name });
    const count = (await getCountFromServer(this.ref.categories(cid))).data().count;
    if (count >= LIMITS.community.categoriesMax) throw new ApiClientError(409, 'limit_reached', 'Limite de categorias atingido.');
    const ref = doc(this.ref.categories(cid));
    await guard(() => setDoc(ref, { name: v.name, position: count }));
    return { categoryId: ref.id };
  };

  deleteCategory = async (cid: string, catId: string) => {
    const orphans = await getDocs(query(this.ref.channels(cid), where('categoryId', '==', catId)));
    const batch = writeBatch(this.db);
    orphans.docs.forEach((d) => batch.update(d.ref, { categoryId: null }));
    batch.delete(doc(this.ref.categories(cid), catId));
    await guard(() => batch.commit());
    return { ok: true as const };
  };

  reorder = async (cid: string, kind: 'channels' | 'categories', order: string[]) => {
    const col = kind === 'channels' ? this.ref.channels(cid) : this.ref.categories(cid);
    const batch = writeBatch(this.db);
    order.forEach((id, position) => batch.update(doc(col, id), { position }));
    await guard(() => batch.commit());
    return { ok: true as const };
  };

  setMemberRole = async (cid: string, uid: string, role: CommunityRole) => {
    if (uid === this.me) throw new ApiClientError(400, 'self', 'Você não pode alterar o próprio papel.');
    const batch = writeBatch(this.db);
    batch.update(this.ref.member(cid, uid), { role });
    batch.update(this.ref.membership(uid, cid), { role });
    await guard(() => batch.commit());
    return { ok: true as const };
  };

  removeMember = async (cid: string, uid: string) => {
    if (uid === this.me) throw new ApiClientError(400, 'use_leave', 'Use a opção de sair da comunidade.');
    const batch = writeBatch(this.db);
    batch.delete(this.ref.member(cid, uid));
    batch.delete(this.ref.membership(uid, cid));
    await guard(() => batch.commit());
    return { ok: true as const };
  };

  /* ───────────── convites ───────────── */

  createInvite = async (cid: string, opts: { maxUses?: number | null; maxAgeSeconds?: number | null } = {}) => {
    const me = this.me;
    const v = parse(inviteCreateSchema, { communityId: cid, ...opts });
    const community = await guard(() => getDoc(this.ref.community(cid)));
    if (!community.exists()) throw new ApiClientError(404, 'community_not_found', 'Comunidade não encontrada.');
    const expiresAt = v.maxAgeSeconds ? Timestamp.fromMillis(Date.now() + v.maxAgeSeconds * 1000) : null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode();
      const ref = this.ref.invite(code);
      if ((await getDoc(ref)).exists()) continue;
      await guard(() =>
        setDoc(ref, {
          communityId: cid,
          communityName: community.get('name'),
          createdBy: me,
          createdAt: serverTimestamp(),
          expiresAt,
          maxUses: v.maxUses,
          uses: 0,
          revoked: false,
        }),
      );
      return { code, expiresAt: expiresAt?.toMillis() ?? null, maxUses: v.maxUses };
    }
    throw new ApiClientError(409, 'code_collision', 'Tente novamente.');
  };

  listInvites = async (cid: string) => {
    const snap = await guard(() =>
      getDocs(query(collection(this.db, 'invites'), where('createdBy', '==', this.me), where('communityId', '==', cid))),
    );
    const invites: InviteInfo[] = snap.docs
      .map((d) => ({
        code: d.id,
        createdBy: d.get('createdBy') as string,
        createdAt: (d.get('createdAt') as Timestamp | null)?.toMillis() ?? null,
        expiresAt: (d.get('expiresAt') as Timestamp | null)?.toMillis() ?? null,
        maxUses: d.get('maxUses') as number | null,
        uses: d.get('uses') as number,
        revoked: d.get('revoked') === true,
      }))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return { invites };
  };

  revokeInvite = async (code: string) => {
    await guard(() => updateDoc(this.ref.invite(parse(inviteCodeSchema, code)), { revoked: true }));
    return { ok: true as const };
  };

  /** Transação: a contagem de usos não estoura o limite mesmo com resgates simultâneos. */
  redeemInvite = async (rawCode: string) => {
    const me = this.me;
    const code = parse(inviteCodeSchema, rawCode);
    return guard(
      () =>
        runTransaction(this.db, async (tx) => {
          const invite = await tx.get(this.ref.invite(code));
          if (!invite.exists()) throw new ApiClientError(404, 'invite_not_found', 'Convite inválido.');
          const cid = invite.get('communityId') as string;
          const member = await tx.get(this.ref.member(cid, me));
          if (member.exists()) return { communityId: cid, alreadyMember: true };

          const expiresAt = invite.get('expiresAt') as Timestamp | null;
          const maxUses = invite.get('maxUses') as number | null;
          const uses = invite.get('uses') as number;
          if (invite.get('revoked') === true) throw new ApiClientError(409, 'invite_revoked', 'Este convite foi revogado.');
          if (expiresAt && expiresAt.toMillis() <= Date.now()) throw new ApiClientError(409, 'invite_expired', 'Este convite expirou.');
          if (maxUses !== null && uses >= maxUses) throw new ApiClientError(409, 'invite_exhausted', 'Este convite atingiu o limite de usos.');

          const now = serverTimestamp();
          tx.set(this.ref.member(cid, me), { uid: me, role: 'member', joinedAt: now, inviteCode: code });
          tx.set(this.ref.membership(me, cid), { communityId: cid, role: 'member', joinedAt: now });
          tx.update(invite.ref, { uses: uses + 1 });
          return { communityId: cid, alreadyMember: false };
        }),
      'Este convite não está mais disponível.',
    );
  };

  /* ───────────── voz e conta ───────────── */

  voiceToken = async (req: VoiceTokenRequest): Promise<VoiceGrant> => {
    if (!this.server) throw new ApiClientError(503, 'voice_not_configured', 'A voz precisa do servidor do NOX, que ainda não está no ar.');
    return this.server.voiceToken(req);
  };

  /**
   * Exclusão de conta no modo direto. Bloqueia se for dono de comunidade com outros membros.
   * Mensagens enviadas permanecem para os outros participantes como "conta removida".
   */
  deleteAccount = async () => {
    const me = this.me;
    const memberships = await getDocs(collection(this.db, 'users', me, 'memberships'));
    const owned: string[] = [];
    for (const m of memberships.docs) {
      if (m.get('role') !== 'owner') continue;
      const count = await getCountFromServer(collection(this.db, 'communities', m.id, 'members')).catch(() => null);
      if (count && count.data().count > 1) owned.push(m.id);
    }
    if (owned.length) throw new ApiClientError(409, 'owns_communities', 'Transfira ou apague suas comunidades com outros membros antes de excluir a conta.');

    const [friends, blocks, outgoing, incoming, profile] = await Promise.all([
      getDocs(collection(this.db, 'users', me, 'friends')),
      getDocs(collection(this.db, 'users', me, 'blocks')),
      getDocs(query(collection(this.db, 'friendRequests'), where('from', '==', me))),
      getDocs(query(collection(this.db, 'friendRequests'), where('to', '==', me))),
      getDoc(this.ref.user(me)),
    ]);

    await guard(async () => {
      for (const m of memberships.docs) {
        const b = writeBatch(this.db);
        if (m.get('role') === 'owner') b.delete(this.ref.community(m.id));
        b.delete(this.ref.member(m.id, me));
        b.delete(m.ref);
        await b.commit().catch(() => undefined); // comunidade já apagada: segue em frente
      }
      for (const f of friends.docs) {
        const b = writeBatch(this.db);
        b.delete(f.ref);
        b.delete(this.ref.friend(f.id, me));
        if (await this.dmExists(me, f.id)) b.update(this.ref.dm(me, f.id), { locked: true });
        await b.commit();
      }
      const last = writeBatch(this.db);
      blocks.docs.forEach((d) => last.delete(d.ref));
      [...outgoing.docs, ...incoming.docs].forEach((d) => last.delete(d.ref));
      last.delete(doc(this.db, 'users', me, 'private', 'settings'));
      const username = profile.get('username') as string | undefined;
      if (username) last.delete(doc(this.db, 'usernames', username));
      last.delete(this.ref.user(me));
      await last.commit();
    });

    const user = this.auth.currentUser;
    if (user) {
      try {
        await user.delete();
      } catch (err) {
        if (err instanceof FirebaseError && err.code === 'auth/requires-recent-login') {
          throw new ApiClientError(401, 'requires_recent_login', 'Seus dados foram apagados. Por segurança, entre de novo para concluir a exclusão do login.');
        }
        throw err;
      }
    }
    return { ok: true as const };
  };
}
