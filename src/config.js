require("dotenv").config();
const path = require("path");

module.exports = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID || null,
    // Plataformas de hospedagem (Railway, etc.) costumam injetar a porta
    // via process.env.PORT, não deixam você escolher — por isso ela tem
    // prioridade sobre API_PORT, que continua valendo pra rodar local.
    apiPort: Number(process.env.PORT) || Number(process.env.API_PORT) || 3000,
    adminRoleId: process.env.ADMIN_ROLE_ID || null,
    // Segredo exigido na API /validate (header X-API-Key ou ?secret=).
    // Deixe vazio pra desativar a exigência (não recomendado em produção).
    apiSecret: process.env.API_SECRET || null,
    // Access Token do Mercado Pago (mercadopago.com.br/developers). Vazio =
    // Pix automático fica desativado, e o fluxo cai pro botão manual de
    // "Confirmar Pagamento" que já existia.
    mercadoPagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || null,
    // Token da API do PushinPay (pushinpay.com.br). Se configurado,
    // tem prioridade sobre o Mercado Pago pro Pix automático.
    pushinPayToken: process.env.PUSHINPAY_API_TOKEN || null,
    // Chave da API da Grok (xAI). Vazio = a IA no ticket de suporte
    // fica desativada (nenhuma mensagem automática é enviada).
    grokApiKey: process.env.GROK_API_KEY || null,
    // Senha do dashboard privado (Vercel). Vazio = dashboard inteiro
    // desativado (todas as rotas /dashboard/* respondem 401).
    dashboardPassword: process.env.DASHBOARD_PASSWORD || null,
    // Domínio do seu dashboard no Vercel (ex: https://meu-dashboard.vercel.app).
    // Vazio = libera CORS pra qualquer origem (ok pra testar, mas trave
    // isso quando souber a URL final).
    dashboardAllowedOrigin: process.env.DASHBOARD_ALLOWED_ORIGIN || "*",

    // Onde o banco SQLite fica salvo. Gerado automaticamente na primeira
    // execução (não vem no repo).
    dbPath: path.join(__dirname, "..", "data", "bot.db")
};
