const crypto = require("crypto");
const db = require("../db");

function generateId() {
    return `ORD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function rowToEntry(row) {
    return row || null;
}

const stmts = {
    insert: db.prepare(`INSERT INTO orders (id, discordId, plan, channelId, status, createdAt, decidedAt, decidedBy, generatedKey, couponCode, lastActivityAt, productId) VALUES (?, ?, ?, ?, 'open', ?, NULL, NULL, NULL, ?, ?, ?)`),
    get: db.prepare(`SELECT * FROM orders WHERE id = ?`),
    getByChannel: db.prepare(`SELECT * FROM orders WHERE channelId = ?`),
    all: db.prepare(`SELECT * FROM orders`),
    decide: db.prepare(`UPDATE orders SET status = ?, generatedKey = ?, decidedAt = ?, decidedBy = ?, amountPaid = ? WHERE id = ?`),
    touch: db.prepare(`UPDATE orders SET lastActivityAt = ? WHERE id = ?`)
};

/**
 * Formato de cada pedido/ticket:
 * { id, discordId, plan, channelId, status, createdAt, decidedAt,
 *   decidedBy, generatedKey, couponCode, lastActivityAt, productId }
 */

const OrderStore = {
    create({ discordId, plan, channelId, couponCode = null, productId = null }) {
        let id;
        do {
            id = generateId();
        } while (stmts.get.get(id));

        const now = Date.now();
        stmts.insert.run(id, discordId, plan, channelId, now, couponCode, now, productId);
        return rowToEntry(stmts.get.get(id));
    },

    get(id) {
        return rowToEntry(stmts.get.get(id));
    },

    getByChannel(channelId) {
        return rowToEntry(stmts.getByChannel.get(channelId));
    },

    list() {
        return stmts.all.all().map(rowToEntry);
    },

    listOpen() {
        return this.list().filter(o => o.status === "open");
    },

    /** Marca que teve mensagem nova no ticket — usado pra saber se ficou inativo. */
    touchActivity(id) {
        stmts.touch.run(Date.now(), id);
    },

    confirm(id, generatedKey, adminId, amountPaid = null) {
        const entry = rowToEntry(stmts.get.get(id));
        if (!entry) return { ok: false, reason: "not_found" };
        if (entry.status !== "open") return { ok: false, reason: "already_decided" };

        stmts.decide.run("confirmed", generatedKey, Date.now(), adminId, amountPaid, id);
        return { ok: true, entry: rowToEntry(stmts.get.get(id)) };
    },

    reject(id, adminId) {
        const entry = rowToEntry(stmts.get.get(id));
        if (!entry) return { ok: false, reason: "not_found" };
        if (entry.status !== "open") return { ok: false, reason: "already_decided" };

        stmts.decide.run("rejected", null, Date.now(), adminId, null, id);
        return { ok: true, entry: rowToEntry(stmts.get.get(id)) };
    },

    /** Fechado sozinho por inatividade — não é rejeição nem confirmação. */
    expire(id) {
        const entry = rowToEntry(stmts.get.get(id));
        if (!entry) return { ok: false, reason: "not_found" };
        if (entry.status !== "open") return { ok: false, reason: "already_decided" };

        stmts.decide.run("expired", null, Date.now(), null, null, id);
        return { ok: true, entry: rowToEntry(stmts.get.get(id)) };
    }
};

module.exports = OrderStore;
