const db = require("../db");

const DEFAULTS = {
    // Dias de validade padrão quando /key generate não especifica.
    defaultExpiryDays: null, // null = nunca expira
    // Se true, o comando /key resethwid só pode ser usado por admin.
    hwidResetAdminOnly: false,
    // Horas de espera entre resets gratuitos de HWID (0 = sem cooldown).
    // Um código de reset comprado (/resetcode) pula esse cooldown.
    resetCooldownHours: 24,
    // Dias de validade da key de trial grátis (/key trial). 0 = trial desativado.
    trialDays: 1,
    // Canal onde o bot avisa quando uma key é gerada/resgatada/revogada (opcional).
    logChannelId: null,
    // Canal onde os tickets de compra (threads) são criados. Vazio = usa
    // o canal onde /comprar foi digitado.
    ticketChannelId: null,
    // Imagem mostrada na DM de "obrigado pela compra" quando confirma o pedido.
    purchaseThanksImageUrl: "",
    // Canal-base onde os tickets de SUPORTE (diferente do de compra) são
    // criados. Vazio = usa o canal onde /suporte foi digitado.
    supportChannelId: null,
    // Texto e imagem do painel FIXO de suporte (o que o /suporte posta
    // no canal — diferente do painel que aparece dentro do ticket).
    supportPanelDescription: "Precisa de ajuda? Clica no botão abaixo pra abrir um ticket com a administração.",
    supportPanelImageUrl: "",
    // Instruções de pagamento mostradas dentro do ticket (referência).
    paymentInfo: {
        pix: "",
        btc: "",
        card: "",
        local: ""
    },
    // Prompt de sistema da IA (Grok) que responde automaticamente nos
    // tickets de suporte.
    grokSystemPrompt: "Você é um assistente de suporte do 1NXITER HUB. Seja educado, direto e breve. Se não souber a resposta ou o assunto for financeiro/sensível, diga que um admin vai responder em breve."
};

const PLAN_LABELS = {
    day: "1 Dia",
    week: "7 Dias",
    month: "30 Dias",
    lifetime: "Lifetime"
};

// Dias de validade de cada plano — lifetime é null (nunca expira).
// Isso é estrutural, não configurável (o preço sim, o prazo não).
const PLAN_DAYS = {
    day: 1,
    week: 7,
    month: 30,
    lifetime: null
};

const PAYMENT_METHODS = {
    pix: "Pix",
    btc: "Bitcoin",
    card: "Cartão",
    local: "Moeda local"
};

const stmts = {
    get: db.prepare(`SELECT value FROM settings WHERE key = ?`),
    set: db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
};

function readOne(key) {
    const row = stmts.get.get(key);
    return row ? JSON.parse(row.value) : DEFAULTS[key];
}

function writeOne(key, value) {
    stmts.set.run(key, JSON.stringify(value));
}

const SettingsStore = {
    getAll() {
        const result = {};
        for (const k of Object.keys(DEFAULTS)) result[k] = readOne(k);
        return result;
    },

    get(k) {
        return readOne(k);
    },

    set(k, v) {
        if (!(k in DEFAULTS)) return false;
        writeOne(k, v);
        return true;
    },

    validKeys() {
        return Object.keys(DEFAULTS);
    },

    /** Texto de instrução configurado pra um método ("pix"|"btc"|"card"|"local"). */
    getPaymentInfo(method) {
        return readOne("paymentInfo")?.[method] || "";
    },

    /** Define o texto de instrução de um método específico. */
    setPaymentInfo(method, text) {
        if (!(method in PAYMENT_METHODS)) return false;
        const data = readOne("paymentInfo") || {};
        writeOne("paymentInfo", { ...data, [method]: text });
        return true;
    },

    PAYMENT_METHODS,
    PLAN_LABELS,
    PLAN_DAYS
};

module.exports = SettingsStore;
