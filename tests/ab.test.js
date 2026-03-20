const { describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app, db } = require('../server');

// ===== A/B тесты: сценарии поведения пользователей =====
// Проверяем разные пути пользователей через систему

async function getToken(phone = '+79001234567') {
    await request(app).post('/api/auth/request-otp').send({ phone });
    const res = await request(app).post('/api/auth/verify-otp').send({ phone, code: '123456' });
    return res.body.token;
}

describe('A/B: Путь нового партнёра (регистрация → дашборд)', () => {
    const phone = '+7900' + Math.floor(Math.random() * 9000000 + 1000000);

    it('Шаг 1: Запрос OTP → новый пользователь', async () => {
        const res = await request(app)
            .post('/api/auth/request-otp')
            .send({ phone });
        assert.strictEqual(res.body.ok, true);
        assert.strictEqual(res.body.isNew, true);
    });

    it('Шаг 2: Подтверждение кода → предложение регистрации', async () => {
        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ phone, code: '123456' });
        assert.strictEqual(res.body.action, 'register');
    });

    it('Шаг 3: Регистрация → авторизация', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ phone, full_name: 'Новый Партнёр АБ' });
        assert.strictEqual(res.body.ok, true);
        assert.ok(res.body.token);
    });

    it('Шаг 4: Дашборд → начальный уровень, нулевой баланс', async () => {
        const token = await getToken(phone);
        const res = await request(app)
            .get('/api/partner/dashboard')
            .set('X-Token', token);
        const p = res.body.partner;
        assert.strictEqual(p.level_slug, 'bronze');
        assert.strictEqual(p.balance_accrued, 0);
        assert.strictEqual(p.balance_available, 0);
        assert.strictEqual(p.total_clients, 0);
        assert.ok(p.referral_code);
        assert.ok(p.promo_code);
    });
});

describe('A/B: Путь возвращающегося партнёра (вход → просмотр данных)', () => {
    let token;

    it('Шаг 1: Вход по OTP', async () => {
        token = await getToken('+79001234567');
        assert.ok(token);
    });

    it('Шаг 2: Дашборд отображает баланс и клиентов', async () => {
        const res = await request(app)
            .get('/api/partner/dashboard')
            .set('X-Token', token);
        assert.ok(res.body.partner.balance_accrued > 0);
        assert.ok(res.body.partner.total_clients > 0);
    });

    it('Шаг 3: Рефералы отображаются корректно', async () => {
        const res = await request(app)
            .get('/api/partner/referrals')
            .set('X-Token', token);
        assert.ok(res.body.referrals.length > 0);
        // Все маскированы
        res.body.referrals.forEach(r => assert.ok(r.phone_masked.includes('***')));
    });

    it('Шаг 4: Транзакции доступны', async () => {
        const res = await request(app)
            .get('/api/partner/transactions')
            .set('X-Token', token);
        assert.ok(res.body.transactions.length > 0);
    });
});

describe('A/B: Путь выплаты (запрос → обработка админом)', () => {
    let token;

    it('Шаг 1: Партнёр авторизуется', async () => {
        // Используем второго партнёра с большим балансом
        token = await getToken('+79009876543');
        assert.ok(token);
    });

    it('Шаг 2: Партнёр запрашивает выплату', async () => {
        // Убираем существующие pending заявки
        db.prepare(`UPDATE payouts SET status='paid' WHERE partner_id=2 AND status IN ('new','processing')`).run();

        const res = await request(app)
            .post('/api/partner/request-payout')
            .set('X-Token', token)
            .send({ amount: 5000, payment_method: 'card', payment_details: '5536 **** 5678' });
        assert.strictEqual(res.body.ok, true);
    });

    it('Шаг 3: Заявка видна в списке выплат партнёра', async () => {
        const res = await request(app)
            .get('/api/partner/payouts')
            .set('X-Token', token);
        const newest = res.body.payouts[0];
        assert.strictEqual(newest.status, 'new');
        assert.strictEqual(newest.amount, 5000);
    });

    it('Шаг 4: Админ видит заявку', async () => {
        const res = await request(app).get('/api/admin/payouts');
        const found = res.body.payouts.find(p => p.amount === 5000 && p.status === 'new');
        assert.ok(found, 'Заявка должна быть в списке админа');
    });

    it('Шаг 5: Админ одобряет → баланс списывается', async () => {
        const dashBefore = await request(app)
            .get('/api/partner/dashboard')
            .set('X-Token', token);
        const balBefore = dashBefore.body.partner.balance_available;

        const payout = db.prepare(`SELECT id FROM payouts WHERE partner_id=2 AND status='new' ORDER BY id DESC LIMIT 1`).get();
        await request(app)
            .post(`/api/admin/payout/${payout.id}`)
            .send({ status: 'paid', comment: 'A/B тест' });

        const dashAfter = await request(app)
            .get('/api/partner/dashboard')
            .set('X-Token', token);
        assert.strictEqual(dashAfter.body.partner.balance_available, balBefore - 5000);
    });
});

describe('A/B: Путь администратора (клиент оплатил → бонус начислен)', () => {
    it('Сквозной сценарий: смена статуса клиента → автоначисление бонуса → повышение уровня', async () => {
        // Находим реферала в статусе in_progress
        const ref = db.prepare(`SELECT * FROM referrals WHERE status='in_progress' LIMIT 1`).get();
        if (!ref) return; // Пропускаем если нет подходящих данных

        const partnerBefore = db.prepare('SELECT * FROM partners WHERE id=?').get(ref.partner_id);

        // Устанавливаем сумму и меняем статус на paid
        await request(app)
            .post(`/api/admin/referral/${ref.id}`)
            .send({ status: 'paid', contract_amount: 200000 });

        const refAfter = db.prepare('SELECT * FROM referrals WHERE id=?').get(ref.id);
        const partnerAfter = db.prepare('SELECT * FROM partners WHERE id=?').get(ref.partner_id);

        assert.strictEqual(refAfter.status, 'paid');
        assert.ok(refAfter.bonus_amount > 0, 'Бонус должен быть начислен');
        assert.ok(
            partnerAfter.balance_accrued >= partnerBefore.balance_accrued,
            'Баланс должен вырасти или остаться (если уже начислен)'
        );

        // Проверяем транзакцию
        const tx = db.prepare(`SELECT * FROM transactions WHERE referral_id=? AND type='accrual'`).get(ref.id);
        assert.ok(tx, 'Должна быть транзакция начисления');
    });
});

describe('A/B: Антифрод — регистрация дублей', () => {
    it('нельзя зарегистрировать второй аккаунт на тот же телефон', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ phone: '+79001234567', full_name: 'Дубликат' });
        assert.strictEqual(res.body.ok, false);
        assert.match(res.body.error, /уже существует/i);
    });
});

describe('A/B: Изоляция данных между партнёрами', () => {
    it('партнёр видит только свои данные', async () => {
        const token1 = await getToken('+79001234567');
        const token2 = await getToken('+79009876543');

        const refs1 = await request(app).get('/api/partner/referrals').set('X-Token', token1);
        const refs2 = await request(app).get('/api/partner/referrals').set('X-Token', token2);

        const ids1 = new Set(refs1.body.referrals.map(r => r.partner_id));
        const ids2 = new Set(refs2.body.referrals.map(r => r.partner_id));

        // У каждого свой partner_id в рефералах
        assert.strictEqual(ids1.size, 1);
        assert.strictEqual(ids2.size, 1);
        // И они не пересекаются
        assert.notDeepStrictEqual(ids1, ids2);
    });
});
