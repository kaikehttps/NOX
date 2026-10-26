import { Hono } from 'hono';
import type { AppEnv, Deps } from '../context';
import { conflict } from '../errors';
import { deleteCommunityCascade } from './communities';

/**
 * Exclusão de conta.
 * - Comunidades próprias com outros membros bloqueiam a exclusão (transfira ou apague antes).
 * - Comunidades próprias sem outros membros são apagadas.
 * - Sai das demais comunidades, desfaz amizades, remove solicitações e trava as DMs.
 * - Apaga perfil, reserva de nome, preferências, índices, avatar e a conta de autenticação.
 * - Mensagens enviadas permanecem para os outros participantes e passam a exibir
 *   "conta removida" (o perfil deixa de existir). Ver docs/privacy.md.
 */
export function accountRoutes({ db, auth, storage }: Deps) {
  const app = new Hono<AppEnv>();

  app.delete('/account', async (c) => {
    const me = c.get('uid');
    const memberships = await db.collection(`users/${me}/memberships`).get();

    const ownedWithOthers: string[] = [];
    const ownedAlone: string[] = [];
    for (const m of memberships.docs) {
      if (m.get('role') !== 'owner') continue;
      const count = (await db.collection(`communities/${m.id}/members`).count().get()).data().count;
      (count > 1 ? ownedWithOthers : ownedAlone).push(m.id);
    }
    if (ownedWithOthers.length > 0) {
      throw conflict('owns_communities', `Transfira ou apague suas comunidades antes: ${ownedWithOthers.join(', ')}`);
    }

    for (const cid of ownedAlone) await deleteCommunityCascade(db, cid);

    const [friends, outgoing, incoming, profile] = await Promise.all([
      db.collection(`users/${me}/friends`).get(),
      db.collection('friendRequests').where('from', '==', me).get(),
      db.collection('friendRequests').where('to', '==', me).get(),
      db.doc(`users/${me}`).get(),
    ]);

    const writer = db.bulkWriter();
    for (const m of memberships.docs) {
      if (ownedAlone.includes(m.id)) continue;
      void writer.delete(db.doc(`communities/${m.id}/members/${me}`));
      void writer.delete(db.doc(`communities/${m.id}/voiceStates/${me}`));
    }
    for (const f of friends.docs) {
      void writer.delete(db.doc(`users/${f.id}/friends/${me}`));
      const conversationId = f.get('conversationId') as string | undefined;
      if (conversationId) void writer.update(db.doc(`conversations/${conversationId}`), { locked: true });
    }
    for (const r of [...outgoing.docs, ...incoming.docs]) void writer.delete(r.ref);
    const username = profile.get('username') as string | undefined;
    if (username) void writer.delete(db.doc(`usernames/${username}`));
    await writer.close();

    await db.recursiveDelete(db.doc(`users/${me}`));
    if (storage) {
      await storage.bucket().deleteFiles({ prefix: `avatars/${me}/` }).catch(() => undefined);
    }
    await auth.deleteUser(me);
    return c.json({ ok: true });
  });

  return app;
}
