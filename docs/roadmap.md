# Roadmap e status real

Legenda: ✅ funciona e foi verificado · 🟡 implementado, verificado só em parte · ⏳ pendente

**Como foi verificado nesta entrega**: testes automatizados (unitários, regras de segurança no Emulator Suite, integração da API contra emuladores), typecheck de todos os workspaces, build do desktop, bundle Android/iOS do mobile (`expo export`) e um **fluxo E2E dirigindo o app Electron real** contra emuladores + API local (`apps/desktop/e2e/flow.mjs`). O mobile **não** foi executado em aparelho/emulador. Voz **não** foi testada com mídia real (sem servidor LiveKit nesta sessão).

## Fase 1 — Fundação

| Item | Status | Observação |
|---|---|---|
| Monorepo, TypeScript, tokens de design | ✅ | |
| Logomarca (símbolo, wordmark, lockups, mono, ícones) | ✅ | `npm run brand` gera SVG/PNG/ICO |
| Identidade visual desktop | ✅ | revisada por capturas do app real |
| Identidade visual mobile | 🟡 | só verificada por typecheck/bundle |
| Tela de entrada + login e-mail/senha + recuperação | ✅ desktop · 🟡 mobile | |
| Login Google | 🟡 | desktop: OAuth loopback+PKCE implementado, **não testado sem credenciais reais**; mobile: Google Sign-In nativo, não testado |
| Onboarding (nome de usuário único + nome) | ✅ | reserva atômica validada pelas regras |
| Perfil (editar nome/bio), status de presença | ✅ desktop | avatar personalizado ⏳ (depende de anexos) |
| Comunidades, categorias, canais, permissões por papel | ✅ | API + regras testadas; UI desktop verificada |
| Exclusão de conta | ✅ API (teste) · 🟡 UI | |

## Fase 2 — Amigos e mensagens

| Item | Status | Observação |
|---|---|---|
| Solicitações (enviar, aceitar, recusar, cancelar), remover, bloquear/desbloquear | ✅ | API testada; aceite em tempo real verificado no E2E |
| DMs e grupos | ✅ DM · 🟡 grupo | grupo testado na API; UI de criação de grupo só desktop |
| Presença (online/ausente/ocupado/invisível) | ✅ | ACL restrita a amigos ⏳ |
| Mensagens em tempo real, editar, apagar, responder, fixar, reações, menções, links seguros | ✅ | |
| Histórico paginado, pendente/falhou com reenvio sem duplicar | ✅ | falha de rede real não simulada no E2E |
| Emojis (seletor compacto, recentes, busca pt-BR) | 🟡 | conjunto curado de ~110; seletor Unicode completo e favoritos ⏳ |
| Não lidas + notificações nativas + badge (DMs) | 🟡 desktop | não lidas de canais e sincronização entre dispositivos ⏳ |
| Indicador "digitando" | ⏳ | requer ACL no RTDB |
| Anexos (imagens, vídeos, documentos, áudio) com progresso/cancelamento | ⏳ | regras do Storage prontas e testadas; UI e metadados pendentes |
| Pesquisa de mensagens | ⏳ | Firestore não tem busca textual: índice externo (Typesense/Algolia) ou busca local nas páginas carregadas |
| Pré-visualização de links | ⏳ | precisa de busca no servidor (evita vazar IP e SSRF) |
| Push (FCM) | ⏳ | Cloud Function em `functions/` |

## Fase 3 — Voz (prioridade)

| Item | Status | Observação |
|---|---|---|
| Tokens LiveKit por sala com verificação de permissão | ✅ | testes de integração |
| Webhook → quem está em cada sala | ✅ | assinatura verificada em teste |
| Sessão de voz: entrar/sair, mudo, ensurdecer, volume individual, PTT, troca de dispositivo, processamento (eco/ruído/ganho), reconexão com backoff, liberação de recursos | 🟡 | máquina de estados testada com sala simulada; **mídia real não testada** |
| Painel de chamada persistente, palco com destaque de quem fala, medidores | 🟡 | renderização verificada no estado de falha; estado conectado não exercitado |
| Teste de microfone | 🟡 | implementado com Web Audio; não exercitado no E2E |
| Atalhos globais (Ctrl+Shift+M/D) | 🟡 | |
| Sensibilidade de detecção de voz, PTT global, estatísticas de qualidade na UI | ⏳ | |
| Android foreground service para chamada em segundo plano | ⏳ | iOS background audio configurado |
| Testes reais de latência/perda em redes diferentes | ⏳ | roteiro em docs/deployment.md |

## Fase 4 — Tela e gravação · Fase 5 — Avançados · Fase 6 — Lançamento

Não iniciadas: compartilhamento de tela (desktopCapturer + `setDisplayMediaRequestHandler`), gravação 1080p/60 (MediaRecorder → remux MP4/H.264 com verificação de FPS real), vídeo, GIFs (proxy no servidor), figurinhas, emojis personalizados, papéis de parede, publicidade, auto-update, App Check.

Já preparado para elas: permissões `display-capture` e `media` no Electron, `canPublishSources` com tela e áudio de tela no token, campos `attachments` nas mensagens, regras do Storage, tokens de tema/destaque/densidade/movimento reduzido.

## Pendências técnicas conhecidas

- Limitador de taxa da API é por instância (memória).
- Metadados de canais restritos são visíveis a todos os membros (conteúdo não).
- Presença legível por qualquer usuário autenticado que conheça o `uid`.
- Mobile: perfil carregado de cache offline já não manda ao onboarding (corrigido em `subscribeProfile`), mas o restante do comportamento offline não foi testado em aparelho.
- Lista de mensagens usa `content-visibility` + paginação; virtualização completa se canais muito ativos exigirem.
