const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags
} = require("discord.js");
const { COLORS } = require("./theme");

function textDisplay(content) {
    return new TextDisplayBuilder().setContent(content);
}

function separator(spacing = SeparatorSpacingSize.Small, divider = true) {
    return new SeparatorBuilder().setSpacing(spacing).setDivider(divider);
}

/**
 * Monta um "Container" (substituto do Embed em Components V2) a partir
 * de um título, uma descrição opcional, uma lista de "campos" (pares
 * nome/valor — V2 não tem field lado a lado como embed, então cada um
 * vira uma linha em negrito), um rodapé opcional e uma imagem opcional
 * (URL — mostrada como galeria de mídia dentro do próprio container).
 */
function panel({ title, description = null, fields = [], color = COLORS.primary, footer = null, imageUrl = null }) {
    const container = new ContainerBuilder().setAccentColor(color);

    container.addTextDisplayComponents(textDisplay(`### ${title}`));

    if (description) {
        container.addSeparatorComponents(separator());
        container.addTextDisplayComponents(textDisplay(description));
    }

    if (imageUrl) {
        container.addSeparatorComponents(separator());
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(imageUrl).setDescription(title)
            )
        );
    }

    if (fields.length > 0) {
        container.addSeparatorComponents(separator());
        const fieldsText = fields.map(f => `**${f.name}**\n${f.value}`).join("\n\n");
        container.addTextDisplayComponents(textDisplay(fieldsText));
    }

    if (footer) {
        container.addSeparatorComponents(separator(SeparatorSpacingSize.Small, false));
        container.addTextDisplayComponents(textDisplay(`-# ${footer}`));
    }

    return container;
}

/**
 * Payload final pra reply/update/followUp usando Components V2.
 * containers pode ser um Container só ou uma lista deles; rows são as
 * ActionRow de botão/select — agora aninhadas DENTRO do último container
 * (via addActionRowComponents), então os botões aparecem dentro da caixa
 * colorida em vez de soltos abaixo dela.
 * IMPORTANTE: a flag precisa estar em TODA resposta (reply/update/
 * followUp) da mensagem, inclusive nas edições — não é "seta uma vez
 * só". content e embeds não podem ser usados junto (por isso content
 * sempre vai null aqui). Passe ephemeral: true pra combinar com a flag
 * de "só quem usou o comando vê" — não dá pra usar o atalho
 * `ephemeral: true` do discord.js junto com `flags` explícito, então a
 * combinação das duas flags é feita aqui via bitwise OR.
 */
function v2Payload(containers, rows = [], { ephemeral = false } = {}) {
    const list = Array.isArray(containers) ? containers : [containers];

    if (rows.length > 0) {
        const last = list[list.length - 1];
        for (const row of rows) last.addActionRowComponents(row);
    }

    let flags = MessageFlags.IsComponentsV2;
    if (ephemeral) flags |= MessageFlags.Ephemeral;

    return {
        content: null,
        embeds: [],
        components: list,
        flags
    };
}

module.exports = { textDisplay, separator, panel, v2Payload, SeparatorSpacingSize };
