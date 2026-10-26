import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { ref as sref, uploadBytes, getBytes, type FirebaseStorage } from 'firebase/storage';
import { ref as dref, set, get, serverTimestamp, type Database } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const access = { view: 'member', send: 'member', attach: 'member', connect: 'member' };

const storage = (uid?: string) =>
  (uid ? env.authenticatedContext(uid).storage() : env.unauthenticatedContext().storage()) as unknown as FirebaseStorage;
const rtdb = (uid?: string) =>
  (uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database()) as unknown as Database;

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nox',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync(resolve(__dirname, '../storage.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
    database: { rules: readFileSync(resolve(__dirname, '../database.rules.json'), 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(a, 'communities/c1/members/bob'), { uid: 'bob', role: 'member' });
    await setDoc(doc(a, 'communities/c1/channels/geral'), { name: 'geral', type: 'text', access });
    await setDoc(doc(a, 'communities/c1/channels/fotos-staff'), { name: 'fotos-staff', type: 'text', access: { ...access, attach: 'moderator' } });
    await setDoc(doc(a, 'conversations/dm_alice_bob'), { type: 'dm', memberIds: ['alice', 'bob'], locked: false });
  });
});

describe('storage', () => {
  it('avatar: só o dono escreve, só imagens', async () => {
    await assertSucceeds(uploadBytes(sref(storage('bob'), 'avatars/bob/a.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(sref(storage('eve'), 'avatars/bob/a.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(sref(storage('bob'), 'avatars/bob/a.html'), png, { contentType: 'text/html' }));
  });

  it('anexo de DM: só membros enviam e leem', async () => {
    const path = 'attachments/conversations/dm_alice_bob/bob/f1/foto.png';
    await assertSucceeds(uploadBytes(sref(storage('bob'), path), png, { contentType: 'image/png' }));
    await assertSucceeds(getBytes(sref(storage('alice'), path)));
    await assertFails(getBytes(sref(storage('eve'), path)));
    await assertFails(getBytes(sref(storage(), path)));
    await assertFails(uploadBytes(sref(storage('eve'), 'attachments/conversations/dm_alice_bob/eve/f2/x.png'), png, { contentType: 'image/png' }));
  });

  it('anexo de canal respeita permissão de anexar e bloqueia tipos executáveis', async () => {
    await assertSucceeds(uploadBytes(sref(storage('bob'), 'attachments/channels/c1/geral/bob/f1/a.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(sref(storage('bob'), 'attachments/channels/c1/fotos-staff/bob/f1/a.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(sref(storage('bob'), 'attachments/channels/c1/geral/bob/f2/a.exe'), png, { contentType: 'application/x-msdownload' }));
    await assertFails(uploadBytes(sref(storage('bob'), 'attachments/channels/c1/geral/alice/f3/a.png'), png, { contentType: 'image/png' }));
  });
});

describe('presença (realtime database)', () => {
  it('usuário define apenas o próprio estado, com carimbo do servidor', async () => {
    await assertSucceeds(set(dref(rtdb('bob'), 'status/bob'), { state: 'online', lastChanged: serverTimestamp() }));
    await assertFails(set(dref(rtdb('eve'), 'status/bob'), { state: 'offline', lastChanged: serverTimestamp() }));
    await assertFails(set(dref(rtdb('bob'), 'status/bob'), { state: 'online', lastChanged: 123 }));
    await assertFails(set(dref(rtdb('bob'), 'status/bob'), { state: 'hacker', lastChanged: serverTimestamp() }));
    await assertFails(set(dref(rtdb('bob'), 'status/bob'), { state: 'online', lastChanged: serverTimestamp(), extra: 1 }));
  });

  it('leitura exige autenticação', async () => {
    await assertSucceeds(get(dref(rtdb('alice'), 'status/bob')));
    await assertFails(get(dref(rtdb(), 'status/bob')));
  });
});
