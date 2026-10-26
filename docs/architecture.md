# Arquitetura do NOX

## Visão geral

```
 ┌──────────────┐   ┌──────────────┐
 │ Desktop      │   │ Mobile       │      clientes: UI, cache, escritas diretas permitidas pelas regras
 │ Electron     │   │ Expo / RN    │
 └──┬───┬───┬───┘   └──┬───┬───┬───┘
    │   │   │          │   │   │
    │   │   └──────────┼───┼───┼─────────────► LiveKit Cloud (WebRTC SFU) — áudio, vídeo, tela
    │   │              │   │   │                       │ webhooks assinados
    │   └──────────────┼───┼───┴──► Cloud Run: nox-api ◄┘
    │                  │   │          • tokens LiveKit (por sala, por usuário)
    │                  │   │          • amizades, bloqueios, grupos, comunidades, canais, convites, papéis
    │                  │   │          • exclusão de conta
    ▼                  ▼   ▼                │ Admin SDK
 Firebase: Auth · Firestore (mensagens, dados) · RTDB (presença) · Storage (arquivos)
```

### Dois modos de operação

- **Modo direto (padrão, plano Spark, sem servidor)**: quando `apiBaseUrl` está vazia, o cliente usa `DirectApi` (`packages/firebase/src/direct.ts`) e grava amizades, bloqueios, grupos, comunidades, canais, convites e papéis direto no Firestore em lotes/transações. **As regras são a barreira de segurança** de cada operação (amizade só com pedido pendente do outro lado; convite resgatado só com +1 no uso no mesmo lote; papéis só abaixo do próprio; etc.) e têm testes de abuso em `firebase/tests/direct.test.ts`. Limitações: grupos com até 10 pessoas; contadores (comunidades por dono, convites ativos) não são impostos; voz indisponível.
- **Modo servidor**: com `apiBaseUrl` configurada, as mesmas operações vão para o `nox-api` (Admin SDK), que adiciona limites de taxa e contagens. É obrigatório para **voz** (o segredo do LiveKit fica no servidor).

As telas usam a mesma interface (`NoxApi`) nos dois modos.

Princípio original do modo servidor: **o cliente escreve diretamente só o que as regras conseguem validar sozinhas** (próprio perfil, preferências, mensagens, reações, fixações). Tudo que envolve vários documentos, terceiros ou contadores (aceitar amizade cria 2 amizades + 1 DM; resgatar convite incrementa usos atomicamente; bloquear trava a DM e apaga solicitações) passa pela API em transações do Admin SDK.

A mesma tabela de permissões (`packages/shared/src/permissions.ts`) é usada pela API, pela interface (esconder ações indisponíveis) e espelhada nas regras do Firestore/Storage (`rank()`). A interface nunca é a barreira de segurança.

## Pacotes

| Pacote | Responsabilidade | Usado por |
|---|---|---|
| `@nox/shared` | Tipos de domínio, `ROLE_RANK`/`can()`/`canOnChannel()`, IDs determinísticos (DM, salas de voz), `LIMITS`, tokenização segura de texto, textos de marca | todos |
| `@nox/validation` | Esquemas zod de entrada | API, formulários |
| `@nox/design-system` | Tokens e geometria da marca (paths SVG como dados) | desktop (CSS vars), mobile (StyleSheet/react-native-svg), script de marca |
| `@nox/firebase` | Inicialização com adaptadores por plataforma, repositórios, presença, cliente HTTP da API, hooks React | desktop, mobile |
| `@nox/realtime` | `VoiceSession`: estado da chamada sobre `livekit-client`, independente de framework; `web.ts` com reprodução de áudio e teste de microfone | desktop, mobile |

Componentes visuais **não** são compartilhados entre desktop e mobile de propósito: as duas plataformas compartilham tokens, lógica e dados, mas cada uma tem a organização de tela adequada.

## Modelo de dados (Firestore)

```
users/{uid}                         perfil público: username, displayName, avatarUrl, bio, createdAt
  private/settings                  preferências (tema, destaque, densidade, privacidade) — só o dono
  friends/{friendUid}               { since, conversationId }            — escrito pela API
  blocks/{blockedUid}               { createdAt }                        — escrito pela API
  memberships/{communityId}         índice reverso { role, joinedAt }    — escrito pela API
usernames/{username}                { uid } — reserva única, criada no mesmo batch do perfil
friendRequests/{from_to}            { from, to, createdAt }              — escrito pela API
conversations/{id}                  dm_{a}_{b} (determinístico) ou id aleatório (grupo)
                                    { type, memberIds[], name, ownerId, locked, lastMessageAt,
                                      lastMessagePreview, lastMessageAuthorId }
  messages/{id}                     mensagem (formato abaixo)
  voiceStates/{uid}                 quem está na chamada — webhook LiveKit
communities/{cid}                   { name, description, iconUrl, ownerId, createdAt }
  members/{uid}                     { role: owner|admin|moderator|member, joinedAt }
  categories/{id}                   { name, position }
  channels/{id}                     { name, type: text|voice, categoryId, topic, position,
                                      access: { view, send, attach, connect } = papel mínimo }
    messages/{id}
  voiceStates/{uid}                 { channelId, joinedAt } — webhook LiveKit
invites/{code}                      { communityId, communityName, createdBy, expiresAt, maxUses, uses, revoked }
```

Mensagem:

```ts
{ authorId, text, createdAt /* serverTimestamp */, editedAt, replyTo: { id, authorId, preview } | null,
  mentions: uid[], attachments: Attachment[], reactions: { [emoji]: { [uid]: true } }, pinned,
  lastReaction?: { uid, emoji } }
```

- **Menções** são guardadas como `<@uid>` no texto e renderizadas com o nome atual (sobrevivem a trocas de nome).
- **Reações** em mapa `emoji → uid → true`: cada usuário altera só a própria entrada; `lastReaction` informa às regras qual emoji mudou para que elas validem isso sem laços.
- **IDs de mensagem gerados no cliente**: reenviar após falha usa o mesmo ID, logo nunca duplica. A interface distingue *pendente* (`hasPendingWrites`) de *confirmada* e mostra *falhou* com reenviar/descartar.
- **Paginação**: uma janela ao vivo com as 50 mais recentes + páginas estáticas mais antigas sob demanda (`startAfter`). O histórico inteiro nunca é carregado.

Índices compostos: [firebase/firestore.indexes.json](../firebase/firestore.indexes.json).

### Presença (Realtime Database)

`status/{uid} = { state: online|idle|dnd|offline, lastChanged }`. Ao conectar, o cliente registra `onDisconnect().set(offline)` **antes** de se anunciar online; o servidor do RTDB aplica o offline quando a conexão cai. Escritas só acontecem em mudanças de estado (não há heartbeat). "Invisível" publica `offline`. Ociosidade: desktop usa `powerMonitor` (5 min ou tela bloqueada); mobile usa `AppState`.

**Limitação conhecida**: o estado de presença é legível por qualquer usuário autenticado que conheça o `uid` (o RTDB não consulta o Firestore para checar amizade). Para restringir a amigos, a API passará a espelhar uma ACL em `presenceAcl/{uid}/{viewer}` — anotado no roadmap.

## Permissões

Hierarquia: `owner (3) > admin (2) > moderator (1) > member (0)`.

| Ação | Papel mínimo |
|---|---|
| editar comunidade | admin |
| apagar comunidade | owner |
| criar/revogar convites | moderator |
| remover membro | moderator, e só quem está **abaixo** |
| atribuir papel | admin, só abaixo de si e nunca `owner` |
| gerenciar canais/categorias | admin |
| apagar/fixar mensagens de outros | moderator |

Cada canal define o papel mínimo para `view`, `send`, `attach`, `connect`. Qualquer operação exige também `view`. Os **metadados** dos canais (nome) são visíveis a todos os membros; o **conteúdo** (mensagens, anexos, conexão de voz) respeita `access`. Ocultar até os nomes exigiria consultas filtradas por papel, que as regras do Firestore não conseguem provar seguras com o modelo atual.

## Segurança

- **Regras desde o início** ([firebase/](../firebase/)): negação por padrão; validação de formato, tamanho, autoria e `createdAt == request.time`; testes automatizados de casos negativos (autor falso, campos extras, canal restrito, conversa bloqueada, reação alheia, upload de executável…).
- **Storage**: arquivos privados nunca são públicos; leitura exige participação verificada no Firestore; tipos de conteúdo permitidos explicitamente; limites de tamanho.
- **API**: ID token do Firebase verificado em toda rota; webhook LiveKit verificado pela assinatura JWT + hash do corpo; limite de corpo (64 KB); limitador por usuário em memória (primeira barreira; ver nota em `rate-limit.ts`).
- **Tokens LiveKit**: identidade = `uid`, sala única autorizada, TTL de 1 h (o LiveKit renova sessões conectadas), sem `roomAdmin`, fontes de publicação explícitas.
- **Electron**: `contextIsolation`, `sandbox`, sem `nodeIntegration`, preload mínimo e tipado; IPC aceito só do frame do próprio app; navegação e `window.open` bloqueados (links externos vão para o navegador do sistema, só http/https/mailto); `<webview>` bloqueado; permissões do Chromium limitadas a mídia, notificações, clipboard e captura de tela; CSP sem scripts inline em produção.
- **Login Google no desktop**: OAuth 2.0 para apps instalados (RFC 8252) — navegador do sistema, loopback em porta aleatória, PKCE S256 e `state`. Nada de popup embutido nem senha digitada no app.
- **Segredos**: nenhum segredo nos clientes. A configuração do Firebase nos apps é pública por design.
- **Bloqueio**: aplicado no servidor — remove amizade e solicitações, trava a DM (regras rejeitam novas mensagens e a API nega tokens de chamada), impede novas solicitações sem revelar o bloqueio.

Pendentes de segurança (roadmap): Firebase App Check nos clientes e na API; limitador distribuído; varredura de malware em uploads; ACL de presença.

## Voz

`VoiceSession` (pacote `@nox/realtime`) é uma instância única por app; a chamada sobrevive à navegação e só termina com `leave()`, que desconecta, remove listeners, desanexa elementos de áudio e libera o microfone.

- Opus 64 kbps, **DTX** (economia em silêncio) e **RED** (redundância contra perda de pacotes); `adaptiveStream` + `dynacast` para vídeo.
- Entrar mudo **não** abre o microfone; ele só é capturado quando for transmitir.
- Ensurdecer silencia todos (inclusive quem entra depois) e o próprio microfone, restaurando o estado anterior ao voltar.
- Volume individual por participante (0–100%).
- Push-to-talk com a janela em foco (tecla configurável); atalhos globais Ctrl+Shift+M/D no desktop.
- Reconexão: o SDK faz *resume*/ICE restart; se a sessão cair mesmo assim, a sessão reentra com token novo com backoff (1, 2, 4, 8, 15 s). Quedas definitivas (outro dispositivo, removido, sala encerrada) não reentram.
- Processamento WebRTC nativo (cancelamento de eco, redução de ruído, ganho automático) configurável e aplicado com `restartTrack` durante a chamada; troca de microfone/saída durante a chamada.
- `voiceStates` no Firestore (via webhook) mostra quem está em cada sala sem polling.

Pendentes: sensibilidade de detecção de voz (gate) via processador de áudio, PTT global (requer hook de teclado nativo), estatísticas de RTT/perda na interface, foreground service no Android.

## Por que Cloud Run e não só Functions

O backend síncrono (tokens, convites, amizades) é um único serviço HTTP com cold start controlável (`min-instances`), mesmo código testável localmente contra emuladores e um Dockerfile. Cloud Functions entram apenas para **gatilhos de eventos** (ex.: `onCreate` de mensagem → notificação FCM), sem duplicar responsabilidades da API.

## Publicidade

Planejada para a Fase 6, atrás de uma interface `AdProvider` por plataforma (`AdMob` no mobile; provedor próprio/curado no desktop, já que o AdMob não suporta Electron). Regras de produto já decididas: nunca durante chamadas, nunca sobre tela compartilhada ou controles de áudio, nunca invisível/em segundo plano, nunca sem identificação, sem intersticiais indiscriminados, descarregar quando a área estiver inativa, consentimento (UMP/GDPR/LGPD) antes de qualquer carregamento, e o app funciona normalmente sem anúncio disponível.
