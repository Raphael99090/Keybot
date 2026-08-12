const config = require("../config");

/** True se a pessoa tem Administrator no servidor OU o cargo configurado em ADMIN_ROLE_ID. */
function isAdmin(interaction) {
    if (!interaction.inGuild()) return false;
    if (interaction.member.permissions.has("Administrator")) return true;
    if (config.adminRoleId && interaction.member.roles.cache.has(config.adminRoleId)) return true;
    return false;
}

module.exports = { isAdmin };
