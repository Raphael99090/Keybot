const crypto = require("crypto");
const db = require("../db");

function generateKeyString(prefix = "1NX") {
    const part = () => crypto.randomBytes(2).toString("hex").toUpperCase();
    return `${prefix}-${part()}-${part()}-${part()}`;
}

function rowToEntry(row) {
    if (!row) return null;
    return { ...row, revoked: Boolean(row.revoked) };
}

const stmts = {
    insert: db.prepare(`INSERT INTO keys (key, discordId, hwid, createdAt, expiresAt, revoked, note, lastHwidReset, productId) VALUES (?, NULL, NULL, ?, ?, 0, ?, NULL, ?)`),
    get: db.prepare(`SELECT * FROM keys WHERE key = ?`),
    all: db.prepare(`SELECT * FROM keys`),
    revoke: db.prepare(`UPDATE keys SET revoked = 1 WHERE key = ?`),
    setDiscordId: db.prepare(`UPDATE keys SET discordId = ? WHERE key = ?`),
    setExpiresAt: db.prepare(`UPDATE keys SET expiresAt = ? WHERE key = ?`),
    resetHwidStmt: db.prepare(`UPDATE keys SET hwid = NULL, lastHwidReset = ? WHERE key = ?`),
    setHwid: db.prepare(`UPDATE keys SET hwid = ? WHERE key = ?`),
    deleteOne: db.prepare(`DELETE FROM keys WHERE key = ?`),
    deleteAllStmt: db.prepare(`DELETE FROM keys`),
    markRenewalNotified: db.prepare(`UPDATE keys SET renewalNotifiedAt = ? WHERE key = ?`),
    clearRenewalNotified: db.prepare(`UPDATE keys SET renewalNotifiedAt = NULL WHERE key = ?`)
};

/**
 * Formato de cada key salva:
 * { key, discordId, hwid, createdAt, expiresAt, revoked, note, lastHwidReset }
 */

const KeyStore = {
    /**
     * Cria uma key nova. daysValid = null significa "nunca expira".
     * productId define o prefixo (ex: "1NX-...", "OUTRO-..."); sem
     * productId, usa o produto padrão (compatibilidade com instalações
     * de antes do multi-produto).
     */
    create({ daysValid = null, note = "", productId = null } = {}) {
        const ProductStore = require("./productStore");
        const product = productId ? ProductStore.get(productId) : ProductStore.ensureDefault();
        const prefix = product?.prefix || "1NX";
        const finalProductId = product?.id || null;

        let key;
        do {
            key = generateKeyString(prefix);
        } while (stmts.get.get(key));

        const now = Date.now();
        const expiresAt = daysValid ? now + daysValid * 86400000 : null;
        stmts.insert.run(key, now, expiresAt, note, finalProductId);
        return rowToEntry(stmts.get.get(key));
    },

    get(key) {
        return rowToEntry(stmts.get.get(key));
    },

    list() {
        return stmts.all.all().map(rowToEntry);
    },

    revoke(key) {
        if (!stmts.get.get(key)) return false;
        stmts.revoke.run(key);
        return true;
    },

    /** Vincula a key a um usuário do Discord (comando /key redeem). */
    redeem(key, discordId) {
        const entry = rowToEntry(stmts.get.get(key));
        if (!entry) return { ok: false, reason: "not_found" };
        if (entry.revoked) return { ok: false, reason: "revoked" };
        if (entry.discordId && entry.discordId !== discordId) {
            return { ok: false, reason: "already_claimed" };
        }
        stmts.setDiscordId.run(discordId, key);
        return { ok: true, entry: rowToEntry(stmts.get.get(key)) };
    },

    /**
     * Estende a validade de uma key (renovação). Se ela já tiver expirado
     * ou nunca tiver expirado, conta os dias a partir de agora; senão,
     * soma em cima da data de expiração atual.
     */
    extend(key, days) {
        const entry = rowToEntry(stmts.get.get(key));
        if (!entry) return { ok: false, reason: "not_found" };

        const base = entry.expiresAt && entry.expiresAt > Date.now() ? entry.expiresAt : Date.now();
        const newExpiry = base + days * 86400000;
        stmts.setExpiresAt.run(newExpiry, key);
        stmts.clearRenewalNotified.run(key);
        return { ok: true, entry: rowToEntry(stmts.get.get(key)) };
    },

    /**
     * Remove as keys revogadas ou expiradas há mais de `olderThanDays`
     * dias. Retorna a lista das keys removidas.
     */
    purge(olderThanDays = 30) {
        const toRemove = this.previewPurge(olderThanDays);
        for (const k of toRemove) stmts.deleteOne.run(k);
        return toRemove;
    },

    /** Mesma seleção do purge(), mas sem apagar — pra tela de confirmação. */
    previewPurge(olderThanDays = 30) {
        const cutoff = Date.now() - olderThanDays * 86400000;
        return this.list()
            .filter(e => (e.expiresAt && e.expiresAt < cutoff) || (e.revoked && e.createdAt < cutoff))
            .map(e => e.key);
    },

    /** Apaga TODAS as keys, sem exceção. Sem volta. */
    deleteAll() {
        const removed = this.list().map(e => e.key);
        stmts.deleteAllStmt.run();
        return removed;
    },

    /** Quanto tempo falta (em ms) até poder resetar de novo. 0 = pode resetar já. */
    cooldownRemaining(key, cooldownHours) {
        const entry = rowToEntry(stmts.get.get(key));
        if (!entry || !entry.lastHwidReset || !cooldownHours) return 0;
        const elapsed = Date.now() - entry.lastHwidReset;
        const total = cooldownHours * 3600000;
        return Math.max(0, total - elapsed);
    },

    /** Reseta o HWID de uma key (comando /key resethwid). */
    resetHwid(key) {
        if (!stmts.get.get(key)) return false;
        stmts.resetHwidStmt.run(Date.now(), key);
        return true;
    },

    /** Marca que já avisamos essa key sobre vencimento próximo (evita espamar). */
    markRenewalNotified(key) {
        if (!stmts.get.get(key)) return false;
        stmts.markRenewalNotified.run(Date.now(), key);
        return true;
    },

    /**
     * Valida uma key vinda do jogo (usado pela API HTTP).
     * Se a key não tiver HWID ainda, trava no primeiro HWID que aparecer.
     */
    validate(key, hwid) {
        const entry = rowToEntry(stmts.get.get(key));

        if (!entry) return { valid: false, reason: "not_found" };
        if (entry.revoked) return { valid: false, reason: "revoked" };
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            return { valid: false, reason: "expired" };
        }
        if (!entry.hwid && hwid) {
            stmts.setHwid.run(hwid, key);
        } else if (entry.hwid && hwid && entry.hwid !== hwid) {
            return { valid: false, reason: "hwid_mismatch" };
        }

        return { valid: true, entry };
    }
};

module.exports = KeyStore;
