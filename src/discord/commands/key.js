const { SlashCommandBuilder } = require("discord.js");
const KeyStore = require("../../store/keyStore");
const SettingsStore = require("../../store/settingsStore");
const ResetCodeStore = require("../../store/resetCodeStore");
const TrialStore = require("../../store/trialStore");
const { fmtDuration, fmtDate } = require("../../utils/format");
const { panel, v2Payload } = require("../v2");
const { COLORS } = require("../theme");

function statusOf(entry) {
    if (entry.revoked) return "🔴 Revogada";
    if (entry.expiresAt && Date.now() > entry.expiresAt) return "🟠 Expirada";
    return "🟢 Ativa";
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("key")
        .setDescription("Comandos de key pra uso pessoal")
        .addSubcommand(sub =>
            sub.setName("redeem")
                .setDescription("Resgata uma key e vincula à sua conta do Discord")
                .addStringOption(opt =>
                    opt.setName("key").setDescription("A key recebida").setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("check")
                .setDescription("Verifica o status de uma key")
                .addStringOption(opt =>
                    opt.setName("key").setDescription("A key a verificar").setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("resethwid")
                .setDescription("Reseta o HWID de uma key (permite trocar de dispositivo)")
                .addStringOption(opt =>
                    opt.setName("key").setDescription("A key a resetar").setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("codigo")
                        .setDescription("Código de reset comprado (pula o cooldown)")
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName("trial")
                .setDescription("Pega uma key de teste grátis (1 por pessoa)")
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        // --- check ---
        if (sub === "check") {
            const key = interaction.options.getString("key").trim();
            const entry = KeyStore.get(key);
            if (!entry) {
                return interaction.reply({ content: `❌ Key \`${key}\` não encontrada.`, ephemeral: true });
            }
            const container = panel({
                title: `🔑 ${key}`,
                fields: [
                    { name: "Status", value: statusOf(entry) },
                    { name: "Expira", value: fmtDate(entry.expiresAt) },
                    { name: "Resgatada por", value: entry.discordId ? `<@${entry.discordId}>` : "ninguém" },
                    { name: "HWID vinculado", value: entry.hwid ? "sim" : "não" }
                ]
            });
            return interaction.reply(v2Payload(container, [], { ephemeral: true }));
        }

        // --- redeem ---
        if (sub === "redeem") {
            const key = interaction.options.getString("key").trim();
            const result = KeyStore.redeem(key, interaction.user.id);

            const reasons = {
                not_found: "❌ Key não encontrada.",
                revoked: "❌ Essa key foi revogada.",
                already_claimed: "❌ Essa key já foi resgatada por outra pessoa."
            };

            if (!result.ok) {
                return interaction.reply({ content: reasons[result.reason] || "❌ Erro ao resgatar.", ephemeral: true });
            }
            return interaction.reply({ content: `✅ Key \`${key}\` vinculada à sua conta!`, ephemeral: true });
        }

        // --- resethwid ---
        if (sub === "resethwid") {
            const key = interaction.options.getString("key").trim();
            const codigo = interaction.options.getString("codigo");
            const entry = KeyStore.get(key);

            if (!entry) {
                return interaction.reply({ content: `❌ Key \`${key}\` não encontrada.`, ephemeral: true });
            }

            const requireAdmin = SettingsStore.get("hwidResetAdminOnly");
            const ownsKey = entry.discordId === interaction.user.id;

            if (requireAdmin && !codigo) {
                return interaction.reply({ content: "❌ Reset de HWID está restrito (use um código de reset ou peça a um admin).", ephemeral: true });
            }
            if (!requireAdmin && !ownsKey && !codigo) {
                return interaction.reply({ content: "❌ Essa key não é sua.", ephemeral: true });
            }

            let usedCode = null;
            if (codigo) {
                const result = ResetCodeStore.use(codigo.trim(), key, interaction.user.id);
                if (!result.ok) {
                    const reasons = {
                        not_found: "❌ Código de reset não encontrado.",
                        already_used: "❌ Esse código de reset já foi usado."
                    };
                    return interaction.reply({ content: reasons[result.reason] || "❌ Código inválido.", ephemeral: true });
                }
                usedCode = result.entry;
            } else {
                const cooldownHours = SettingsStore.get("resetCooldownHours");
                const remaining = KeyStore.cooldownRemaining(key, cooldownHours);
                if (remaining > 0) {
                    return interaction.reply({
                        content: `⏳ Essa key só pode resetar o HWID de novo em ${fmtDuration(remaining)}. Se precisar agora, use um código de reset com \`/key resethwid codigo:\`.`,
                        ephemeral: true
                    });
                }
            }

            KeyStore.resetHwid(key);
            return interaction.reply({
                content: usedCode
                    ? `🔄 HWID da key \`${key}\` resetado (código \`${usedCode.code}\` consumido).`
                    : `🔄 HWID da key \`${key}\` resetado.`,
                ephemeral: true
            });
        }

        // --- trial ---
        if (sub === "trial") {
            const trialDays = SettingsStore.get("trialDays");
            if (!trialDays || trialDays <= 0) {
                return interaction.reply({ content: "❌ O trial grátis está desativado atualmente.", ephemeral: true });
            }
            if (TrialStore.hasClaimed(interaction.user.id)) {
                return interaction.reply({ content: "❌ Você já pegou sua key de trial antes — só é permitida uma por pessoa.", ephemeral: true });
            }

            const entry = KeyStore.create({ daysValid: trialDays, note: `trial (${interaction.user.tag})` });
            KeyStore.redeem(entry.key, interaction.user.id);
            TrialStore.markClaimed(interaction.user.id, entry.key);

            const container = panel({
                title: "🎁 Key de trial",
                color: COLORS.warning,
                fields: [
                    { name: "Key", value: `\`${entry.key}\`` },
                    { name: "Validade", value: fmtDate(entry.expiresAt) }
                ],
                footer: "Só é permitido 1 trial por pessoa."
            });
            return interaction.reply(v2Payload(container, [], { ephemeral: true }));
        }
    }
};
