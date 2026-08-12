const crypto = require("crypto");
const db = require("../db");

function generateId() {
    return `PROD-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function rowToEntry(row) {
    if (!row) return null;
    let plans = {};
    try {
        plans = JSON.parse(row.plans || "{}");
    } catch {
        plans = {};
    }
    return { ...row, active: Boolean(row.active), plans };
}

const stmts = {
    insert: db.prepare(`INSERT INTO products (id, name, prefix, description, imageUrl, termsText, plans, active, createdAt) VALUES (?, ?, ?, '', '', '', '{}', 1, ?)`),
    get: db.prepare(`SELECT * FROM products WHERE id = ?`),
    all: db.prepare(`SELECT * FROM products`),
    update: db.prepare(`UPDATE products SET name = ?, prefix = ?, description = ?, imageUrl = ?, termsText = ?, plans = ?, active = ? WHERE id = ?`),
    deleteOne: db.prepare(`DELETE FROM products WHERE id = ?`)
};

/**
 * Formato de cada produto:
 * { id, name, prefix, description, imageUrl, termsText,
 *   plans: { day, week, month, lifetime } (preços, texto livre),
 *   active, createdAt }
 */
const ProductStore = {
    create({ name, prefix }) {
        let id;
        do {
            id = generateId();
        } while (stmts.get.get(id));

        const safePrefix = (prefix || "1NX").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "1NX";
        stmts.insert.run(id, name, safePrefix, Date.now());
        return rowToEntry(stmts.get.get(id));
    },

    get(id) {
        return rowToEntry(stmts.get.get(id));
    },

    list() {
        return stmts.all.all().map(rowToEntry);
    },

    listActive() {
        return this.list().filter(p => p.active);
    },

    update(id, fields) {
        const entry = this.get(id);
        if (!entry) return null;
        const merged = { ...entry, ...fields };
        stmts.update.run(
            merged.name,
            merged.prefix,
            merged.description,
            merged.imageUrl,
            merged.termsText,
            JSON.stringify(merged.plans),
            merged.active ? 1 : 0,
            id
        );
        return this.get(id);
    },

    setPlanPrice(id, plan, price) {
        const entry = this.get(id);
        if (!entry) return null;
        return this.update(id, { plans: { ...entry.plans, [plan]: price } });
    },

    delete(id) {
        stmts.deleteOne.run(id);
        return true;
    },

    /**
     * Garante que sempre exista pelo menos 1 produto — instalações que
     * já existiam antes do multi-produto ganham automaticamente um
     * produto padrão "1NXITER HUB" com prefixo 1NX na primeira vez que
     * o bot sobe com essa versão, sem precisar de nenhuma ação manual.
     */
    ensureDefault() {
        const all = this.list();
        if (all.length > 0) return all[0];
        return this.create({ name: "1NXITER HUB", prefix: "1NX" });
    }
};

module.exports = ProductStore;
