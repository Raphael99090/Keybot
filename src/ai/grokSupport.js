const { isConfigured, askGrok } = require("./grokClient");
const SettingsStore = require("../store/settingsStore");
const logger = require("../utils/logger");

/**
 * Lê as últimas mensagens do ticket, monta o histórico no formato que a
 * Grok espera (mensagens do bot = "assistant", do resto = "user") e
 * manda a resposta de volta no próprio canal. Chamado a cada mensagem
 * nova num ticket de suporte aberto — sempre ativo, sem precisar o
 * admin ligar nada.
 */
async function respondInSupportTicket(message) {
    if (!isConfigured()) return;

    try {
        const history = await message.channel.messages.fetch({ limit: 10 });
        const sorted = [...history.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const botId = message.client.user.id;

        const chatMessages = sorted
            .filter(m => m.content?.trim())
            .map(m => ({
                role: m.author.id === botId ? "assistant" : "user",
                content: m.author.id === botId ? m.content : `${m.author.username}: ${m.content}`
            }));

        if (chatMessages.length === 0) return;

        const systemPrompt = SettingsStore.get("grokSystemPrompt");
        const reply = await askGrok(chatMessages, systemPrompt);
        if (reply) {
            await message.channel.send(reply.slice(0, 1900));
        }
    } catch (err) {
        logger.warn(`Falha ao responder com IA no ticket -> ${err.message}`);
    }
}

module.exports = { respondInSupportTicket };
