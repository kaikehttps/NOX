import { randomInt } from 'node:crypto';
import { Hono } from 'hono';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  DEFAULT_CHANNEL_ACCESS,
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  LIMITS,
  can,
  canAssignRole,
  canRemoveMember,
  type CommunityAction,
  type CommunityRole,
} from '@nox/shared';
import {
  categoryCreateSchema,
  channelCreateSchema,
  channelUpdateSchema,
  communityCreateSchema,
  communityUpdateSchema,
  inviteCodeSchema,
  inviteCreateSchema,
  memberRoleSchema,
  reorderSchema,
} from '@nox/validation';
import type { AppEnv, Deps } from '../context';
import { badRequest, conflict, forbidden, notFound, parse } from '../errors';

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return code;
}

const paths = (db: Firestore) => ({
  community: (cid: string) => db.doc(`communities/${cid}`),
  member: (cid: string, uid: string) => db.doc(`communities/${cid}/members/${uid}`),
  members: (cid: string) => db.collection(`communities/${cid}/members`),
  membership: (uid: string, cid: string) => db.doc(`users/${uid}/memberships/${cid}`),
  channels: (cid: string) => db.collection(`communities/${cid}/channels`),
  categories: (cid: string) => db.collection(`communities/${cid}/categories`),
  invite: (code: string) => db.doc(`invites/${code}`),
});

/** Remove uma comunidade e tudo abaixo dela, incluindo índices reversos e convites. */
export async function deleteCommunityCascade(db: Firestore, cid: string) {
  const p = paths(db);
  const [members, invites] = await Promise.all([
    p.members(cid).get(),
    db.collection('invites').where('communityId', '==', cid).get(),
  ]);
  const writer = db.bulkWriter();
  for (const m of members.docs) void writer.delete(p.membership(m.id, cid));
  for (const i of invites.docs) void writer.delete(i.ref);
  await writer.close();
  await db.recursiveDelete(p.community(cid));
}

export function communityRoutes({ db, limiter }: Deps) {
  const app = new Hono<AppEnv>();
  const p = paths(db);

  async function roleOf(cid: string, uid: string): Promise<CommunityRole> {
    const snap = await p.member(cid, uid).get();
    if (!snap.exists) throw notFound('community_not_found', 'Comunidade não encontrada.');
    return snap.get('role') as CommunityRole;
  }

  async function requireAction(cid: string, uid: string, action: CommunityAction): Promise<CommunityRole> {
    const role = await roleOf(cid, uid);
    if (!can(role, action)) throw forbidden();
    return role;
  }

  /* ───────────── comunidade ───────────── */

  app.post('/communities', async (c) => {
    const me = c.get('uid');
    limiter.check(`cc:${me}`, 10, 60 * 60_000);
    const input = parse(communityCreateSchema, await c.req.json());

    const owned = await db.collection('communities').where('ownerId', '==', me).count().get();
    if (owned.data().count >= LIMITS.community.ownedMax) {
      throw conflict('limit_reached', 'Você atingiu o limite de comunidades próprias.');
    }

    const ref = db.collection('communities').doc();
    const cid = ref.id;
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.create(ref, { name: input.name, description: input.description, iconUrl: null, ownerId: me, createdAt: now });
    batch.create(p.member(cid, me), { uid: me, role: 'owner', joinedAt: now });
    batch.create(p.membership(me, cid), { communityId: cid, role: 'owner', joinedAt: now });

    // Estrutura inicial: um canal de texto e um de voz, cada um em sua categoria.
    const textCat = p.categories(cid).doc();
    const voiceCat = p.categories(cid).doc();
    batch.create(textCat, { name: 'texto', position: 0 });
    batch.create(voiceCat, { name: 'voz', position: 1 });
    const general = p.channels(cid).doc();
    batch.create(general, {
      name: 'geral', type: 'text', categoryId: textCat.id, topic: '', position: 0, access: DEFAULT_CHANNEL_ACCESS,
    });
    batch.create(p.channels(cid).doc(), {
      name: 'lounge', type: 'voice', categoryId: voiceCat.id, topic: '', position: 1, access: DEFAULT_CHANNEL_ACCESS,
    });
    await batch.commit();
    return c.json({ communityId: cid, defaultChannelId: general.id }, 201);
  });

  app.patch('/communities/:cid', async (c) => {
    const me = c.get('uid');
    const input = parse(communityUpdateSchema, { ...(await c.req.json()), communityId: c.req.param('cid') });
    await requireAction(input.communityId, me, 'community.edit');
    const { communityId, ...patch } = input;
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length === 0) throw badRequest('empty_patch', 'Nada para atualizar.');
    await p.community(communityId).update(clean);
    if (patch.name) {
      const invites = await db.collection('invites').where('communityId', '==', communityId).get();
      const writer = db.bulkWriter();
      for (const i of invites.docs) void writer.update(i.ref, { communityName: patch.name });
      await writer.close();
    }
    return c.json({ ok: true });
  });

  app.delete('/communities/:cid', async (c) => {
    const me = c.get('uid');
    const cid = c.req.param('cid');
    await requireAction(cid, me, 'community.delete');
    await deleteCommunityCascade(db, cid);
    return c.json({ ok: true });
  });

  app.post('/communities/:cid/leave', async (c) => {
    const me = c.get('uid');
    const cid = c.req.param('cid');
    const role = await roleOf(cid, me);
    if (role === 'owner') throw conflict('owner_cannot_leave', 'Transfira a propriedade ou apague a comunidade antes de sair.');
    const batch = db.batch();
    batch.delete(p.member(cid, me));
    batch.delete(p.membership(me, cid));
    await batch.commit();
    return c.json({ ok: true });
  });

  /* ───────────── canais e categorias ───────────── */

  app.post('/communities/:cid/channels', async (c) => {
    const me = c.get('uid');
    const input = parse(channelCreateSchema, { ...(await c.req.json()), communityId: c.req.param('cid') });
    await requireAction(input.communityId, me, 'channels.manage');

    const count = (await p.channels(input.communityId).count().get()).data().count;
    if (count >= LIMITS.community.channelsMax) throw conflict('limit_reached', 'Limite de canais atingido.');
    if (input.categoryId) {
      const cat = await p.categories(input.communityId).doc(input.categoryId).get();
      if (!cat.exists) throw badRequest('category_not_found', 'Categoria não encontrada.');
    }
    const ref = p.channels(input.communityId).doc();
    await ref.create({
      name: input.name,
      type: input.type,
      categoryId: input.categoryId,
      topic: input.topic,
      position: count,
      access: { ...DEFAULT_CHANNEL_ACCESS, ...input.access },
    });
    return c.json({ channelId: ref.id }, 201);
  });

  app.patch('/communities/:cid/channels/:chid', async (c) => {
    const me = c.get('uid');
    const input = parse(channelUpdateSchema, {
      ...(await c.req.json()),
      communityId: c.req.param('cid'),
      channelId: c.req.param('chid'),
    });
    await requireAction(input.communityId, me, 'channels.manage');
    const ref = p.channels(input.communityId).doc(input.channelId);
    const snap = await ref.get();
    if (!snap.exists) throw notFound('channel_not_found', 'Canal não encontrado.');
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.topic !== undefined) patch.topic = input.topic;
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
    if (input.access) patch.access = { ...DEFAULT_CHANNEL_ACCESS, ...snap.get('access'), ...input.access };
    await ref.update(patch);
    return c.json({ ok: true });
  });

  app.delete('/communities/:cid/channels/:chid', async (c) => {
    const me = c.get('uid');
    const cid = c.req.param('cid');
    await requireAction(cid, me, 'channels.manage');
    const ref = p.channels(cid).doc(c.req.param('chid'));
    if (!(await ref.get()).exists) throw notFound('channel_not_found', 'Canal não encontrado.');
    await db.recursiveDelete(ref);
    return c.json({ ok: true });
  });

  app.post('/communities/:cid/categories', async (c) => {
    const me = c.get('uid');
    const input = parse(categoryCreateSchema, { ...(await c.req.json()), communityId: c.req.param('cid') });
    await requireAction(input.communityId, me, 'channels.manage');
    const count = (await p.categories(input.communityId).count().get()).data().count;
    if (count >= LIMITS.community.categoriesMax) throw conflict('limit_reached', 'Limite de categorias atingido.');
    const ref = p.categories(input.communityId).doc();
    await ref.create({ name: input.name, position: count });
    return c.json({ categoryId: ref.id }, 201);
  });

  app.delete('/communities/:cid/categories/:catId', async (c) => {
    const me = c.get('uid');
    const cid = c.req.param('cid');
    const catId = c.req.param('catId');
    await requireAction(cid, me, 'channels.manage');
    // Canais da categoria apagada ficam sem categoria, nunca são apagados junto.
    const orphans = await p.channels(cid).where('categoryId', '==', catId).get();
    const batch = db.batch();
    for (const ch of orphans.docs) batch.update(ch.ref, { categoryId: null });
    batch.delete(p.categories(cid).doc(catId));
    await batch.commit();
    return c.json({ ok: true });
  });

  app.post('/communities/:cid/reorder', async (c) => {
    const me = c.get('uid');
    const input = parse(reorderSchema, { ...(await c.req.json()), communityId: c.req.param('cid') });
    await requireAction(input.communityId, me, 'channels.manage');
    const col = input.kind === 'channels' ? p.channels(input.communityId) : p.categories(input.communityId);
    const docs = await db.getAll(...input.order.map((id) => col.doc(id)));
    if (docs.some((d) => !d.exists)) throw badRequest('unknown_id', 'Lista de ordenação contém itens inexistentes.');
    const batch = db.batch();
    input.order.forEach((id, position) => batch.update(col.doc(id), { position }));
    await batch.commit();
    return c.json({ ok: true });
  });

  /* ───────────── membros ───────────── */

  app.put('/communities/:cid/members/:uid/role', async (c) => {
    const me = c.get('uid');
    const input = parse(memberRoleSchema, {
      ...(await c.req.json()),
      communityId: c.req.param('cid'),
      uid: c.req.param('uid'),
    });
    if (input.uid === me) throw badRequest('self', 'Você não pode alterar o próprio papel.');
    const [actor, target] = await Promise.all([roleOf(input.communityId, me), roleOf(input.communityId, input.uid)]);
    if (!canAssignRole(actor, target, input.role)) throw forbidden();
    const batch = db.batch();
    batch.update(p.member(input.communityId, input.uid), { role: input.role });
    batch.set(p.membership(input.uid, input.communityId), { role: input.role }, { merge: true });
    await batch.commit();
    return c.json({ ok: true });
  });

  app.delete('/communities/:cid/members/:uid', async (c) => {
    const me = c.get('uid');
    const cid = c.req.param('cid');
    const uid = c.req.param('uid');
    if (uid === me) throw badRequest('use_leave', 'Use a opção de sair da comunidade.');
    const [actor, target] = await Promise.all([roleOf(cid, me), roleOf(cid, uid)]);
    if (!canRemoveMember(actor, target)) throw forbidden();
    const batch = db.batch();
    batch.delete(p.member(cid, uid));
    batch.delete(p.membership(uid, cid));
    batch.delete(db.doc(`communities/${cid}/voiceStates/${uid}`));
    await batch.commit();
    return c.json({ ok: true });
  });

  /* ───────────── convites ───────────── */

  app.post('/communities/:cid/invites', async (c) => {
    const me = c.get('uid');
    limiter.check(`inv:${me}`, 30, 60 * 60_000);
    const input = parse(inviteCreateSchema, { ...(await c.req.json()), communityId: c.req.param('cid') });
    await requireAction(input.communityId, me, 'invites.create');

    const active = await db
      .collection('invites')
      .where('communityId', '==', input.communityId)
      .where('revoked', '==', false)
      .count()
      .get();
    if (active.data().count >= LIMITS.invite.activePerCommunity) {
      throw conflict('limit_reached', 'Muitos convites ativos. Revogue alguns antes de criar outros.');
    }

    const community = await p.community(input.communityId).get();
    const expiresAt = input.maxAgeSeconds ? Timestamp.fromMillis(Date.now() + input.maxAgeSeconds * 1000) : null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode();
      try {
        await p.invite(code).create({
          communityId: input.communityId,
          communityName: community.get('name'),
          createdBy: me,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt,
          maxUses: input.maxUses,
          uses: 0,
          revoked: false,
        });
        return c.json({ code, expiresAt: expiresAt?.toMillis() ?? null, maxUses: input.maxUses }, 201);
      } catch (err) {
        if ((err as { code?: number }).code !== 6 /* ALREADY_EXISTS */) throw err;
      }
    }
    throw conflict('code_collision', 'Tente novamente.');
  });

  app.get('/communities/:cid/invites', async (c) => {
    const me = c.get('uid');
    const cid = c.req.param('cid');
    await requireAction(cid, me, 'invites.create');
    const snap = await db.collection('invites').where('communityId', '==', cid).orderBy('createdAt', 'desc').limit(100).get();
    return c.json({
      invites: snap.docs.map((d) => ({
        code: d.id,
        createdBy: d.get('createdBy'),
        createdAt: (d.get('createdAt') as Timestamp | null)?.toMillis() ?? null,
        expiresAt: (d.get('expiresAt') as Timestamp | null)?.toMillis() ?? null,
        maxUses: d.get('maxUses'),
        uses: d.get('uses'),
        revoked: d.get('revoked'),
      })),
    });
  });

  app.delete('/invites/:code', async (c) => {
    const me = c.get('uid');
    const code = parse(inviteCodeSchema, c.req.param('code'));
    const snap = await p.invite(code).get();
    if (!snap.exists) throw notFound('invite_not_found', 'Convite não encontrado.');
    await requireAction(snap.get('communityId'), me, 'invites.revoke');
    await snap.ref.update({ revoked: true });
    return c.json({ ok: true });
  });

  /** Resgate atômico: valida validade, revogação e limite de usos dentro da transação. */
  app.post('/invites/:code/redeem', async (c) => {
    const me = c.get('uid');
    limiter.check(`redeem:${me}`, 30, 10 * 60_000);
    const code = parse(inviteCodeSchema, c.req.param('code'));
    const result = await db.runTransaction(async (tx) => {
      const invite = await tx.get(p.invite(code));
      if (!invite.exists) throw notFound('invite_not_found', 'Convite inválido.');
      const cid = invite.get('communityId') as string;
      const [member, community, profile] = await tx.getAll(p.member(cid, me), p.community(cid), db.doc(`users/${me}`));
      if (!profile!.exists) throw forbidden('profile_required', 'Conclua seu perfil primeiro.');
      if (!community!.exists) throw notFound('invite_not_found', 'Convite inválido.');
      if (member!.exists) return { communityId: cid, alreadyMember: true };

      const expiresAt = invite.get('expiresAt') as Timestamp | null;
      const maxUses = invite.get('maxUses') as number | null;
      const uses = invite.get('uses') as number;
      if (invite.get('revoked') === true) throw conflict('invite_revoked', 'Este convite foi revogado.');
      if (expiresAt && expiresAt.toMillis() <= Date.now()) throw conflict('invite_expired', 'Este convite expirou.');
      if (maxUses !== null && uses >= maxUses) throw conflict('invite_exhausted', 'Este convite atingiu o limite de usos.');

      const now = FieldValue.serverTimestamp();
      tx.create(p.member(cid, me), { uid: me, role: 'member', joinedAt: now });
      tx.create(p.membership(me, cid), { communityId: cid, role: 'member', joinedAt: now });
      tx.update(invite.ref, { uses: FieldValue.increment(1) });
      return { communityId: cid, alreadyMember: false };
    });
    return c.json(result);
  });

  return app;
}
