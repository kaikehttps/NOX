// Modo direto (sem servidor): o DirectApi real contra as regras reais no emulador.
// Cobre os fluxos felizes e as tentativas de abuso que as regras precisam barrar.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { Auth } from 'firebase/auth';
import { Timestamp, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DirectApi } from '../../packages/firebase/src/direct';

let env: RulesTestEnvironment;

const USERS = ['alice', 'bob', 'carol', 'eve'] as const;
type U = (typeof USERS)[number];

const fs = (uid: U) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const api = (uid: U) => new DirectApi(fs(uid), { currentUser: { uid, delete: async () => undefined } } as unknown as Auth);

function message(authorId: string, text = 'oi') {
  return { authorId, text, createdAt: serverTimestamp(), editedAt: null, replyTo: null, mentions: [], attachments: [], reactions: {}, pinned: false };
}

async function adminRead(path: string) {
  let out: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = (await getDoc(doc(ctx.firestore() as unknown as Firestore, path))).data();
  });
  return out;
}

async function befriend(a: U, b: U) {
  await api(a).sendFriendRequest(b);
  return api(b).acceptFriendRequest(`${a}_${b}`);
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nox',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore() as unknown as Firestore;
    for (const u of USERS) {
      await setDoc(doc(a, 'users', u), { uid: u, username: u, displayName: u.toUpperCase(), avatarUrl: null, bio: '', createdAt: new Date() });
      await setDoc(doc(a, 'usernames', u), { uid: u });
    }
  });
});

describe('amizades no modo direto', () => {
  it('solicitar → aceitar cria as duas amizades e a DM, e a conversa funciona', async () => {
    expect(await api('alice').sendFriendRequest('@Bob')).toEqual({ status: 'pending', uid: 'bob' });
    const { conversationId } = await api('bob').acceptFriendRequest('alice_bob');
    expect(conversationId).toBe('dm_alice_bob');
    expect(await adminRead('users/alice/friends/bob')).toBeTruthy();
    expect(await adminRead('users/bob/friends/alice')).toBeTruthy();
    expect(await adminRead('friendRequests/alice_bob')).toBeUndefined();
    expect((await adminRead('conversations/dm_alice_bob'))?.locked).toBe(false);
    await assertSucceeds(setDoc(doc(collection(fs('alice'), 'conversations/dm_alice_bob/messages')), message('alice')));
  });

  it('solicitação cruzada é aceita automaticamente', async () => {
    await api('alice').sendFriendRequest('bob');
    expect((await api('bob').sendFriendRequest('alice')).status).toBe('accepted');
  });

  it('não é possível forjar amizade nem aceitar pedido alheio', async () => {
    await api('alice').sendFriendRequest('bob');
    // eve tenta aceitar um pedido que não é para ela
    await expect(api('eve').acceptFriendRequest('alice_bob')).rejects.toMatchObject({ code: 'request_not_found' });
    // alice (remetente) tenta "aceitar" o próprio pedido escrevendo as amizades
    await assertFails(setDoc(doc(fs('alice'), 'users/alice/friends/bob'), { uid: 'bob', since: serverTimestamp(), conversationId: 'dm_alice_bob' }));
    await assertFails(setDoc(doc(fs('alice'), 'users/bob/friends/alice'), { uid: 'alice', since: serverTimestamp(), conversationId: 'dm_alice_bob' }));
    // DM sem amizade
    await assertFails(
      setDoc(doc(fs('eve'), 'conversations/dm_alice_eve'), {
        type: 'dm', memberIds: ['alice', 'eve'], name: null, ownerId: null, locked: false,
        createdAt: serverTimestamp(), lastMessageAt: serverTimestamp(), lastMessagePreview: null, lastMessageAuthorId: null,
      }),
    );
  });

  it('bloqueio desfaz amizade, trava a DM e impede novos pedidos e desbloqueio da conversa', async () => {
    await befriend('alice', 'eve');
    await api('alice').block('eve');
    expect(await adminRead('users/alice/friends/eve')).toBeUndefined();
    expect(await adminRead('users/eve/friends/alice')).toBeUndefined();
    expect((await adminRead('conversations/dm_alice_eve'))?.locked).toBe(true);
    await expect(api('eve').sendFriendRequest('alice')).rejects.toMatchObject({ code: 'forbidden' });
    await assertFails(updateDoc(doc(fs('eve'), 'conversations/dm_alice_eve'), { locked: false }));
    await assertFails(setDoc(doc(collection(fs('eve'), 'conversations/dm_alice_eve/messages')), message('eve')));
    await expect(api('alice').sendFriendRequest('eve')).rejects.toMatchObject({ code: 'blocked' });
    // desbloquear não restaura a amizade
    await api('alice').unblock('eve');
    expect(await adminRead('users/alice/friends/eve')).toBeUndefined();
  });

  it('desfazer amizade trava a DM; refazer destrava', async () => {
    await befriend('alice', 'bob');
    await api('alice').removeFriend('bob');
    expect((await adminRead('conversations/dm_alice_bob'))?.locked).toBe(true);
    await befriend('bob', 'alice');
    expect((await adminRead('conversations/dm_alice_bob'))?.locked).toBe(false);
  });

  it('respeita quem desativou solicitações', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'users/carol/private/settings'), { allowFriendRequests: false });
    });
    await expect(api('eve').sendFriendRequest('carol')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('grupos só com amigos', async () => {
    await befriend('alice', 'bob');
    await befriend('alice', 'carol');
    const { conversationId } = await api('alice').createGroup(['bob', 'carol'], 'trio');
    expect((await adminRead(`conversations/${conversationId}`))?.memberIds).toEqual(['alice', 'bob', 'carol']);
    await expect(api('alice').createGroup(['bob', 'eve'], null)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('comunidades e convites no modo direto', () => {
  it('criar comunidade gera dono, índice, categorias e canais', async () => {
    const { communityId, defaultChannelId } = await api('alice').createCommunity('Base Noturna', 'amigos');
    expect((await adminRead(`communities/${communityId}/members/alice`))?.role).toBe('owner');
    expect((await adminRead(`users/alice/memberships/${communityId}`))?.role).toBe('owner');
    expect((await adminRead(`communities/${communityId}/channels/${defaultChannelId}`))?.name).toBe('geral');
  });

  it('não dá para criar comunidade em nome de outra pessoa', async () => {
    await assertFails(
      setDoc(doc(fs('eve'), 'communities/x'), { name: 'falsa', description: '', iconUrl: null, ownerId: 'alice', createdAt: serverTimestamp() }),
    );
  });

  it('convite: resgate, idempotência, limite de usos, revogação e expiração', async () => {
    const { communityId } = await api('alice').createCommunity('Base');
    const inv = await api('alice').createInvite(communityId, { maxUses: 1 });
    expect(await api('bob').redeemInvite(inv.code)).toEqual({ communityId, alreadyMember: false });
    expect((await adminRead(`communities/${communityId}/members/bob`))?.role).toBe('member');
    expect((await adminRead(`invites/${inv.code}`))?.uses).toBe(1);
    expect((await api('bob').redeemInvite(inv.code)).alreadyMember).toBe(true);
    await expect(api('carol').redeemInvite(inv.code)).rejects.toMatchObject({ code: 'invite_exhausted' });

    const inv2 = await api('alice').createInvite(communityId, {});
    await api('alice').revokeInvite(inv2.code);
    await expect(api('carol').redeemInvite(inv2.code)).rejects.toMatchObject({ code: 'invite_revoked' });

    const inv3 = await api('alice').createInvite(communityId, {});
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as unknown as Firestore, `invites/${inv3.code}`), { expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    });
    await expect(api('carol').redeemInvite(inv3.code)).rejects.toMatchObject({ code: 'invite_expired' });

    const { invites } = await api('alice').listInvites(communityId);
    expect(invites.map((i) => i.code).sort()).toEqual([inv.code, inv2.code, inv3.code].sort());
  });

  it('as regras barram resgate forjado (sem contar uso, convite revogado, sem convite)', async () => {
    const { communityId } = await api('alice').createCommunity('Base');
    const inv = await api('alice').createInvite(communityId, { maxUses: 1 });
    // entrar sem incrementar o uso
    await assertFails(setDoc(doc(fs('eve'), `communities/${communityId}/members/eve`), { uid: 'eve', role: 'member', joinedAt: serverTimestamp(), inviteCode: inv.code }));
    // incrementar o uso sem entrar (sabotagem)
    await assertFails(updateDoc(doc(fs('eve'), `invites/${inv.code}`), { uses: 1 }));
    // zerar usos
    await assertFails(updateDoc(doc(fs('eve'), `invites/${inv.code}`), { uses: 0 }));
    // entrar como moderador
    await assertFails(setDoc(doc(fs('eve'), `communities/${communityId}/members/eve`), { uid: 'eve', role: 'moderator', joinedAt: serverTimestamp(), inviteCode: inv.code }));
  });

  it('só moderador+ cria convites; só admin+ cria canais; papéis respeitam a hierarquia', async () => {
    const { communityId } = await api('alice').createCommunity('Base');
    const inv = await api('alice').createInvite(communityId, {});
    await api('bob').redeemInvite(inv.code);
    await api('carol').redeemInvite(inv.code);

    await expect(api('bob').createInvite(communityId, {})).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api('eve').createInvite(communityId, {})).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api('bob').createChannel(communityId, { name: 'x', type: 'text' })).rejects.toMatchObject({ code: 'forbidden' });

    await api('alice').setMemberRole(communityId, 'bob', 'admin');
    expect((await adminRead(`users/bob/memberships/${communityId}`))?.role).toBe('admin');
    const { channelId } = await api('bob').createChannel(communityId, { name: 'Jogos Hoje', type: 'text' });
    expect((await adminRead(`communities/${communityId}/channels/${channelId}`))?.name).toBe('jogos-hoje');

    await api('bob').setMemberRole(communityId, 'carol', 'moderator');
    await expect(api('bob').setMemberRole(communityId, 'carol', 'admin')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api('bob').setMemberRole(communityId, 'alice', 'member')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(api('carol').removeMember(communityId, 'bob')).rejects.toMatchObject({ code: 'forbidden' });
    await api('bob').removeMember(communityId, 'carol');
    expect(await adminRead(`communities/${communityId}/members/carol`)).toBeUndefined();
    expect(await adminRead(`users/carol/memberships/${communityId}`)).toBeUndefined();
  });

  it('sair, dono não sai, só o dono apaga; dados da comunidade apagada ficam inacessíveis', async () => {
    const { communityId, defaultChannelId } = await api('alice').createCommunity('Base');
    const inv = await api('alice').createInvite(communityId, {});
    await api('bob').redeemInvite(inv.code);
    await api('carol').redeemInvite(inv.code);

    await expect(api('alice').leaveCommunity(communityId)).rejects.toMatchObject({ code: 'owner_cannot_leave' });
    await api('carol').leaveCommunity(communityId);
    expect(await adminRead(`communities/${communityId}/members/carol`)).toBeUndefined();

    await expect(api('bob').deleteCommunity(communityId)).rejects.toMatchObject({ code: 'forbidden' });
    await api('alice').deleteCommunity(communityId);
    await assertFails(getDocs(collection(fs('bob'), `communities/${communityId}/channels/${defaultChannelId}/messages`)));
    await assertFails(getDocs(collection(fs('bob'), `communities/${communityId}/channels`)));
  });
});

describe('exclusão de conta no modo direto', () => {
  it('apaga perfil, nome, amizades e trava DMs', async () => {
    await befriend('alice', 'bob');
    await api('bob').deleteAccount();
    expect(await adminRead('users/bob')).toBeUndefined();
    expect(await adminRead('usernames/bob')).toBeUndefined();
    expect(await adminRead('users/alice/friends/bob')).toBeUndefined();
    expect((await adminRead('conversations/dm_alice_bob'))?.locked).toBe(true);
  });

  it('ninguém libera o nome de usuário de outra pessoa', async () => {
    await assertFails(env.authenticatedContext('eve').firestore().doc('usernames/alice').delete());
  });
});
