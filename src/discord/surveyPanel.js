const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");
const SettingsStore = require("../store/settingsStore");
const ReviewStore = require("../store/reviewStore");
const logger = require("../utils/logger");
const { panel, v2Payload } = require("./v2");
const { COLORS } = require("./theme");

const { PLAN_LABELS } = SettingsStore;

/**
 * Manda a pesquisa de satisfação SÓ na DM do comprador — nunca no
 * ticket/servidor. Se a DM falhar (fechada), só loga e segue a vida,
 * sem tentar mandar em outro lugar.
 */
async function sendSatisfactionSurvey(client, order) {
    try {
        const buyer = await client.users.fetch(order.discordId);
        const container = panel({
            title: "⭐ Como foi sua experiência?",
            description: `Sua compra do plano **${PLAN_LABELS[order.plan] || order.plan}** foi concluída. Avalia de 1 a 5 estrelas — ajuda muito a melhorar o atendimento.`,
            footer: `Pedido ${order.id}`
        });

        const row = new ActionRowBuilder().addComponents(
            [1, 2, 3, 4, 5].map(n =>
                new ButtonBuilder()
                    .setCustomId(`survey:rate:${order.id}:${n}`)
                    .setLabel("⭐".repeat(n))
                    .setStyle(ButtonStyle.Secondary)
            )
        );

        await buyer.send(v2Payload(container, [row]));
    } catch (err) {
        logger.warn(`Não consegui mandar a pesquisa de satisfação pro pedido ${order.id} -> ${err.message}`);
    }
}

function commentModal(orderId, stars) {
    return new ModalBuilder()
        .setCustomId(`survey_modal:rate:${orderId}:${stars}`)
        .setTitle(`Avaliação: ${"⭐".repeat(stars)}`)
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("comentario")
                    .setLabel("Quer deixar um comentário? (opcional)")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
            )
        );
}

async function handleButton(interaction) {
    const [, action, orderId, starsRaw] = interaction.customId.split(":");
    if (action !== "rate") return;

    const stars = Number(starsRaw);
    return interaction.showModal(commentModal(orderId, stars));
}

async function handleModalSubmit(interaction) {
    const [, action, orderId, starsRaw] = interaction.customId.split(":");
    if (action !== "rate") return;

    const stars = Number(starsRaw);
    const comentario = interaction.fields.getTextInputValue("comentario")?.trim() || "";

    ReviewStore.create({ orderId, discordId: interaction.user.id, stars, comment: comentario });

    const container = panel({
        title: "🙏 Obrigado pela avaliação!",
        color: COLORS.success,
        description: `Você avaliou com ${"⭐".repeat(stars)}${comentario ? `\n\n_"${comentario}"_` : ""}`
    });

    // Edita a própria mensagem da DM (tira os botões), já que o modal
    // foi aberto a partir dela.
    if (typeof interaction.isFromMessage === "function" && interaction.isFromMessage()) {
        return interaction.update(v2Payload(container, []));
    }
    return interaction.reply(v2Payload(container, [], { ephemeral: true }));
}

module.exports = { sendSatisfactionSurvey, handleButton, handleModalSubmit };
