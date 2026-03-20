const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app, db } = require('../server');

// ===== Интеграционные тесты: Авторизация =====

describe('POST /api/auth/request-otp', () => {
    it('должен вернуть ошибку при коротком номере', async () => {
        const res = await request(app)
            .post('/api/auth/request-otp')
            .send({ phone: '123' });
        assert.strictEqual(res.body.ok, false);
        assert.match(res.body.error, /корректный/i);
    });

    it('должен отправить OTP для существующего партнёра', async () => {
        const res = await request(app)
            .post('/api/auth/request-otp')
            .send({ phone: '+79001234567' });
        assert.strictEqual(res.body.ok, true);
        assert.strictEqual(res.body.isNew, false);
        assert.ok(res.body.hint);
    });

    it('должен отправить OTP для нового номера', async () => {
        const res = await request(app)
            .post('/api/auth/request-otp')
            .send({ phone: '+79991112233' });
        assert.strictEqual(res.body.ok, true);
        assert.strictEqual(res.body.isNew, true);
    });
});

describe('POST /api/auth/verify-otp', () => {
    beforeEach(async () => {
        await request(app)
            .post('/api/auth/request-otp')
            .send({ phone: '+79001234567' });
    });

    it('должен вернуть ошибку при неверном коде', async () => {
        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ phone: '+79001234567', code: '000000' });
        assert.strictEqual(res.body.ok, false);
        assert.match(res.body.error, /неверный/i);
    });

    it('должен авторизовать при верном коде', async () => {
        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ phone: '+79001234567', code: '123456' });
        assert.strictEqual(res.body.ok, true);
        assert.strictEqual(res.body.action, 'login');
        assert.ok(res.body.token);
        assert.ok(res.body.partnerId);
    });

    it('должен предложить регистрацию для нового номера', async () => {
        await request(app)
            .post('/api/auth/request-otp')
            .send({ phone: '+79998887766' });

        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ phone: '+79998887766', code: '123456' });
        assert.strictEqual(res.body.ok, true);
        assert.strictEqual(res.body.action, 'register');
    });

    it('должен заблокировать после 5 неверных попыток', async () => {
        for (let i = 0; i < 5; i++) {
            await request(app)
                .post('/api/auth/verify-otp')
                .send({ phone: '+79001234567', code: '999999' });
        }
        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ phone: '+79001234567', code: '123456' });
        assert.strictEqual(res.body.ok, false);
        assert.match(res.body.error, /много попыток|запросите/i);
    });
});

describe('POST /api/auth/register', () => {
    it('должен зарегистрировать нового партнёра', async () => {
        const phone = '+7900' + Date.now().toString().slice(-7);

        await request(app)
            .post('/api/auth/request-otp')
            .send({ phone });
        await request(app)
            .post('/api/auth/verify-otp')
            .send({ phone, code: '123456' });

        const res = await request(app)
            .post('/api/auth/register')
            .send({ phone, full_name: 'Тестов Тест Тестович' });
        assert.strictEqual(res.body.ok, true);
        assert.strictEqual(res.body.action, 'login');
        assert.ok(res.body.token);
    });

    it('должен отклонить дублирующий телефон', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ phone: '+79001234567', full_name: 'Дубль' });
        assert.strictEqual(res.body.ok, false);
        assert.match(res.body.error, /уже существует/i);
    });

    it('должен отклонить без ФИО', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ phone: '+79001111111', full_name: '' });
        assert.strictEqual(res.body.ok, false);
    });
});

describe('POST /api/auth/logout', () => {
    it('должен разлогинить', async () => {
        const res = await request(app).post('/api/auth/logout');
        assert.strictEqual(res.body.ok, true);
    });
});
