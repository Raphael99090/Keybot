const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { dbPath } = require("./config");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
    CREATE TABLE IF NOT EXISTS keys (
        key TEXT PRIMARY KEY,
        discordId TEXT,
        hwid TEXT,
        createdAt INTEGER NOT NULL,
        expiresAt INTEGER,
        revoked INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        lastHwidReset INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resetcodes (
        code TEXT PRIMARY KEY,
        used INTEGER NOT NULL DEFAULT 0,
        usedOnKey TEXT,
        usedBy TEXT,
        usedAt INTEGER,
        createdAt INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS trials (
        discordId TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        claimedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        discordId TEXT NOT NULL,
        plan TEXT NOT NULL,
        channelId TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        createdAt INTEGER NOT NULL,
        decidedAt INTEGER,
        decidedBy TEXT,
        generatedKey TEXT,
        couponCode TEXT
    );

    CREATE TABLE IF NOT EXISTS coupons (
        code TEXT PRIMARY KEY,
        discountText TEXT NOT NULL DEFAULT '',
        maxUses INTEGER,
        uses INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId TEXT NOT NULL,
        discordId TEXT NOT NULL,
        stars INTEGER NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
        id TEXT PRIMARY KEY,
        discordId TEXT NOT NULL,
        channelId TEXT,
        subject TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        createdAt INTEGER NOT NULL,
        lastActivityAt INTEGER,
        closedAt INTEGER,
        closedBy TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prefix TEXT NOT NULL DEFAULT '1NX',
        description TEXT NOT NULL DEFAULT '',
        imageUrl TEXT NOT NULL DEFAULT '',
        termsText TEXT NOT NULL DEFAULT '',
        plans TEXT NOT NULL DEFAULT '{}',
        active INTEGER NOT NULL DEFAULT 1,
        createdAt INTEGER NOT NULL
    );
`);

// ALTER TABLE ADD COLUMN falha se a coluna já existir — como essas
// tabelas já existiam antes dessas colunas serem criadas, protege com
// try/catch em vez de exigir apagar o banco de quem já tinha dados.
for (const stmt of [
    `ALTER TABLE orders ADD COLUMN lastActivityAt INTEGER`,
    `ALTER TABLE orders ADD COLUMN amountPaid REAL`,
    `ALTER TABLE keys ADD COLUMN renewalNotifiedAt INTEGER`,
    `ALTER TABLE support_tickets ADD COLUMN type TEXT`,
    `ALTER TABLE keys ADD COLUMN productId TEXT`,
    `ALTER TABLE orders ADD COLUMN productId TEXT`
]) {
    try {
        db.exec(stmt);
    } catch {
        // coluna já existe, segue o jogo
    }
}

module.exports = db;
