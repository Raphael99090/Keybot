<div align="center">

# 1NXITER KeyBot

**Sistema de licenciamento (key system), loja e suporte via Discord
para o 1NXITER HUB.**
Painéis fixos em Components V2, tickets em thread, Pix automático,
dashboard privado e API de validação — tudo num banco SQLite nativo,
sem dependências externas de compilação.

</div>

---

## Visão geral

O 1NXITER KeyBot resolve cinco problemas do hub:

1. **Distribuição de acesso** — geração, resgate e controle de keys de uso.
2. **Validação em tempo real** — o script Lua consulta uma API HTTP antes
   de liberar o hub, com bloqueio por HWID.
3. **Monetização de suporte** — reset de HWID tem cooldown gratuito
   configurável, com códigos de reset vendáveis para quem quer pular a
   espera.
4. **Vendas** — painel fixo com 4 planos, cupons de desconto, Pix
   automático via Mercado Pago, e um ticket privado (thread) por
   compra pra negociar o pagamento.
5. **Suporte** — painel fixo separado do de vendas, com dois tipos de
   ticket (Dúvidas / Suporte Compra) e ferramentas de atendimento
   (call de voz, adicionar/remover pessoas do ticket).

Toda a administração roda através de um único comando (`/admin`), que
abre um painel por botões e formulários. Toda a interface usa
**Discord Components V2** (containers com texto e botões nativos, não
embeds clássicos).

## Funcionalidades

### Keys
- 🔑 Geração (individual ou em lote, até 25 por vez), resgate vinculado
  à conta do Discord, verificação de status, revogação, renovação e
  expiração automática.
- 🎁 Trial autoatendido — uma key de teste gratuita por conta do Discord.
- 🔒 HWID lock — cada key trava no primeiro dispositivo que a usar.
- ⏳ Cooldown de reset de HWID configurável, com códigos de reset
  vendáveis pra pular a espera.
- ⏰ Aviso automático por DM quando a key de alguém está a 2 dias de
  vencer, com lembrete pra renovar.
- 🧹 Limpeza de keys antigas (com prévia antes de apagar) e opção de
  apagar TODAS as keys (exige digitar uma palavra de confirmação).

### Vendas (`/comprar` — painel fixo, postado por admin)
- 🛒 4 planos (1 dia, 7 dias, 30 dias, lifetime), preço/descrição/imagem
  configuráveis via dropdown no `/admin`.
- 📜 Termos de uso — o comprador precisa aceitar antes do ticket ser
  criado; cupom só é consumido depois do aceite (cancelar não gasta o cupom).
- 🎟️ Cupons de desconto com limite de usos configurável.
- 🎫 Cada compra abre uma **thread** (privada com boost nível 2 no
  servidor, pública como fallback) só entre comprador e administração.
- 💠 Pix automático via **PushinPay ou Mercado Pago** (opcional,
  qualquer um dos dois — PushinPay tem prioridade se ambos estiverem
  configurados) — gera QR Code +
  copia-e-cola no ticket e libera a key sozinha quando aprova.
- 🎁 Imagem de agradecimento configurável, mostrada na DM de entrega da key.
- ⏱️ Ticket fecha automaticamente 10s depois da compra confirmada, ou
  sozinho após 3 minutos sem mensagens se ninguém decidir nada.
- ⭐ Pesquisa de satisfação por DM (estrelas + comentário opcional) ao
  fechar um ticket de compra concluída; média exibida na loja como
  prova social.

### Suporte (`/suporte` — painel fixo, postado por admin)
- 🎫 Separado do fluxo de compra — dois tipos: **Dúvidas** e **Suporte
  Compra**, escolhidos pelo próprio usuário antes de abrir o ticket.
- 📞 Dentro do ticket, a administração tem botões próprios: criar uma
  **call de voz privada** (o bot entra sozinho nela), adicionar ou
  remover pessoas da thread, e marcar/mencionar quem abriu o ticket.
  Membros comuns só veem essas ações recusadas — só conseguem usar
  "Fechar Ticket".
- 🔒 Fecha sozinho após 15 minutos sem mensagens (mais tolerante que o
  de compra, já que suporte tende a ser mais devagar).

### Administração e operação
- 📊 Estatísticas consolidadas: keys por status, vendas por plano,
  faturamento (via Pix automático), avaliações.
- 📄 Transcript em `.txt` postado no canal de log antes de qualquer
  ticket (compra ou suporte) ser apagado.
- 🗒️ Logs com painel: quem fez, quando (timestamp nativo do Discord) e
  a validade da key envolvida, quando aplicável.
- 💾 Backup automático do banco a cada 24h (`VACUUM INTO`, atômico),
  mantendo os 7 mais recentes.
- 🌐 Dashboard privado (site estático, hospedável no Vercel) com visão
  geral, vendas, keys, cupons, avaliações e logs — protegido por senha.
- 📞 `/conectar` — faz o bot entrar numa call de voz específica.
- 🔐 API `/validate` protegida por segredo opcional, com rate limiting
  básico; validação de `.env` ao iniciar.

## Arquitetura

```
src/
├── index.js                    # entrada: bot + API + backup automático
├── config.js                   # leitura do .env
├── db.js                       # conexão SQLite única (node:sqlite) + schema
├── backup.js                    # backup automático do banco
├── store/                      # camada de dados, tudo em cima do SQLite
│   ├── keyStore.js              # CRUD de keys, cooldown, extend, purge
│   ├── settingsStore.js         # configurações ajustáveis pelo painel
│   ├── resetCodeStore.js        # códigos de reset vendáveis
│   ├── trialStore.js            # controle de 1 trial por conta
│   ├── orderStore.js            # pedidos/tickets de compra
│   ├── couponStore.js           # cupons de desconto
│   ├── reviewStore.js           # avaliações de satisfação
│   └── supportStore.js          # tickets de suporte geral
├── discord/
│   ├── client.js                 # cliente + roteador de interações
│   ├── deployCommands.js          # registro dos slash commands
│   ├── v2.js                       # helper de Components V2 (Container/TextDisplay)
│   ├── adminPanel.js                # painel admin: telas, botões, modais
│   ├── storePanel.js                 # loja, tickets de compra (threads), cupons
│   ├── supportPanel.js                # painel de suporte, tickets, funções de admin
│   ├── surveyPanel.js                  # pesquisa de satisfação (só DM)
│   ├── transcript.js                    # gera o transcript antes de fechar ticket
│   ├── ticketSweeper.js                  # fecha tickets inativos (compra/suporte)
│   ├── renewalReminder.js                 # avisa vencimento próximo por DM
│   ├── logNotifier.js                      # painel de log (quem/quando) no canal
│   └── commands/
│       ├── key.js                      # /key redeem|check|resethwid|trial
│       ├── comprar.js                   # /comprar — posta o painel fixo da loja
│       ├── suporte.js                    # /suporte — posta o painel fixo de suporte
│       ├── conectar.js                    # /conectar — entra numa call de voz
│       ├── admin.js                        # /admin — abre o painel
│       └── help.js                          # /help
├── payments/
│   └── mercadoPago.js              # wrapper da SDK do Mercado Pago (Pix)
├── api/
│   ├── server.js                  # servidor Express + rate limit + segredos
│   └── routes/
│       ├── validate.js             # GET /validate?key=&hwid=&secret=
│       └── dashboard.js             # GET /dashboard/* (protegido por senha)
└── utils/
    ├── logger.js                    # console + arquivo (data/bot.log)
    ├── permissions.js                 # quem é admin
    ├── validator.js                    # valida .env ao iniciar
    └── format.js                         # formatação de data/duração
data/                            # gerado em runtime, não versionado (bot.db, backups/, bot.log)
```

Comandos são carregados automaticamente a partir de `src/discord/commands/`
— para adicionar um novo, basta criar o arquivo no formato `{ data, execute }`.

## Comandos

| Comando | Acesso | Descrição |
|---|---|---|
| `/comprar` | admin | Posta o painel fixo da loja no canal — qualquer um clica num plano pra comprar |
| `/suporte` | admin | Posta o painel fixo de suporte no canal — qualquer um abre um ticket (Dúvidas/Suporte Compra) |
| `/conectar` | admin | Faz o bot entrar numa call de voz (a atual do usuário, ou uma escolhida) |
| `/key redeem <key>` | todos | Vincula uma key à própria conta do Discord |
| `/key check <key>` | todos | Consulta o status de uma key |
| `/key trial` | todos | Resgata uma key de teste gratuita (1 por conta) |
| `/key resethwid <key> [codigo]` | dono da key | Reseta o HWID (respeita cooldown, salvo com código de reset) |
| `/admin` | admin | Abre o painel administrativo completo |
| `/help` | todos | Lista os comandos disponíveis |

Os painéis de `/comprar` e `/suporte` são mensagens fixas — poste uma
vez em cada canal desejado; os botões continuam funcionando pra
sempre (não precisa repostar, a menos que a mensagem seja apagada).

### Quem é "admin"?

Qualquer membro com a permissão **Administrator** no servidor, ou com o
cargo definido em `ADMIN_ROLE_ID` no `.env`.

## Instalação

### Pré-requisitos
- **Node.js 22.5 ou superior** (usa `node:sqlite`, nativo do Node —
  sem instalar nenhum pacote de banco de dados, sem compilar binário
  nenhum)
- Uma aplicação de bot criada em [discord.com/developers/applications](https://discord.com/developers/applications)
- Permissões do bot no servidor: **Gerenciar Threads**, **Criar Threads
  Públicas/Privadas**, **Gerenciar Canais** (pra criar a call de voz
  do suporte) e **Conectar/Falar** (pra `/conectar` e pra ele entrar
  sozinho na call que cria)

### Passo a passo

```bash
git clone <url-do-seu-repo>
cd keybot
npm install
cp .env.example .env
```

Preencha o `.env`:

| Variável | Descrição |
|---|---|
| `DISCORD_TOKEN` | Token do bot (Developer Portal → Bot) |
| `CLIENT_ID` | Application ID (Developer Portal → General Information) |
| `GUILD_ID` | ID do servidor onde os comandos serão registrados (recomendado — sem isso, o registro global demora até 1h para propagar) |
| `ADMIN_ROLE_ID` | ID do cargo com acesso ao painel admin (recomendado — também é quem consegue ver os tickets privados) |
| `API_PORT` | Porta da API HTTP local (padrão `3000`). Em hospedagens que injetam a porta via `PORT` (Railway, etc.), essa variável tem prioridade. |
| `API_SECRET` | Segredo exigido pra chamar `/validate` (recomendado em produção) |
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token de produção do Mercado Pago (opcional) |
| `PUSHINPAY_API_TOKEN` | Token da API do PushinPay (opcional — tem prioridade sobre o Mercado Pago se os dois estiverem preenchidos). Sem nenhum dos dois, o Pix automático fica desativado e só o botão manual funciona |
| `DASHBOARD_PASSWORD` | Senha do dashboard privado (vazio = dashboard desativado) |
| `DASHBOARD_ALLOWED_ORIGIN` | URL do seu dashboard no Vercel, pra travar o CORS (vazio = libera qualquer origem) |

O bot valida essas variáveis ao iniciar: se `DISCORD_TOKEN` ou `CLIENT_ID`
estiverem faltando, ele encerra com uma mensagem clara. `GUILD_ID` e
`ADMIN_ROLE_ID` são recomendados, mas o bot sobe sem eles.

Registre os comandos e inicie:

```bash
npm run deploy-commands
npm start
```

Depois, configure em `/admin`:
- **Vendas/Pagamentos**: instruções de pagamento, e dentro de
  **🛍️ Configurar Loja**: descrição, imagem, preço de cada plano,
  canal-base dos tickets, termos de uso e imagem de agradecimento.
- **Configurações**: canal de log, canal-base de suporte, e o
  texto/imagem do painel fixo de suporte.
- **🎟️ Cupons**: gerar/listar/revogar códigos de desconto.

Por fim, rode `/comprar` e `/suporte` nos canais onde quer que os
painéis fixos apareçam.

### Dashboard privado (opcional)

O arquivo de um dashboard estático (HTML puro, sem build) que consome
a API `/dashboard/*` do bot pode ser hospedado gratuitamente no
[Vercel](https://vercel.com/new) — basta um repositório com um
`index.html` na raiz. Na tela de login, informe a URL pública do bot
(sem `/dashboard` no final) e a senha definida em `DASHBOARD_PASSWORD`.

## Hospedagem

O bot mantém uma conexão persistente com o Discord (gateway WebSocket),
então **não é compatível com hospedagem serverless** (Cloudflare Workers,
Vercel Functions — o dashboard estático em si pode ficar no Vercel,
só o bot em si não).

- **Railway** — free tier simples, URL pública gerada automaticamente
  em Settings → Networking → Generate Domain. **Importante:** o
  filesystem do container é descartável a cada deploy — anexe um
  **Volume** (Settings → Volumes) apontando pra pasta `data/` do
  projeto, ou o banco (e os backups) somem toda vez que você atualizar
  o código.
- **VPS própria** (ex: Oracle Cloud Free Tier) — mais estável a longo
  prazo, e evita instabilidade de rede que pode causar erros de
  interação expirada (`Unknown interaction`) em conexões mais fracas.
- **Self-hosted (Termux/dispositivo próprio)** — `npm start` com
  `termux-wake-lock` ativo; pra expor a API publicamente sem IP fixo,
  um túnel gratuito (`cloudflared tunnel --url http://localhost:3000`)
  funciona bem pra testes, mas gera uma URL nova a cada reinício.

## Integração com o hub (`main.lua`)

```lua
local API_URL = "https://seu-bot.exemplo.com/validate"
local API_SECRET = "" -- mesmo valor do API_SECRET no .env do bot, se tiver

local function ValidateKey(key)
    local hwid = game:GetService("RbxAnalyticsService"):GetClientId()
    local url = API_URL .. "?key=" .. key .. "&hwid=" .. hwid
    if API_SECRET ~= "" then url = url .. "&secret=" .. API_SECRET end

    local ok, response = pcall(function()
        return game:HttpGet(url)
    end)
    if not ok then return false, "request_failed" end

    local data = game:GetService("HttpService"):JSONDecode(response)
    return data.valid, data.reason
end
```

A resposta da API nunca inclui dados internos da key (nota, Discord ID
vinculado) — apenas `{ valid: boolean, reason: string|null }`.

## Segurança e limitações conhecidas

- A rota `/validate` aceita rate limiting básico (20 requisições / 10s
  por IP) sempre, e exige `API_SECRET` quando configurado. A rota
  `/dashboard/*` exige a senha em todo request e libera CORS só pra
  origem configurada (ou qualquer uma, se não travada ainda).
- HWID é o identificador que o executor/jogo fornece — funciona como
  dificultador de compartilhamento de key, não como trava criptográfica
  inquebrável.
- **Persistência de dados**: SQLite em `data/bot.db`, via `node:sqlite`
  (nativo do Node — sem dependência npm, sem compilação). Trocar o
  motor de banco no futuro (ex: Postgres) significa reimplementar só a
  camada interna de cada store, sem tocar nos comandos/painéis.
- **Threads de ticket**: privada exige boost nível 2 no servidor; sem
  isso, o bot cria como thread pública automaticamente.
- **Cupons não calculam desconto automaticamente**: como os preços dos
  planos são texto livre (não numérico), o cupom só carrega uma
  descrição do desconto — quem aplica de fato na cobrança é o admin.
- **Filesystem descartável em PaaS**: sem um volume persistente
  (Railway) ou disco de verdade (VPS), o banco e os backups se perdem
  a cada deploy.
- **Risco de plataforma**: conteúdo de exploit/cheat pode acionar
  moderação automática em hospedagens de código, processadores de
  pagamento e no próprio Discord — vale manter backups fora dessas
  plataformas e não depender de uma conta só.

## Licença

Projeto open source, de uso livre.
