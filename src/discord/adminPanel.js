const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    MessageFlags
} = require("discord.js");
const KeyStore = require("../store/keyStore");
const SettingsStore = require("../store/settingsStore");
const ResetCodeStore = require("../store/resetCodeStore");
const CouponStore = require("../store/couponStore");
const OrderStore = require("../store/orderStore");
const ReviewStore = require("../store/reviewStore");
const ProductStore = require("../store/productStore");
const { isAdmin } = require("../utils/permissions");
const logger = require("../utils/logger");
const { panel, v2Payload } = require("./v2");
const { sendActionLog } = require("./logNotifier");
const { fmtDate } = require("../utils/format");

function statusOf(entry) {
    if (entry.revoked) return "🔴 Revogada";
    if (entry.expiresAt && Date.now() > entry.expiresAt) return "🟠 Expirada";
    return "🟢 Ativa";
}

function preview(text) {
    return text ? (text.length > 60 ? `${text.slice(0, 60)}…` : text) : "não configurado";
}

/** Loga em arquivo (sempre) e manda um painel pro canal configurado (se houver). */
async function logAction(interaction, plainText) {
    logger.action(interaction.user.id, plainText);
    await sendActionLog(interaction.client, {
        title: "🛠️ Ação administrativa",
        actorId: interaction.user.id,
        description: `${plainText.charAt(0).toUpperCase()}${plainText.slice(1)}.`
    });
}

/**
 * Responde a uma interação de painel editando a MESMA mensagem em vez de
 * mandar uma nova. Funciona tanto pra botão (sempre editável) quanto pra
 * modal (editável quando o modal foi aberto a partir de um componente da
 * mensagem, que é sempre o nosso caso). Se por algum motivo não for
 * possível editar, cai pra um reply ephemeral como último recurso.
 * O payload já vem pronto de v2Payload() (com a flag de Components V2).
 */
async function respondToPanel(interaction, payload) {
    if (typeof interaction.isFromMessage === "function" && interaction.isFromMessage()) {
        return interaction.update(payload);
    }
    if (interaction.isButton?.()) {
        return interaction.update(payload);
    }
    return interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
}

function backRow(customId = "admin:back", label = "⬅️ Voltar ao painel") {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Secondary)
    );
}

// ============================================================
// MENU PRINCIPAL (agora em seções, não botões soltos)
// ============================================================

function mainPanel() {
    const container = panel({
        title: "🛠️ Painel Admin — 1NXITER KeyBot",
        description: "Escolha uma seção abaixo."
    });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:keys").setLabel("Keys").setEmoji("🔑").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("admin:resetcodes").setLabel("Códigos de Reset").setEmoji("🔓").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin:products").setLabel("Produtos").setEmoji("📦").setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:payments").setLabel("Pagamentos").setEmoji("💳").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin:coupons").setLabel("Cupons").setEmoji("🎟️").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("admin:config").setLabel("Configurações").setEmoji("⚙️").setStyle(ButtonStyle.Secondary)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:stats").setLabel("Estatísticas").setEmoji("📊").setStyle(ButtonStyle.Primary)
    );

    return v2Payload(container, [row1, row2, row3]);
}

// ============================================================
// SEÇÃO: KEYS
// ============================================================

function keysPanel() {
    const container = panel({
        title: "🔑 Keys",
        description: "Gerar, listar, revogar, renovar e limpar keys."
    });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:generate").setLabel("Gerar Key").setEmoji("🔑").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("admin:list").setLabel("Listar Keys").setEmoji("📋").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin:revoke").setLabel("Revogar Key").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("admin:extend").setLabel("Renovar Key").setEmoji("📅").setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:purge").setLabel("Limpar Antigas").setEmoji("🧹").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("admin:delete_all_keys").setLabel("⚠️ Apagar TODAS as keys").setStyle(ButtonStyle.Danger)
    );
    const row3 = backRow();

    return v2Payload(container, [row1, row2, row3]);
}

const KEYS_PER_PAGE = 10;

/** Painel paginado de listagem de keys. page é 0-indexed. */
function keyListPanel(page = 0) {
    const all = KeyStore.list();
    const totalPages = Math.max(1, Math.ceil(all.length / KEYS_PER_PAGE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const slice = all.slice(safePage * KEYS_PER_PAGE, safePage * KEYS_PER_PAGE + KEYS_PER_PAGE);

    const container = panel({
        title: `🔑 Keys cadastradas (${all.length})`,
        description: slice.length === 0
            ? "Nenhuma key cadastrada ainda."
            : slice.map(e => `\`${e.key}\` — ${statusOf(e)} — ${e.discordId ? `<@${e.discordId}>` : "não resgatada"}`).join("\n"),
        footer: `Página ${safePage + 1} de ${totalPages}`
    });

    const nav = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`admin:list_page:${safePage - 1}`)
            .setLabel("⬅️ Anterior")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage <= 0),
        new ButtonBuilder()
            .setCustomId(`admin:list_page:${safePage + 1}`)
            .setLabel("Próximo ➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage >= totalPages - 1)
    );

    return v2Payload(container, [nav, backRow("admin:keys", "⬅️ Voltar pra Keys")]);
}

// ============================================================
// SEÇÃO: CÓDIGOS DE RESET
// ============================================================

function resetCodesPanel() {
    const container = panel({
        title: "🔓 Códigos de Reset",
        description: "Códigos vendáveis que pulam o cooldown de reset de HWID."
    });
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:resetcode_generate").setLabel("Gerar Código").setEmoji("🔓").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("admin:resetcode_list").setLabel("Listar Códigos").setEmoji("📦").setStyle(ButtonStyle.Secondary)
    );
    return v2Payload(container, [row1, backRow()]);
}

// ============================================================
// SEÇÃO: PRODUTOS (multi-produto — cada um com prefixo/preços/termos próprios)
// ============================================================

function productsPanel() {
    const all = ProductStore.list();
    const lines = all.length === 0
        ? "Nenhum produto criado ainda."
        : all.map(p => `\`${p.id}\` — **${p.name}** (prefixo \`${p.prefix}\`) ${p.active ? "🟢" : "🔴"}`).join("\n");

    const container = panel({
        title: `📦 Produtos (${all.length})`,
        description: lines,
        footer: "Cada produto tem seu próprio prefixo de key, preços, imagem e termos de uso."
    });

    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("admin:product_create").setLabel("➕ Criar Produto").setStyle(ButtonStyle.Success)
        )
    ];

    if (all.length > 0) {
        rows.unshift(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("admin:product_select")
                .setPlaceholder("Selecione um produto pra editar")
                .addOptions(all.slice(0, 25).map(p => ({ label: p.name, value: p.id, description: `prefixo ${p.prefix}` })))
        ));
    }

    rows.push(backRow());
    return v2Payload(container, rows);
}

const { PLAN_LABELS } = SettingsStore;

function productEditPanel(product) {
    const container = panel({
        title: `📦 ${product.name}`,
        imageUrl: product.imageUrl || null,
        fields: [
            { name: "ID", value: `\`${product.id}\`` },
            { name: "Prefixo da key", value: `\`${product.prefix}\`` },
            { name: "Status", value: product.active ? "🟢 ativo" : "🔴 inativo" },
            { name: "Descrição", value: preview(product.description) },
            { name: "Termos de uso", value: preview(product.termsText) },
            { name: `Preço ${PLAN_LABELS.day}`, value: preview(product.plans?.day) },
            { name: `Preço ${PLAN_LABELS.week}`, value: preview(product.plans?.week) },
            { name: `Preço ${PLAN_LABELS.month}`, value: preview(product.plans?.month) },
            { name: `Preço ${PLAN_LABELS.lifetime}`, value: preview(product.plans?.lifetime) }
        ]
    });

    const planSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`admin:product_plan_select:${product.id}`)
            .setPlaceholder("Selecione um plano pra editar o preço")
            .addOptions(Object.entries(PLAN_LABELS).map(([value, label]) => ({ label, value })))
    );
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin:product_edit_name:${product.id}`).setLabel("Nome").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`admin:product_edit_prefix:${product.id}`).setLabel("Prefixo").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`admin:product_edit_description:${product.id}`).setLabel("Descrição").setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin:product_edit_imageUrl:${product.id}`).setLabel("Imagem").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`admin:product_edit_termsText:${product.id}`).setLabel("Termos de Uso").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`admin:product_toggle_active:${product.id}`).setLabel(product.active ? "Desativar" : "Ativar").setStyle(ButtonStyle.Primary)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin:product_delete:${product.id}`).setLabel("🗑️ Excluir Produto").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("admin:products").setLabel("⬅️ Voltar pra Produtos").setStyle(ButtonStyle.Secondary)
    );

    return v2Payload(container, [planSelect, row1, row2, row3]);
}

const PRODUCT_FIELD_LABELS = {
    name: "Nome do produto",
    prefix: "Prefixo da key (ex: 1NX)",
    description: "Descrição (aparece no /comprar)",
    imageUrl: "URL da imagem (vazio = remover)",
    termsText: "Termos de uso mostrados antes do ticket"
};

// ============================================================
// SEÇÃO: PAGAMENTOS
// ============================================================

function paymentsPanel() {
    const s = SettingsStore.getAll();
    const container = panel({
        title: "💳 Pagamentos",
        description: "Instruções mostradas como referência dentro de cada ticket de compra.",
        fields: [
            { name: "Pix", value: preview(s.paymentInfo?.pix) },
            { name: "Bitcoin", value: preview(s.paymentInfo?.btc) },
            { name: "Cartão", value: preview(s.paymentInfo?.card) },
            { name: "Moeda local", value: preview(s.paymentInfo?.local) }
        ]
    });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:payment_pix").setLabel("Editar Pix").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin:payment_btc").setLabel("Editar Bitcoin").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin:payment_card").setLabel("Editar Cartão").setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:payment_local").setLabel("Editar Moeda Local").setStyle(ButtonStyle.Secondary)
    );

    return v2Payload(container, [row1, row2, backRow()]);
}

// ============================================================
// SEÇÃO: CUPONS
// ============================================================

function couponsPanel() {
    const all = CouponStore.list();
    const lines = all.length === 0
        ? "Nenhum cupom criado ainda."
        : all.slice(0, 20).map(c => {
            const status = !c.active ? "🔴 revogado" : (c.maxUses !== null && c.uses >= c.maxUses) ? "🟠 esgotado" : "🟢 ativo";
            const usos = c.maxUses !== null ? `${c.uses}/${c.maxUses}` : `${c.uses}/∞`;
            return `\`${c.code}\` — ${status} — ${usos} uso(s)${c.discountText ? ` — _${c.discountText}_` : ""}`;
        }).join("\n");

    const container = panel({
        title: `🎟️ Cupons (${all.length})`,
        color: 0x2ecc71,
        description: lines,
        footer: all.length > 20 ? "Mostrando os 20 primeiros" : null
    });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:coupon_generate").setLabel("Gerar Cupom").setEmoji("🎟️").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("admin:coupon_revoke").setLabel("Revogar Cupom").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
    );

    return v2Payload(container, [row1, backRow()]);
}

// ============================================================
// SEÇÃO: CONFIGURAÇÕES
// ============================================================

function configPanel() {
    const s = SettingsStore.getAll();
    const container = panel({
        title: "⚙️ Configurações",
        fields: [
            { name: "Validade padrão", value: s.defaultExpiryDays ? `${s.defaultExpiryDays} dias` : "nunca expira" },
            { name: "Cooldown reset HWID", value: s.resetCooldownHours ? `${s.resetCooldownHours}h` : "sem cooldown" },
            { name: "Validade do trial", value: s.trialDays ? `${s.trialDays} dia(s)` : "desativado" },
            { name: "Reset HWID restrito a admin", value: s.hwidResetAdminOnly ? "sim" : "não" },
            { name: "Canal de log", value: s.logChannelId ? `<#${s.logChannelId}>` : "desativado" },
            { name: "Canal-base dos tickets de compra", value: s.ticketChannelId ? `<#${s.ticketChannelId}>` : "usa o canal onde /comprar foi digitado" },
            { name: "Canal-base de suporte", value: s.supportChannelId ? `<#${s.supportChannelId}>` : "usa o canal onde o painel foi postado" },
            { name: "Texto do painel de suporte", value: preview(s.supportPanelDescription) },
            { name: "Imagem do painel de suporte", value: s.supportPanelImageUrl ? "configurada" : "não configurada" },
            { name: "🎁 Imagem de agradecimento", value: s.purchaseThanksImageUrl ? "configurada" : "não configurada" }
        ]
    });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:config_expiry").setLabel("Validade padrão").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin:config_cooldown").setLabel("Cooldown reset").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin:config_trialdays").setLabel("Dias de trial").setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:config_toggle_hwidreset").setLabel("Alternar: HWID só admin").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("admin:config_logchannel").setLabel("Canal de log").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin:ticket_channel").setLabel("Canal dos tickets de compra").setStyle(ButtonStyle.Secondary)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:config_supportchannel").setLabel("Canal de suporte").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin:config_supporttext").setLabel("Texto do painel de suporte").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin:config_supportimage").setLabel("Imagem do painel de suporte").setStyle(ButtonStyle.Secondary)
    );
    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin:thanks_image").setLabel("🎁 Imagem de agradecimento").setStyle(ButtonStyle.Secondary)
    );

    return v2Payload(container, [row1, row2, row3, row4, backRow()]);
}

// ============================================================
// MODAIS (formulários pra pedir input — não são afetados por Components V2)
// ============================================================

function modal(customId, title, fields) {
    const m = new ModalBuilder().setCustomId(customId).setTitle(title);
    for (const f of fields) {
        m.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(f.id)
                    .setLabel(f.label)
                    .setStyle(f.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
                    .setPlaceholder(f.placeholder || "")
                    .setRequired(f.required !== false)
            )
        );
    }
    return m;
}

const MODALS = {
    generate: () => modal("admin_modal:generate", "Gerar key(s)", [
        { id: "dias", label: "Validade em dias (vazio = padrão configurado)", required: false, placeholder: "ex: 30" },
        { id: "quantidade", label: "Quantidade (padrão 1, máx 25)", required: false, placeholder: "ex: 5" },
        { id: "nota", label: "Nota interna (ex: nome do comprador)", required: false },
        { id: "produto", label: "ID do produto (vazio = padrão, vê em Produtos)", required: false, placeholder: "ex: PROD-A1B2C3" }
    ]),
    revoke: () => modal("admin_modal:revoke", "Revogar key", [
        { id: "key", label: "Key a revogar" }
    ]),
    extend: () => modal("admin_modal:extend", "Renovar key", [
        { id: "key", label: "Key a renovar" },
        { id: "dias", label: "Dias a adicionar", placeholder: "ex: 30" }
    ]),
    purge: () => modal("admin_modal:purge", "Limpar keys antigas", [
        { id: "dias", label: "Remove o que expirou/foi revogado há +X dias", required: false, placeholder: "padrão: 30" }
    ]),
    resetcode_generate: () => modal("admin_modal:resetcode_generate", "Gerar código de reset", [
        { id: "nota", label: "Nota interna (ex: nome do comprador)", required: false }
    ]),
    resetcode_revoke: () => modal("admin_modal:resetcode_revoke", "Apagar código de reset", [
        { id: "codigo", label: "Código a apagar" }
    ]),
    config_expiry: () => modal("admin_modal:config_expiry", "Validade padrão das novas keys", [
        { id: "dias", label: "Dias (0 = nunca expira)", placeholder: "ex: 30" }
    ]),
    config_cooldown: () => modal("admin_modal:config_cooldown", "Cooldown de reset de HWID", [
        { id: "horas", label: "Horas (0 = sem cooldown)", placeholder: "ex: 24" }
    ]),
    config_trialdays: () => modal("admin_modal:config_trialdays", "Validade da key de trial", [
        { id: "dias", label: "Dias (0 = desativa o trial)", placeholder: "ex: 1" }
    ]),
    config_logchannel: () => modal("admin_modal:config_logchannel", "Canal de log", [
        { id: "canal", label: "ID do canal (vazio = desativar)", required: false, placeholder: "ex: 123456789012345678" }
    ]),
    ticket_channel: () => modal("admin_modal:ticket_channel", "Canal-base dos tickets de compra", [
        { id: "canal", label: "ID do canal (vazio = usa o do /comprar)", required: false, placeholder: "ex: 123456789012345678" }
    ]),
    config_supportchannel: () => modal("admin_modal:config_supportchannel", "Canal-base de suporte", [
        { id: "canal", label: "ID do canal (vazio = usa onde o painel foi postado)", required: false, placeholder: "ex: 123456789012345678" }
    ]),
    config_supporttext: () => modal("admin_modal:config_supporttext", "Texto do painel de suporte", [
        { id: "texto", label: "Texto mostrado no painel fixo", long: true, required: false }
    ]),
    config_supportimage: () => modal("admin_modal:config_supportimage", "Imagem do painel de suporte", [
        { id: "url", label: "URL da imagem (vazio = remover)", required: false, placeholder: "https://..." }
    ]),
    thanks_image: () => modal("admin_modal:thanks_image", "Imagem de agradecimento", [
        { id: "url", label: "URL da imagem (vazio = remover)", required: false, placeholder: "https://..." }
    ]),
    payment_pix: () => modal("admin_modal:payment_pix", "Instruções — Pix", [
        { id: "texto", label: "Chave/valor/instruções", long: true, required: false }
    ]),
    payment_btc: () => modal("admin_modal:payment_btc", "Instruções — Bitcoin", [
        { id: "texto", label: "Endereço/valor/instruções", long: true, required: false }
    ]),
    payment_card: () => modal("admin_modal:payment_card", "Instruções — Cartão", [
        { id: "texto", label: "Link de pagamento/instruções", long: true, required: false }
    ]),
    payment_local: () => modal("admin_modal:payment_local", "Instruções — Moeda local", [
        { id: "texto", label: "Instruções de pagamento", long: true, required: false }
    ]),
    coupon_generate: () => modal("admin_modal:coupon_generate", "Gerar cupom", [
        { id: "codigo", label: "Código (vazio = gera automático)", required: false, placeholder: "ex: PROMO10" },
        { id: "desconto", label: "Descrição do desconto", required: false, placeholder: "ex: 10% OFF ou R$5 de desconto" },
        { id: "usos", label: "Máximo de usos (vazio = ilimitado)", required: false, placeholder: "ex: 10" }
    ]),
    coupon_revoke: () => modal("admin_modal:coupon_revoke", "Revogar cupom", [
        { id: "codigo", label: "Código a revogar" }
    ]),
    delete_all_keys: () => modal("admin_modal:delete_all_keys", "⚠️ Apagar TODAS as keys", [
        { id: "confirmacao", label: 'Digite exatamente "APAGAR" pra confirmar', placeholder: "APAGAR" }
    ]),
    product_create: () => modal("admin_modal:product_create", "Criar produto", [
        { id: "nome", label: "Nome do produto", placeholder: "ex: 1NXITER HUB" },
        { id: "prefixo", label: "Prefixo da key (ex: 1NX)", required: false, placeholder: "1NX" }
    ])
};

/** Painel de confirmação genérico, usado antes de qualquer ação destrutiva. */
function confirmPanel({ title, description, confirmCustomId, confirmLabel = "Confirmar", danger = true, cancelCustomId = "admin:back" }) {
    const container = panel({ title, description, color: danger ? 0xe74c3c : 0x8a3ffc });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(confirmCustomId).setLabel(confirmLabel).setStyle(danger ? ButtonStyle.Danger : ButtonStyle.Primary).setEmoji("✅"),
        new ButtonBuilder().setCustomId(cancelCustomId).setLabel("Cancelar").setStyle(ButtonStyle.Secondary).setEmoji("✖️")
    );

    return v2Payload(container, [row]);
}

// ============================================================
// HANDLERS — BOTÕES
// ============================================================

async function handleButton(interaction) {
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: "❌ Só admins podem usar esse painel.", ephemeral: true });
    }

    const parts = interaction.customId.split(":");
    const action = parts[1];
    const param = parts[2];

    // Campos dinâmicos de produto (nome/prefixo/descrição/imagem/termos)
    if (action.startsWith("product_edit_")) {
        const field = action.replace("product_edit_", "");
        const label = PRODUCT_FIELD_LABELS[field];
        if (!label) return interaction.reply({ content: "❌ Campo inválido.", ephemeral: true });
        const m = modal(`admin_modal:product_field:${field}:${param}`, label, [
            { id: "valor", label, long: field === "description" || field === "termsText", required: false }
        ]);
        return interaction.showModal(m);
    }

    // Ações que abrem um modal estático
    if (MODALS[action]) {
        return interaction.showModal(MODALS[action]());
    }

    if (action === "back") return interaction.update(mainPanel());
    if (action === "keys") return interaction.update(keysPanel());
    if (action === "resetcodes") return interaction.update(resetCodesPanel());
    if (action === "products") return interaction.update(productsPanel());
    if (action === "payments") return interaction.update(paymentsPanel());
    if (action === "coupons") return interaction.update(couponsPanel());
    if (action === "config") return interaction.update(configPanel());

    if (action === "product_create") {
        return interaction.showModal(MODALS.product_create());
    }

    if (action === "product_toggle_active") {
        const product = ProductStore.get(param);
        if (!product) return interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true });
        ProductStore.update(product.id, { active: !product.active });
        await interaction.update(productEditPanel(ProductStore.get(product.id)));
        return logAction(interaction, `${product.active ? "desativou" : "ativou"} o produto "${product.name}"`);
    }

    if (action === "product_delete") {
        const product = ProductStore.get(param);
        if (!product) return interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true });
        return interaction.update(confirmPanel({
            title: "🗑️ Confirmar exclusão de produto",
            description: `Tem certeza que quer excluir **${product.name}**? Isso não apaga as keys já vendidas dele, só o produto em si (ele deixa de aparecer na loja).`,
            confirmCustomId: `admin:product_confirm_delete:${product.id}`,
            confirmLabel: "Excluir",
            cancelCustomId: `admin:product_select_direct:${product.id}`
        }));
    }

    if (action === "product_confirm_delete") {
        const product = ProductStore.get(param);
        if (product) ProductStore.delete(product.id);
        await interaction.update(productsPanel());
        return logAction(interaction, `excluiu o produto "${product?.name || param}"`);
    }

    if (action === "product_select_direct") {
        const product = ProductStore.get(param);
        if (!product) return interaction.update(productsPanel());
        return interaction.update(productEditPanel(product));
    }

    if (action === "config_toggle_hwidreset") {
        const atual = SettingsStore.get("hwidResetAdminOnly");
        SettingsStore.set("hwidResetAdminOnly", !atual);
        await logAction(interaction, `alterou "HWID reset restrito a admin" para ${!atual ? "sim" : "não"}`);
        return interaction.update(configPanel());
    }

    if (action === "list" || action === "list_page") {
        const page = action === "list_page" ? Number(param) || 0 : 0;
        return interaction.update(keyListPanel(page));
    }

    if (action === "resetcode_list") {
        const all = ResetCodeStore.list();
        const lines = all.length === 0
            ? "Nenhum código gerado ainda."
            : all.slice(0, 25).map(c => {
                const status = c.used ? `🔴 usado (key \`${c.usedOnKey}\`)` : "🟢 disponível";
                return `\`${c.code}\` — ${status}${c.note ? ` — _${c.note}_` : ""}`;
            }).join("\n");

        const container = panel({
            title: `🔓 Códigos de reset (${all.length})`,
            description: lines,
            color: 0x2ecc71,
            footer: all.length > 25 ? "Mostrando os 25 primeiros" : null
        });
        return interaction.update(v2Payload(container, [backRow("admin:resetcodes", "⬅️ Voltar pra Códigos de Reset")]));
    }

    if (action === "stats") {
        const keys = KeyStore.list();
        const now = Date.now();
        const ativas = keys.filter(k => !k.revoked && (!k.expiresAt || k.expiresAt > now)).length;
        const expiradas = keys.filter(k => !k.revoked && k.expiresAt && k.expiresAt <= now).length;
        const revogadas = keys.filter(k => k.revoked).length;
        const resgatadas = keys.filter(k => k.discordId).length;
        const trials = keys.filter(k => k.note?.startsWith("trial")).length;
        const codigos = ResetCodeStore.list();
        const codigosUsados = codigos.filter(c => c.used).length;

        const orders = OrderStore.list();
        const confirmados = orders.filter(o => o.status === "confirmed");
        const porPlano = Object.entries(PLAN_LABELS)
            .map(([plan, label]) => `${label}: ${confirmados.filter(o => o.plan === plan).length}`)
            .join(" | ");
        const faturamento = confirmados.reduce((sum, o) => sum + (o.amountPaid || 0), 0);

        const porProduto = ProductStore.list()
            .map(p => `${p.name}: ${confirmados.filter(o => o.productId === p.id).length}`)
            .join(" | ") || "nenhum produto";

        const avaliacoes = ReviewStore.list();
        const media = ReviewStore.averageStars();

        const container = panel({
            title: "📊 Estatísticas",
            fields: [
                { name: "🔑 Total de keys", value: String(keys.length) },
                { name: "🟢 Ativas", value: String(ativas) },
                { name: "🟠 Expiradas", value: String(expiradas) },
                { name: "🔴 Revogadas", value: String(revogadas) },
                { name: "✅ Resgatadas", value: String(resgatadas) },
                { name: "🎁 Trials", value: String(trials) },
                { name: "🔓 Códigos gerados", value: String(codigos.length) },
                { name: "💰 Códigos vendidos", value: String(codigosUsados) },
                { name: "🛒 Vendas por plano", value: `${porPlano}\n(${confirmados.length} no total)` },
                { name: "📦 Vendas por produto", value: porProduto },
                { name: "💵 Faturamento (via Pix automático)", value: `R$ ${faturamento.toFixed(2)}` },
                { name: "⭐ Avaliações", value: media !== null ? `${media.toFixed(1)}/5 (${avaliacoes.length})` : "nenhuma ainda" }
            ]
        });
        return interaction.update(v2Payload(container, [backRow()]));
    }

    if (action === "purge") {
        const previewList = KeyStore.previewPurge(30);
        return interaction.update(confirmPanel({
            title: "🧹 Confirmar limpeza",
            description: previewList.length === 0
                ? "Nenhuma key revogada/expirada há mais de 30 dias — nada a remover."
                : `Isso vai remover **${previewList.length}** key(s):\n${previewList.slice(0, 20).join(", ")}${previewList.length > 20 ? "…" : ""}`,
            confirmCustomId: "admin:confirm_purge:30",
            confirmLabel: "Confirmar limpeza",
            cancelCustomId: "admin:keys"
        }));
    }

    if (action === "confirm_purge") {
        const dias = Number(param) || 30;
        const removidas = KeyStore.purge(dias);
        const container = panel({
            title: "🧹 Limpeza concluída",
            description: `${removidas.length} key(s) revogada(s)/expirada(s) há mais de ${dias} dias foram removidas.`
        });
        await interaction.update(v2Payload(container, [backRow("admin:keys", "⬅️ Voltar pra Keys")]));
        return logAction(interaction, `limpou ${removidas.length} key(s) antiga(s) (+${dias} dias)${removidas.length ? `: ${removidas.join(", ")}` : ""}`);
    }

    if (action === "confirm_revoke") {
        const key = param;
        const ok = KeyStore.revoke(key);
        const container = panel({
            title: ok ? "🔴 Key revogada" : "❌ Key não encontrada",
            description: ok ? `A key \`${key}\` foi revogada.` : `Não achei a key \`${key}\`.`
        });
        await interaction.update(v2Payload(container, [backRow("admin:keys", "⬅️ Voltar pra Keys")]));
        if (ok) await logAction(interaction, `revogou a key \`${key}\``);
        return;
    }
}

// ============================================================
// HANDLERS — MODAIS
// ============================================================

async function handleModalSubmit(interaction) {
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: "❌ Só admins podem usar esse painel.", ephemeral: true });
    }

    const parts = interaction.customId.split(":");
    const action = parts[1];
    const get = (id) => interaction.fields.getTextInputValue(id)?.trim();

    if (action === "product_field") {
        const field = parts[2];
        const productId = parts[3];
        const label = PRODUCT_FIELD_LABELS[field];
        if (!label) return;

        let valor = get("valor") || "";
        if (field === "prefix") {
            valor = valor.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "1NX";
        }

        ProductStore.update(productId, { [field]: valor });
        const product = ProductStore.get(productId);
        await respondToPanel(interaction, productEditPanel(product));
        return logAction(interaction, `atualizou "${label}" do produto "${product?.name || productId}"`);
    }

    if (action === "product_plan_price") {
        const productId = parts[2];
        const plan = parts[3];
        const preco = get("preco") || "";
        ProductStore.setPlanPrice(productId, plan, preco);
        const product = ProductStore.get(productId);
        await respondToPanel(interaction, productEditPanel(product));
        return logAction(interaction, `definiu o preço do plano ${plan} do produto "${product?.name || productId}": ${preco || "sem preço"}`);
    }

    if (action === "product_create") {
        const nome = get("nome");
        const prefixo = get("prefixo") || "1NX";
        const product = ProductStore.create({ name: nome, prefix: prefixo });
        await respondToPanel(interaction, productEditPanel(product));
        return logAction(interaction, `criou o produto "${product.name}" (prefixo ${product.prefix})`);
    }

    if (action === "generate") {
        const dias = get("dias") ? Number(get("dias")) : SettingsStore.get("defaultExpiryDays");
        const nota = get("nota") || "";
        const quantidade = Math.min(Math.max(Number(get("quantidade")) || 1, 1), 25);
        const produtoId = get("produto") || null;

        if (produtoId && !ProductStore.get(produtoId)) {
            const container = panel({ title: "❌ Produto não encontrado", description: `Não achei o produto \`${produtoId}\`. Vê o ID certo em Produtos.` });
            return respondToPanel(interaction, v2Payload(container, [backRow("admin:keys", "⬅️ Voltar pra Keys")]));
        }

        const entries = [];
        for (let i = 0; i < quantidade; i++) {
            entries.push(KeyStore.create({ daysValid: dias, note: nota, productId: produtoId }));
        }

        const container = panel({
            title: quantidade === 1 ? "🔑 Key gerada" : `🔑 ${quantidade} keys geradas`,
            description: entries.map(e => `\`${e.key}\``).join("\n"),
            fields: [{ name: "Validade", value: fmtDate(entries[0].expiresAt) }]
        });

        await respondToPanel(interaction, v2Payload(container, [backRow("admin:keys", "⬅️ Voltar pra Keys")]));
        const keysList = entries.map(e => e.key).join(", ");
        return logAction(interaction, `gerou ${quantidade} key(s): ${keysList} — vencimento: ${fmtDate(entries[0].expiresAt)}${nota ? ` (nota: "${nota}")` : ""}`);
    }

    if (action === "revoke") {
        const key = get("key");
        const entry = KeyStore.get(key);
        if (!entry) {
            const container = panel({ title: "❌ Key não encontrada", description: `Não achei a key \`${key}\`.` });
            return respondToPanel(interaction, v2Payload(container, [backRow("admin:keys", "⬅️ Voltar pra Keys")]));
        }
        return respondToPanel(interaction, confirmPanel({
            title: "🗑️ Confirmar revogação",
            description: `Tem certeza que quer revogar a key \`${key}\`?${entry.discordId ? ` Ela está vinculada a <@${entry.discordId}>.` : ""}`,
            confirmCustomId: `admin:confirm_revoke:${key}`,
            confirmLabel: "Revogar",
            cancelCustomId: "admin:keys"
        }));
    }

    if (action === "extend") {
        const key = get("key");
        const dias = Number(get("dias"));
        const result = KeyStore.extend(key, dias);
        if (!result.ok) {
            const container = panel({ title: "❌ Key não encontrada", description: `Não achei a key \`${key}\`.` });
            return respondToPanel(interaction, v2Payload(container, [backRow("admin:keys", "⬅️ Voltar pra Keys")]));
        }
        const container = panel({
            title: "✅ Key renovada",
            description: `Key \`${key}\` — nova validade: ${fmtDate(result.entry.expiresAt)}.`
        });
        await respondToPanel(interaction, v2Payload(container, [backRow("admin:keys", "⬅️ Voltar pra Keys")]));
        return logAction(interaction, `renovou a key \`${key}\` por +${dias} dias — novo vencimento: ${fmtDate(result.entry.expiresAt)}`);
    }

    if (action === "purge") {
        const dias = Number(get("dias")) || 30;
        const previewList = KeyStore.previewPurge(dias);
        return respondToPanel(interaction, confirmPanel({
            title: "🧹 Confirmar limpeza",
            description: previewList.length === 0
                ? `Nenhuma key revogada/expirada há mais de ${dias} dias — nada a remover.`
                : `Isso vai remover **${previewList.length}** key(s):\n${previewList.slice(0, 20).join(", ")}${previewList.length > 20 ? "…" : ""}`,
            confirmCustomId: `admin:confirm_purge:${dias}`,
            confirmLabel: "Confirmar limpeza",
            cancelCustomId: "admin:keys"
        }));
    }

    if (action === "resetcode_generate") {
        const nota = get("nota") || "";
        const entry = ResetCodeStore.create({ note: nota });
        const container = panel({
            title: "🔓 Código de reset gerado",
            color: 0x2ecc71,
            fields: [{ name: "Código", value: `\`${entry.code}\`` }, { name: "Nota", value: nota || "—" }],
            footer: "Manda esse código pra quem comprou — usa em /key resethwid codigo:"
        });
        await respondToPanel(interaction, v2Payload(container, [backRow("admin:resetcodes", "⬅️ Voltar pra Códigos de Reset")]));
        return logAction(interaction, `gerou o código de reset \`${entry.code}\`${nota ? ` (nota: "${nota}")` : ""}`);
    }

    if (action === "resetcode_revoke") {
        const codigo = get("codigo");
        const entry = ResetCodeStore.get(codigo);
        if (!entry) {
            const container = panel({ title: "❌ Código não encontrado", description: `Não achei o código \`${codigo}\`.` });
            return respondToPanel(interaction, v2Payload(container, [backRow("admin:resetcodes", "⬅️ Voltar pra Códigos de Reset")]));
        }
        if (entry.used) {
            const container = panel({ title: "❌ Código já usado", description: `O código \`${codigo}\` já foi usado.` });
            return respondToPanel(interaction, v2Payload(container, [backRow("admin:resetcodes", "⬅️ Voltar pra Códigos de Reset")]));
        }
        ResetCodeStore.revoke(codigo);
        const container = panel({ title: "🗑️ Código apagado", description: `Código \`${codigo}\` apagado.` });
        await respondToPanel(interaction, v2Payload(container, [backRow("admin:resetcodes", "⬅️ Voltar pra Códigos de Reset")]));
        return logAction(interaction, `apagou o código de reset \`${codigo}\``);
    }

    if (action === "config_expiry") {
        const dias = Number(get("dias"));
        SettingsStore.set("defaultExpiryDays", dias > 0 ? dias : null);
        await respondToPanel(interaction, configPanel());
        return logAction(interaction, `definiu a validade padrão: ${dias > 0 ? `${dias} dias` : "nunca expira"}`);
    }

    if (action === "config_cooldown") {
        const horas = Number(get("horas"));
        SettingsStore.set("resetCooldownHours", horas > 0 ? horas : 0);
        await respondToPanel(interaction, configPanel());
        return logAction(interaction, `definiu o cooldown de reset: ${horas > 0 ? `${horas}h` : "desativado"}`);
    }

    if (action === "config_trialdays") {
        const dias = Number(get("dias"));
        SettingsStore.set("trialDays", dias > 0 ? dias : 0);
        await respondToPanel(interaction, configPanel());
        return logAction(interaction, `definiu o trial: ${dias > 0 ? `${dias} dia(s)` : "desativado"}`);
    }

    if (action === "config_logchannel") {
        const raw = get("canal");
        const id = raw ? raw.replace(/[<#>]/g, "") : null;
        SettingsStore.set("logChannelId", id || null);
        await respondToPanel(interaction, configPanel());
        return logAction(interaction, `definiu o canal de log: ${id ? `<#${id}>` : "desativado"}`);
    }

    if (action === "ticket_channel") {
        const raw = get("canal");
        const id = raw ? raw.replace(/[<#>]/g, "") : null;
        SettingsStore.set("ticketChannelId", id || null);
        await respondToPanel(interaction, configPanel());
        return logAction(interaction, `definiu o canal-base dos tickets de compra: ${id ? `<#${id}>` : "usa o do /comprar"}`);
    }

    if (action === "config_supportchannel") {
        const raw = get("canal");
        const id = raw ? raw.replace(/[<#>]/g, "") : null;
        SettingsStore.set("supportChannelId", id || null);
        await respondToPanel(interaction, configPanel());
        return logAction(interaction, `definiu o canal-base de suporte: ${id ? `<#${id}>` : "usa onde o painel foi postado"}`);
    }

    if (action === "config_supporttext") {
        const texto = get("texto") || "";
        SettingsStore.set("supportPanelDescription", texto);
        await respondToPanel(interaction, configPanel());
        return logAction(interaction, "atualizou o texto do painel de suporte");
    }

    if (action === "config_supportimage") {
        const url = get("url") || "";
        SettingsStore.set("supportPanelImageUrl", url);
        await respondToPanel(interaction, configPanel());
        return logAction(interaction, url ? "definiu a imagem do painel de suporte" : "removeu a imagem do painel de suporte");
    }

    if (action === "thanks_image") {
        const url = get("url") || "";
        SettingsStore.set("purchaseThanksImageUrl", url);
        await respondToPanel(interaction, configPanel());
        return logAction(interaction, url ? "definiu a imagem de agradecimento" : "removeu a imagem de agradecimento");
    }

    if (["payment_pix", "payment_btc", "payment_card", "payment_local"].includes(action)) {
        const method = action.replace("payment_", "");
        const texto = get("texto") || "";
        SettingsStore.setPaymentInfo(method, texto);
        await respondToPanel(interaction, paymentsPanel());
        return logAction(interaction, `atualizou as instruções de pagamento (${method})`);
    }

    if (action === "coupon_generate") {
        const codigo = get("codigo") || null;
        const desconto = get("desconto") || "";
        const usosRaw = get("usos");
        const maxUses = usosRaw ? Number(usosRaw) : null;

        const entry = CouponStore.create({ code: codigo, discountText: desconto, maxUses });
        await respondToPanel(interaction, couponsPanel());
        return logAction(interaction, `gerou o cupom \`${entry.code}\`${desconto ? ` (${desconto})` : ""}${maxUses ? ` — máx ${maxUses} usos` : " — usos ilimitados"}`);
    }

    if (action === "coupon_revoke") {
        const codigo = get("codigo");
        const ok = CouponStore.revoke(codigo);
        await respondToPanel(interaction, couponsPanel());
        return logAction(interaction, ok ? `revogou o cupom \`${codigo}\`` : `tentou revogar o cupom \`${codigo}\` (não encontrado)`);
    }

    if (action === "delete_all_keys") {
        const confirmacao = get("confirmacao");
        if (confirmacao?.toUpperCase() !== "APAGAR") {
            const container = panel({
                title: "❌ Cancelado",
                description: 'Você não digitou exatamente "APAGAR" — nada foi apagado.'
            });
            return respondToPanel(interaction, v2Payload(container, [backRow("admin:keys", "⬅️ Voltar pra Keys")]));
        }

        const removidas = KeyStore.deleteAll();
        const container = panel({
            title: "🗑️ Todas as keys foram apagadas",
            color: 0xe74c3c,
            description: `${removidas.length} key(s) removida(s) do banco. Essa ação não tem volta — se precisar recuperar, use o backup mais recente em \`data/backups/\`, se existir.`
        });
        await respondToPanel(interaction, v2Payload(container, [backRow("admin:keys", "⬅️ Voltar pra Keys")]));

        logger.action(interaction.user.id, `APAGOU TODAS AS ${removidas.length} KEY(S): ${removidas.join(", ")}`);
        return sendActionLog(interaction.client, {
            title: "🗑️⚠️ TODAS as keys foram apagadas",
            actorId: interaction.user.id,
            color: 0xe74c3c,
            description: `${removidas.length} key(s) removida(s) permanentemente.${removidas.length ? `\n\n${removidas.slice(0, 30).join(", ")}${removidas.length > 30 ? "…" : ""}` : ""}`
        });
    }
}

// ============================================================
// HANDLERS — SELECT MENUS
// ============================================================

async function handleSelectMenu(interaction) {
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: "❌ Só admins podem usar esse painel.", ephemeral: true });
    }

    if (interaction.customId === "admin:product_select") {
        const product = ProductStore.get(interaction.values[0]);
        if (!product) return interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true });
        return interaction.update(productEditPanel(product));
    }

    if (interaction.customId.startsWith("admin:product_plan_select:")) {
        const productId = interaction.customId.split(":")[2];
        const plan = interaction.values[0];
        if (!PLAN_LABELS[plan]) return interaction.reply({ content: "❌ Plano inválido.", ephemeral: true });

        const m = modal(`admin_modal:product_plan_price:${productId}:${plan}`, `Preço — ${PLAN_LABELS[plan]}`, [
            { id: "preco", label: "Preço (texto livre, ex: R$ 15,00)", required: false }
        ]);
        return interaction.showModal(m);
    }
}

module.exports = { mainPanel, configPanel, handleButton, handleModalSubmit, handleSelectMenu };
