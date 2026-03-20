/**
 * Запись полного демо-ролика: клиент + админ в одном видео
 * Результат: demo/recordings/demo-full.webm
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const BASE = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, 'recordings');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    // Ensure server
    let serverProc = null;
    try {
        const http = require('http');
        await new Promise((resolve, reject) => {
            http.get(BASE + '/health', res => { res.resume(); resolve(); })
                .on('error', reject);
        });
        console.log('Сервер уже запущен');
    } catch {
        console.log('Запускаю сервер...');
        try { fs.unlinkSync(path.join(__dirname, 'partner.db')); } catch {}
        try { fs.unlinkSync(path.join(__dirname, 'partner.db-shm')); } catch {}
        try { fs.unlinkSync(path.join(__dirname, 'partner.db-wal')); } catch {}
        serverProc = spawn('node', ['server.js'], { cwd: __dirname, stdio: 'pipe' });
        await sleep(3000);
    }

    const browser = await chromium.launch({ headless: false });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 800 } },
        locale: 'ru-RU',
    });

    const page = await context.newPage();

    try {
        // ===== ТИТР 1: Вступление =====
        await showTitle(page, 'Партнёрская программа', 'Личный кабинет партнёра — демонстрация работы');
        await sleep(3000);

        // ===== ЧАСТЬ 1: КЛИЕНТ =====
        await showTitle(page, 'Часть 1', 'Личный кабинет партнёра');
        await sleep(2500);

        // 1. Вход по OTP
        await showTitle(page, 'Шаг 1', 'Вход по номеру телефона');
        await sleep(2000);

        await page.goto(BASE);
        await sleep(1500);

        await page.click('#i-phone');
        await typeSlowly(page, '#i-phone', '9001234567');
        await sleep(800);
        await page.click('#b-otp');
        await sleep(2000);

        // Ввод OTP
        for (let i = 0; i < 6; i++) {
            await page.fill(`.cd[data-i="${i}"]`, '123456'[i]);
            await sleep(250);
        }
        // Ждём автоматическую верификацию и вход
        await sleep(3000);

        // 2. Дашборд
        await showTitle(page, 'Шаг 2', 'Дашборд — уровень, баланс, клиенты');
        await sleep(2000);

        // Заходим на главную (уже авторизованы — покажет кабинет)
        await page.goto(BASE, { waitUntil: 'networkidle' });
        await sleep(2500);

        // Прокрутка к ссылке
        await smoothScroll(page, 350);
        await sleep(2000);

        // Копируем ссылку
        await page.click('[data-c="d-url"]');
        await sleep(2000);

        await smoothScroll(page, -350);
        await sleep(1000);

        // 3. Мои клиенты
        await showTitle(page, 'Шаг 3', 'Список привлечённых клиентов');
        await sleep(2000);

        await page.goto(BASE, { waitUntil: 'networkidle' });
        await sleep(1500);
        await page.click('[data-t="refs"]');
        await sleep(2000);
        await smoothScroll(page, 300);
        await sleep(2000);
        await smoothScroll(page, 300);
        await sleep(2000);

        // 4. Выплаты
        await showTitle(page, 'Шаг 4', 'Запрос выплаты');
        await sleep(2000);

        await page.goto(BASE, { waitUntil: 'networkidle' });
        await sleep(1500);
        await page.click('[data-t="pays"]');
        await sleep(1500);

        await page.fill('#pay-amt', '5000');
        await sleep(400);
        await page.selectOption('#pay-meth', 'card');
        await sleep(400);
        await page.fill('#pay-det', '4276 1234 5678 9012');
        await sleep(800);
        await page.click('#b-pay');
        await sleep(2500);

        await smoothScroll(page, 300);
        await sleep(2000);

        // 5. Профиль
        await showTitle(page, 'Шаг 5', 'Профиль партнёра');
        await sleep(2000);

        await page.goto(BASE, { waitUntil: 'networkidle' });
        await sleep(1500);
        await page.click('[data-t="prof"]');
        await sleep(1500);

        await page.fill('#p-city', '');
        await typeSlowly(page, '#p-city', 'Казань');
        await sleep(500);
        await page.click('#b-prof');
        await sleep(2000);

        // 6. Тема
        await showTitle(page, 'Шаг 6', 'Переключение темы: день / ночь');
        await sleep(2000);

        await page.goto(BASE, { waitUntil: 'networkidle' });
        await sleep(1500);
        await sleep(1000);
        await page.click('#b-theme');
        await sleep(2500);
        await page.click('#b-theme');
        await sleep(2000);

        // ===== ЧАСТЬ 2: АДМИН =====
        await showTitle(page, 'Часть 2', 'Админ-панель');
        await sleep(2500);

        // 1. Список партнёров
        await showTitle(page, 'Админ: Шаг 1', 'Список партнёров, поиск, редактирование');
        await sleep(2000);

        await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
        await sleep(2500);

        // Поиск
        await page.fill('#a-search', 'Иванов');
        await sleep(500);
        await page.click('#a-search-btn');
        await sleep(1500);

        await page.fill('#a-search', '');
        await page.click('#a-search-btn');
        await sleep(1500);

        // Редактирование партнёра
        const editP = await page.$('.a-edit-p');
        if (editP) {
            await editP.click();
            await sleep(2500);
            await page.click('#modal-close');
            await sleep(1000);
        }

        // 2. Клиенты
        await showTitle(page, 'Админ: Шаг 2', 'Управление клиентами — смена статуса');
        await sleep(2000);

        await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
        await sleep(1500);
        await page.click('[data-t="a-refs"]');
        await sleep(2000);

        const editR = await page.$('.a-edit-r');
        if (editR) {
            await editR.click();
            await sleep(1500);
            await page.selectOption('#m-rst', 'paid');
            await sleep(500);
            await page.fill('#m-ramt', '200000');
            await sleep(500);
            await page.click('#m-sv-r');
            await sleep(2500);
        }

        // 3. Выплаты
        await showTitle(page, 'Админ: Шаг 3', 'Обработка заявок на выплату');
        await sleep(2000);

        await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
        await sleep(1500);
        await page.click('[data-t="a-pays"]');
        await sleep(2000);

        const editPy = await page.$('.a-edit-py');
        if (editPy) {
            await editPy.click();
            await sleep(1500);
            await page.selectOption('#m-pyst', 'paid');
            await sleep(500);
            await page.fill('#m-pyc', 'Перевод выполнен');
            await sleep(500);
            await page.click('#m-sv-py');
            await sleep(2500);
        }

        // 4. Настройки
        await showTitle(page, 'Админ: Шаг 4', 'Настройки программы и уровни');
        await sleep(2000);

        await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
        await sleep(1500);
        await page.click('[data-t="a-settings"]');
        await sleep(2000);
        await smoothScroll(page, 400);
        await sleep(2500);

        // ===== ФИНАЛЬНЫЙ ТИТР =====
        await showTitle(page, 'Готово!', 'Партнёрская программа — полный цикл работы\n\nКлиент: регистрация → реферальная ссылка → отслеживание клиентов → выплаты\nАдмин: управление партнёрами → статусы клиентов → начисление бонусов → выплаты');
        await sleep(4000);

    } finally {
        const video = page.video();
        await page.close();
        await context.close();

        if (video) {
            const videoPath = await video.path();
            await sleep(1500);
            const dest = path.join(OUT_DIR, 'demo-full.webm');
            try { fs.copyFileSync(videoPath, dest); } catch (e) { console.error('Copy error:', e.message); }
            try { fs.unlinkSync(videoPath); } catch {}
        }

        await browser.close();
        if (serverProc) serverProc.kill();
    }

    console.log('\n✅ Демо-ролик записан: recordings/demo-full.webm');
}

// ===== Титульный слайд =====
async function showTitle(page, title, subtitle) {
    const html = `
    <div style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        min-height:100vh;background:#0D0D0D;color:#F5F5F5;
        font-family:Inter,-apple-system,sans-serif;text-align:center;padding:40px;
    ">
        <div style="
            background:#181818;border-radius:24px;padding:60px 80px;
            box-shadow:0 8px 30px rgba(0,0,0,.6);max-width:700px;
        ">
            <div style="
                background:#FFDD2D;color:#1A1A1A;display:inline-block;
                padding:8px 24px;border-radius:20px;font-size:14px;font-weight:700;
                letter-spacing:.05em;text-transform:uppercase;margin-bottom:24px;
            ">${escHtml(title)}</div>
            <h1 style="font-size:28px;font-weight:800;margin:0;line-height:1.4;white-space:pre-line">${escHtml(subtitle)}</h1>
        </div>
    </div>`;
    await page.setContent(html);
}

function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

async function typeSlowly(page, sel, text) {
    for (const c of text) {
        await page.type(sel, c);
        await sleep(70 + Math.random() * 50);
    }
}

async function smoothScroll(page, distance) {
    await page.evaluate((d) => {
        const step = d > 0 ? 20 : -20;
        const steps = Math.abs(d / step);
        let i = 0;
        const timer = setInterval(() => {
            window.scrollBy(0, step);
            if (++i >= steps) clearInterval(timer);
        }, 16);
    }, distance);
    await sleep(Math.abs(distance) / 20 * 16 + 200);
}

main().catch(err => {
    console.error('Ошибка:', err);
    process.exit(1);
});
