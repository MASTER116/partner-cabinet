const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app, db } = require('../server');

// ===== Helper: получить токен =====
async function getToken(phone = '+79001234567') {
    await request(app).post('/api/auth/request-otp').send({ phone });
    const res = await request(app).post('/api/auth/verify-otp').send({ phone, code: '123456' });
    return res.body.token;
}

// ===== Интеграционные тесты: Кабинет партнёра =====

describe('GET /api/partner/dashboard', () => {
    it('должен вернуть 401 без токена', async () => {
        const res = await request(app).get('/api/partner/dashboard');
        assert.strictEqual(res.status, 401);
    });

    it('должен вернуть данные дашборда', async () => {
        const token = await getToken();
        const res = await request(app)
            .get('/api/partner/dashboard')
            .set('X-Token', token);
        assert.strictEqual(res.body.ok, true);
        const p = res.body.partner;
        assert.ok(p.full_name);
        assert.ok(p.phone);
        assert.ok(p.referral_code);
        assert.ok(p.promo_code);
        assert.ok(p.referral_url);
        assert.strictEqual(typeof p.balance_accrued, 'number');
        assert.strictEqual(typeof p.balance_available, 'number');
        assert.strictEqual(typeof p.total_clients, 'number');
        assert.strictEqual(typeof p.paid_clients, 'number');
        assert.strictEqual(typeof p.tg_linked, 'boolean');
        assert.ok(p.level_name);
        assert.ok(p.level_slug);
    });

    it('должен вернуть информацию о следующем уровне', async () => {
        const token = await getToken();
        const res = await request(app)
            .get('/api/partner/dashboard')
            .set('X-Token', token);
        if (res.body.next_level) {
            assert.ok(res.body.next_level.name);
            assert.strictEqual(typeof res.body.next_level.min_clients, 'number');
        }
    });
});

describe('GET /api/partner/referrals', () => {
    it('должен вернуть список рефералов', async () => {
        const token = await getToken();
        const res = await request(app)
            .get('/api/partner/referrals')
            .set('X-Token', token);
        assert.strictEqual(res.body.ok, true);
        assert.ok(Array.isArray(res.body.referrals));
        assert.ok(res.body.referrals.length > 0);

        const r = res.body.referrals[0];
        assert.ok(r.client_name);
        assert.ok(r.status);
        assert.ok(r.status_label);
        assert.ok(r.phone_masked);
        assert.ok(['lead', 'in_progress', 'contract', 'paid'].includes(r.status));
    });

    it('должен поддерживать пагинацию', async () => {
        const token = await getToken();
        const res = await request(app)
            .get('/api/partner/referrals?page=1')
            .set('X-Token', token);
        assert.strictEqual(res.body.ok, true);
        assert.strictEqual(typeof res.body.total, 'number');
        assert.strictEqual(typeof res.body.pages, 'number');
        assert.strictEqual(res.body.page, 1);
    });

    it('должен маскировать телефоны клиентов', async () => {
        const token = await getToken();
        const res = await request(app)
            .get('/api/partner/referrals')
            .set('X-Token', token);
        res.body.referrals.forEach(r => {
            assert.ok(r.phone_masked.includes('***'), `Телефон не замаскирован: ${r.phone_masked}`);
        });
    });
});

describe('GET /api/partner/transactions', () => {
    it('должен вернуть историю транзакций', async () => {
        const token = await getToken();
        const res = await request(app)
            .get('/api/partner/transactions')
            .set('X-Token', token);
        assert.strictEqual(res.body.ok, true);
        assert.ok(Array.isArray(res.body.transactions));

        if (res.body.transactions.length > 0) {
            const t = res.body.transactions[0];
            assert.ok(t.type);
            assert.ok(t.type_label);
            assert.strictEqual(typeof t.amount, 'number');
            assert.strictEqual(typeof t.is_positive, 'boolean');
        }
    });
});

describe('POST /api/partner/update-profile', () => {
    it('должен обновить профиль', async () => {
        const token = await getToken();
        const res = await request(app)
            .post('/api/partner/update-profile')
            .set('X-Token', token)
            .send({ full_name: 'Обновлённый Тест', city: 'Казань', payment_details: '1234 5678' });
        assert.strictEqual(res.body.ok, true);

        // Проверяем что обновилось
        const dash = await request(app)
            .get('/api/partner/dashboard')
            .set('X-Token', token);
        assert.strictEqual(dash.body.partner.city, 'Казань');
    });

    it('должен отклонить без ФИО', async () => {
        const token = await getToken();
        const res = await request(app)
            .post('/api/partner/update-profile')
            .set('X-Token', token)
            .send({ full_name: '', city: 'Москва' });
        assert.strictEqual(res.body.ok, false);
    });
});

describe('POST /api/partner/link-telegram', () => {
    it('должен вернуть ссылку для привязки', async () => {
        const token = await getToken();
        const res = await request(app)
            .post('/api/partner/link-telegram')
            .set('X-Token', token);
        assert.strictEqual(res.body.ok, true);
        assert.ok(res.body.link);
        assert.match(res.body.link, /t\.me/);
    });
});

describe('POST /api/partner/confirm-telegram', () => {
    it('должен привязать Telegram', async () => {
        const token = await getToken();
        const res = await request(app)
            .post('/api/partner/confirm-telegram')
            .set('X-Token', token);
        assert.strictEqual(res.body.ok, true);

        const dash = await request(app)
            .get('/api/partner/dashboard')
            .set('X-Token', token);
        assert.strictEqual(dash.body.partner.tg_linked, true);
    });
});
