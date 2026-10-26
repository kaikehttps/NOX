import { Hono } from 'hono';
import { FieldValue, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { dmConversationId, friendRequestId, LIMITS } from '@nox/shared';
import { friendRequestCreateSchema, groupCreateSchema, userTargetSchema } from '@nox/validation';
import type { AppEnv, Deps } from '../context';
import { badRequest, conflict, forbidden, notFound, parse } from '../errors';

const refs = (db: Firestore) => ({
  user: (uid: string) => db.doc(`users/${uid}`),
  friend: (owner: string, other: string) => db.doc(`users/${owner}/friends/${other}`),
  block: (owner: string, other: string) => db.doc(`users/${owner}/blocks/${other}`),
  settings: (uid: string) => db.doc(`users/${uid}/private/settings`),
  request: (from: string, to: string) => db.doc(`friendRequests/${friendRequestId(from, to)}`),
  dm: (a: string, b: string) => db.doc(`conversations/${dmConversationId(a, b)}`),
});

const UNAVAILABLE = 'Não foi possível enviar a solicitação para este usuário.';

/**
 * Cria a amizade nos dois sentidos e abre (ou reabre) a DM.
 * Deve ser chamada depois de todas as leituras da transação.
 */
function writeFriendship(tx: Transaction, db: Firestore, a: string, b: string, dmExists: boolean) {
  const r = refs(db);
  const conversationId = dmConversationId(a, b);
  const since = FieldValue.serverTimestamp();
  tx.set(r.friend(a, b), { uid: b, since, conversationId });
  tx.set(r.friend(b, a), { uid: a, since, conversationId });
  if (dmExists) {
    tx.update(r.dm(a, b), { locked: false });
  } else {
    tx.create(r.dm(a, b), {
      type: 'dm',
      memberIds: [a, b].sort(),
      name: null,
      ownerId: null,
      locked: false,
      createdAt: since,
      lastMessageAt: since,
      lastMessagePreview: null,
      lastMessageAuthorId: null,
    });
  }
  tx.delete(r.request(a, b));
  tx.delete(r.request(b, a));
  return conversationId;
}

export function socialRoutes({ db, limiter }: Deps) {
  const app = new Hono<AppEnv>();
  const r = refs(db);

  /** Envia solicitação pelo nome de usuário. Se já houver uma no sentido inverso, aceita direto. */
  app.post('/friends/requests', async (c) => {
    const me = c.get('uid');
    limiter.check(`fr:${me}`, 30, 60 * 60_000);
    const { username } = parse(friendRequestCreateSchema, await c.req.json());

    const claim = await db.doc(`usernames/${username}`).get();
    const target = claim.get('uid') as string | undefined;
    if (!target) throw notFound('user_not_found', 'Nenhum usuário com esse nome.');
    if (target === me) throw badRequest('self', 'Você não pode adicionar a si mesmo.');

    const result = await db.runTransaction(async (tx) => {
      const [blockedByThem, blockedByMe, friends, reverse, existing, settings, dm, meDoc] = await tx.getAll(
        r.block(target, me),
        r.block(me, target),
        r.friend(me, target),
        r.request(target, me),
        r.request(me, target),
        r.settings(target),
        r.dm(me, target),
        r.user(me),
      );
      if (!meDoc!.exists) throw forbidden('profile_required', 'Conclua seu perfil primeiro.');
      if (blockedByMe!.exists) throw conflict('blocked', 'Você bloqueou este usuário. Desbloqueie para adicionar.');
      // Não revelamos que o outro usuário bloqueou ou fechou solicitações.
      if (blockedByThem!.exists || settings!.get('allowFriendRequests') === false) throw forbidden('unavailable', UNAVAILABLE);
      if (friends!.exists) throw conflict('already_friends', 'Vocês já são amigos.');
      if (reverse!.exists) {
        const conversationId = writeFriendship(tx, db, me, target, dm!.exists);
        return { status: 'accepted' as const, uid: target, conversationId };
      }
      if (existing!.exists) return { status: 'pending' as const, uid: target };
      tx.create(r.request(me, target), { from: me, to: target, createdAt: FieldValue.serverTimestamp() });
      return { status: 'pending' as const, uid: target };
    });
    return c.json(result, result.status === 'pending' ? 201 : 200);
  });

  app.post('/friends/requests/:id/accept', async (c) => {
    const me = c.get('uid');
    const ref = db.doc(`friendRequests/${c.req.param('id')}`);
    const result = await db.runTransaction(async (tx) => {
      const req = await tx.get(ref);
      if (!req.exists || req.get('to') !== me) throw notFound('request_not_found', 'Solicitação não encontrada.');
      const from = req.get('from') as string;
      const [blockedByMe, blockedByThem, dm] = await tx.getAll(r.block(me, from), r.block(from, me), r.dm(me, from));
      if (blockedByMe!.exists || blockedByThem!.exists) {
        tx.delete(ref);
        throw forbidden('unavailable', 'Esta solicitação não está mais disponível.');
      }
      return { uid: from, conversationId: writeFriendship(tx, db, me, from, dm!.exists) };
    });
    return c.json(result);
  });

  /** Recusar (destinatário) ou cancelar (remetente). */
  app.delete('/friends/requests/:id', async (c) => {
    const me = c.get('uid');
    const ref = db.doc(`friendRequests/${c.req.param('id')}`);
    const snap = await ref.get();
    if (!snap.exists || (snap.get('to') !== me && snap.get('from') !== me)) {
      throw notFound('request_not_found', 'Solicitação não encontrada.');
    }
    await ref.delete();
    return c.json({ ok: true });
  });

  /** Desfaz a amizade. A DM continua legível, mas fica bloqueada para novas mensagens. */
  app.delete('/friends/:uid', async (c) => {
    const me = c.get('uid');
    const { uid } = parse(userTargetSchema, { uid: c.req.param('uid') });
    await db.runTransaction(async (tx) => {
      const [dm] = await tx.getAll(r.dm(me, uid));
      tx.delete(r.friend(me, uid));
      tx.delete(r.friend(uid, me));
      if (dm!.exists) tx.update(r.dm(me, uid), { locked: true });
    });
    return c.json({ ok: true });
  });

  /** Bloqueio: remove amizade e solicitações pendentes e trava a DM nos dois sentidos. */
  app.put('/blocks/:uid', async (c) => {
    const me = c.get('uid');
    const { uid } = parse(userTargetSchema, { uid: c.req.param('uid') });
    if (uid === me) throw badRequest('self', 'Você não pode bloquear a si mesmo.');
    await db.runTransaction(async (tx) => {
      const [dm] = await tx.getAll(r.dm(me, uid));
      tx.set(r.block(me, uid), { uid, createdAt: FieldValue.serverTimestamp() });
      tx.delete(r.friend(me, uid));
      tx.delete(r.friend(uid, me));
      tx.delete(r.request(me, uid));
      tx.delete(r.request(uid, me));
      if (dm!.exists) tx.update(r.dm(me, uid), { locked: true });
    });
    return c.json({ ok: true });
  });

  /** Desbloquear não restaura a amizade: é preciso uma nova solicitação. */
  app.delete('/blocks/:uid', async (c) => {
    const me = c.get('uid');
    const { uid } = parse(userTargetSchema, { uid: c.req.param('uid') });
    await r.block(me, uid).delete();
    return c.json({ ok: true });
  });

  /** Grupo privado: somente com amigos atuais. */
  app.post('/conversations/groups', async (c) => {
    const me = c.get('uid');
    limiter.check(`grp:${me}`, 20, 60 * 60_000);
    const input = parse(groupCreateSchema, await c.req.json());
    const others = [...new Set(input.memberIds.filter((u) => u !== me))];
    if (others.length < 2) throw badRequest('too_few_members', 'Um grupo precisa de pelo menos 3 pessoas.');
    if (others.length + 1 > LIMITS.group.membersMax) throw badRequest('too_many_members', 'Grupo cheio.');

    const friendDocs = await db.getAll(...others.map((u) => r.friend(me, u)));
    if (friendDocs.some((d) => !d.exists)) throw forbidden('not_friends', 'Só é possível criar grupos com amigos.');

    const ref = db.collection('conversations').doc() as DocumentReference;
    const now = FieldValue.serverTimestamp();
    await ref.create({
      type: 'group',
      memberIds: [me, ...others],
      name: input.name,
      ownerId: me,
      locked: false,
      createdAt: now,
      lastMessageAt: now,
      lastMessagePreview: null,
      lastMessageAuthorId: null,
    });
    return c.json({ conversationId: ref.id }, 201);
  });

  return app;
}
