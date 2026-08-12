const config = require("../config");
const logger = require("../utils/logger");

function isConfigured() {
    return Boolean(config.grokApiKey);
}

/**
 * messages: array no formato [{ role: "user"|"assistant"|"system", content }].
 * Retorna o texto da resposta, ou null se não configurado/deu erro
 * (nesse caso o chamador simplesmente não manda nada no ticket).
 */
async function askGrok(messages, systemPrompt) {
    if (!isConfigured()) return null;

    try {
        const res = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.grokApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "grok-beta",
                messages: [{ role: "system", content: systemPrompt }, ...messages],
                max_tokens: 500
            })
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`Grok respondeu ${res.status}: ${text || "sem detalhes"}`);
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
        logger.warn(`Falha ao consultar a Grok -> ${err.message}`);
        return null;
    }
}

module.exports = { isConfigured, askGrok };
