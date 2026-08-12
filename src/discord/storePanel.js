const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    MessageFlags
} = require("discord.js");
const KeyStore = require("../store/keyStore");
const SettingsStore = require("../store/settingsStore");
const OrderStore = require("../store/orderStore");
const CouponStore = require("../store/couponStore");
const ProductStore = require("../store/productStore");
const { isAdmin } = require("../utils/permissions");
const { fmtDate } = require("../utils/format");
const logger = require("../utils/logger");
const { panel, v2Payload } = require("./v2");
const { sendActionLog } = require("./logNotifier");
const pixProvider = require("../payments/pixProvider");
const { sendSatisfactionSurvey } = require("./surveyPanel");
const { postTicketTranscript } = require("./transcript");
const ReviewStore = require("../store/reviewStore");

const { PLAN_LABELS, PLAN_DAYS, PAYMENT_METHODS } = SettingsStore;

function priceLine(product, plan) {
    return product.plans?.[plan] || "preço a definir";
}

function planButtonsRow(product) {
    return new ActionRowBuilder().addComponents(
        Object.keys(PLAN_LABELS).map(plan =>
            new ButtonBuilder()
                .setCustomId(`store:buy:${product.id}:${plan}`)
                .setLabel(`${PLAN_LABELS[plan]} — ${priceLine(product, plan)}`)
                .setStyle(plan === "lifetime" ? ButtonStyle.Success : ButtonStyle.Primary)
        )
    );
}

/** Painel de planos de UM produto específico. */
function productPlanPanel(product) {
    const reviews = ReviewStore.list();
    const avg = ReviewStore.averageStars();
    const starsLine = avg !== null
        ? `\n\n⭐ **${avg.toFixed(1)}/5** — baseado em ${reviews.length} avalia${reviews.length === 1 ? "ção" : "ções"}`
        : "";

    const container = panel({
        title: `🛒 ${product.name}`,
        description: `${product.description || "Escolha um plano abaixo pra comprar sua key."}${starsLine}\n\n**🛒 Compre aqui:**`,
        imageUrl: product.imageUrl || null,
        footer: "Ao escolher um plano, um ticket privado é criado só pra você e a administração."
    });
    return v2Payload(container, [planButtonsRow(product)]);
}

/**
 * Painel principal da loja. Se só existir 1 produto ativo, vai direto
 * pros planos dele (experiência igual a antes, sem clique extra). Com
 * mais de 1, mostra um catálogo pra escolher qual produto primeiro.
 */
function shopPanel() {
    const products = ProductStore.listActive();

    if (products.length === 0) {
        const empty = panel({ title: "🛒 Loja", description: "Nenhum produto configurado ainda — fala com a administração." });
        return v2Payload(empty, []);
    }

    if (products.length === 1) {
        return productPlanPanel(products[0]);
    }

    const container = panel({
        title: "🛒 Loja — Catálogo",
        description: "Escolha um produto abaixo pra ver os planos:"
    });
    const rows = [];
    for (let i = 0; i < products.length; i += 5) {
        const slice = products.slice(i, i + 5);
        rows.push(new ActionRowBuilder().addComponents(
            slice.map(p => new ButtonBuilder().setCustomId(`store:viewproduct:${p.id}`).setLabel(p.name).setStyle(ButtonStyle.Primary))
        ));
    }
    return v2Payload(container, rows);
}

function paymentReferenceText() {
    const lines = Object.entries(PAYMENT_METHODS)
        .map(([key, label]) => {
            const info = SettingsStore.getPaymentInfo(key);
            return info ? `**${label}:**\n${info}` : null;
        })
        .filter(Boolean);
    return lines.length > 0 ? lines.join("\n\n") : "_Nenhuma forma de pagamento configurada ainda — combine direto com o comprador._";
}

function ticketActionsRow(orderId) {
    const buttons = [
        new ButtonBuilder().setCustomId(`store:confirm:${orderId}`).setLabel("✅ Confirmar Pagamento").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`store:reject:${orderId}`).setLabel("❌ Rejeitar").setStyle(ButtonStyle.Danger)
    ];
    if (pixProvider.isConfigured()) {
        buttons.unshift(
            new ButtonBuilder().setCustomId(`store:autopix:${orderId}`).setLabel("💠 Gerar Pix Automático").setStyle(ButtonStyle.Primary)
        );
    }
    return new ActionRowBuilder().addComponents(buttons);
}

function closeRow(orderId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`store:close:${orderId}`).setLabel("🔒 Fechar Ticket").setStyle(ButtonStyle.Secondary)
    );
}

/**
 * Fecha (apaga) o canal do ticket. Se o pedido foi de fato confirmado
 * (compra concluída), manda a pesquisa de satisfação pro comprador
 * ANTES de apagar o canal — e só na DM, nunca no ticket/servidor.
 */
async function closeTicket(client, order, { delayMs = 0 } = {}) {
    if (order.status === "confirmed") {
        await sendSatisfactionSurvey(client, order);
    }
    const doClose = async () => {
        const channel = await client.channels.fetch(order.channelId).catch(() => null);
        await postTicketTranscript(client, order, channel);
        await channel?.delete().catch(() => {});
    };
    if (delayMs > 0) {
        setTimeout(doClose, delayMs);
    } else {
        await doClose();
    }
}

function autopixModal(orderId) {
    return new ModalBuilder()
        .setCustomId(`store_modal:autopix:${orderId}`)
        .setTitle("Gerar Pix automático")
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("valor")
                    .setLabel("Valor a cobrar (ex: 15.90)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder("15.90")
            )
        );
}

/**
 * Gera a key (com o prefixo do produto comprado), vincula ao comprador,
 * marca o pedido como confirmado e manda a key por DM. Usado tanto pelo
 * clique manual em "Confirmar Pagamento" quanto pela aprovação
 * automática do Pix — os dois caminhos terminam aqui.
 */
async function finalizeOrder(client, order, adminId, amountPaid = null) {
    const days = PLAN_DAYS[order.plan];
    const product = ProductStore.get(order.productId) || ProductStore.ensureDefault();
    const keyEntry = KeyStore.create({ daysValid: days, note: `venda (${order.plan}) - pedido ${order.id}`, productId: product.id });
    KeyStore.redeem(keyEntry.key, order.discordId);

    const result = OrderStore.confirm(order.id, keyEntry.key, adminId, amountPaid);
    if (!result.ok) return { ok: false, reason: result.reason };

    let dmOk = true;
    try {
        const buyer = await client.users.fetch(order.discordId);
        const dmContainer = panel({
            title: "🔑 Sua key chegou!",
            color: 0x2ecc71,
            imageUrl: SettingsStore.get("purchaseThanksImageUrl") || null,
            description:
                `Pagamento confirmado — aqui está sua key de **${product.name}**:\n\n\`${keyEntry.key}\`\n\n` +
                `**Vence em:** ${fmtDate(keyEntry.expiresAt)}\n\n` +
                `**Como usar:** dentro do jogo, digite \`/key redeem key:${keyEntry.key}\` aqui no Discord ` +
                `pra vincular ela na sua conta, depois cole a key na tela do hub quando ele carregar.`
        });
        await buyer.send(v2Payload(dmContainer, []));
    } catch {
        dmOk = false;
    }

    logger.action(adminId, `confirmou o pedido ${order.id} (${product.name}) e gerou a key ${keyEntry.key} pra <@${order.discordId}>`);
    await sendActionLog(client, {
        title: "🛒 Pedido confirmado",
        actorId: adminId,
        color: 0x2ecc71,
        description: `Pedido \`${order.id}\` (${product.name} — ${PLAN_LABELS[order.plan]}) — key \`${keyEntry.key}\` gerada pra <@${order.discordId}>. Vencimento: ${fmtDate(keyEntry.expiresAt)}.`
    });

    return { ok: true, keyEntry, dmOk };
}

function couponModal(productId, plan) {
    return new ModalBuilder()
        .setCustomId(`store_modal:buy:${productId}:${plan}`)
        .setTitle(`Comprar — ${PLAN_LABELS[plan]}`)
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("cupom")
                    .setLabel("Tem um cupom de desconto? (opcional)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder("deixe vazio se não tiver")
            )
        );
}

/**
 * Painel de termos de uso — o comprador precisa clicar "Aceito" aqui
 * antes do ticket ser criado de verdade. O cupom só é CONSUMIDO
 * (incrementa o contador de uso) depois do aceite, não na hora que foi
 * digitado — assim, se a pessoa cancelar, o cupom continua intacto.
 */
function termsPanel(product, plan, couponCode) {
    const terms = product.termsText || "Sem termos configurados.";
    const container = panel({
        title: "📜 Termos de Uso",
        description:
            `${terms}\n\n` +
            `**Produto:** ${product.name}\n` +
            `**Plano:** ${PLAN_LABELS[plan]} — ${priceLine(product, plan)}` +
            (couponCode ? `\n**Cupom:** \`${couponCode}\`` : ""),
        footer: "Clique em \"Aceito\" pra continuar e abrir seu ticket."
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`store:accept_terms:${product.id}:${plan}:${couponCode || "none"}`).setLabel("✅ Aceito, continuar").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("store:cancel_terms").setLabel("❌ Cancelar").setStyle(ButtonStyle.Secondary)
    );

    return v2Payload(container, [row]);
}

/**
 * Cria o ticket como THREAD, não canal — mais leve e não exige a
 * permissão "Gerenciar Canais" pra sempre. Tenta thread PRIVADA primeiro
 * (exige boost nível 2 no servidor); se o servidor não tiver boost
 * suficiente, cai pra thread pública automaticamente (ainda funciona,
 * só que fica visível pra quem também vê o canal-base).
 */
async function createTicketThread(interaction, buyer) {
    const baseChannelId = SettingsStore.get("ticketChannelId");
    const baseChannel = baseChannelId
        ? await interaction.guild.channels.fetch(baseChannelId).catch(() => null)
        : interaction.channel;

    if (!baseChannel || !baseChannel.isTextBased()) {
        throw new Error("Canal base pra criar o ticket não foi encontrado ou não é de texto — confere o 'Canal dos tickets' em /admin.");
    }

    const safeName = buyer.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "comprador";
    const threadName = `ticket-${safeName}-${Date.now().toString(36).slice(-4)}`;

    let thread;
    let isPrivate = true;
    try {
        thread = await baseChannel.threads.create({
            name: threadName,
            type: ChannelType.PrivateThread,
            invitable: false,
            reason: `Ticket de compra de ${buyer.tag}`
        });
    } catch {
        // Provavelmente o servidor não tem boost nível 2 — thread privada
        // exige isso. Cai pra pública, que funciona em qualquer servidor.
        isPrivate = false;
        thread = await baseChannel.threads.create({
            name: threadName,
            type: ChannelType.PublicThread,
            reason: `Ticket de compra de ${buyer.tag}`
        });
    }

    await thread.members.add(buyer.id).catch(() => {});
    return { thread, isPrivate };
}

/**
 * Cria o ticket de fato — só é chamada DEPOIS de aceitar os termos de
 * uso (botão "accept_terms"). O cupom só é consumido aqui, não na hora
 * que a pessoa digitou (senão cancelar a compra desperdiçaria o cupom).
 */
async function createTicketAndNotify(interaction, product, plan, couponCode) {
    let coupon = null;
    if (couponCode && couponCode !== "none") {
        const result = CouponStore.use(couponCode);
        if (result.ok) coupon = result.entry;
        // Se falhar aqui (ex: alguém mais usou o mesmo cupom nesse meio-tempo,
        // raríssimo), só segue sem cupom em vez de travar a compra da pessoa.
    }

    let thread, isPrivate;
    try {
        ({ thread, isPrivate } = await createTicketThread(interaction, interaction.user));
    } catch (err) {
        logger.error(`Falha ao criar thread de ticket -> ${err.message}`);
        const errContainer = panel({ title: "❌ Erro ao criar o ticket", description: err.message });
        return interaction.editReply(v2Payload(errContainer, []));
    }

    const order = OrderStore.create({
        discordId: interaction.user.id,
        plan,
        channelId: thread.id,
        couponCode: coupon?.code || null,
        productId: product.id
    });

    const days = PLAN_DAYS[plan];
    const ticketContainer = panel({
        title: `🎫 Ticket de compra — ${product.name} (${PLAN_LABELS[plan]})`,
        description:
            `Olá <@${interaction.user.id}>! Aqui está seu ticket pra comprar **${product.name}**, plano **${PLAN_LABELS[plan]}** por **${priceLine(product, plan)}**.\n\n` +
            (coupon ? `**Cupom aplicado:** \`${coupon.code}\` — ${coupon.discountText || "desconto combinado com o admin"}\n\n` : "") +
            `Combine a forma de pagamento com a administração. Referência do que já está configurado:\n\n${paymentReferenceText()}`,
        fields: [
            { name: "Pedido", value: `\`${order.id}\`` },
            { name: "Validade da key", value: days ? `${days} dia(s)` : "vitalícia (lifetime)" }
        ],
        footer: isPrivate
            ? "Um admin confirma o pagamento aqui pra liberar a key."
            : "Um admin confirma o pagamento aqui pra liberar a key. (Thread pública — o servidor não tem boost nível 2 pra threads privadas.)"
    });

    await thread.send(v2Payload(ticketContainer, [ticketActionsRow(order.id)]));

    const doneContainer = panel({ title: "✅ Ticket criado", description: `Seu ticket foi criado: ${thread}` });
    await interaction.editReply(v2Payload(doneContainer, []));

    await sendActionLog(interaction.client, {
        title: "🎫 Novo ticket de compra",
        actorId: interaction.user.id,
        description: `Pedido \`${order.id}\` — ${product.name} (${PLAN_LABELS[plan]}) — ${thread}${coupon ? ` — cupom \`${coupon.code}\`` : ""}.`
    });
}

async function handleButton(interaction) {
    const parts = interaction.customId.split(":");
    const action = parts[1];

    if (action === "viewproduct") {
        const product = ProductStore.get(parts[2]);
        if (!product) return interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true });
        return interaction.update(productPlanPanel(product));
    }

    if (action === "buy") {
        const [productId, plan] = [parts[2], parts[3]];
        const product = ProductStore.get(productId);
        if (!product || !PLAN_LABELS[plan]) {
            return interaction.reply({ content: "❌ Produto ou plano inválido.", ephemeral: true });
        }
        if (!interaction.inGuild()) {
            return interaction.reply({ content: "❌ Isso só funciona dentro do servidor.", ephemeral: true });
        }

        // Rate limit: só 1 ticket aberto por vez por pessoa, pra ninguém
        // ficar clicando nos planos e empilhando threads vazias.
        const existing = OrderStore.listOpen().find(o => o.discordId === interaction.user.id);
        if (existing) {
            return interaction.reply({
                content: `❌ Você já tem um ticket aberto: <#${existing.channelId}>. Finaliza ou espera ele fechar antes de abrir outro.`,
                ephemeral: true
            });
        }

        return interaction.showModal(couponModal(productId, plan));
    }

    if (action === "accept_terms") {
        const [productId, plan, couponCode] = [parts[2], parts[3], parts[4]];
        const product = ProductStore.get(productId);
        if (!product || !PLAN_LABELS[plan]) {
            return interaction.reply({ content: "❌ Produto ou plano inválido.", ephemeral: true });
        }

        // Confirma o rate limit de novo aqui (pode ter passado tempo entre
        // abrir os termos e clicar em Aceito).
        const existing = OrderStore.listOpen().find(o => o.discordId === interaction.user.id);
        if (existing) {
            const container = panel({ title: "❌ Você já tem um ticket aberto", description: `<#${existing.channelId}>` });
            return interaction.update(v2Payload(container, []));
        }

        await interaction.deferUpdate();
        return createTicketAndNotify(interaction, product, plan, couponCode);
    }

    if (action === "cancel_terms") {
        const container = panel({ title: "❌ Compra cancelada", description: "Nenhum ticket foi criado. Pode chamar `/comprar` de novo quando quiser." });
        return interaction.update(v2Payload(container, []));
    }

    if (action === "autopix") {
        const orderId = parts[2];
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: "❌ Só admins podem gerar o Pix.", ephemeral: true });
        }
        if (!OrderStore.get(orderId)) {
            return interaction.reply({ content: "❌ Pedido não encontrado.", ephemeral: true });
        }
        return interaction.showModal(autopixModal(orderId));
    }

    if (action === "confirm" || action === "reject") {
        const orderId = parts[2];
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: "❌ Só admins podem confirmar/rejeitar pedidos.", ephemeral: true });
        }

        const order = OrderStore.get(orderId);
        if (!order) {
            const container = panel({ title: "❌ Pedido não encontrado", description: "Esse pedido não existe mais." });
            return interaction.update(v2Payload(container, []));
        }

        if (action === "confirm") {
            const result = await finalizeOrder(interaction.client, order, interaction.user.id);
            if (!result.ok) {
                return interaction.reply({ content: "⚠️ Esse pedido já tinha sido decidido antes.", ephemeral: true });
            }

            const doneContainer = panel({
                title: "✅ Pedido confirmado",
                color: 0x2ecc71,
                fields: [
                    { name: "Pedido", value: `\`${order.id}\`` },
                    { name: "Key gerada", value: `\`${result.keyEntry.key}\`` },
                    { name: "Vencimento", value: fmtDate(result.keyEntry.expiresAt) },
                    { name: "DM enviada?", value: result.dmOk ? "sim" : "❌ falhou (DMs fechadas?) — a key já está escrita aqui em cima" }
                ]
            });
            await interaction.update(v2Payload(doneContainer, [closeRow(order.id)]));
            await closeTicket(interaction.client, OrderStore.get(order.id), { delayMs: 10000 });
            return;
        }

        if (action === "reject") {
            const result = OrderStore.reject(order.id, interaction.user.id);
            if (!result.ok) {
                return interaction.reply({ content: "⚠️ Esse pedido já tinha sido decidido antes.", ephemeral: true });
            }

            const rejectedContainer = panel({
                title: "❌ Pedido rejeitado",
                color: 0xe74c3c,
                fields: [{ name: "Pedido", value: `\`${order.id}\`` }, { name: "Comprador", value: `<@${order.discordId}>` }]
            });
            await interaction.update(v2Payload(rejectedContainer, [closeRow(order.id)]));

            logger.action(interaction.user.id, `rejeitou o pedido ${order.id} (comprador: ${order.discordId})`);
            await sendActionLog(interaction.client, {
                title: "🛒 Pedido rejeitado",
                actorId: interaction.user.id,
                color: 0xe74c3c,
                description: `Pedido \`${order.id}\` (${PLAN_LABELS[order.plan]}) — comprador <@${order.discordId}>.`
            });
            return;
        }
    }

    if (action === "close") {
        const orderId = parts[2];
        const order = OrderStore.get(orderId);
        const isBuyer = order && order.discordId === interaction.user.id;
        if (!isAdmin(interaction) && !isBuyer) {
            return interaction.reply({ content: "❌ Só o comprador ou um admin pode fechar esse ticket.", ephemeral: true });
        }

        await interaction.reply({ content: "🔒 Fechando o ticket em 5 segundos...", ephemeral: false });
        if (order) {
            await closeTicket(interaction.client, order, { delayMs: 5000 });
        } else {
            setTimeout(() => interaction.channel?.delete().catch(() => {}), 5000);
        }
        return;
    }
}

async function handleModalSubmit(interaction) {
    const parts = interaction.customId.split(":");
    const action = parts[1];

    if (action === "autopix") {
        return handleAutopixSubmit(interaction, parts[2]);
    }

    if (action !== "buy") return;
    const [productId, plan] = [parts[2], parts[3]];
    const product = ProductStore.get(productId);
    if (!product || !PLAN_LABELS[plan]) return;

    const codigoDigitado = interaction.fields.getTextInputValue("cupom")?.trim();
    let couponCode = null;

    if (codigoDigitado) {
        // Só valida aqui — NÃO consome o cupom ainda. Se a pessoa cancelar
        // nos termos de uso, o cupom continua intacto pra tentar de novo.
        const result = CouponStore.validate(codigoDigitado);
        if (!result.ok) {
            const reasons = {
                not_found: "❌ Cupom não encontrado.",
                inactive: "❌ Esse cupom foi desativado.",
                exhausted: "❌ Esse cupom já atingiu o limite de usos."
            };
            return interaction.reply({ content: reasons[result.reason] || "❌ Cupom inválido.", ephemeral: true });
        }
        couponCode = result.entry.code;
    }

    const payload = termsPanel(product, plan, couponCode);
    return interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
}

const PIX_POLL_INTERVAL_MS = 5000;
const PIX_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos

/**
 * Gera a cobrança Pix via PushinPay ou Mercado Pago (o que estiver
 * configurado — ver pixProvider.js), posta o QR Code + copia-e-cola
 * no ticket, e fica checando o status a cada 5s. Quando aprovar, chama
 * o mesmo finalizeOrder() que o botão manual usa — ninguém precisa
 * clicar em nada.
 */
async function handleAutopixSubmit(interaction, orderId) {
    const order = OrderStore.get(orderId);
    if (!order) {
        return interaction.reply({ content: "❌ Pedido não encontrado.", ephemeral: true });
    }

    const valorTexto = interaction.fields.getTextInputValue("valor")?.trim().replace(",", ".");
    const valor = Number(valorTexto);
    if (!valor || valor <= 0) {
        return interaction.reply({ content: "❌ Valor inválido. Usa só números, ex: 15.90", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const product = ProductStore.get(order.productId) || ProductStore.ensureDefault();

    let charge;
    try {
        charge = await pixProvider.createPixCharge({
            amount: valor,
            description: `${product.name} — ${PLAN_LABELS[order.plan]} — pedido ${order.id}`
        });
    } catch (err) {
        logger.error(`Falha ao gerar Pix -> ${err.message}`);
        return interaction.editReply({ content: `❌ Não consegui gerar o Pix. ${err.message}` });
    }

    await interaction.editReply({ content: "✅ Pix gerado — postado no ticket." });

    const channel = await interaction.client.channels.fetch(order.channelId).catch(() => null);
    if (!channel) return;

    const attachment = new AttachmentBuilder(Buffer.from(charge.qrCodeBase64, "base64"), { name: "pix.png" });
    const pixContainer = panel({
        title: "💠 Pix gerado",
        color: 0x00b0f0,
        description:
            `Valor: **R$ ${valor.toFixed(2)}**\n\n` +
            `Escaneia o QR Code acima ou copia o código abaixo no app do seu banco:\n\n` +
            `\`\`\`${charge.qrCodeText}\`\`\`\n\n` +
            `Assim que o pagamento cair, a key é liberada automaticamente — não precisa avisar ninguém.`,
        footer: "Esse Pix expira em 15 minutos se não for pago."
    });

    await channel.send({ files: [attachment], ...v2Payload(pixContainer, []) });

    let elapsed = 0;
    const poll = setInterval(async () => {
        elapsed += PIX_POLL_INTERVAL_MS;

        if (elapsed >= PIX_TIMEOUT_MS) {
            clearInterval(poll);
            await channel.send("⏳ O Pix gerado expirou sem confirmação. Gera um novo com **💠 Gerar Pix Automático** se ainda quiser pagar assim.").catch(() => {});
            return;
        }

        // Se o pedido já foi decidido por outro caminho (confirm manual,
        // reject, ou outro Pix gerado antes), para de checar esse aqui.
        const current = OrderStore.get(order.id);
        if (!current || current.status !== "open") {
            clearInterval(poll);
            return;
        }

        const status = await pixProvider.checkPaymentStatus(charge.id);
        if (status === "approved") {
            clearInterval(poll);

            const result = await finalizeOrder(interaction.client, order, interaction.client.user.id, valor);
            if (!result.ok) return;

            const doneContainer = panel({
                title: "✅ Pagamento aprovado automaticamente",
                color: 0x2ecc71,
                fields: [
                    { name: "Pedido", value: `\`${order.id}\`` },
                    { name: "Key gerada", value: `\`${result.keyEntry.key}\`` },
                    { name: "Vencimento", value: fmtDate(result.keyEntry.expiresAt) },
                    { name: "DM enviada?", value: result.dmOk ? "sim" : "❌ falhou (DMs fechadas?) — a key já está escrita aqui em cima" }
                ]
            });
            await channel.send(v2Payload(doneContainer, [closeRow(order.id)])).catch(() => {});
            await closeTicket(interaction.client, OrderStore.get(order.id), { delayMs: 10000 });
        } else if (status === "rejected" || status === "cancelled") {
            clearInterval(poll);
            await channel.send("❌ O Pix foi rejeitado/cancelado. Gera um novo se quiser tentar de novo.").catch(() => {});
        }
        // "pending" só continua esperando, sem spamar o ticket.
    }, PIX_POLL_INTERVAL_MS);
}

module.exports = { shopPanel, handleButton, handleModalSubmit };
