# Implantação e infraestrutura

## Ambientes

| Ambiente | Firebase | Cloud Run | LiveKit | Uso |
|---|---|---|---|---|
| local | Emulator Suite (`demo-nox`) | `npm run dev:api` | Cloud (projeto dev) ou `livekit-server --dev` | desenvolvimento e testes |
| dev | `nox-dev-…` | `nox-api` (dev) | projeto LiveKit dev | integração contínua |
| staging | `nox-staging-…` | `nox-api` (staging) | projeto LiveKit staging | testes reais com o grupo |
| prod | `nox-prod-…` | `nox-api` (prod) | projeto LiveKit prod | usuários |

Um projeto Firebase/GCP por ambiente isola dados, cotas, regras e faturamento. Copie `.firebaserc.example` para `.firebaserc` e use `firebase use dev|staging|prod`.

## Escolha de regiões (decida antes de criar — não é simples mudar depois)

| Recurso | Região sugerida | Observação |
|---|---|---|
| Cloud Firestore | `southamerica-east1` (São Paulo) | Menor latência para o Brasil. A localização é permanente. |
| Cloud Run | `southamerica-east1` | Junto do Firestore: as transações da API ficam rápidas. |
| Realtime Database | `us-central1` | O RTDB não oferece São Paulo; presença tolera a latência extra. |
| Storage | avaliar | As **cotas gratuitas** do Storage só valem em `us-central1`, `us-west1` e `us-east1` (página de preços do Firebase). Um bucket em São Paulo é mais rápido, mas pago desde o primeiro byte. Para um grupo pequeno, `us-east1` costuma ser o equilíbrio. |
| LiveKit Cloud | automática | O LiveKit Cloud roteia para a borda mais próxima; não presuma uma região específica. Meça latência real do Brasil (ver "Testes de qualidade"). Fixação de região é recurso de planos superiores. |

## 1. Firebase

1. Crie o projeto e ative o plano **Blaze** (Firestore em São Paulo, Cloud Run, Secret Manager e RTDB fora da cota exigem faturamento).
2. Registre um **app Web** → copie a configuração para `apps/desktop/.env` (`VITE_FIREBASE_*`) e `apps/mobile/.env` (`EXPO_PUBLIC_FIREBASE_*`).
3. Crie o Firestore (Native mode, `southamerica-east1`), o Realtime Database e o bucket do Storage.
4. Publique regras e índices:
   ```bash
   firebase use dev
   firebase deploy --only firestore:rules,firestore:indexes,storage,database
   ```
5. Authentication → métodos de login → ative **E-mail/senha** e **Google**. Em *Configurações → Domínios autorizados* não é preciso adicionar nada para o desktop (o login é via loopback).

## 2. Login com Google

**Desktop** (OAuth para apps instalados):
1. Google Cloud Console (mesmo projeto) → *APIs e serviços → Credenciais → Criar ID do cliente OAuth → App para computador*.
2. Coloque o ID e o secret em `MAIN_VITE_GOOGLE_DESKTOP_CLIENT_ID` / `MAIN_VITE_GOOGLE_DESKTOP_CLIENT_SECRET`. O Google documenta que o secret de clientes desktop não é confidencial; a proteção vem do PKCE e do loopback.
3. No Firebase Auth → Google → *Lista de permissões de IDs de cliente de projetos externos*, adicione o ID do cliente desktop (garante que o Firebase aceite o `id_token` com esse público).
4. Configure a tela de consentimento OAuth (nome NOX, logo, e-mail de suporte, política de privacidade).

**Mobile** (`@react-native-google-signin/google-signin`):
1. `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` = cliente **Web** criado automaticamente pelo Firebase (é ele que gera o `idToken` aceito).
2. Android: registre um app Android no Firebase com o pacote (`app.nox.mobile`) e as impressões **SHA-1/SHA-256** do keystore de debug e de release.
3. iOS: crie o cliente iOS, defina `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` e `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` (ID invertido).
4. Gere um novo development build após mudar plugins/IDs (`npx expo prebuild --clean`).

## 3. LiveKit {#livekit}

1. Crie um projeto em [cloud.livekit.io](https://cloud.livekit.io) por ambiente.
2. *Settings → Keys*: gere uma API key/secret. O **secret só vai para o Secret Manager**.
3. *Settings → Webhooks*: URL `https://<url-do-nox-api>/v1/livekit/webhook`, assinada com a mesma API key. Isso mantém `voiceStates` (quem está em cada sala).
4. Defina limites e alertas de uso no painel do LiveKit.

Voz local sem nuvem: o servidor oficial tem binários para Windows/macOS/Linux ([releases](https://github.com/livekit/livekit/releases)). `livekit-server --dev` sobe em `ws://127.0.0.1:7880` com a chave de desenvolvimento documentada pelo LiveKit; use esses valores em `services/api/.env`. Webhooks locais exigem configurar `webhook.urls` no YAML do servidor.

## 4a. Alternativa gratuita: nox-api no Render (sem Blaze)

Para ficar no plano Spark do Firebase, hospede o `nox-api` fora do Google. O arquivo [render.yaml](../render.yaml) descreve o serviço (Docker, plano gratuito). O serviço gratuito "dorme" após ~15 min sem uso; a primeira ação seguinte leva cerca de 30–60 s.

1. Suba o repositório para o GitHub (privado serve).
2. Firebase Console → Configurações do projeto → **Contas de serviço** → *Gerar nova chave privada*. É um segredo administrativo: guarde só em variável de ambiente do servidor, nunca no repositório nem nos apps.
3. Render → New → **Blueprint** → escolha o repositório. Preencha:
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: o conteúdo do JSON da chave (ou em base64).
   - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: do projeto LiveKit (plano Build é gratuito).
4. Copie a URL do serviço (`https://nox-api-xxxx.onrender.com`) para `VITE_API_BASE_URL` em `apps/desktop/.env.production` e gere de novo o instalador/site.
5. LiveKit → Webhooks: `https://<url>/v1/livekit/webhook`.

Mesmo código, outra credencial: no Cloud Run ele usa a identidade do serviço; fora do Google, usa `FIREBASE_SERVICE_ACCOUNT_JSON`.

## 4. Cloud Run

Conta de serviço dedicada com o mínimo necessário:

```bash
PROJECT=nox-dev-xxxxx
gcloud iam service-accounts create nox-api --project $PROJECT
for role in roles/datastore.user roles/firebaseauth.admin roles/storage.objectAdmin roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:nox-api@$PROJECT.iam.gserviceaccount.com" --role=$role
done
```

Segredos (Secret Manager):

```bash
printf 'wss://seu-projeto.livekit.cloud' | gcloud secrets create livekit-url --data-file=- --project $PROJECT
printf 'APIxxxx'                           | gcloud secrets create livekit-api-key --data-file=- --project $PROJECT
printf 'segredo'                           | gcloud secrets create livekit-api-secret --data-file=- --project $PROJECT
```

Artifact Registry + build/deploy:

```bash
gcloud artifacts repositories create nox --repository-format=docker --location=southamerica-east1 --project $PROJECT
gcloud builds submit --project $PROJECT --config services/api/cloudbuild.yaml --substitutions=_ENV=dev
```

Depois, aponte `VITE_API_BASE_URL` / `EXPO_PUBLIC_API_BASE_URL` para a URL do serviço (ou um domínio próprio mapeado). `--allow-unauthenticated` é intencional: a autenticação é feita pela API com ID tokens do Firebase em cada rota (e o webhook verifica a assinatura do LiveKit).

Ajustes recomendados: `min-instances=1` em produção se o cold start incomodar na primeira chamada do dia (custo fixo pequeno); logs estruturados já saem em JSON (`severity`) para o Cloud Logging; crie um alerta de taxa de erro 5xx no Cloud Monitoring.

## 4b. Versão web (Firebase Hosting)

A mesma interface do desktop é publicada como site estático no Firebase Hosting.

1. Preencha `apps/desktop/.env` com a configuração **real** do projeto (`VITE_FIREBASE_*`, `VITE_API_BASE_URL` apontando para o Cloud Run, `VITE_USE_EMULATORS=false`). Esses valores são embutidos no build.
2. `firebase use dev` (ou staging/prod) e então:
   ```bash
   npm run deploy:web      # build + firebase deploy --only hosting
   ```
   O site sai em `https://<projeto>.web.app`. Prévia sem afetar produção: `firebase hosting:channel:deploy teste`.
3. Firebase Auth → Configurações → **Domínios autorizados**: o `*.web.app` / `*.firebaseapp.com` do projeto já vem autorizado; adicione seu domínio próprio se mapear um.
4. Login Google na web usa o popup do Firebase (provedor Google ativado, sem client ID extra).
5. A API precisa aceitar o site: o CORS dela já é aberto (usa só tokens Bearer).
6. Microfone no navegador exige HTTPS (o Hosting já entrega).

Limitações da versão web: sem notificações do sistema, atalhos globais, detecção de ausência nem gravação de tela nativa; layout pensado para tela grande.

## 5. Orçamento e monitoramento

- **Cloud Billing → Orçamentos e alertas**: um orçamento por projeto com alertas em 50/90/100%. Alertas avisam, não cortam: para corte automático, conecte o orçamento a um tópico Pub/Sub com uma função que desativa o faturamento (avalie o risco antes).
- **Firestore → Uso**: acompanhe leituras/escritas diárias; listeners abertos são a principal fonte de leituras.
- **LiveKit**: limites de minutos e alertas no painel.
- **Crashlytics/Sentry** (pendente): registro de erros dos clientes. Hoje a API registra erros 500 em JSON.

## 6. Emulator Suite em CI

```bash
npm ci
npm run typecheck
npm test
npm run test:rules
npm run test:api
```

Os testes de regras e API sobem e derrubam os emuladores sozinhos (`firebase emulators:exec`), exigindo apenas Java e firebase-tools no runner.

## 7. Testes de qualidade de voz (antes de abrir para o grupo)

Não marque voz como pronta sem isto:
1. Duas a cinco pessoas em redes diferentes (fibra, 4G, Wi-Fi fraco), desktop e mobile.
2. Use o painel de *Sessions* do LiveKit Cloud para ver RTT, jitter, perda de pacotes e reconexões por participante.
3. Teste queda de rede (desligar Wi-Fi 10 s): a sessão deve mostrar "reconectando" e voltar sozinha.
4. Teste troca de microfone/fone durante a chamada e o ensurdecer.
5. Registre os resultados em `docs/roadmap.md`.
