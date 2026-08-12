const config = require("./config");
const { createClient } = require("./discord/client");
const { startApi } = require("./api/server");
const { validateEnv } = require("./utils/validator");
const { startAutoBackup } = require("./backup");
const ProductStore = require("./store/productStore");

validateEnv(config);

// Garante que sempre exista pelo menos 1 produto — instalações que já
// existiam antes do multi-produto ganham automaticamente um produto
// padrão "1NXITER HUB" (prefixo 1NX), sem precisar de nenhuma ação manual.
ProductStore.ensureDefault();

const client = createClient();
client.login(config.token);

startApi();
startAutoBackup();

