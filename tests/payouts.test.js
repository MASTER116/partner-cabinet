const { describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app, db } = require('../server');

async function getToken(phone = '+79001234567') {
    await request(app).post('/api/auth/request-otp').send({ phone });
    const res = await request(app).post('/api/auth/verify-otp').send({ phone, code: '123456' });
    return res.body.token;
}

// ===== Интеграционные тесты: Выплаты =====

describe('GET /api/partner/payouts', () => {
    it('должен вернуть список выплат', async () => {
        const token = await getToken();
        const res = await request(app)
            .get('/api/partner/payouts')
            .set('X-Token', token);
        assert.strictEqual(res.body.ok, true);
        assert.ok(Array.isArray(res.body.payouts));

        if (res.body.payouts.length > 0) {
            const p = res.body.payouts[0];
            assert.ok(p.status);
            assert.ok(p.status_label);
            assert.strictEqual(typeof p.amount, 'number');
        }
    });
});

describe('POST /api/partner/request-payout', () => {
    it('должен отклонить сумму ниже минимальной', async () => {
        const token = await getToken();
        const res = await request(app)
            .post('/api/partner/request-payout')
            .set('X-Token', token)
            .send({ amount: 100, payment_method: 'card' });
        assert.strictEqual(res.body.ok, false);
        assert.match(res.body.error, /минимальная/i);
    });

    it('должен отклонить без способа выплаты', async () => {
        const token = await getToken();
        const res = await request(app)
            .post('/api/partner/request-payout')
            .set('X-Token', token)
            .send({ amount: 5000, payment_method: '' });
        assert.strictEqual(res.body.ok, false);
        assert.match(res.body.error, /способ/i);
    });

    it('должен отклонить сумму больше баланса', async () => {
        const token = await getToken();
        const res = await request(app)
            .post('/api/partner/request-payout')
            .set('X-Token', token)
            .send({ amount: 999999999, payment_method: 'card' });
        assert.strictEqual(res.body.ok, false);
        assert.match(res.body.error, /недостаточно/i);
    });

    it('должен создать заявку на выплату', async () => {
        const token = await getToken();
        // Сначала убираем все pending заявки для чистоты
        db.prepare(`UPDATE payouts SET status='paid' WHERE partner_id=1 AND status IN ('new','processing')`).run();

        const res = await request(app)
            .post('/api/partner/request-payout')
            .set('X-Token', token)
            .send({ amount: 1000, payment_method: 'card', payment_details: '4276 **** 1234' });
        assert.strictEqual(res.body.ok, true);
        assert.match(res.body.message, /создана/i);
    });

    it('должен блокировать вторую заявку если есть необработанная', async () => {
        const token = await getToken();
        const res = await request(app)
            .post('/api/partner/request-payout')
            .set('X-Token', token)
            .send({ amount: 1000, payment_method: 'card' });
        assert.strictEqual(res.body.ok, false);
        assert.match(res.body.error, /необработанная/i);
    });
});
