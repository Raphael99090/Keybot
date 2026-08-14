const express = require("express");
const fs = require("fs");
const path = require("path");
const KeyStore = require("../../store/keyStore");
const OrderStore = require("../../store/orderStore");
const SettingsStore = require("../../store/settingsStore");
const ResetCodeStore = require("../../store/resetCodeStore");
const CouponStore = require("../../store/couponStore");
const ReviewStore = require("../../store/reviewStore");
const ProductStore = require("../../store/productStore");
const SupportStore = require("../../store/supportStore");
const { dashboardPassword } = require("../../config");

const router = express.Router();

// Toda rota /dashboard/* passa por aqui primeiro. Sem senha configurada
// no .env, o dashboard inteiro fica desativado (nunca aberto por padrão).
router.use((req, res, next) => {
    if (!dashboardPassword) {
        return res.status(503).json({ error: "dashboard_disabled", message: "DASHBOARD_PASSWORD não configurado no .env do bot." });
    }
    const provided = req.header("x-dashboard-password") || req.query.password;
    if (provided !== dashboardPassword) {
        return res.status(401).json({ error: "unauthorized" });
    }
    next();
});

/** Confirma a senha sem devolver nenhum dado — usado só pra validar o login. */
router.get("/ping", (req, res) => res.json({ ok: true }));

router.get("/stats", (req, res) => {
    const keys = KeyStore.list();
    const now = Date.now();
    const orders = OrderStore.list();
    const confirmados = orders.filter(o => o.status === "confirmed");
    const { PLAN_LABELS } = SettingsStore;

    const porPlano = {};
    for (const plan of Object.keys(PLAN_LABELS)) {
        porPlano[plan] = { label: PLAN_LABELS[plan], vendas: confirmados.filter(o => o.plan === plan).length };
    }

    const porProduto = ProductStore.list().map(p => ({
        id: p.id,
        nome: p.name,
        vendas: confirmados.filter(o => o.productId === p.id).length
    }));

    const ticketsSuporte = SupportStore.list();

    res.json({
        keys: {
            total: keys.length,
            ativas: keys.filter(k => !k.revoked && (!k.expiresAt || k.expiresAt > now)).length,
            expiradas: keys.filter(k => !k.revoked && k.expiresAt && k.expiresAt <= now).length,
            revogadas: keys.filter(k => k.revoked).length,
            resgatadas: keys.filter(k => k.discordId).length,
            trials: keys.filter(k => k.note?.startsWith("trial")).length
        },
        resetCodes: {
            gerados: ResetCodeStore.list().length,
            usados: ResetCodeStore.list().filter(c => c.used).length
        },
        vendas: {
            porPlano,
            porProduto,
            totalConfirmadas: confirmados.length,
            faturamento: confirmados.reduce((sum, o) => sum + (o.amountPaid || 0), 0)
        },
        suporte: {
            total: ticketsSuporte.length,
            abertos: ticketsSuporte.filter(t => t.status === "open").length,
            fechados: ticketsSuporte.filter(t => t.status === "closed").length
        },
        avaliacoes: {
            media: ReviewStore.averageStars(),
            total: ReviewStore.list().length
        }
    });
});

router.get("/keys", (req, res) => {
    res.json(KeyStore.list().sort((a, b) => b.createdAt - a.createdAt));
});

router.get("/orders", (req, res) => {
    res.json(OrderStore.list().sort((a, b) => b.createdAt - a.createdAt));
});

router.get("/coupons", (req, res) => {
    res.json(CouponStore.list());
});

router.get("/reviews", (req, res) => {
    res.json(ReviewStore.list().sort((a, b) => b.createdAt - a.createdAt));
});

router.get("/products", (req, res) => {
    res.json(ProductStore.list());
});

router.get("/support", (req, res) => {
    res.json(SupportStore.list().sort((a, b) => b.createdAt - a.createdAt));
});

/** Últimas N linhas do log em arquivo (padrão 200, máx 1000). */
router.get("/logs", (req, res) => {
    const lines = Math.min(Number(req.query.lines) || 200, 1000);
    const logPath = path.join(__dirname, "..", "..", "..", "data", "bot.log");

    if (!fs.existsSync(logPath)) {
        return res.json({ lines: [] });
    }

    const content = fs.readFileSync(logPath, "utf-8");
    const all = content.split("\n").filter(Boolean);
    res.json({ lines: all.slice(-lines) });
});

module.exports = router;
