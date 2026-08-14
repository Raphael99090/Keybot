const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits
} = require("discord.js");
const SettingsStore = require("../store/settingsStore");
const SupportStore = require("../store/supportStore");
const { isAdmin } = require("../utils/permissions");
const logger = require("../utils/logger");
const { panel, v2Payload } = require("./v2");
const { COLORS } = require("./theme");
const { sendActionLog } = require("./logNotifier");
const { postTicketTranscript } = require("./transcript");
const config = require("../config");

const TYPE_LABELS = { duvida: "❓ Dúvidas", compra: "🛒 Suporte Compra" };

// ============================================================
// PAINEL FIXO (postado no canal pelo /suporte, comando de admin)
// ============================================================

function fixedPanel() {
    const description = SettingsStore.get("supportPanelDescription") || "Precisa de ajuda? Clica no botão abaixo.";
    const container = panel({
        title: "🎫 Central de Suporte",
        description,
        imageUrl: SettingsStore.get("supportPanelImageUrl") || null,
        color: COLORS.voice
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("support:request").setLabel("Solicitar Suporte").setEmoji("🎫").setStyle(ButtonStyle.Primary)
    );

    return v2Payload(container, [row]);
}

function typeSelectPayload() {
    const container = panel({
        title: "Qual o motivo do seu ticket?",
        description: "Escolhe uma opção abaixo:"
    });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("support:type:duvida").setLabel(TYPE_LABELS.duvida).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("support:type:compra").setLabel(TYPE_LABELS.compra).setStyle(ButtonStyle.Secondary)
    );
    return v2Payload(container, [row]);
}

function subjectModal(type) {
    return new ModalBuilder()
        .setCustomId(`support_modal:open:${type}`)
        .setTitle("Abrir ticket de suporte")
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("assunto")
                    .setLabel("Descreve o problema ou dúvida")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            )
        );
}

// ============================================================
// PAINEL DENTRO DO TICKET (funções de admin + fechar, pro dono)
// ============================================================

function ticketActionsRows(ticketId) {
    const adminRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`support:call:${ticketId}`).setLabel("Criar Call Privada").setEmoji("📞").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`support:addmember:${ticketId}`).setLabel("Adicionar Membro").setEmoji("➕").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`support:removemember:${ticketId}`).setLabel("Remover Membro").setEmoji("➖").setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`support:ping:${ticketId}`).setLabel("Marcar quem abriu").setEmoji("🔔").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`support:close:${ticketId}`).setLabel("Fechar Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
    );
    return [adminRow, row2];
}

/** Mesma lógica de fallback do ticket de compra — privada com boost nível 2, senão pública. */
async function createSupportThread(interaction) {
    const baseChannelId = SettingsStore.get("supportChannelId");
    const baseChannel = baseChannelId
        ? await interaction.guild.channels.fetch(baseChannelId).catch(() => null)
        : interaction.channel;

    if (!baseChannel || !baseChannel.isTextBased()) {
        throw new Error("Canal-base de suporte não encontrado — confere em /admin → Configurações → Canal de suporte.");
    }

    const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "usuario";
    const threadName = `suporte-${safeName}-${Date.now().toString(36).slice(-4)}`;

    let thread, isPrivate = true;
    try {
        thread = await baseChannel.threads.create({
            name: threadName,
            type: ChannelType.PrivateThread,
            invitable: false,
            reason: `Suporte de ${interaction.user.tag}`
        });
    } catch {
        isPrivate = false;
        thread = await baseChannel.threads.create({
            name: threadName,
            type: ChannelType.PublicThread,
            reason: `Suporte de ${interaction.user.tag}`
        });
    }

    await thread.members.add(interaction.user.id).catch(() => {});
    return { thread, isPrivate };
}

function extractUserId(raw) {
    if (!raw) return null;
    const match = raw.match(/\d{15,20}/);
    return match ? match[0] : null;
}

// ============================================================
// HANDLERS
// ============================================================

async function handleButton(interaction) {
    const [, action, ticketId] = interaction.customId.split(":");

    if (action === "request") {
        return interaction.reply({ ...typeSelectPayload(), ephemeral: true });
    }

    if (action === "type") {
        const type = ticketId; // aqui o "ticketId" é na verdade o tipo (duvida|compra)
        if (!TYPE_LABELS[type]) return interaction.reply({ content: "❌ Tipo inválido.", ephemeral: true });
        return interaction.showModal(subjectModal(type));
    }

    const ticket = SupportStore.get(ticketId);

    if (action === "close") {
        const isOwner = ticket && ticket.discordId === interaction.user.id;
        if (!isAdmin(interaction) && !isOwner) {
            return interaction.reply({ content: "❌ Só quem abriu o ticket ou um admin pode fechar.", ephemeral: true });
        }
        await interaction.reply({ content: "🔒 Fechando o ticket em 5 segundos...", ephemeral: false });
        if (ticket) SupportStore.close(ticket.id, interaction.user.id);
        setTimeout(async () => {
            const channel = interaction.channel;
            if (ticket) await postTicketTranscript(interaction.client, { id: ticket.id, status: "closed" }, channel);
            await channel?.delete().catch(() => {});
        }, 5000);
        return;
    }

    // A partir daqui, todas as ações são só pra admin — quem não é
    // admin recebe o erro e nada acontece (o membro só usa "Fechar").
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: "❌ Essa ação é só pra administração.", ephemeral: true });
    }
    if (!ticket) {
        return interaction.reply({ content: "❌ Ticket não encontrado.", ephemeral: true });
    }

    if (action === "ping") {
        await interaction.reply({ content: `🔔 <@${ticket.discordId}>, a administração está te chamando aqui.` });
        return;
    }

    if (action === "call") {
        try {
            const parentChannel = interaction.channel.parent; // canal-base do ticket (categoria/canal pai da thread)
            const adminRoleId = config.adminRoleId;
            const overwrites = [
                { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: ticket.discordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }
            ];
            if (adminRoleId) {
                overwrites.push({ id: adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] });
            }

            const call = await interaction.guild.channels.create({
                name: `call-suporte-${ticket.id}`,
                type: ChannelType.GuildVoice,
                parent: parentChannel?.parentId || parentChannel?.id || null,
                permissionOverwrites: overwrites
            });

            // O bot já entra sozinho na call — assim ela não fica "vazia"
            // esperando alguém entrar primeiro.
            try {
                const { joinVoiceChannel } = require("@discordjs/voice");
                joinVoiceChannel({
                    channelId: call.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator
                });
            } catch (voiceErr) {
                logger.warn(`Call criada, mas o bot não conseguiu entrar sozinho -> ${voiceErr.message}`);
            }

            await interaction.reply({ content: `📞 Call privada criada: ${call}` });
        } catch (err) {
            logger.error(`Falha ao criar call de suporte -> ${err.message}`);
            await interaction.reply({ content: `❌ Não consegui criar a call. ${err.message}`, ephemeral: true });
        }
        return;
    }

    if (action === "addmember" || action === "removemember") {
        const modal = new ModalBuilder()
            .setCustomId(`support_modal:${action}:${ticket.id}`)
            .setTitle(action === "addmember" ? "Adicionar membro" : "Remover membro")
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("usuario")
                        .setLabel("ID ou @menção do usuário")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder("ex: 123456789012345678")
                )
            );
        return interaction.showModal(modal);
    }
}

async function handleModalSubmit(interaction) {
    const [, action, param] = interaction.customId.split(":");

    if (action === "open") {
        const type = param;
        if (!TYPE_LABELS[type]) return;

        // Rate limit: só 1 ticket de suporte aberto por vez por pessoa.
        const existing = SupportStore.listOpen().find(t => t.discordId === interaction.user.id);
        if (existing) {
            return interaction.reply({
                content: `❌ Você já tem um ticket de suporte aberto: <#${existing.channelId}>.`,
                ephemeral: true
            });
        }

        const subject = interaction.fields.getTextInputValue("assunto")?.trim();
        await interaction.deferReply({ ephemeral: true });

        let thread, isPrivate;
        try {
            ({ thread, isPrivate } = await createSupportThread(interaction));
        } catch (err) {
            logger.error(`Falha ao criar ticket de suporte -> ${err.message}`);
            return interaction.editReply({ content: `❌ Não consegui criar o ticket. ${err.message}` });
        }

        const ticket = SupportStore.create({ discordId: interaction.user.id, channelId: thread.id, subject, type });

        const container = panel({
            title: `🎫 Ticket de suporte — ${TYPE_LABELS[type]}`,
            color: COLORS.voice,
            description: `Olá <@${interaction.user.id}>! Um admin vai te atender aqui em breve.\n\n**Assunto:**\n${subject}`,
            footer: isPrivate ? `Ticket ${ticket.id} — thread privada.` : `Ticket ${ticket.id} — thread pública (servidor sem boost nível 2).`
        });

        await thread.send(v2Payload(container, ticketActionsRows(ticket.id)));
        await interaction.editReply({ content: `✅ Ticket criado: ${thread}` });

        await sendActionLog(interaction.client, {
            title: "🎫 Novo ticket de suporte",
            actorId: interaction.user.id,
            color: COLORS.voice,
            description: `Ticket \`${ticket.id}\` (${TYPE_LABELS[type]}) — ${thread}\n**Assunto:** ${subject}`
        });
        return;
    }

    if (action === "addmember" || action === "removemember") {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: "❌ Essa ação é só pra administração.", ephemeral: true });
        }
        const ticketId = param;
        const raw = interaction.fields.getTextInputValue("usuario")?.trim();
        const userId = extractUserId(raw);
        if (!userId) {
            return interaction.reply({ content: "❌ Não consegui reconhecer esse usuário — usa o ID ou @menção.", ephemeral: true });
        }

        try {
            if (action === "addmember") {
                await interaction.channel.members.add(userId);
                await interaction.reply({ content: `➕ <@${userId}> foi adicionado ao ticket.` });
            } else {
                await interaction.channel.members.remove(userId);
                await interaction.reply({ content: `➖ <@${userId}> foi removido do ticket.` });
            }
        } catch (err) {
            await interaction.reply({ content: `❌ Não consegui fazer isso. ${err.message}`, ephemeral: true });
        }
    }
}

module.exports = { fixedPanel, handleButton, handleModalSubmit };
