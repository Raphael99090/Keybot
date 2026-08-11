const config = require("../config");
const logger = require("../utils/logger");

const BASE_URL = "https://api.pushinpay.com.br/api";

function isConfigured() {
    return Boolean(config.pushinPayToken);
}

/**
 * Cria uma cobrança Pix. Retorna o QR Code (imagem em base64 — sem o
 * prefixo "data:image/...;base64," que a PushinPay já inclui — e o
 * "copia e cola") junto com o ID pra depois checar o status.
 */
async function createPixCharge({ amount, description }) {
    if (!isConfigured()) {
        throw new Error("PushinPay não configurado (PUSHINPAY_API_TOKEN ausente no .env).");
    }

    // A PushinPay trabalha com o valor em centavos (inteiro): R$ 15,90 = 1590.
    const valueInCents = Math.round(amount * 100);

    const res = await fetch(`${BASE_URL}/pix/cashIn`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${config.pushinPayToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ value: valueInCents })
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`PushinPay respondeu ${res.status}: ${text || "sem detalhes"}`);
    }

    const data = await res.json();
    if (!data.qr_code) {
        throw new Error("PushinPay não retornou os dados do Pix — confere se o token está certo.");
    }

    return {
        id: data.id,
        qrCodeBase64: (data.qr_code_base64 || "").replace(/^data:image\/\w+;base64,/, ""),
        qrCodeText: data.qr_code
    };
}

/** Traduz o status da PushinPay pro mesmo vocabulário usado no resto do bot. */
async function checkPaymentStatus(paymentId) {
    if (!isConfigured()) return null;

    try {
        const res = await fetch(`${BASE_URL}/transactions/${paymentId}`, {
            headers: { Authorization: `Bearer ${config.pushinPayToken}` }
        });
        if (!res.ok) return null;

        const data = await res.json();
        if (data.status === "paid") return "approved";
        if (["expired", "refunded", "cancelled"].includes(data.status)) return "rejected";
        return "pending";
    } catch (err) {
        logger.warn(`Falha ao consultar status PushinPay ${paymentId} -> ${err.message}`);
        return null;
    }
}

module.exports = { isConfigured, createPixCharge, checkPaymentStatus };
