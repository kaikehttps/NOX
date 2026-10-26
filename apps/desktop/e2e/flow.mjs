// Fluxo E2E do NOX desktop: dirige o app Electron real contra o Firebase Emulator Suite + API local.
// Pré-requisitos (ver README → Testes): npm run emulators, npm run dev:api, apps/desktop/.env com
// VITE_USE_EMULATORS=true e `npm run build -w @nox/desktop`. Executar: npm run e2e -w @nox/desktop
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const APP = path.join(ROOT, 'apps/desktop');
const SHOTS = process.env.SHOTS_DIR || path.join(import.meta.dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const req = createRequire(path.join(ROOT, 'package.json'));
const { initializeApp } = req('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = req('firebase/auth');
const fsdk = req('firebase/firestore');

const step = (m) => console.log(`\n▸ ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Segundo usuário ("ana") controlado pelo SDK cliente — passa pelas regras de segurança.
const fbApp = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-nox', authDomain: 'demo-nox.firebaseapp.com' }, 'ana');
const anaAuth = getAuth(fbApp);
connectAuthEmulator(anaAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
const anaDb = fsdk.getFirestore(fbApp);
fsdk.connectFirestoreEmulator(anaDb, '127.0.0.1', 8080);

async function api(user, method, p, body) {
  const res = await fetch(`http://127.0.0.1:8787/v1${p}`, {
    method,
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${p}: ${JSON.stringify(json)}`);
  return json;
}

const run = Date.now().toString(36).slice(-5);
const ME = { email: `tester.${run}@nox.test`, password: 'senha-forte-123', username: `tester.${run}`, name: 'Kaike Teste' };
const ANA = { email: `ana.${run}@nox.test`, password: 'senha-forte-123', username: `ana.${run}`, name: 'Ana' };

const app = await electron.launch({
  executablePath: req('electron'),
  args: [APP],
  env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')),
  timeout: 30_000,
});
app.process().stdout?.on('data', (d) => process.stdout.write(`[main] ${d}`));
app.process().stderr?.on('data', (d) => process.stdout.write(`[main:err] ${d}`));
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.setViewportSize?.({ width: 1320, height: 800 }).catch(() => {});

const shot = async (name) => {
  await sleep(350);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  console.log(`  📸 ${name}.png`);
};

try {
  step('estado limpo');
  await page.evaluate(async () => {
    localStorage.clear();
    for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name);
  });
  await page.reload();

  step('tela de entrada (primeira abertura)');
  await page.getByText('Entrar no NOX').waitFor({ timeout: 15_000 });
  await shot('01-entrada');
  await page.getByText('Entrar no NOX').click();

  step('autenticação: criar conta por e-mail');
  await page.getByText('Continuar com Google').waitFor();
  await shot('02-login');
  await page.getByText('criar conta').click();
  await page.locator('input[type=email]').fill(ME.email);
  await page.locator('input[type=password]').fill(ME.password);
  await page.locator('form button[type=submit]').click();

  step('onboarding');
  const uname = page.locator('input[placeholder="seu.nome"]');
  await uname.waitFor({ timeout: 15_000 });
  await uname.fill(ME.username);
  await page.locator('input[placeholder="Como você aparece nas conversas"]').fill(ME.name);
  await page.getByText('disponível').waitFor({ timeout: 10_000 });
  await shot('03-onboarding');
  await page.getByRole('button', { name: 'Concluir' }).click();

  step('início');
  await page.getByText('Bem-vindo de volta').waitFor({ timeout: 15_000 });
  await shot('04-inicio-vazio');

  step('segundo usuário (ana) cria conta e envia solicitação pela API');
  const anaCred = await createUserWithEmailAndPassword(anaAuth, ANA.email, ANA.password);
  const anaUid = anaCred.user.uid;
  const batch = fsdk.writeBatch(anaDb);
  batch.set(fsdk.doc(anaDb, 'users', anaUid), { uid: anaUid, username: ANA.username, displayName: ANA.name, avatarUrl: null, bio: 'testando o NOX', createdAt: fsdk.serverTimestamp() });
  batch.set(fsdk.doc(anaDb, 'usernames', ANA.username), { uid: anaUid });
  await batch.commit();
  await api(anaCred.user, 'POST', '/friends/requests', { username: ME.username });

  step('solicitação aparece em tempo real e é aceita pela interface');
  await page.getByText('Solicitações').first().click();
  await page.getByText('quer ser seu amigo').waitFor({ timeout: 10_000 });
  await shot('05-solicitacao');
  await page.locator('button[title="Aceitar"]').click();
  await page.getByText('Nenhuma solicitação pendente.').waitFor({ timeout: 15_000 });

  step('ana fica online (presença) e manda DM pelo SDK cliente');
  const { getDatabase, connectDatabaseEmulator, ref, set, serverTimestamp } = req('firebase/database');
  const anaRtdb = getDatabase(fbApp, 'https://demo-nox-default-rtdb.firebaseio.com');
  connectDatabaseEmulator(anaRtdb, '127.0.0.1', 9000);
  await set(ref(anaRtdb, `status/${anaUid}`), { state: 'online', lastChanged: serverTimestamp() });

  await page.locator('.sidebar .nav-item', { hasText: 'Amigos' }).click();
  await page.locator('.friend-row', { hasText: ANA.name }).waitFor({ timeout: 10_000 });
  await shot('06-amigos-online');

  const convs = await fsdk.getDocs(fsdk.query(fsdk.collection(anaDb, 'conversations'), fsdk.where('memberIds', 'array-contains', anaUid)));
  const convId = convs.docs[0].id;
  const mb = fsdk.writeBatch(anaDb);
  mb.set(fsdk.doc(fsdk.collection(anaDb, 'conversations', convId, 'messages')), {
    authorId: anaUid, text: 'oi! entrou no NOX? bora testar a call hoje às 21h 🎮', createdAt: fsdk.serverTimestamp(), editedAt: null, replyTo: null, mentions: [], attachments: [], reactions: {}, pinned: false,
  });
  mb.update(fsdk.doc(anaDb, 'conversations', convId), { lastMessageAt: fsdk.serverTimestamp(), lastMessagePreview: 'oi! entrou no NOX?', lastMessageAuthorId: anaUid });
  await mb.commit();

  step('DM chega em tempo real; responder pela interface');
  await page.locator('.sidebar .nav-item', { hasText: ANA.name }).first().click();
  await page.getByText('bora testar a call').waitFor({ timeout: 10_000 });
  const composer = page.locator('.composer textarea');
  await composer.fill('fechado! vou criar o espaço da galera agora');
  await composer.press('Enter');
  await page.getByText('vou criar o espaço da galera').waitFor({ timeout: 10_000 });
  // Reação pela interface (menu de contexto → reação rápida)
  await page.getByText('bora testar a call').click({ button: 'right' });
  await page.locator('.menu-reactions button').nth(3).click();
  await page.locator('.reaction.mine').waitFor({ timeout: 10_000 });
  await shot('07-dm');

  step('criar comunidade');
  await page.locator('button[aria-label="Criar ou entrar em uma comunidade"]').click();
  await page.locator('input[placeholder="Base Noturna"]').fill('Base Noturna');
  await page.getByRole('button', { name: 'Criar espaço' }).click();
  await page.locator('.main-head .name', { hasText: 'geral' }).waitFor({ timeout: 15_000 });

  step('mensagem no canal com menção');
  const ch = page.locator('.composer textarea');
  await ch.fill('primeira mensagem do espaço. sejam bem-vindos ❯ https://nox.app');
  await ch.press('Enter');
  await page.getByText('primeira mensagem do espaço').waitFor({ timeout: 10_000 });
  await shot('08-canal');

  step('convite: gerar e ana entra pela API');
  await page.locator('.sidebar .panel-head').click();
  await page.getByText('Convidar pessoas').click();
  await page.getByRole('button', { name: 'Gerar convite' }).click();
  await page.locator('.terminal-lines', { hasText: 'nox://invite/' }).waitFor({ timeout: 10_000 });
  const code = (await page.locator('.terminal-lines', { hasText: 'nox://invite/' }).innerText()).match(/invite\/([a-z0-9]+)/)[1];
  await shot('09-convite');
  await page.keyboard.press('Escape');
  const joined = await api(anaCred.user, 'POST', `/invites/${code}/redeem`);
  console.log('  ana entrou em', joined.communityId);
  await page.locator('.side-panel .member-row', { hasText: ANA.name }).waitFor({ timeout: 10_000 });

  step('criar canal pela interface');
  await page.locator('.sidebar .panel-head').click();
  await page.getByText('Criar canal').click();
  await page.locator('input[placeholder="geral"]').fill('jogos hoje');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await page.locator('.sidebar .nav-item', { hasText: 'jogos-hoje' }).waitFor({ timeout: 10_000 });
  await shot('10-canal-criado');

  step('canal de voz (sem LiveKit configurado → erro claro, sem travar)');
  await page.locator('.sidebar .nav-item', { hasText: 'lounge' }).click();
  await page.getByRole('button', { name: 'Entrar na sala' }).click();
  await page.locator('.voice-dock').waitFor({ timeout: 10_000 });
  await sleep(1500);
  await shot('11-voz-sem-servidor');

  step('configurações');
  await page.locator('button[title="Configurações"]').click();
  await page.getByText('voz e áudio').click();
  await shot('12-config-voz');
  await page.keyboard.press('Escape');
} catch (err) {
  console.error('\n✕ FALHOU:', err.message);
  await shot('zz-falha').catch(() => {});
  process.exitCode = 1;
} finally {
  console.log('\nerros no renderer:', errors.length ? errors : 'nenhum');
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  process.exit(process.exitCode ?? 0);
}
