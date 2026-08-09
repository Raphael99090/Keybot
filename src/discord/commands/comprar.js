const { SlashCommandBuilder } = require("discord.js");
const { isAdmin } = require("../../utils/permissions");
const { shopPanel } = require("../storePanel");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("comprar")
        .setDescription("[admin] Posta o painel fixo da loja nesse canal"),

    async execute(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: "❌ Só admins podem postar o painel da loja.", ephemeral: true });
        }
        await interaction.channel.send(shopPanel());
        return interaction.reply({ content: "✅ Painel da loja postado.", ephemeral: true });
    }
};
