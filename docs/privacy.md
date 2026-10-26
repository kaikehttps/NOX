# Privacidade e dados

Rascunho técnico para embasar a Política de Privacidade e os Termos de Uso (que precisam de revisão jurídica antes da publicação nas lojas — LGPD).

## O que é coletado

| Dado | Onde | Visível para | Finalidade |
|---|---|---|---|
| E-mail, provedor de login | Firebase Auth | só o próprio usuário | autenticação |
| Nome de usuário, nome de exibição, avatar, bio | `users/{uid}` | usuários autenticados | identificação entre amigos |
| Preferências (tema, privacidade) | `users/{uid}/private/settings` | só o próprio usuário | personalização |
| Amizades, bloqueios, solicitações | `users/{uid}/friends`, `blocks`, `friendRequests` | os envolvidos | grafo social |
| Mensagens e reações | `conversations/…/messages`, `communities/…/messages` | participantes com permissão | comunicação |
| Presença (online/ausente/ocupado/offline + horário) | RTDB `status/{uid}` | usuários autenticados (ver limitação) | disponibilidade |
| Quem está em uma chamada | `voiceStates` | participantes da conversa/comunidade | mostrar a sala |
| Áudio/vídeo das chamadas | **não armazenado** — trafega pelo LiveKit (WebRTC, criptografado em trânsito) | participantes da sala | chamada |

Não há: gravação de chamadas no servidor, analytics de terceiros, rastreamento publicitário (a publicidade da Fase 6 exigirá consentimento explícito e será documentada aqui antes de ativada).

**Criptografia**: TLS/DTLS-SRTP em trânsito; dados em repouso criptografados pelo Google Cloud. **Não há criptografia de ponta a ponta** — o NOX não anuncia E2EE. Se um dia for implementado, terá arquitetura própria (ex.: LiveKit E2EE com troca de chaves verificável) e documentação.

**Gravação de tela (Fase 4)**: local por padrão, nunca enviada automaticamente; indicador visível; gravação de chamadas exigirá aviso aos participantes.

## Permissões do sistema

- Microfone: solicitado ao entrar numa chamada ou no teste de microfone. Mudo = microfone não transmite; entrar mudo nem abre o dispositivo.
- Notificações: nativas do sistema, só para mensagens fora da conversa em foco; suprimidas no status "ocupado".
- Captura de tela (Fase 4) e câmera (Fase 5): só quando o usuário iniciar.

## Exclusão de conta

`DELETE /v1/account` (Configurações → Conta):
1. Bloqueia se o usuário é dono de comunidades com outros membros (transferir ou apagar antes).
2. Apaga comunidades das quais é o único membro (canais, mensagens, convites).
3. Sai das demais comunidades; remove estados de voz.
4. Desfaz amizades (dos dois lados), remove solicitações e **trava** as DMs.
5. Apaga perfil, reserva do nome de usuário, preferências, índices, avatar no Storage e a conta de autenticação.

Mensagens enviadas a outras pessoas permanecem visíveis para elas, exibidas como "conta removida" (o perfil deixa de existir). Pendente: opção de apagar também as próprias mensagens e exportação de dados (direito de portabilidade da LGPD).

## Retenção

- Mensagens: enquanto a conversa/comunidade existir. Pendente: retenção configurável por comunidade.
- Logs da API (Cloud Logging): retenção padrão do projeto (30 dias). Não registram conteúdo de mensagens.
- Presença: apenas o último estado.
