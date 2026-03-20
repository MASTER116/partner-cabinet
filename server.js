const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Database =====
const db = new Database(path.join(__dirname, 'partner.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===== Init tables =====
db.exec(`
CREATE TABLE IF NOT EXISTS levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    min_clients INTEGER DEFAULT 0,
    min_amount REAL DEFAULT 0,
    reward_type TEXT DEFAULT 'percent' CHECK(reward_type IN ('percent','fixed')),
    reward_value REAL DEFAULT 0,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE,
    full_name TEXT DEFAULT '',
    city TEXT DEFAULT '',
    level_id INTEGER DEFAULT 1,
    referral_code TEXT NOT NULL UNIQUE,
    promo_code TEXT NOT NULL DEFAULT '',
    payment_details TEXT DEFAULT '',
    tg_chat_id TEXT DEFAULT '',
    max_chat_id TEXT DEFAULT '',
    balance_accrued REAL DEFAULT 0,
    balance_available REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (level_id) REFERENCES levels(id)
);

CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    client_name TEXT DEFAULT '',
    client_phone TEXT DEFAULT '',
    status TEXT DEFAULT 'lead' CHECK(status IN ('lead','in_progress','contract','paid')),
    contract_amount REAL DEFAULT 0,
    bonus_amount REAL DEFAULT 0,
    source TEXT DEFAULT 'link' CHECK(source IN ('link','promo')),
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (partner_id) REFERENCES partners(id)
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('accrual','payout','manual_add','manual_subtract')),
    amount REAL DEFAULT 0,
    referral_id INTEGER,
    comment TEXT DEFAULT '',
    created_by TEXT DEFAULT 'system',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (partner_id) REFERENCES partners(id)
);

CREATE TABLE IF NOT EXISTS payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    amount REAL DEFAULT 0,
    payment_method TEXT DEFAULT '',
    payment_details TEXT DEFAULT '',
    status TEXT DEFAULT 'new' CHECK(status IN ('new','processing','paid','rejected')),
    admin_comment TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    processed_at TEXT,
    FOREIGN KEY (partner_id) REFERENCES partners(id)
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    title TEXT DEFAULT '',
    file_path TEXT DEFAULT '',
    type TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (partner_id) REFERENCES partners(id)
);

CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    used INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
);
`);

// ===== Seed defaults =====
const levelCount = db.prepare('SELECT COUNT(*) as c FROM levels').get().c;
if (levelCount === 0) {
    const ins = db.prepare('INSERT INTO levels (name,slug,min_clients,min_amount,reward_type,reward_value,sort_order) VALUES (?,?,?,?,?,?,?)');
    ins.run('Бронза', 'bronze', 0, 0, 'percent', 5, 1);
    ins.run('Серебро', 'silver', 5, 100000, 'percent', 7, 2);
    ins.run('Золото', 'gold', 15, 500000, 'percent', 10, 3);
}

const settingsCount = db.prepare('SELECT COUNT(*) as c FROM settings').get().c;
if (settingsCount === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
    ins.run('cookie_lifetime_days', '30');
    ins.run('min_payout_amount', '1000');
    ins.run('bonus_trigger_status', 'paid');
    ins.run('program_description', 'Приглашайте друзей и получайте вознаграждение за каждого оплатившего клиента!');
    ins.run('telegram_bot_token', '');
    ins.run('telegram_bot_username', '');
    ins.run('max_bot_token', '');
}

// Seed demo data if empty
const partnerCount = db.prepare('SELECT COUNT(*) as c FROM partners').get().c;
if (partnerCount === 0) {
    seedDemoData();
}

function seedDemoData() {
    const insP = db.prepare(`INSERT INTO partners (phone,full_name,city,level_id,referral_code,promo_code,payment_details,tg_chat_id,balance_accrued,balance_available,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    insP.run('+79001234567', 'Иванов Иван Иванович', 'Москва', 1, 'a7f2b9c1e3d4', 'BANK23', '4276 **** **** 1234', '', 47500, 32500, '2026-01-15 10:00:00');
    insP.run('+79009876543', 'Петрова Мария Сергеевна', 'Санкт-Петербург', 2, 'b8e3c2d4f5a6', 'REF777', '5536 **** **** 5678', '', 125000, 85000, '2025-12-01 09:00:00');

    const insR = db.prepare(`INSERT INTO referrals (partner_id,client_name,client_phone,status,contract_amount,bonus_amount,source,created_at) VALUES (?,?,?,?,?,?,?,?)`);
    insR.run(1, 'Петров А.С.', '+79111114521', 'paid', 150000, 7500, 'link', '2026-03-15 12:00:00');
    insR.run(1, 'Сидорова М.И.', '+79222228834', 'paid', 200000, 10000, 'promo', '2026-03-12 10:00:00');
    insR.run(1, 'Козлов Д.В.', '+79333332210', 'contract', 180000, 0, 'link', '2026-03-10 09:00:00');
    insR.run(1, 'Новикова Е.А.', '+79444446677', 'paid', 250000, 12500, 'link', '2026-03-08 15:00:00');
    insR.run(1, 'Фёдоров И.П.', '+79555553301', 'in_progress', 0, 0, 'promo', '2026-03-05 11:00:00');
    insR.run(1, 'Морозова Т.К.', '+79666669988', 'paid', 350000, 17500, 'link', '2026-03-01 10:00:00');
    insR.run(1, 'Волков Р.С.', '+79777771155', 'lead', 0, 0, 'link', '2026-02-25 14:00:00');
    insR.run(2, 'Кузнецов А.А.', '+79888880011', 'paid', 300000, 21000, 'link', '2026-03-14 10:00:00');
    insR.run(2, 'Лебедева О.В.', '+79999990022', 'paid', 180000, 12600, 'promo', '2026-03-10 09:00:00');

    const insT = db.prepare(`INSERT INTO transactions (partner_id,type,amount,comment,created_at) VALUES (?,?,?,?,?)`);
    insT.run(1, 'accrual', 7500, 'Бонус за клиента Петров А.С.', '2026-03-15 14:32:00');
    insT.run(1, 'accrual', 10000, 'Бонус за клиента Сидорова М.И.', '2026-03-12 10:15:00');
    insT.run(1, 'payout', 15000, 'Выплата #1 на карту', '2026-03-10 09:00:00');
    insT.run(1, 'accrual', 12500, 'Бонус за клиента Новикова Е.А.', '2026-03-08 16:45:00');
    insT.run(1, 'accrual', 17500, 'Бонус за клиента Морозова Т.К.', '2026-03-01 11:20:00');

    const insPy = db.prepare(`INSERT INTO payouts (partner_id,amount,payment_method,payment_details,status,created_at,processed_at) VALUES (?,?,?,?,?,?,?)`);
    insPy.run(1, 15000, 'card', '4276 **** **** 1234', 'paid', '2026-03-10 08:00:00', '2026-03-11 10:00:00');
}

// ===== Helpers =====
function genCode(len) { return crypto.randomBytes(len).toString('hex').slice(0, len); }
function genPromo() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(chars.length)];
    return code;
}
function getSetting(key) { return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value || ''; }
function fmt(n) { return Number(n || 0).toLocaleString('ru-RU'); }

const statusLabels = { lead: 'Лид', in_progress: 'В работе', contract: 'Заключён договор', paid: 'Оплачен' };
const payoutLabels = { new: 'Новая', processing: 'В обработке', paid: 'Выплачено', rejected: 'Отклонена' };

// ===== Sessions (in-memory for demo) =====
const sessions = new Map();

function createSession(partnerId) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { partnerId, created: Date.now() });
    return token;
}

function getSession(req) {
    const token = req.headers['x-token'] || req.query.token || '';
    return sessions.get(token);
}

function requireAuth(req, res, next) {
    const sess = getSession(req);
    if (!sess) return res.status(401).json({ error: 'Не авторизован' });
    req.partnerId = sess.partnerId;
    next();
}

// ===== Middleware =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS for dev
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Token');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ===== Health check =====
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ===== AUTH API =====

// POST /api/auth/request-otp
app.post('/api/auth/request-otp', (req, res) => {
    let { phone } = req.body;
    phone = (phone || '').replace(/[^\d+]/g, '');
    if (phone.length < 11) return res.json({ ok: false, error: 'Введите корректный номер телефона' });

    // Rate limit: max 5 per 15 min per phone
    const recent = db.prepare(`SELECT COUNT(*) as c FROM otp_codes WHERE phone=? AND expires_at > datetime('now','localtime') AND used=0`).get(phone);
    if (recent.c >= 5) return res.json({ ok: false, error: 'Слишком много запросов. Подождите 15 минут.' });

    const code = '123456'; // Demo: fixed code
    db.prepare(`INSERT INTO otp_codes (phone,code,expires_at) VALUES (?,?,datetime('now','localtime','+5 minutes'))`).run(phone, code);

    const partner = db.prepare('SELECT id,tg_chat_id,max_chat_id FROM partners WHERE phone=?').get(phone);
    const isNew = !partner;
    let channel = 'demo';

    if (partner?.tg_chat_id) channel = 'telegram';
    else if (partner?.max_chat_id) channel = 'max';

    res.json({
        ok: true,
        channel,
        isNew,
        message: `Код отправлен (демо: 123456)`,
        hint: '123456'
    });
});

// POST /api/auth/verify-otp
app.post('/api/auth/verify-otp', (req, res) => {
    let { phone, code } = req.body;
    phone = (phone || '').replace(/[^\d+]/g, '');

    const otp = db.prepare('SELECT * FROM otp_codes WHERE phone=? AND used=0 ORDER BY id DESC LIMIT 1').get(phone);
    if (!otp) return res.json({ ok: false, error: 'Сначала запросите код' });

    if (otp.attempts >= 5) {
        db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(otp.id);
        return res.json({ ok: false, error: 'Слишком много попыток' });
    }

    db.prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?').run(otp.id);

    if (otp.code !== code) return res.json({ ok: false, error: 'Неверный код' });

    db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(otp.id);

    const partner = db.prepare('SELECT * FROM partners WHERE phone=?').get(phone);
    if (partner) {
        const token = createSession(partner.id);
        return res.json({ ok: true, action: 'login', token, partnerId: partner.id });
    }

    res.json({ ok: true, action: 'register', verifiedPhone: phone });
});

// POST /api/auth/register
app.post('/api/auth/register', (req, res) => {
    const { phone, full_name } = req.body;
    if (!phone || !full_name) return res.json({ ok: false, error: 'Заполните все поля' });

    const exists = db.prepare('SELECT id FROM partners WHERE phone=?').get(phone);
    if (exists) return res.json({ ok: false, error: 'Аккаунт с этим номером уже существует' });

    const refCode = genCode(12);
    const promoCode = genPromo();
    const defaultLevel = db.prepare('SELECT id FROM levels ORDER BY sort_order ASC LIMIT 1').get();

    const result = db.prepare(`INSERT INTO partners (phone,full_name,level_id,referral_code,promo_code) VALUES (?,?,?,?,?)`)
        .run(phone, full_name, defaultLevel?.id || 1, refCode, promoCode);

    const token = createSession(result.lastInsertRowid);
    res.json({ ok: true, action: 'login', token, partnerId: result.lastInsertRowid });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
    const token = req.headers['x-token'] || '';
    sessions.delete(token);
    res.json({ ok: true });
});

// ===== PARTNER API =====

// GET /api/partner/dashboard
app.get('/api/partner/dashboard', requireAuth, (req, res) => {
    const p = db.prepare(`
        SELECT p.*, l.name as level_name, l.slug as level_slug, l.reward_type, l.reward_value
        FROM partners p LEFT JOIN levels l ON p.level_id = l.id WHERE p.id=?
    `).get(req.partnerId);

    const totalClients = db.prepare('SELECT COUNT(*) as c FROM referrals WHERE partner_id=?').get(req.partnerId).c;
    const paidClients = db.prepare(`SELECT COUNT(*) as c FROM referrals WHERE partner_id=? AND status='paid'`).get(req.partnerId).c;

    // Next level
    const nextLevel = db.prepare('SELECT * FROM levels WHERE sort_order > (SELECT sort_order FROM levels WHERE id=?) ORDER BY sort_order ASC LIMIT 1').get(p.level_id);

    res.json({
        ok: true,
        partner: {
            id: p.id,
            full_name: p.full_name,
            phone: p.phone,
            city: p.city,
            level_name: p.level_name || 'Бронза',
            level_slug: p.level_slug || 'bronze',
            reward_type: p.reward_type,
            reward_value: p.reward_value,
            balance_accrued: p.balance_accrued,
            balance_available: p.balance_available,
            referral_code: p.referral_code,
            promo_code: p.promo_code,
            referral_url: `${process.env.BASE_URL || ('http://localhost:' + PORT)}/?ref=${p.referral_code}`,
            total_clients: totalClients,
            paid_clients: paidClients,
            tg_linked: !!p.tg_chat_id,
            max_linked: !!p.max_chat_id,
            payment_details: p.payment_details,
            created_at: p.created_at,
        },
        next_level: nextLevel ? {
            name: nextLevel.name,
            min_clients: nextLevel.min_clients,
            min_amount: nextLevel.min_amount,
        } : null,
    });
});

// GET /api/partner/referrals
app.get('/api/partner/referrals', requireAuth, (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = 20;
    const offset = (page - 1) * perPage;

    const referrals = db.prepare('SELECT * FROM referrals WHERE partner_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(req.partnerId, perPage, offset);

    const total = db.prepare('SELECT COUNT(*) as c FROM referrals WHERE partner_id=?').get(req.partnerId).c;

    res.json({
        ok: true,
        referrals: referrals.map(r => ({
            ...r,
            status_label: statusLabels[r.status] || r.status,
            phone_masked: r.client_phone.slice(0, 4) + '***' + r.client_phone.slice(-4),
        })),
        total,
        pages: Math.ceil(total / perPage),
        page,
    });
});

// GET /api/partner/transactions
app.get('/api/partner/transactions', requireAuth, (req, res) => {
    const txs = db.prepare('SELECT * FROM transactions WHERE partner_id=? ORDER BY created_at DESC').all(req.partnerId);
    const typeLabels = { accrual: 'Начисление', payout: 'Выплата', manual_add: 'Ручное начисление', manual_subtract: 'Ручное списание' };

    res.json({
        ok: true,
        transactions: txs.map(t => ({
            ...t,
            type_label: typeLabels[t.type] || t.type,
            is_positive: ['accrual', 'manual_add'].includes(t.type),
        })),
    });
});

// GET /api/partner/payouts
app.get('/api/partner/payouts', requireAuth, (req, res) => {
    const payouts = db.prepare('SELECT * FROM payouts WHERE partner_id=? ORDER BY created_at DESC').all(req.partnerId);
    res.json({
        ok: true,
        payouts: payouts.map(p => ({ ...p, status_label: payoutLabels[p.status] || p.status })),
    });
});

// POST /api/partner/request-payout
app.post('/api/partner/request-payout', requireAuth, (req, res) => {
    const { amount, payment_method, payment_details } = req.body;
    const p = db.prepare('SELECT * FROM partners WHERE id=?').get(req.partnerId);
    const minPayout = parseFloat(getSetting('min_payout_amount')) || 1000;

    if (!amount || amount < minPayout) return res.json({ ok: false, error: `Минимальная сумма: ${fmt(minPayout)} ₽` });
    if (amount > p.balance_available) return res.json({ ok: false, error: 'Недостаточно средств' });
    if (!payment_method) return res.json({ ok: false, error: 'Выберите способ выплаты' });

    const pending = db.prepare(`SELECT COUNT(*) as c FROM payouts WHERE partner_id=? AND status IN ('new','processing')`).get(req.partnerId).c;
    if (pending) return res.json({ ok: false, error: 'У вас уже есть необработанная заявка' });

    db.prepare('INSERT INTO payouts (partner_id,amount,payment_method,payment_details) VALUES (?,?,?,?)')
        .run(req.partnerId, amount, payment_method, payment_details || p.payment_details);

    res.json({ ok: true, message: 'Заявка создана!' });
});

// POST /api/partner/update-profile
app.post('/api/partner/update-profile', requireAuth, (req, res) => {
    const { full_name, city, payment_details } = req.body;
    if (!full_name) return res.json({ ok: false, error: 'Введите ФИО' });

    db.prepare('UPDATE partners SET full_name=?, city=?, payment_details=? WHERE id=?')
        .run(full_name, city || '', payment_details || '', req.partnerId);

    res.json({ ok: true, message: 'Профиль сохранён' });
});

// POST /api/partner/link-telegram (demo)
app.post('/api/partner/link-telegram', requireAuth, (req, res) => {
    const code = genCode(16);
    // In demo just simulate
    res.json({
        ok: true,
        link: `https://t.me/BankrotPartnerBot?start=link_${code}`,
        code,
    });
});

// POST /api/partner/confirm-telegram (demo: simulate linking)
app.post('/api/partner/confirm-telegram', requireAuth, (req, res) => {
    db.prepare('UPDATE partners SET tg_chat_id=? WHERE id=?').run('demo_' + Date.now(), req.partnerId);
    res.json({ ok: true, message: 'Telegram привязан!' });
});

// ===== ADMIN API =====

// GET /api/admin/partners
app.get('/api/admin/partners', (req, res) => {
    const search = req.query.search || '';
    let partners;
    if (search) {
        const like = `%${search}%`;
        partners = db.prepare(`
            SELECT p.*, l.name as level_name,
            (SELECT COUNT(*) FROM referrals r WHERE r.partner_id=p.id) as total_clients,
            (SELECT COUNT(*) FROM referrals r WHERE r.partner_id=p.id AND r.status='paid') as paid_clients
            FROM partners p LEFT JOIN levels l ON p.level_id=l.id
            WHERE p.full_name LIKE ? OR p.phone LIKE ?
            ORDER BY p.created_at DESC
        `).all(like, like);
    } else {
        partners = db.prepare(`
            SELECT p.*, l.name as level_name,
            (SELECT COUNT(*) FROM referrals r WHERE r.partner_id=p.id) as total_clients,
            (SELECT COUNT(*) FROM referrals r WHERE r.partner_id=p.id AND r.status='paid') as paid_clients
            FROM partners p LEFT JOIN levels l ON p.level_id=l.id
            ORDER BY p.created_at DESC
        `).all();
    }
    res.json({ ok: true, partners });
});

// GET /api/admin/partner/:id
app.get('/api/admin/partner/:id', (req, res) => {
    const partner = db.prepare('SELECT p.*, l.name as level_name FROM partners p LEFT JOIN levels l ON p.level_id=l.id WHERE p.id=?').get(req.params.id);
    const levels = db.prepare('SELECT * FROM levels ORDER BY sort_order').all();
    res.json({ ok: true, partner, levels });
});

// POST /api/admin/partner/:id/level
app.post('/api/admin/partner/:id/level', (req, res) => {
    db.prepare('UPDATE partners SET level_id=? WHERE id=?').run(req.body.level_id, req.params.id);
    res.json({ ok: true });
});

// POST /api/admin/partner/:id/adjust
app.post('/api/admin/partner/:id/adjust', (req, res) => {
    const { amount, comment } = req.body;
    const a = parseFloat(amount);
    if (!a) return res.json({ ok: false, error: 'Введите сумму' });

    const type = a >= 0 ? 'manual_add' : 'manual_subtract';
    db.prepare('INSERT INTO transactions (partner_id,type,amount,comment,created_by) VALUES (?,?,?,?,?)')
        .run(req.params.id, type, Math.abs(a), comment || '', 'admin');

    db.prepare('UPDATE partners SET balance_accrued=balance_accrued+?, balance_available=balance_available+? WHERE id=?')
        .run(a, a, req.params.id);

    res.json({ ok: true });
});

// GET /api/admin/referrals
app.get('/api/admin/referrals', (req, res) => {
    const referrals = db.prepare(`
        SELECT r.*, p.full_name as partner_name, p.phone as partner_phone
        FROM referrals r LEFT JOIN partners p ON r.partner_id=p.id
        ORDER BY r.created_at DESC
    `).all();
    res.json({ ok: true, referrals: referrals.map(r => ({ ...r, status_label: statusLabels[r.status] })) });
});

// POST /api/admin/referral/:id
app.post('/api/admin/referral/:id', (req, res) => {
    const { status, contract_amount } = req.body;
    const allowed = ['lead', 'in_progress', 'contract', 'paid'];
    if (!allowed.includes(status)) return res.json({ ok: false, error: 'Недопустимый статус' });

    db.prepare(`UPDATE referrals SET status=?, contract_amount=?, updated_at=datetime('now','localtime') WHERE id=?`)
        .run(status, parseFloat(contract_amount) || 0, req.params.id);

    // Auto-accrue bonus
    const trigger = getSetting('bonus_trigger_status') || 'paid';
    if (status === trigger) {
        const ref = db.prepare('SELECT * FROM referrals WHERE id=?').get(req.params.id);
        if (ref && ref.bonus_amount === 0 && ref.contract_amount > 0) {
            const partner = db.prepare('SELECT p.*, l.reward_type, l.reward_value FROM partners p LEFT JOIN levels l ON p.level_id=l.id WHERE p.id=?').get(ref.partner_id);
            let bonus = 0;
            if (partner.reward_type === 'percent') bonus = ref.contract_amount * (partner.reward_value / 100);
            else bonus = partner.reward_value;

            if (bonus > 0) {
                db.prepare('UPDATE referrals SET bonus_amount=? WHERE id=?').run(bonus, ref.id);
                db.prepare('INSERT INTO transactions (partner_id,type,amount,referral_id,comment) VALUES (?,?,?,?,?)')
                    .run(partner.id, 'accrual', bonus, ref.id, `Бонус за клиента ${ref.client_name || '#' + ref.id}`);
                db.prepare('UPDATE partners SET balance_accrued=balance_accrued+?, balance_available=balance_available+? WHERE id=?')
                    .run(bonus, bonus, partner.id);

                // Recalculate level
                const stats = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(contract_amount),0) as amt FROM referrals WHERE partner_id=? AND status='paid'`).get(partner.id);
                const newLevel = db.prepare('SELECT id FROM levels WHERE min_clients<=? AND min_amount<=? ORDER BY sort_order DESC LIMIT 1').get(stats.cnt, stats.amt);
                if (newLevel) db.prepare('UPDATE partners SET level_id=? WHERE id=?').run(newLevel.id, partner.id);
            }
        }
    }

    res.json({ ok: true });
});

// GET /api/admin/payouts
app.get('/api/admin/payouts', (req, res) => {
    const payouts = db.prepare(`
        SELECT py.*, p.full_name as partner_name, p.phone as partner_phone
        FROM payouts py LEFT JOIN partners p ON py.partner_id=p.id
        ORDER BY py.created_at DESC
    `).all();
    res.json({ ok: true, payouts: payouts.map(p => ({ ...p, status_label: payoutLabels[p.status] })) });
});

// POST /api/admin/payout/:id
app.post('/api/admin/payout/:id', (req, res) => {
    const { status, comment } = req.body;
    const payout = db.prepare('SELECT * FROM payouts WHERE id=?').get(req.params.id);
    if (!payout) return res.json({ ok: false, error: 'Не найдено' });

    db.prepare(`UPDATE payouts SET status=?, admin_comment=?, processed_at=datetime('now','localtime') WHERE id=?`)
        .run(status, comment || '', req.params.id);

    if (status === 'paid') {
        db.prepare('UPDATE partners SET balance_available=balance_available-? WHERE id=?').run(payout.amount, payout.partner_id);
        db.prepare('INSERT INTO transactions (partner_id,type,amount,comment,created_by) VALUES (?,?,?,?,?)')
            .run(payout.partner_id, 'payout', payout.amount, 'Выплата #' + payout.id, 'admin');
    }

    res.json({ ok: true });
});

// GET /api/admin/settings
app.get('/api/admin/settings', (req, res) => {
    const settings = {};
    db.prepare('SELECT * FROM settings').all().forEach(r => settings[r.key] = r.value);
    const levels = db.prepare('SELECT * FROM levels ORDER BY sort_order').all();
    res.json({ ok: true, settings, levels });
});

// POST /api/admin/settings
app.post('/api/admin/settings', (req, res) => {
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)');
    Object.entries(req.body).forEach(([k, v]) => upsert.run(k, String(v)));
    res.json({ ok: true });
});

// POST /api/admin/levels
app.post('/api/admin/levels', (req, res) => {
    const { levels } = req.body;
    if (!Array.isArray(levels)) return res.json({ ok: false, error: 'Invalid data' });

    db.pragma('foreign_keys = OFF');
    db.prepare('DELETE FROM levels').run();
    const ins = db.prepare('INSERT INTO levels (name,slug,min_clients,min_amount,reward_type,reward_value,sort_order) VALUES (?,?,?,?,?,?,?)');
    levels.forEach((l, i) => {
        const slug = l.name.toLowerCase().replace(/[^a-zа-я0-9]/gi, '_');
        ins.run(l.name, slug, l.min_clients || 0, l.min_amount || 0, l.reward_type || 'percent', l.reward_value || 0, i + 1);
    });
    db.pragma('foreign_keys = ON');
    res.json({ ok: true });
});

// GET /api/admin/export/:type
app.get('/api/admin/export/:type', (req, res) => {
    const type = req.params.type;
    let csv = '';

    if (type === 'partners') {
        csv = 'ID;ФИО;Телефон;Город;Уровень;Начислено;Доступно;Клиентов;Дата\n';
        const data = db.prepare(`SELECT p.*, l.name as level_name, (SELECT COUNT(*) FROM referrals WHERE partner_id=p.id) as cnt FROM partners p LEFT JOIN levels l ON p.level_id=l.id`).all();
        data.forEach(r => csv += `${r.id};"${r.full_name}";${r.phone};"${r.city}";"${r.level_name}";${r.balance_accrued};${r.balance_available};${r.cnt};${r.created_at}\n`);
    } else if (type === 'payouts') {
        csv = 'ID;Партнёр;Сумма;Способ;Статус;Дата;Обработано\n';
        const data = db.prepare(`SELECT py.*, p.full_name FROM payouts py LEFT JOIN partners p ON py.partner_id=p.id`).all();
        data.forEach(r => csv += `${r.id};"${r.full_name}";${r.amount};"${r.payment_method}";${r.status};${r.created_at};${r.processed_at || ''}\n`);
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_${new Date().toISOString().slice(0,10)}.csv`);
    res.send('\ufeff' + csv);
});

// ===== Referral tracking =====
app.get('/', (req, res, next) => {
    if (req.query.ref) {
        // Track referral — just pass through to SPA, JS will handle cookie
    }
    next();
});

// ===== SPA fallback =====
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    if (req.method === 'GET' && req.accepts('html')) {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
    next();
});

// ===== Export for testing =====
module.exports = { app, db };

// ===== Start =====
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n  ╔══════════════════════════════════════════════╗`);
        console.log(`  ║  Партнёрский кабинет — демо-сервер запущен   ║`);
        console.log(`  ╠══════════════════════════════════════════════╣`);
        console.log(`  ║  Кабинет:  http://localhost:${PORT}             ║`);
        console.log(`  ║  Админка:  http://localhost:${PORT}/admin        ║`);
        console.log(`  ╠══════════════════════════════════════════════╣`);
        console.log(`  ║  Демо-вход: любой телефон, код 123456        ║`);
        console.log(`  ╚══════════════════════════════════════════════╝\n`);
    });
}
