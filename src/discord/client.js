const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const config = require("../config");
const logger = require("../utils/logger");
const adminPanel = require("./adminPanel");
const storePanel = require("./storePanel");
const surveyPanel = require("./surveyPanel");
const supportPanel = require("./supportPanel");
const OrderStore = require("../store/orderStore");
const SupportStore = require("../store/supportStore");
const { startTicketSweeper } = require("./ticketSweeper");
const { startRenewalReminder } = require("./renewalReminder");

function createClient() {
    // GuildMessages só pra saber QUE uma mensagem chegou (marcar
    // atividade do ticket) — não lê o conteúdo, então não precisa da
    // intent privilegiada de MessageContent.
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates] });
    client.commands = new Collection();

    // Carrega todo arquivo dentro de commands/ automaticamente —
    // pra adicionar um comando novo, basta criar o arquivo lá,
    // não precisa registrar ele em lugar nenhum aqui.
    const commandsDir = path.join(__dirname, "commands");
    for (const file of fs.readdirSync(commandsDir)) {
        if (!file.endsWith(".js")) continue;
        const command = require(path.join(commandsDir, file));
        if (!command?.data || !command?.execute) {
            logger.warn(`Comando em ${file} está incompleto (faltando 'data' ou 'execute') — ignorado.`);
            continue;
        }
        client.commands.set(command.data.name, command);
    }
    logger.info(`${client.commands.size} comando(s) carregado(s): ${[...client.commands.keys()].join(", ")}`);

    client.on("interactionCreate", async (interaction) => {
        try {
            // Slash commands (/key, /admin, /help)
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command) return;
                return await command.execute(interaction);
            }

            // Botões e modais do painel admin usam customId "admin:..." / "admin_modal:..."
            if (interaction.isButton() && interaction.customId.startsWith("admin:")) {
                return await adminPanel.handleButton(interaction);
            }
            if (interaction.isModalSubmit() && interaction.customId.startsWith("admin_modal:")) {
                return await adminPanel.handleModalSubmit(interaction);
            }
            if (interaction.isStringSelectMenu() && interaction.customId.startsWith("admin:")) {
                return await adminPanel.handleSelectMenu(interaction);
            }

            // Fluxo de compra (/comprar) usa customId "store:..." / "store_modal:..."
            if (interaction.isButton() && interaction.customId.startsWith("store:")) {
                return await storePanel.handleButton(interaction);
            }
            if (interaction.isModalSubmit() && interaction.customId.startsWith("store_modal:")) {
                return await storePanel.handleModalSubmit(interaction);
            }

            // Pesquisa de satisfação (só acontece na DM) usa "survey:..." / "survey_modal:..."
            if (interaction.isButton() && interaction.customId.startsWith("survey:")) {
                return await surveyPanel.handleButton(interaction);
            }
            if (interaction.isModalSubmit() && interaction.customId.startsWith("survey_modal:")) {
                return await surveyPanel.handleModalSubmit(interaction);
            }

            // Ticket de suporte geral (separado do de compra) usa "support:..." / "support_modal:..."
            if (interaction.isButton() && interaction.customId.startsWith("support:")) {
                return await supportPanel.handleButton(interaction);
            }
            if (interaction.isModalSubmit() && interaction.customId.startsWith("support_modal:")) {
                return await supportPanel.handleModalSubmit(interaction);
            }
        } catch (err) {
            logger.error(`Erro ao processar interação -> ${err.stack || err}`);
            const payload = { content: "❌ Ocorreu um erro ao processar isso.", ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(payload).catch(() => {});
            } else {
                await interaction.reply(payload).catch(() => {});
            }
        }
    });

    // Marca atividade no ticket sempre que alguém manda mensagem nele —
    // o sweeper usa isso pra saber se o ticket ficou "morto" (compra:
    // 3min quieto, suporte: 15min quieto).
    client.on("messageCreate", (message) => {
        if (message.author.bot) return;
        if (!message.channel.isThread?.()) return;

        const order = OrderStore.getByChannel(message.channel.id);
        if (order && order.status === "open") {
            OrderStore.touchActivity(order.id);
            return;
        }

        const ticket = SupportStore.getByChannel(message.channel.id);
        if (ticket && ticket.status === "open") {
            SupportStore.touchActivity(ticket.id);
        }
    });

    client.once("ready", () => {
        logger.ok(`Bot conectado como ${client.user.tag}`);
        startTicketSweeper(client);
        startRenewalReminder(client);
    });

    return client;
}

module.exports = { createClient };
