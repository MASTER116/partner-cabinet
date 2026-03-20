const { describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app, db } = require('../server');

// ===== Интеграционные тесты: Админ-панель =====

describe('GET /api/admin/partners', () => {
    it('должен вернуть список партнёров', async () => {
        const res = await request(app).get('/api/admin/partners');
        assert.strictEqual(res.body.ok, true);
        assert.ok(Array.isArray(res.body.partners));
        assert.ok(res.body.partners.length > 0);

        const p = res.body.partners[0];
        assert.ok(p.full_name);
        assert.ok(p.phone);
        assert.strictEqual(typeof p.total_clients, 'number');
        assert.strictEqual(typeof p.paid_clients, 'number');
    });

    it('должен искать по имени', async () => {
        const res = await request(app).get('/api/admin/partners?search=Иванов');
        assert.strictEqual(res.body.ok, true);
        assert.ok(res.body.partners.length > 0);
        assert.ok(res.body.partners[0].full_name.includes('Иванов'));
    });

    it('должен искать по телефону', async () => {
        const res = await request(app).get('/api/admin/partners?search=79001234567');
        assert.strictEqual(res.body.ok, true);
        assert.ok(res.body.partners.length > 0);
    });

    it('должен вернуть пустой список при несуществующем поиске', async () => {
        const res = await request(app).get('/api/admin/partners?search=НЕСУЩЕСТВУЮЩИЙ12345');
        assert.strictEqual(res.body.ok, true);
        assert.strictEqual(res.body.partners.length, 0);
    });
});

describe('GET /api/admin/partner/:id', () => {
    it('должен вернуть данные партнёра и уровни', async () => {
        const res = await request(app).get('/api/admin/partner/1');
        assert.strictEqual(res.body.ok, true);
        assert.ok(res.body.partner);
        assert.ok(res.body.partner.full_name);
        assert.ok(Array.isArray(res.body.levels));
        assert.ok(res.body.levels.length >= 3); // Бронза, Серебро, Золото
    });
});

describe('POST /api/admin/partner/:id/level', () => {
    it('должен изменить уровень партнёра', async () => {
        const res = await request(app)
            .post('/api/admin/partner/1/level')
            .send({ level_id: 2 });
        assert.strictEqual(res.body.ok, true);

        const check = await request(app).get('/api/admin/partner/1');
        assert.strictEqual(check.body.partner.level_id, 2);

        // Вернуть обратно
        await request(app).post('/api/admin/partner/1/level').send({ level_id: 1 });
    });
});

describe('POST /api/admin/partner/:id/adjust', () => {
    it('должен добавить бонус', async () => {
        const before = (await request(app).get('/api/admin/partner/1')).body.partner;
        await request(app)
            .post('/api/admin/partner/1/adjust')
            .send({ amount: 500, comment: 'Тестовое начисление' });
        const after = (await request(app).get('/api/admin/partner/1')).body.partner;
        assert.strictEqual(after.balance_accrued, before.balance_accrued + 500);
    });

    it('должен списать бонус', async () => {
        const before = (await request(app).get('/api/admin/partner/1')).body.partner;
        await request(app)
            .post('/api/admin/partner/1/adjust')
            .send({ amount: -500, comment: 'Тестовое списание' });
        const after = (await request(app).get('/api/admin/partner/1')).body.partner;
        assert.strictEqual(after.balance_accrued, before.balance_accrued - 500);
    });

    it('должен отклонить нулевую сумму', async () => {
        const res = await request(app)
            .post('/api/admin/partner/1/adjust')
            .send({ amount: 0, comment: 'Нельзя' });
        assert.strictEqual(res.body.ok, false);
    });
});

describe('GET /api/admin/referrals', () => {
    it('должен вернуть список всех рефералов', async () => {
        const res = await request(app).get('/api/admin/referrals');
        assert.strictEqual(res.body.ok, true);
        assert.ok(res.body.referrals.length > 0);
        const r = res.body.referrals[0];
        assert.ok(r.partner_name);
        assert.ok(r.status_label);
    });
});

describe('POST /api/admin/referral/:id — автоначисление бонуса', () => {
    it('должен начислить бонус при смене статуса на paid', async () => {
        // Берём реферала со статусом contract (id=3 в demo)
        const refBefore = db.prepare('SELECT * FROM referrals WHERE id=3').get();
        const partnerBefore = db.prepare('SELECT * FROM partners WHERE id=?').get(refBefore.partner_id);

        const res = await request(app)
            .post('/api/admin/referral/3')
            .send({ status: 'paid', contract_amount: 180000 });
        assert.strictEqual(res.body.ok, true);

        const refAfter = db.prepare('SELECT * FROM referrals WHERE id=3').get();
        assert.strictEqual(refAfter.status, 'paid');
        assert.ok(refAfter.bonus_amount > 0, 'Бонус должен быть начислен');

        const partnerAfter = db.prepare('SELECT * FROM partners WHERE id=?').get(refBefore.partner_id);
        assert.ok(partnerAfter.balance_accrued > partnerBefore.balance_accrued, 'Баланс партнёра должен вырасти');
    });

    it('должен отклонить недопустимый статус', async () => {
        const res = await request(app)
            .post('/api/admin/referral/1')
            .send({ status: 'invalid', contract_amount: 0 });
        assert.strictEqual(res.body.ok, false);
    });
});

describe('Админ: Выплаты', () => {
    it('GET /api/admin/payouts должен вернуть список', async () => {
        const res = await request(app).get('/api/admin/payouts');
        assert.strictEqual(res.body.ok, true);
        assert.ok(Array.isArray(res.body.payouts));
    });

    it('POST /api/admin/payout/:id — обработка выплаты', async () => {
        // Создаём тестовую заявку
        db.prepare(`INSERT INTO payouts (partner_id,amount,payment_method,status) VALUES (1,2000,'card','new')`).run();
        const payout = db.prepare(`SELECT id FROM payouts WHERE status='new' ORDER BY id DESC LIMIT 1`).get();

        const res = await request(app)
            .post(`/api/admin/payout/${payout.id}`)
            .send({ status: 'paid', comment: 'Тестовая выплата' });
        assert.strictEqual(res.body.ok, true);

        const check = db.prepare('SELECT * FROM payouts WHERE id=?').get(payout.id);
        assert.strictEqual(check.status, 'paid');
        assert.ok(check.processed_at);
    });
});

describe('Админ: Настройки', () => {
    it('GET /api/admin/settings должен вернуть настройки и уровни', async () => {
        const res = await request(app).get('/api/admin/settings');
        assert.strictEqual(res.body.ok, true);
        assert.ok(res.body.settings);
        assert.ok(res.body.settings.min_payout_amount);
        assert.ok(Array.isArray(res.body.levels));
    });

    it('POST /api/admin/settings должен сохранить настройки', async () => {
        await request(app)
            .post('/api/admin/settings')
            .send({ min_payout_amount: '2000' });

        const res = await request(app).get('/api/admin/settings');
        assert.strictEqual(res.body.settings.min_payout_amount, '2000');

        // Вернуть обратно
        await request(app).post('/api/admin/settings').send({ min_payout_amount: '1000' });
    });

    it('POST /api/admin/levels должен обновить уровни', async () => {
        const levels = [
            { name: 'Бронза', min_clients: 0, min_amount: 0, reward_type: 'percent', reward_value: 5 },
            { name: 'Серебро', min_clients: 5, min_amount: 100000, reward_type: 'percent', reward_value: 7 },
            { name: 'Золото', min_clients: 15, min_amount: 500000, reward_type: 'percent', reward_value: 10 },
        ];
        const res = await request(app)
            .post('/api/admin/levels')
            .send({ levels });
        assert.strictEqual(res.body.ok, true);

        const check = await request(app).get('/api/admin/settings');
        assert.strictEqual(check.body.levels.length, 3);
    });
});

describe('Админ: Экспорт CSV', () => {
    it('GET /api/admin/export/partners должен вернуть CSV', async () => {
        const res = await request(app).get('/api/admin/export/partners');
        assert.strictEqual(res.status, 200);
        assert.ok(res.headers['content-type'].includes('text/csv'));
        assert.ok(res.text.includes('ФИО'));
    });

    it('GET /api/admin/export/payouts должен вернуть CSV', async () => {
        const res = await request(app).get('/api/admin/export/payouts');
        assert.strictEqual(res.status, 200);
        assert.ok(res.text.includes('Партнёр'));
    });
});

describe('GET /health', () => {
    it('должен вернуть статус ok', async () => {
        const res = await request(app).get('/health');
        assert.strictEqual(res.body.status, 'ok');
    });
});
