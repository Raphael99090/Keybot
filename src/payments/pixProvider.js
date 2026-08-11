const mercadoPago = require("./mercadoPago");
const pushinPay = require("./pushinPay");

/**
 * PushinPay tem prioridade se os dois estiverem configurados — é mais
 * simples de configurar pra quem vende acesso/conteúdo digital, sem
 * exigir conta empresarial verificada como o Mercado Pago costuma pedir.
 * Se quiser forçar o Mercado Pago mesmo com os dois tokens no .env,
 * é só remover o PUSHINPAY_API_TOKEN.
 */
function getActiveProvider() {
    if (pushinPay.isConfigured()) return pushinPay;
    if (mercadoPago.isConfigured()) return mercadoPago;
    return null;
}

function isConfigured() {
    return Boolean(getActiveProvider());
}

function providerName() {
    if (pushinPay.isConfigured()) return "PushinPay";
    if (mercadoPago.isConfigured()) return "Mercado Pago";
    return null;
}

async function createPixCharge(params) {
    const provider = getActiveProvider();
    if (!provider) throw new Error("Nenhum gateway de Pix configurado.");
    return provider.createPixCharge(params);
}

async function checkPaymentStatus(id) {
    const provider = getActiveProvider();
    if (!provider) return null;
    return provider.checkPaymentStatus(id);
}

module.exports = { isConfigured, providerName, createPixCharge, checkPaymentStatus };
