import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  FieldPath,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const db = (uid?: string) =>
  (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore()) as unknown as Firestore;

const access = { view: 'member', send: 'member', attach: 'member', connect: 'member' };

function newMessage(authorId: string, text = 'oi') {
  return {
    authorId,
    text,
    createdAt: serverTimestamp(),
    editedAt: null,
    replyTo: null,
    mentions: [],
    attachments: [],
    reactions: {},
    pinned: false,
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nox',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore() as unknown as Firestore;
    // Comunidade c1: alice (owner), bob (member), mod (moderator). eve não participa.
    await setDoc(doc(a, 'communities/c1'), { name: 'Base', description: '', iconUrl: null, ownerId: 'alice', createdAt: new Date() });
    await setDoc(doc(a, 'communities/c1/members/alice'), { uid: 'alice', role: 'owner', joinedAt: new Date() });
    await setDoc(doc(a, 'communities/c1/members/bob'), { uid: 'bob', role: 'member', joinedAt: new Date() });
    await setDoc(doc(a, 'communities/c1/members/mod'), { uid: 'mod', role: 'moderator', joinedAt: new Date() });
    await setDoc(doc(a, 'communities/c1/channels/geral'), { name: 'geral', type: 'text', categoryId: null, topic: '', position: 0, access });
    await setDoc(doc(a, 'communities/c1/channels/staff'), {
      name: 'staff', type: 'text', categoryId: null, topic: '', position: 1,
      access: { ...access, view: 'moderator' },
    });
    await setDoc(doc(a, 'communities/c1/channels/avisos'), {
      name: 'avisos', type: 'text', categoryId: null, topic: '', position: 2,
      access: { ...access, send: 'admin' },
    });
    await setDoc(doc(a, 'communities/c1/channels/geral/messages/m1'), { ...newMessage('bob'), createdAt: new Date(), reactions: {} });
    // DM alice ↔ bob e DM bloqueada alice ↔ eve
    await setDoc(doc(a, 'conversations/dm_alice_bob'), {
      type: 'dm', memberIds: ['alice', 'bob'], name: null, ownerId: null, locked: false,
      createdAt: new Date(), lastMessageAt: null, lastMessagePreview: null,
    });
    await setDoc(doc(a, 'conversations/dm_alice_eve'), {
      type: 'dm', memberIds: ['alice', 'eve'], name: null, ownerId: null, locked: true,
      createdAt: new Date(), lastMessageAt: null, lastMessagePreview: null,
    });
    await setDoc(doc(a, 'conversations/dm_alice_bob/messages/d1'), { ...newMessage('alice'), createdAt: new Date() });
    await setDoc(doc(a, 'friendRequests/eve_bob'), { from: 'eve', to: 'bob', createdAt: new Date() });
    await setDoc(doc(a, 'invites/abcdefghjk'), { communityId: 'c1', communityName: 'Base', uses: 0, revoked: false });
  });
});

describe('perfil e nome de usuário', () => {
  it('cria perfil junto com a reserva do nome', async () => {
    const d = db('carol');
    const batch = writeBatch(d);
    batch.set(doc(d, 'users/carol'), {
      uid: 'carol', username: 'carol', displayName: 'Carol', avatarUrl: null, bio: '', createdAt: serverTimestamp(),
    });
    batch.set(doc(d, 'usernames/carol'), { uid: 'carol' });
    await assertSucceeds(batch.commit());
  });

  it('não cria perfil sem reservar o nome', async () => {
    await assertFails(setDoc(doc(db('carol'), 'users/carol'), {
      uid: 'carol', username: 'carol', displayName: 'Carol', avatarUrl: null, bio: '', createdAt: serverTimestamp(),
    }));
  });

  it('não permite tomar um nome já reservado', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'usernames/taken'), { uid: 'alice' });
    });
    const d = db('carol');
    const batch = writeBatch(d);
    batch.set(doc(d, 'users/carol'), {
      uid: 'carol', username: 'taken', displayName: 'Carol', avatarUrl: null, bio: '', createdAt: serverTimestamp(),
    });
    batch.set(doc(d, 'usernames/taken'), { uid: 'carol' });
    await assertFails(batch.commit());
  });

  it('não permite reservar nome em nome de outra pessoa', async () => {
    await assertFails(setDoc(doc(db('carol'), 'usernames/zed'), { uid: 'zed' }));
  });

  it('não permite alterar nome de usuário nem perfil alheio', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'users/carol'), {
        uid: 'carol', username: 'carol', displayName: 'Carol', avatarUrl: null, bio: '', createdAt: new Date(),
      });
    });
    await assertFails(updateDoc(doc(db('carol'), 'users/carol'), { username: 'outro' }));
    await assertFails(updateDoc(doc(db('bob'), 'users/carol'), { displayName: 'hack' }));
    await assertSucceeds(updateDoc(doc(db('carol'), 'users/carol'), { displayName: 'Carol N.', bio: 'oi' }));
  });

  it('exige autenticação para ler perfis', async () => {
    await assertFails(getDoc(doc(db(), 'users/alice')));
  });

  it('protege preferências privadas', async () => {
    await assertSucceeds(setDoc(doc(db('bob'), 'users/bob/private/settings'), { theme: 'dark' }));
    await assertFails(getDoc(doc(db('alice'), 'users/bob/private/settings')));
  });

  it('amizade sem solicitação é negada; bloqueio só em nome próprio', async () => {
    await assertFails(setDoc(doc(db('eve'), 'users/eve/friends/bob'), { uid: 'bob', since: serverTimestamp(), conversationId: 'dm_bob_eve' }));
    await assertFails(setDoc(doc(db('eve'), 'users/bob/friends/eve'), { uid: 'eve', since: serverTimestamp(), conversationId: 'dm_bob_eve' }));
    await assertSucceeds(setDoc(doc(db('bob'), 'users/bob/blocks/eve'), { uid: 'eve', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db('eve'), 'users/bob/blocks/alice'), { uid: 'alice', createdAt: serverTimestamp() }));
  });
});

describe('solicitações de amizade', () => {
  it('apenas remetente e destinatário leem', async () => {
    await assertSucceeds(getDoc(doc(db('bob'), 'friendRequests/eve_bob')));
    await assertSucceeds(getDoc(doc(db('eve'), 'friendRequests/eve_bob')));
    await assertFails(getDoc(doc(db('alice'), 'friendRequests/eve_bob')));
  });

  it('consultas devem ser restritas ao próprio usuário', async () => {
    await assertSucceeds(getDocs(query(collection(db('bob'), 'friendRequests'), where('to', '==', 'bob'))));
    await assertFails(getDocs(collection(db('bob'), 'friendRequests')));
  });

  it('só podem ser criadas em nome próprio e com formato válido', async () => {
    await assertFails(setDoc(doc(db('eve'), 'friendRequests/alice_bob'), { from: 'alice', to: 'bob', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db('eve'), 'friendRequests/eve_alice'), { from: 'eve', to: 'alice' }));
    await assertFails(setDoc(doc(db('eve'), 'friendRequests/eve_bob'), { from: 'eve', to: 'bob', createdAt: serverTimestamp() })); // já existe
  });
});

describe('conversas privadas', () => {
  it('apenas membros leem a conversa e as mensagens', async () => {
    await assertSucceeds(getDoc(doc(db('bob'), 'conversations/dm_alice_bob')));
    await assertFails(getDoc(doc(db('eve'), 'conversations/dm_alice_bob')));
    await assertFails(getDoc(doc(db('eve'), 'conversations/dm_alice_bob/messages/d1')));
  });

  it('membro envia mensagem válida', async () => {
    await assertSucceeds(setDoc(doc(db('bob'), 'conversations/dm_alice_bob/messages/n1'), newMessage('bob')));
  });

  it('rejeita autor falso, texto longo, data do cliente e mensagem vazia', async () => {
    const d = db('bob');
    await assertFails(setDoc(doc(d, 'conversations/dm_alice_bob/messages/x1'), newMessage('alice')));
    await assertFails(setDoc(doc(d, 'conversations/dm_alice_bob/messages/x2'), newMessage('bob', 'a'.repeat(4001))));
    await assertFails(setDoc(doc(d, 'conversations/dm_alice_bob/messages/x3'), { ...newMessage('bob'), createdAt: new Date(0) }));
    await assertFails(setDoc(doc(d, 'conversations/dm_alice_bob/messages/x4'), newMessage('bob', '')));
    await assertFails(setDoc(doc(d, 'conversations/dm_alice_bob/messages/x5'), { ...newMessage('bob'), pinned: true }));
    await assertFails(setDoc(doc(d, 'conversations/dm_alice_bob/messages/x6'), { ...newMessage('bob'), extra: 1 }));
  });

  it('conversa bloqueada não aceita novas mensagens', async () => {
    await assertFails(setDoc(doc(db('eve'), 'conversations/dm_alice_eve/messages/z1'), newMessage('eve')));
    await assertFails(setDoc(doc(db('alice'), 'conversations/dm_alice_eve/messages/z2'), newMessage('alice')));
  });

  it('somente o autor edita e apaga', async () => {
    await assertFails(updateDoc(doc(db('bob'), 'conversations/dm_alice_bob/messages/d1'), { text: 'x', editedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db('alice'), 'conversations/dm_alice_bob/messages/d1'), { text: 'editado', editedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('alice'), 'conversations/dm_alice_bob/messages/d1'), { authorId: 'bob' }));
    await assertFails(deleteDoc(doc(db('bob'), 'conversations/dm_alice_bob/messages/d1')));
    await assertSucceeds(deleteDoc(doc(db('alice'), 'conversations/dm_alice_bob/messages/d1')));
  });

  it('membro atualiza apenas o resumo da última mensagem', async () => {
    await assertSucceeds(updateDoc(doc(db('bob'), 'conversations/dm_alice_bob'), { lastMessageAt: serverTimestamp(), lastMessagePreview: 'oi', lastMessageAuthorId: 'bob' }));
    await assertFails(updateDoc(doc(db('bob'), 'conversations/dm_alice_bob'), { lastMessageAt: serverTimestamp(), lastMessagePreview: 'oi', lastMessageAuthorId: 'alice' }));
    await assertFails(updateDoc(doc(db('bob'), 'conversations/dm_alice_bob'), { memberIds: ['bob', 'eve'] }));
    await assertFails(updateDoc(doc(db('bob'), 'conversations/dm_alice_bob'), { locked: false }));
  });
});

describe('reações', () => {
  const path = 'conversations/dm_alice_bob/messages/d1';

  it('usuário adiciona e remove a própria reação', async () => {
    const d = db('bob');
    await assertSucceeds(updateDoc(doc(d, path), new FieldPath('reactions', '🔥', 'bob'), true, 'lastReaction', { uid: 'bob', emoji: '🔥' }));
    await assertSucceeds(updateDoc(doc(d, path), new FieldPath('reactions', '🔥', 'bob'), deleteField(), 'lastReaction', { uid: 'bob', emoji: '🔥' }));
  });

  it('não altera a reação de outra pessoa', async () => {
    const d = db('bob');
    await assertFails(updateDoc(doc(d, path), new FieldPath('reactions', '🔥', 'alice'), true, 'lastReaction', { uid: 'bob', emoji: '🔥' }));
    await assertFails(updateDoc(doc(d, path), new FieldPath('reactions', '🔥', 'bob'), true, 'lastReaction', { uid: 'alice', emoji: '🔥' }));
    await assertFails(updateDoc(doc(d, path), new FieldPath('reactions', '👍', 'bob'), true, 'lastReaction', { uid: 'bob', emoji: '🔥' }));
  });

  it('não altera outros campos junto com a reação', async () => {
    await assertFails(updateDoc(doc(db('bob'), path), new FieldPath('reactions', '🔥', 'bob'), true, 'lastReaction', { uid: 'bob', emoji: '🔥' }, 'text', 'hack'));
  });
});

describe('comunidades e canais', () => {
  it('não membros não leem nada da comunidade', async () => {
    await assertFails(getDoc(doc(db('eve'), 'communities/c1')));
    await assertFails(getDocs(collection(db('eve'), 'communities/c1/channels')));
    await assertFails(getDocs(collection(db('eve'), 'communities/c1/channels/geral/messages')));
  });

  it('membros leem canais e mensagens visíveis', async () => {
    await assertSucceeds(getDocs(collection(db('bob'), 'communities/c1/channels')));
    await assertSucceeds(getDocs(collection(db('bob'), 'communities/c1/channels/geral/messages')));
  });

  it('canal restrito exige papel mínimo de visualização', async () => {
    await assertFails(getDocs(collection(db('bob'), 'communities/c1/channels/staff/messages')));
    await assertSucceeds(getDocs(collection(db('mod'), 'communities/c1/channels/staff/messages')));
    await assertFails(setDoc(doc(db('bob'), 'communities/c1/channels/staff/messages/s1'), newMessage('bob')));
  });

  it('canal somente leitura bloqueia envio de membros', async () => {
    await assertFails(setDoc(doc(db('bob'), 'communities/c1/channels/avisos/messages/a1'), newMessage('bob')));
    await assertSucceeds(setDoc(doc(db('alice'), 'communities/c1/channels/avisos/messages/a2'), newMessage('alice')));
  });

  it('membro envia mensagem em canal aberto; não membro não', async () => {
    await assertSucceeds(setDoc(doc(db('bob'), 'communities/c1/channels/geral/messages/g1'), newMessage('bob')));
    await assertFails(setDoc(doc(db('eve'), 'communities/c1/channels/geral/messages/g2'), newMessage('eve')));
  });

  it('só admin+ cria canais; ninguém se promove ou entra sem convite', async () => {
    const ch = { name: 'novo', type: 'text', categoryId: null, topic: '', position: 9, access };
    await assertSucceeds(setDoc(doc(db('alice'), 'communities/c1/channels/novo'), ch));
    await assertFails(setDoc(doc(db('bob'), 'communities/c1/channels/outro'), ch));
    await assertFails(setDoc(doc(db('alice'), 'communities/c1/channels/ruim'), { ...ch, type: 'video' }));
    await assertFails(updateDoc(doc(db('bob'), 'communities/c1/members/bob'), { role: 'owner' }));
    await assertFails(updateDoc(doc(db('mod'), 'communities/c1/members/bob'), { role: 'moderator' }));
    await assertFails(setDoc(doc(db('eve'), 'communities/c1/members/eve'), { uid: 'eve', role: 'member', joinedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db('eve'), 'communities/c1/members/eve'), { uid: 'eve', role: 'owner', joinedAt: serverTimestamp() }));
  });

  it('moderador apaga e fixa mensagens de outros; membro não', async () => {
    const m1 = 'communities/c1/channels/geral/messages/m1';
    await assertFails(updateDoc(doc(db('alice'), m1), { text: 'edit alheia', editedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db('mod'), m1), { pinned: true }));
    await assertSucceeds(setDoc(doc(db('alice'), 'communities/c1/channels/geral/messages/m2'), newMessage('alice')));
    await assertFails(updateDoc(doc(db('bob'), 'communities/c1/channels/geral/messages/m2'), { pinned: true }));
    await assertFails(deleteDoc(doc(db('bob'), 'communities/c1/channels/geral/messages/m2')));
    await assertSucceeds(deleteDoc(doc(db('mod'), m1)));
  });
});

describe('convites', () => {
  it('permite pré-visualizar por código, mas não listar nem escrever', async () => {
    await assertSucceeds(getDoc(doc(db('eve'), 'invites/abcdefghjk')));
    await assertFails(getDocs(collection(db('eve'), 'invites')));
    await assertFails(updateDoc(doc(db('eve'), 'invites/abcdefghjk'), { uses: 0 }));
    await assertFails(getDoc(doc(db(), 'invites/abcdefghjk')));
  });
});
