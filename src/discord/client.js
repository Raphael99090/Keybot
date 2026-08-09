const { SlashCommandBuilder, ChannelType } = require("discord.js");
const { joinVoiceChannel } = require("@discordjs/voice");
const { isAdmin } = require("../../utils/permissions");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("conectar")
        .setDescription("[admin] Faz o bot entrar numa call de voz")
        .addChannelOption(opt =>
            opt.setName("canal")
                .setDescription("Canal de voz (padrão: o canal em que você está agora)")
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!isAdmin(interaction)) {
            return interaction.reply({ content: "❌ Só admins podem usar esse comando.", ephemeral: true });
        }

        const canalEscolhido = interaction.options.getChannel("canal");
        const canalDoUsuario = interaction.member.voice?.channel;
        const canal = canalEscolhido || canalDoUsuario;

        if (!canal) {
            return interaction.reply({
                content: "❌ Você não está em nenhuma call, e não escolheu um canal — entra numa call ou usa a opção `canal:`.",
                ephemeral: true
            });
        }

        try {
            joinVoiceChannel({
                channelId: canal.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator
            });
            return interaction.reply({ content: `📞 Conectado em ${canal}.`, ephemeral: true });
        } catch (err) {
            return interaction.reply({ content: `❌ Não consegui conectar. ${err.message}`, ephemeral: true });
        }
    }
};
