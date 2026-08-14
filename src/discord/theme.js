/**
 * Tema visual centralizado — cores e emoji num lugar só, em vez de
 * cada painel escolher o próprio valor na hora. Isso é o que faz a
 * interface parecer "uma coisa só" em vez de remendada: toda tela de
 * sucesso usa o mesmo verde, todo erro o mesmo vermelho, etc.
 */

const COLORS = {
    primary: 0x8a3ffc, // roxo — cor padrão de painéis neutros (menus, listagens)
    success: 0x2ecc71, // verde — confirmação, aprovado, ativo
    error: 0xe74c3c, // vermelho — erro, revogado, rejeitado
    warning: 0xf1c40f, // amarelo — atenção, pendente, aguardando
    info: 0x3498db, // azul — informativo neutro
    voice: 0x5865f2, // blurple do Discord — usado no que envolve chamada/suporte
    pix: 0x00b0f0 // ciano — especificamente telas de pagamento Pix
};

const EMOJI = {
    ok: "✅",
    erro: "❌",
    aviso: "⚠️",
    info: "ℹ️",
    key: "🔑",
    loja: "🛒",
    produto: "📦",
    ticket: "🎫",
    pagamento: "💳",
    pix: "💠",
    cupom: "🎟️",
    config: "⚙️",
    stats: "📊",
    fechar: "🔒",
    estrela: "⭐",
    call: "📞",
    adicionar: "➕",
    remover: "➖",
    sino: "🔔",
    presente: "🎁",
    termos: "📜",
    lixeira: "🗑️",
    voltar: "⬅️",
    limpar: "🧹",
    codigo: "🔓"
};

/** Um título já com o emoji certo na frente, pra não montar isso na mão em todo lugar. */
function titled(emojiKey, text) {
    return `${EMOJI[emojiKey] || ""} ${text}`.trim();
}

module.exports = { COLORS, EMOJI, titled };
