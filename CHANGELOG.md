# Changelog — 1NXITER KeyBot

## v4.1.0 — PushinPay como gateway de Pix automático

### Adicionado
- **PushinPay** como segundo gateway de Pix automático
  (`PUSHINPAY_API_TOKEN` no `.env`), com prioridade sobre o Mercado Pago
  quando os dois estão configurados — mais simples de configurar (não
  exige conta empresarial verificada). Nova camada `pixProvider.js`
  escolhe qual gateway usar automaticamente; o resto do bot não precisa
  saber qual dos dois está ativo.

## v4.0.0 — Suporte, Painéis Fixos, Dashboard e Voz

### ⚠️ Breaking changes
- **`/comprar` e `/suporte` agora são comandos de admin** que postam um
  **painel fixo** no canal, em vez de responder efêmero pra quem
  digitar. Os usuários passam a interagir clicando nos botões da
  mensagem fixa, não rodando o comando eles mesmos.

### Adicionado
- **Sistema de ticket de suporte geral**, separado do de compra:
  painel fixo (`/suporte`, admin), dois tipos escolhidos pelo usuário
  (Dúvidas / Suporte Compra), e dentro do ticket um painel só de admin
  com **criar call de voz privada** (o bot entra sozinho nela),
  **adicionar/remover pessoas** da thread, e **marcar quem abriu** o
  ticket. Membros comuns só conseguem usar "Fechar Ticket".
- **`/conectar`** — faz o bot entrar numa call de voz (a do próprio
  usuário ou uma escolhida via opção).
- **Dashboard privado** (site estático, hospedável de graça no
  Vercel): visão geral, vendas, keys, cupons, avaliações e logs — via
  novas rotas `GET /dashboard/*` protegidas por senha (`DASHBOARD_PASSWORD`)
  e CORS restrito por origem.
- **Termos de uso antes da compra**: tela de aceite entre o cupom e a
  criação do ticket; cancelar não consome o cupom.
- **Imagem de agradecimento** configurável, mostrada na DM de entrega
  da key.
- **Pesquisa de satisfação** (estrelas + comentário opcional), enviada
  só por DM quando um ticket de compra concluída fecha; média exibida
  na loja como prova social.
- **Fechamento automático de tickets**: compra fecha 10s após
  confirmar (ou sozinha em 3min sem mensagens); suporte fecha em 15min
  sem mensagens. Ambos postam um transcript `.txt` no canal de log
  antes de apagar o canal.
- **Backup automático do banco** a cada 24h via `VACUUM INTO`, mantendo
  os 7 mais recentes.
- **Aviso de renovação por DM**, 2 dias antes da key vencer.
- **Estatísticas por plano e faturamento** (via Pix automático) no
  `/admin`.
- Botões agora aninham dentro do container (Components V2) em vez de
  aparecer soltos abaixo dele.

## v3.0.0 — SQLite, Components V2, Loja com Tickets

### ⚠️ Breaking changes
- **Banco de dados trocado de JSON pra SQLite** (`node:sqlite`, nativo
  do Node — zero dependência npm, zero compilação). Os dados antigos
  em `data/*.json` **não migram automaticamente**.
- **`/comprar` foi redesenhado do zero**: o fluxo antigo (escolher
  método de pagamento → DM → "Já paguei" → canal de vendas) deixou de
  existir. Agora é: escolher um **plano** (1 dia/7 dias/30 dias/
  lifetime) → cupom opcional → **ticket privado em thread**.
  `salesChannelId` foi removido; `ticketChannelId` faz esse papel agora.
- **Toda a interface migrou pra Discord Components V2** — visual novo
  (containers com markdown em vez de embeds clássicos).

### Adicionado
- **SQLite nativo** (`src/db.js`): todas as 5 stores + a nova de
  cupons viraram tabelas SQL, mesma API pública de antes.
- **Components V2** em todo o bot (`discord/v2.js`), com botões
  aninhados dentro do container (não soltos abaixo).
- **Loja com 4 planos configuráveis** — preço, descrição e imagem
  editáveis via painel (`/admin → Vendas/Pagamentos → 🛍️ Configurar
  Loja`), com dropdown pra escolher qual plano editar.
- **Ticket por compra em thread**: privada quando o servidor tem boost
  nível 2, com fallback automático pra pública quando não tem.
- **Sistema de cupom**: código opcional na compra, com limite de usos
  configurável; desconto aparece no ticket pro admin aplicar na hora
  de cobrar.
- **Pix automático via Mercado Pago** (opcional): com
  `MERCADOPAGO_ACCESS_TOKEN` configurado, o admin gera Pix de verdade
  (QR Code + copia-e-cola) dentro do ticket, e a key é liberada sozinha
  quando o pagamento aprova — sem precisar clicar em nada.
- **Apagar TODAS as keys**, com confirmação por texto (`APAGAR`) além
  do clique, pra evitar acidente.
- **Logs com painel completo**: quem fez, quando (timestamp nativo do
  Discord) e a validade da key envolvida, em todas as ações que geram
  ou renovam key.
- Segredo na API `/validate` (`API_SECRET`), suporte a `process.env.PORT`
  pra hospedagens que injetam a porta, validação de `.env` ao iniciar,
  cooldown de reset com precisão de minutos/segundos, paginação na
  listagem de keys, e confirmação com prévia antes de revogar/limpar.

### Removido
- Fluxo antigo de `/comprar` por método de pagamento (Pix/BTC/Cartão/
  Local como primeira escolha) e o botão "Já paguei".
- Armazenamento em JSON (`utils/jsonFile.js`) — tudo em SQLite agora.

## v2.0.0 — Painel Admin + Monetização

### ⚠️ Breaking changes
- `/config`, `/resetcode` e `/stats` foram removidos como comandos
  separados — toda a administração agora vive dentro de **`/admin`**,
  um painel interativo por botões e formulários.
- `/key` ficou restrito ao uso pessoal: `redeem`, `check`, `resethwid`,
  `trial`. As ações de admin (`generate`, `list`, `revoke`, `extend`,
  `purge`) migraram pro painel.

### Adicionado
- Painel administrativo completo (`/admin`): gerar keys (individual ou
  em lote, até 25), listar, revogar, renovar, gerar/listar/revogar
  códigos de reset, ajustar configurações e ver estatísticas — tudo por
  botões e modais.
- `/key trial` — key de teste gratuita autoatendida, 1 por conta do
  Discord.
- **Monetização de reset de HWID**: cooldown configurável entre resets
  gratuitos, e códigos de reset vendáveis que pulam esse cooldown.
- Renovação de key (`extend`) e limpeza de dados antigos (`purge`).
- README reescrito, mais completo e profissional.

## v1.0.0 — Primeira versão
- Bot com `/key` e `/config` separados, API de validação em `/validate`,
  armazenamento em JSON simples (`keyStore.js`, `settingsStore.js`),
  carregamento automático de comandos, workflow de CI (checagem de
  sintaxe + guarda contra `.env`/`data/keys.json` commitado).

