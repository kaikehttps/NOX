import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { AccessToken, TokenVerifier } from 'livekit-server-sdk';
import { createApp } from '../src/app';
import { RateLimiter } from '../src/rate-limit';

const PROJECT = 'demo-nox';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.FIRESTORE_EMULATOR_HOST = FS_HOST;
process.env.GCLOUD_PROJECT = PROJECT;

const LK = { url: 'wss://test.livekit.cloud', apiKey: 'APItestkey', apiSecret: 'test-secret-that-is-long-enough-123456' };

let firebase: App;
let db: Firestore;
let app: ReturnType<typeof createApp>;

interface TestUser {
  uid: string;
  token: string;
  username: string;
}

async function signUp(username: string): Promise<TestUser> {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${username}@nox.test`, password: 'senha-segura-123', returnSecureToken: true }),
  });
  const body = (await res.json()) as { idToken: string; localId: string };
  await db.doc(`users/${body.localId}`).set({
    uid: body.localId, username, displayName: username.toUpperCase(), avatarUrl: null, bio: '', createdAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`usernames/${username}`).set({ uid: body.localId });
  return { uid: body.localId, token: body.idToken, username };
}

async function call(user: TestUser | null, method: string, path: string, body?: unknown) {
  const res = await app.request(`/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await res.json()) as Record<string, any>;
  return { status: res.status, json };
}

async function clearEmulators() {
  await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

let alice: TestUser, bob: TestUser, eve: TestUser, carol: TestUser;

beforeAll(() => {
  firebase = initializeApp({ projectId: PROJECT }, 'api-test');
  db = getFirestore(firebase);
});

afterAll(async () => {
  await deleteApp(firebase);
});

beforeEach(async () => {
  await clearEmulators();
  app = createApp({
    db,
    auth: getAuth(firebase),
    storage: null,
    config: { port: 0, projectId: PROJECT, storageBucket: null, livekit: LK },
    limiter: new RateLimiter(),
  });
  [alice, bob, eve, carol] = await Promise.all([signUp('alice'), signUp('bob'), signUp('eve'), signUp('carol')]);
});

describe('autenticação', () => {
  it('rejeita requisições sem token ou com token inválido', async () => {
    expect((await call(null, 'POST', '/communities', { name: 'x' })).status).toBe(401);
    expect((await call({ ...alice, token: 'lixo' }, 'POST', '/communities', { name: 'x' })).status).toBe(401);
  });

  it('valida entrada', async () => {
    const r = await call(alice, 'POST', '/friends/requests', { username: '!!' });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('invalid_input');
  });
});

describe('amizades e bloqueios', () => {
  it('fluxo completo: solicitar, aceitar, DM criada, remover trava a DM', async () => {
    const sent = await call(alice, 'POST', '/friends/requests', { username: '@Bob' });
    expect(sent.status).toBe(201);
    expect(sent.json.status).toBe('pending');
    expect((await db.doc(`friendRequests/${alice.uid}_${bob.uid}`).get()).exists).toBe(true);

    // Só o destinatário aceita.
    expect((await call(alice, 'POST', `/friends/requests/${alice.uid}_${bob.uid}/accept`)).status).toBe(404);
    const accepted = await call(bob, 'POST', `/friends/requests/${alice.uid}_${bob.uid}/accept`);
    expect(accepted.status).toBe(200);

    const convId = accepted.json.conversationId as string;
    const conv = await db.doc(`conversations/${convId}`).get();
    expect(conv.get('memberIds')).toEqual([alice.uid, bob.uid].sort());
    expect(conv.get('locked')).toBe(false);
    expect((await db.doc(`users/${alice.uid}/friends/${bob.uid}`).get()).exists).toBe(true);
    expect((await db.doc(`users/${bob.uid}/friends/${alice.uid}`).get()).exists).toBe(true);
    expect((await db.doc(`friendRequests/${alice.uid}_${bob.uid}`).get()).exists).toBe(false);

    expect((await call(alice, 'POST', '/friends/requests', { username: 'bob' })).json.error.code).toBe('already_friends');

    await call(alice, 'DELETE', `/friends/${bob.uid}`);
    expect((await db.doc(`users/${bob.uid}/friends/${alice.uid}`).get()).exists).toBe(false);
    expect((await db.doc(`conversations/${convId}`).get()).get('locked')).toBe(true);
  });

  it('solicitação cruzada é aceita automaticamente', async () => {
    await call(alice, 'POST', '/friends/requests', { username: 'bob' });
    const r = await call(bob, 'POST', '/friends/requests', { username: 'alice' });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe('accepted');
  });

  it('recusar e cancelar', async () => {
    await call(alice, 'POST', '/friends/requests', { username: 'bob' });
    expect((await call(eve, 'DELETE', `/friends/requests/${alice.uid}_${bob.uid}`)).status).toBe(404);
    expect((await call(bob, 'DELETE', `/friends/requests/${alice.uid}_${bob.uid}`)).status).toBe(200);
    await call(alice, 'POST', '/friends/requests', { username: 'bob' });
    expect((await call(alice, 'DELETE', `/friends/requests/${alice.uid}_${bob.uid}`)).status).toBe(200);
  });

  it('bloqueio remove amizade, apaga solicitações, trava DM e impede nova solicitação sem revelar o bloqueio', async () => {
    await call(alice, 'POST', '/friends/requests', { username: 'eve' });
    const { json } = await call(eve, 'POST', `/friends/requests/${alice.uid}_${eve.uid}/accept`);

    await call(alice, 'PUT', `/blocks/${eve.uid}`);
    expect((await db.doc(`users/${alice.uid}/friends/${eve.uid}`).get()).exists).toBe(false);
    expect((await db.doc(`users/${eve.uid}/friends/${alice.uid}`).get()).exists).toBe(false);
    expect((await db.doc(`conversations/${json.conversationId}`).get()).get('locked')).toBe(true);

    const fromEve = await call(eve, 'POST', '/friends/requests', { username: 'alice' });
    expect(fromEve.status).toBe(403);
    expect(fromEve.json.error.code).toBe('unavailable');
    expect(fromEve.json.error.message).not.toMatch(/bloque/i);

    const fromAlice = await call(alice, 'POST', '/friends/requests', { username: 'eve' });
    expect(fromAlice.json.error.code).toBe('blocked');

    // Desbloquear não restaura amizade.
    await call(alice, 'DELETE', `/blocks/${eve.uid}`);
    expect((await db.doc(`users/${alice.uid}/friends/${eve.uid}`).get()).exists).toBe(false);
    expect((await call(eve, 'POST', '/friends/requests', { username: 'alice' })).status).toBe(201);
  });

  it('solicitação pendente não pode ser aceita depois de um bloqueio', async () => {
    await call(eve, 'POST', '/friends/requests', { username: 'alice' });
    await db.doc(`users/${alice.uid}/blocks/${eve.uid}`).set({ uid: eve.uid });
    const r = await call(alice, 'POST', `/friends/requests/${eve.uid}_${alice.uid}/accept`);
    expect(r.status).toBe(403);
    expect((await db.doc(`users/${alice.uid}/friends/${eve.uid}`).get()).exists).toBe(false);
  });

  it('grupos só com amigos', async () => {
    for (const u of [bob, carol]) {
      await call(alice, 'POST', '/friends/requests', { username: u.username });
      await call(u, 'POST', `/friends/requests/${alice.uid}_${u.uid}/accept`);
    }
    const ok = await call(alice, 'POST', '/conversations/groups', { name: 'trio', memberIds: [bob.uid, carol.uid] });
    expect(ok.status).toBe(201);
    const conv = await db.doc(`conversations/${ok.json.conversationId}`).get();
    expect(conv.get('memberIds')).toHaveLength(3);
    const denied = await call(alice, 'POST', '/conversations/groups', { name: null, memberIds: [bob.uid, eve.uid] });
    expect(denied.status).toBe(403);
  });
});

describe('comunidades, canais e permissões', () => {
  async function setup() {
    const created = await call(alice, 'POST', '/communities', { name: 'Base Noturna', description: 'só os amigos' });
    expect(created.status).toBe(201);
    return created.json.communityId as string;
  }

  async function join(cid: string, user: TestUser, by = alice) {
    const inv = await call(by, 'POST', `/communities/${cid}/invites`, {});
    return call(user, 'POST', `/invites/${inv.json.code}/redeem`);
  }

  it('criação gera dono, índice reverso e canais iniciais', async () => {
    const cid = await setup();
    expect((await db.doc(`communities/${cid}/members/${alice.uid}`).get()).get('role')).toBe('owner');
    expect((await db.doc(`users/${alice.uid}/memberships/${cid}`).get()).exists).toBe(true);
    const channels = await db.collection(`communities/${cid}/channels`).orderBy('position').get();
    expect(channels.docs.map((d) => [d.get('name'), d.get('type')])).toEqual([['geral', 'text'], ['lounge', 'voice']]);
  });

  it('convites: resgate, idempotência, limite de usos, expiração e revogação', async () => {
    const cid = await setup();
    const inv = await call(alice, 'POST', `/communities/${cid}/invites`, { maxUses: 1 });
    expect(inv.status).toBe(201);
    expect(inv.json.code).toMatch(/^[a-z2-9]{10}$/);

    const r1 = await call(bob, 'POST', `/invites/${inv.json.code}/redeem`);
    expect(r1.json).toEqual({ communityId: cid, alreadyMember: false });
    expect((await db.doc(`communities/${cid}/members/${bob.uid}`).get()).get('role')).toBe('member');
    expect((await call(bob, 'POST', `/invites/${inv.json.code}/redeem`)).json.alreadyMember).toBe(true);
    expect((await call(carol, 'POST', `/invites/${inv.json.code}/redeem`)).json.error.code).toBe('invite_exhausted');

    const inv2 = await call(alice, 'POST', `/communities/${cid}/invites`, {});
    await db.doc(`invites/${inv2.json.code}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    expect((await call(carol, 'POST', `/invites/${inv2.json.code}/redeem`)).json.error.code).toBe('invite_expired');

    const inv3 = await call(alice, 'POST', `/communities/${cid}/invites`, {});
    expect((await call(bob, 'DELETE', `/invites/${inv3.json.code}`)).status).toBe(403);
    expect((await call(alice, 'DELETE', `/invites/${inv3.json.code}`)).status).toBe(200);
    expect((await call(carol, 'POST', `/invites/${inv3.json.code}/redeem`)).json.error.code).toBe('invite_revoked');

    expect((await call(carol, 'POST', '/invites/zzzzzzzzzz/redeem')).status).toBe(404);
  });

  it('membros comuns não criam convites nem canais; não membros nem enxergam', async () => {
    const cid = await setup();
    await join(cid, bob);
    expect((await call(bob, 'POST', `/communities/${cid}/invites`, {})).status).toBe(403);
    expect((await call(bob, 'POST', `/communities/${cid}/channels`, { name: 'x', type: 'text' })).status).toBe(403);
    expect((await call(eve, 'POST', `/communities/${cid}/channels`, { name: 'x', type: 'text' })).status).toBe(404);
  });

  it('admin cria, edita, reordena e apaga canais', async () => {
    const cid = await setup();
    const ch = await call(alice, 'POST', `/communities/${cid}/channels`, { name: 'Jogos Hoje', type: 'text', topic: 'bora' });
    expect(ch.status).toBe(201);
    const snap = await db.doc(`communities/${cid}/channels/${ch.json.channelId}`).get();
    expect(snap.get('name')).toBe('jogos-hoje');
    expect(snap.get('access')).toEqual({ view: 'member', send: 'member', attach: 'member', connect: 'member' });

    await call(alice, 'PATCH', `/communities/${cid}/channels/${ch.json.channelId}`, { access: { send: 'moderator' } });
    expect((await snap.ref.get()).get('access.send')).toBe('moderator');

    const all = await db.collection(`communities/${cid}/channels`).get();
    const order = all.docs.map((d) => d.id).reverse();
    expect((await call(alice, 'POST', `/communities/${cid}/reorder`, { kind: 'channels', order })).status).toBe(200);
    expect((await db.doc(`communities/${cid}/channels/${order[0]}`).get()).get('position')).toBe(0);

    await db.doc(`communities/${cid}/channels/${ch.json.channelId}/messages/m1`).set({ text: 'oi' });
    expect((await call(alice, 'DELETE', `/communities/${cid}/channels/${ch.json.channelId}`)).status).toBe(200);
    expect((await db.doc(`communities/${cid}/channels/${ch.json.channelId}/messages/m1`).get()).exists).toBe(false);
  });

  it('papéis: sem promoção acima do próprio nível e sem ações sobre pares', async () => {
    const cid = await setup();
    await join(cid, bob);
    await join(cid, carol);
    expect((await call(alice, 'PUT', `/communities/${cid}/members/${bob.uid}/role`, { role: 'admin' })).status).toBe(200);
    expect((await db.doc(`users/${bob.uid}/memberships/${cid}`).get()).get('role')).toBe('admin');
    // bob (admin) promove carol a moderadora, mas não a admin nem owner
    expect((await call(bob, 'PUT', `/communities/${cid}/members/${carol.uid}/role`, { role: 'moderator' })).status).toBe(200);
    expect((await call(bob, 'PUT', `/communities/${cid}/members/${carol.uid}/role`, { role: 'admin' })).status).toBe(403);
    expect((await call(bob, 'PUT', `/communities/${cid}/members/${alice.uid}/role`, { role: 'member' })).status).toBe(403);
    // carol (moderadora) não remove bob (admin); bob remove carol
    expect((await call(carol, 'DELETE', `/communities/${cid}/members/${bob.uid}`)).status).toBe(403);
    expect((await call(bob, 'DELETE', `/communities/${cid}/members/${carol.uid}`)).status).toBe(200);
    expect((await db.doc(`users/${carol.uid}/memberships/${cid}`).get()).exists).toBe(false);
    // dono não sai sem transferir
    expect((await call(alice, 'POST', `/communities/${cid}/leave`)).status).toBe(409);
    expect((await call(bob, 'POST', `/communities/${cid}/leave`)).status).toBe(200);
  });

  it('apagar comunidade remove índices reversos e convites', async () => {
    const cid = await setup();
    await join(cid, bob);
    expect((await call(bob, 'DELETE', `/communities/${cid}`)).status).toBe(403);
    expect((await call(alice, 'DELETE', `/communities/${cid}`)).status).toBe(200);
    expect((await db.doc(`communities/${cid}`).get()).exists).toBe(false);
    expect((await db.doc(`users/${bob.uid}/memberships/${cid}`).get()).exists).toBe(false);
    expect((await db.collection('invites').where('communityId', '==', cid).get()).size).toBe(0);
  });
});

describe('voz', () => {
  it('emite token apenas para quem pode conectar, com identidade e sala corretas', async () => {
    const { json } = await call(alice, 'POST', '/communities', { name: 'Voz' });
    const cid = json.communityId as string;
    const channels = await db.collection(`communities/${cid}/channels`).get();
    const voice = channels.docs.find((d) => d.get('type') === 'voice')!;
    const text = channels.docs.find((d) => d.get('type') === 'text')!;

    const ok = await call(alice, 'POST', '/voice/token', { kind: 'channel', communityId: cid, channelId: voice.id });
    expect(ok.status).toBe(200);
    expect(ok.json.room).toBe(`nox:ch:${cid}:${voice.id}`);
    const claims = await new TokenVerifier(LK.apiKey, LK.apiSecret).verify(ok.json.token);
    expect(claims.sub).toBe(alice.uid);
    expect(claims.name).toBe('ALICE');
    expect(claims.video?.room).toBe(ok.json.room);
    expect(claims.video?.roomJoin).toBe(true);
    expect(claims.video?.roomAdmin).toBeFalsy();

    expect((await call(eve, 'POST', '/voice/token', { kind: 'channel', communityId: cid, channelId: voice.id })).status).toBe(404);
    expect((await call(alice, 'POST', '/voice/token', { kind: 'channel', communityId: cid, channelId: text.id })).status).toBe(403);

    await voice.ref.update({ 'access.connect': 'admin' });
    const inv = await call(alice, 'POST', `/communities/${cid}/invites`, {});
    await call(bob, 'POST', `/invites/${inv.json.code}/redeem`);
    expect((await call(bob, 'POST', '/voice/token', { kind: 'channel', communityId: cid, channelId: voice.id })).status).toBe(403);
  });

  it('chamada privada exige participação e conversa destravada', async () => {
    await call(alice, 'POST', '/friends/requests', { username: 'bob' });
    const { json } = await call(bob, 'POST', `/friends/requests/${alice.uid}_${bob.uid}/accept`);
    const body = { kind: 'conversation', conversationId: json.conversationId };
    expect((await call(bob, 'POST', '/voice/token', body)).status).toBe(200);
    expect((await call(eve, 'POST', '/voice/token', body)).status).toBe(404);
    await call(alice, 'PUT', `/blocks/${bob.uid}`);
    expect((await call(bob, 'POST', '/voice/token', body)).status).toBe(403);
  });

  it('webhook assinado atualiza estados de voz; assinatura inválida é rejeitada', async () => {
    const room = 'nox:ch:c1:v1';
    const send = async (event: Record<string, unknown>, valid = true) => {
      const body = JSON.stringify({ id: crypto.randomUUID(), createdAt: Math.floor(Date.now() / 1000), ...event });
      const at = new AccessToken(LK.apiKey, valid ? LK.apiSecret : 'segredo-errado-com-tamanho-suficiente');
      at.sha256 = createHash('sha256').update(body).digest('base64');
      return app.request('/v1/livekit/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/webhook+json', Authorization: await at.toJwt() },
        body,
      });
    };

    expect((await send({ event: 'participant_joined', room: { name: room }, participant: { identity: bob.uid } })).status).toBe(200);
    expect((await db.doc(`communities/c1/voiceStates/${bob.uid}`).get()).get('channelId')).toBe('v1');

    expect((await send({ event: 'participant_left', room: { name: room }, participant: { identity: bob.uid } }, false)).status).toBe(401);
    expect((await db.doc(`communities/c1/voiceStates/${bob.uid}`).get()).exists).toBe(true);

    await send({ event: 'participant_left', room: { name: room }, participant: { identity: bob.uid } });
    expect((await db.doc(`communities/c1/voiceStates/${bob.uid}`).get()).exists).toBe(false);
  });
});

describe('exclusão de conta', () => {
  it('remove perfil, nome, amizades e trava DMs; bloqueia se for dono de comunidade com membros', async () => {
    await call(alice, 'POST', '/friends/requests', { username: 'bob' });
    const { json } = await call(bob, 'POST', `/friends/requests/${alice.uid}_${bob.uid}/accept`);
    const c = await call(bob, 'POST', '/communities', { name: 'Do Bob' });
    const inv = await call(bob, 'POST', `/communities/${c.json.communityId}/invites`, {});
    await call(alice, 'POST', `/invites/${inv.json.code}/redeem`);

    expect((await call(bob, 'DELETE', '/account')).json.error.code).toBe('owns_communities');

    expect((await call(alice, 'DELETE', '/account')).status).toBe(200);
    expect((await db.doc(`users/${alice.uid}`).get()).exists).toBe(false);
    expect((await db.doc('usernames/alice').get()).exists).toBe(false);
    expect((await db.doc(`users/${bob.uid}/friends/${alice.uid}`).get()).exists).toBe(false);
    expect((await db.doc(`communities/${c.json.communityId}/members/${alice.uid}`).get()).exists).toBe(false);
    expect((await db.doc(`conversations/${json.conversationId}`).get()).get('locked')).toBe(true);
    await expect(getAuth(firebase).getUser(alice.uid)).rejects.toThrow();
  });
});
