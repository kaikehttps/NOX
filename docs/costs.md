# Estimativa de custos

> Preços consultados em **26/10/2026** nas páginas oficiais ([LiveKit](https://livekit.com/pricing), [Firebase](https://firebase.google.com/pricing)). Valores marcados com **(verificar)** não puderam ser confirmados na página no momento e vêm de referência anterior — confirme na [calculadora do Google Cloud](https://cloud.google.com/products/calculator) antes de decidir. Nenhum serviço é ilimitado ou permanentemente gratuito: cotas gratuitas mudam e só valem dentro de limites.

## Preços usados

**LiveKit Cloud**

| Plano | Mensal | Minutos WebRTC incluídos | Excedente | Tráfego de saída incluído | Excedente | Conexões simultâneas |
|---|---|---|---|---|---|---|
| Build | US$ 0 | 5.000 | não listado (trate como teto) | 50 GB | não listado | 100 |
| Ship | a partir de US$ 50 | 150.000 | US$ 0,0005/min | 250 GB | US$ 0,12/GB | 1.000 |
| Scale | a partir de US$ 500 | 1,5 milhão | US$ 0,0004/min | 3 TB | US$ 0,10/GB | 5.000 |

"Minuto WebRTC" = minuto de cada participante conectado. 4 pessoas por 1 h = 240 minutos.

**Firebase (cotas sem custo no Blaze)**: Firestore 50 mil leituras/dia, 20 mil escritas/dia, 20 mil exclusões/dia, 1 GiB armazenado, 10 GiB/mês de saída · RTDB 1 GB armazenado, 10 GB/mês baixados, depois US$ 5/GB armazenado e US$ 1/GB baixado · Auth 50 mil usuários ativos/mês · FCM sem custo · Storage: 5 GB e 100 GB/mês de download **apenas em us-central1/us-west1/us-east1**.

**Cloud Run (verificar)**: cota mensal de 180 mil vCPU-s, 360 mil GiB-s e 2 milhões de requisições; `southamerica-east1` é região de preço mais alto (Tier 2).

## Como a voz consome tráfego

- Opus até 64 kbps por quem fala; com DTX, silêncio quase não gera tráfego. Média usada: **48 kbps por fluxo recebido**.
- Cada participante recebe o áudio dos outros: tráfego de saída da sala ≈ `N × (N−1) × 48 kbps`.
- 4 pessoas → 576 kbps → **~0,26 GB por hora de sala**. 6 pessoas → 1,44 Mbps → ~0,65 GB/h.
- Compartilhamento de tela 1080p ≈ 2–3 Mbps por espectador → 5 espectadores ≈ **5,6 GB/h**. Vídeo é o que pesa; voz é barata.

## Cenários

### A — grupo de amigos (lançamento)
8 contas · voz 2 h/dia com 4 pessoas em média · 300 mensagens/dia · sem tela compartilhada.

| Item | Cálculo | Custo/mês |
|---|---|---|
| LiveKit minutos | 4 × 120 min × 30 = **14.400** (estoura o Build) | Ship: US$ 50 |
| LiveKit tráfego | 0,26 GB/h × 60 h = 16 GB | incluído |
| Firestore | ~600 escritas/dia (mensagem + resumo da DM); ~2 mil leituras/usuário/dia → ~16 mil/dia | dentro da cota |
| RTDB (presença) | escritas só em mudança de estado; KB por dia | dentro da cota |
| Cloud Run | algumas centenas de requisições/dia | dentro da cota |
| **Total** | | **≈ US$ 50/mês** |

Com uso esporádico (até ~5.000 minutos/mês, ex.: 4 pessoas por ~20 h no mês), o plano **Build** cobre a voz e o total fica perto de **US$ 0**, mas ao atingir o limite as chamadas param até o mês virar.

### B — grupo ativo
20 contas · voz 5 h/dia com 6 pessoas · 1 h/dia de tela 1080p para 5 espectadores · 2.000 mensagens/dia · 2 GB de anexos novos/mês (Fase 2).

| Item | Cálculo | Custo/mês |
|---|---|---|
| LiveKit minutos | 6 × 300 × 30 = 54.000 | Ship: US$ 50 |
| LiveKit tráfego | voz 0,65 GB/h × 150 h = 97 GB + tela 5,6 GB/h × 30 h = 169 GB → 266 GB | +16 GB × US$ 0,12 ≈ US$ 2 |
| Firestore | ~4 mil escritas e ~45–60 mil leituras/dia | perto da cota; excedente de centavos **(verificar tarifa por 100 mil leituras em São Paulo)** |
| Storage | 2 GB/mês acumulando, downloads moderados | cotas gratuitas se o bucket estiver em us-east1; poucos dólares em São Paulo |
| **Total** | | **≈ US$ 52–60/mês** |

### C — crescimento
200 contas · 40 pessoas em voz simultâneas em média 8 h/dia (8 salas de 5) · tela 2 h/dia em 3 salas.

| Item | Cálculo | Custo/mês |
|---|---|---|
| LiveKit minutos | 40 × 480 × 30 = 576.000 | Ship: 50 + 426 mil × 0,0005 = **US$ 263** · ou Scale: US$ 500 |
| LiveKit tráfego | voz 0,43 GB/h × 8 salas × 240 h ≈ 830 GB + tela 3 salas × 4 espectadores × 2,5 Mbps ≈ 13,5 GB/h × 60 h ≈ 810 GB → ~1,64 TB | Ship: ~1,39 TB excedente × 0,12 ≈ US$ 167 · Scale: incluído (3 TB) |
| Firestore | centenas de milhares de leituras/dia | dezenas de dólares **(verificar)** |
| **Total** | | **≈ US$ 450 (Ship) a US$ 520 (Scale)/mês** — ponto em que vale comparar Scale com um SFU próprio |

## Alavancas de custo já no código

- Listeners só existem enquanto a tela está aberta; perfis/presença compartilham um listener por usuário (`KeyedSubscriptionStore`).
- Histórico paginado (50 por vez); nunca o histórico inteiro.
- Presença no RTDB com `onDisconnect`, sem heartbeat.
- Entrar mudo não abre o microfone; DTX reduz tráfego em silêncio; `dynacast`/`adaptiveStream` para vídeo.
- Limites operacionais em `packages/shared/src/limits.ts` (tamanho de upload, rajada de mensagens, convites ativos, canais por comunidade).

## Quando considerar infraestrutura própria de mídia

Um LiveKit Server próprio (open source) numa VM com bom tráfego de saída começa a compensar quando a conta do LiveKit Cloud passar de algumas centenas de dólares/mês **e** houver alguém para operar (TURN, atualizações, monitoramento, escala). O código do app não muda: só `LIVEKIT_URL` e as chaves.
