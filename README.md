# NOX

**Seu grupo. Sua frequência.** · *YOUR PEOPLE. YOUR FREQUENCY.*

NOX é um terminal social privado: mensagens, comunidades e chamadas de voz para um grupo de amigos, com identidade própria (preto, grafite, verde-limão contido e tipografia técnica). Este repositório contém o app desktop (Electron), o app mobile (Expo/React Native), o backend (Cloud Run) e a configuração do Firebase.

> Estado atual: **primeira entrega (Fases 1–2 parciais + base da Fase 3)**. Veja [docs/roadmap.md](docs/roadmap.md) para o que funciona, o que foi testado e o que está pendente.

---

## Sumário

- [Tecnologias](#tecnologias)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Requisitos](#requisitos)
- [Rodar localmente (emuladores)](#rodar-localmente-emuladores)
- [Testes](#testes)
- [Configurar serviços reais](#configurar-serviços-reais)
- [Builds](#builds)
- [Documentação](#documentação)

## Tecnologias

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript 6 em todo o monorepo | Tipos compartilhados entre clientes, API e testes. TS 7 (nativo) ainda não é suportado pelo ecossistema Vite/Expo. |
| Monorepo | npm workspaces | Já vem com o Node; Expo SDK 58 entende workspaces npm sem configuração. Pacotes internos são consumidos como código-fonte TS (sem etapa de build). |
| Desktop | Electron 45 + electron-vite + React 19 | Janela nativa, captura de tela/áudio do sistema (Fase 4), mesmo motor WebRTC do Chromium. |
| Mobile | Expo SDK 58 (development builds) + Expo Router + React Native 0.88 | Componentes nativos; módulos nativos de WebRTC exigem development build (não roda no Expo Go). |
| Dados | Cloud Firestore | Mensagens e dados estruturados em tempo real, cache offline, regras de segurança declarativas. |
| Presença | Firebase Realtime Database | `onDisconnect` marca offline no servidor quando a conexão cai: sem heartbeats nem gravações periódicas no Firestore. |
| Arquivos | Firebase Storage | Regras entre serviços verificam participação no Firestore. |
| Auth | Firebase Authentication | Google (fluxos oficiais por plataforma) + e-mail/senha. |
| Mídia | LiveKit Cloud (WebRTC SFU) | Voz/vídeo/tela gerenciados; o app nunca transporta mídia pelo Firestore. |
| Backend | Cloud Run (Hono + Admin SDK) | Operações privilegiadas e multi-documento, tokens LiveKit, webhooks. Um serviço, sem microserviços. |
| Validação | zod | Mesmos esquemas na API e nos formulários. |

## Estrutura do repositório

```
apps/
  desktop/            Electron: main (segurança, OAuth Google, bandeja, atalhos) · preload · renderer React
  mobile/             Expo Router: telas, provedores, chat, voz
packages/
  shared/             Tipos de domínio, permissões, IDs, limites operacionais, textos de marca
  validation/         Esquemas zod (API + formulários)
  design-system/      Tokens (cores, tipografia, espaço, movimento), geometria da logomarca, SVGs
  firebase/           Cliente compartilhado: inicialização, repositórios, presença, cliente da API, hooks React
  realtime/           Sessão de voz sobre LiveKit (máquina de estados, reconexão, dispositivos, PTT)
services/
  api/                Backend Cloud Run (Hono) + Dockerfile + testes de integração
firebase/             Regras (Firestore, Storage, RTDB), índices e testes de regras
scripts/              Geração dos recursos de marca (SVG → PNG/ICO)
docs/                 Arquitetura, implantação, custos, privacidade, distribuição, roadmap
```

`functions/` (Cloud Functions orientadas a eventos) ainda não existe de propósito: hoje nenhuma responsabilidade precisa de gatilho de evento. Ela entra na Fase 2 para notificações push (FCM) — ver [docs/architecture.md](docs/architecture.md#por-que-cloud-run-e-não-só-functions).

## Requisitos

- **Node.js ≥ 22** (testado com 24) e npm ≥ 10
- **Java 21+** (Firebase Emulator Suite)
- **firebase-tools** (`npm i -g firebase-tools`)
- Mobile: Android Studio (SDK + emulador) e/ou Xcode (macOS) para development builds
- Windows: recomendado manter o projeto **fora do OneDrive** e num caminho só com ASCII (ex.: `C:\dev\nox`). O OneDrive sincroniza `node_modules` (lento, travas de arquivo) e caminhos com acentos são uma fonte conhecida de falhas no Gradle/CMake do Android.

```bash
npm install
```

O npm 11 bloqueia scripts de instalação por padrão. O `package.json` raiz já aprova os necessários (`electron`, `esbuild`, `electron-winstaller`). Se o binário do Electron não existir após o install: `node node_modules/electron/install.js`.

## Rodar localmente (emuladores)

Nenhuma credencial é necessária para desenvolver: tudo roda no Firebase Emulator Suite com o projeto `demo-nox`.

```bash
# Terminal 1 — Firebase (Auth, Firestore, RTDB, Storage) + UI em http://127.0.0.1:4000
npm run emulators

# Terminal 2 — API (Cloud Run local) em http://127.0.0.1:8787
cp services/api/.env.example services/api/.env
npm run dev:api

# Terminal 3 — Desktop
cp apps/desktop/.env.example apps/desktop/.env   # deixe VITE_USE_EMULATORS=true
npm run dev:desktop
```

Contas criadas no emulador são locais. Login Google exige configuração real (abaixo); no emulador use e-mail e senha.

Voz: sem `LIVEKIT_*` na API, entrar em uma sala mostra "Servidor de voz não configurado". Para testar voz localmente, use um projeto LiveKit Cloud gratuito (plano Build) ou o servidor LiveKit em modo `--dev` (ver [docs/deployment.md](docs/deployment.md#livekit)).

> **Terminal do VS Code**: ele define `ELECTRON_RUN_AS_NODE=1`. O `electron-vite dev` remove a variável sozinho, mas se você executar o binário do Electron diretamente, remova-a antes (`set ELECTRON_RUN_AS_NODE=` no cmd).

### Mobile

```bash
cp apps/mobile/.env.example apps/mobile/.env     # EXPO_PUBLIC_USE_EMULATORS=true, host 10.0.2.2 no emulador Android
cd apps/mobile
npx expo run:android      # gera o development build e instala no emulador/aparelho
npx expo start --dev-client
```

Para aparelhos físicos acessarem os emuladores, troque `"host": "127.0.0.1"` por `"0.0.0.0"` em [firebase.json](firebase.json) e use o IP da máquina em `EXPO_PUBLIC_EMULATOR_HOST` / `EXPO_PUBLIC_API_BASE_URL`.

## Testes

| Comando | O que cobre | Requer |
|---|---|---|
| `npm test` | Unitários: permissões, IDs, texto/links, limitador, store de assinaturas, **máquina de estados da voz** (entrar, trocar de sala, sair liberando recursos, mudo/ensurdecer, PTT, reconexão com backoff, quedas definitivas) | — |
| `npm run test:rules` | Regras de segurança do Firestore, Storage e RTDB (33 casos) | Java (sobe os emuladores sozinho) |
| `npm run test:api` | API contra Auth + Firestore emulados (18 casos): amizades, bloqueios, grupos, comunidades, convites, papéis, tokens LiveKit, webhook assinado, exclusão de conta | Java |
| `npm run typecheck` | Todos os workspaces (desktop, mobile, pacotes, API) | — |
| `npm run e2e -w @nox/desktop` | Dirige o **app Electron real** (cadastro → onboarding → amizade em tempo real → DM → reação → comunidade → convite → canal → falha de voz tratada) e salva capturas em `apps/desktop/e2e/shots/` | emuladores + API rodando, `.env` do desktop com emuladores, `npm run build -w @nox/desktop` |

## Configurar serviços reais

Passo a passo completo em [docs/deployment.md](docs/deployment.md). Resumo do que você precisa fornecer:

| Serviço | O que criar | Onde vai |
|---|---|---|
| Firebase | Projetos `nox-dev` / `nox-staging` / `nox-prod` no plano **Blaze**; app Web; Firestore (`southamerica-east1`), RTDB, Storage | `.firebaserc` (a partir de `.firebaserc.example`), `VITE_FIREBASE_*`, `EXPO_PUBLIC_FIREBASE_*` |
| Google Login | Provedor Google ativado no Firebase Auth; OAuth client **Desktop** (desktop), **Web** + **Android** (SHA-1) + **iOS** (mobile) | `MAIN_VITE_GOOGLE_DESKTOP_CLIENT_*`, `EXPO_PUBLIC_GOOGLE_*` |
| LiveKit Cloud | Projeto + API key/secret; webhook apontando para `https://<api>/v1/livekit/webhook` | `LIVEKIT_URL` (apps via API), `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` (Secret Manager) |
| Cloud Run | Serviço `nox-api` em `southamerica-east1` com a conta de serviço padrão + papel Firebase Admin | `VITE_API_BASE_URL`, `EXPO_PUBLIC_API_BASE_URL` |
| Orçamento | Alertas de orçamento no Cloud Billing e limites no LiveKit | Console |

Publicidade (Fase 6) ainda não está integrada; a política e a arquitetura planejadas estão em [docs/architecture.md](docs/architecture.md#publicidade).

## Builds

```bash
npm run brand                 # regenera SVG/PNG/ICO da marca a partir de packages/design-system/src/logo.ts
npm run build:desktop         # out/ (main CJS, preload CJS, renderer minificado)
npm run dist:desktop          # instalador NSIS em apps/desktop/release/<versão>/
cd apps/mobile && npx expo run:android --variant release   # ou EAS Build (docs/distribution.md)
docker build -f services/api/Dockerfile -t nox-api .       # imagem do backend
```

## Documentação

- [docs/architecture.md](docs/architecture.md) — arquitetura, modelo de dados, permissões, segurança, decisões
- [docs/deployment.md](docs/deployment.md) — ambientes, Firebase, Google, LiveKit, Cloud Run, segredos, alertas
- [docs/costs.md](docs/costs.md) — estimativas por cenário
- [docs/privacy.md](docs/privacy.md) — dados coletados, retenção, exclusão de conta
- [docs/distribution.md](docs/distribution.md) — instaladores, atualizações, lojas
- [docs/roadmap.md](docs/roadmap.md) — status real de cada funcionalidade e próximas fases
- [packages/design-system/assets/](packages/design-system/assets/) — logomarca (símbolo, wordmark, lockups, versões monocromáticas)
