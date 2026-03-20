/**
 * Запись демо-ролика на реальном WordPress
 * WordPress должен быть запущен на localhost:8088
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const WP = 'http://localhost:8088';
const OUT_DIR = path.join(__dirname, 'demo', 'recordings');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 800 } },
        locale: 'ru-RU',
    });
    const page = await context.newPage();

    try {
        // ===== ТИТР =====
        await showTitle(page, 'WordPress-плагин Partner Cabinet', 'Демонстрация на реальном WordPress');
        await sleep(3000);

        // ===== ЧАСТЬ 1: АДМИНКА WP =====
        await showTitle(page, 'Часть 1: Админ-панель', 'Вход в WordPress и управление плагином');
        await sleep(2500);

        // 1. Вход в WP-админку
        await showTitle(page, 'Шаг 1', 'Вход в WordPress');
        await sleep(2000);

        await page.goto(WP + '/wp-login.php', { waitUntil: 'networkidle' });
        await sleep(1500);

        await page.fill('#user_login', 'admin');
        await sleep(300);
        await page.fill('#user_pass', 'admin123');
        await sleep(300);
        await page.click('#wp-submit');
        await page.waitForURL('**/wp-admin/**', { timeout: 10000 });
        await sleep(2000);

        // 2. Меню «Партнёры»
        await showTitle(page, 'Шаг 2', 'Плагин Partner Cabinet в меню WordPress');
        await sleep(2000);

        await page.goto(WP + '/wp-admin/admin.php?page=partner-cabinet', { waitUntil: 'networkidle' });
        await sleep(3000);

        // 3. Список клиентов
        await showTitle(page, 'Шаг 3', 'Управление клиентами — статусы и суммы');
        await sleep(2000);

        await page.goto(WP + '/wp-admin/admin.php?page=pc-referrals', { waitUntil: 'networkidle' });
        await sleep(3000);

        // 4. Выплаты
        await showTitle(page, 'Шаг 4', 'Заявки на выплату');
        await sleep(2000);

        await page.goto(WP + '/wp-admin/admin.php?page=pc-payouts', { waitUntil: 'networkidle' });
        await sleep(3000);

        // 5. Настройки
        await showTitle(page, 'Шаг 5', 'Настройки партнёрской программы');
        await sleep(2000);

        await page.goto(WP + '/wp-admin/admin.php?page=pc-settings', { waitUntil: 'networkidle' });
        await sleep(2000);
        await smoothScroll(page, 400);
        await sleep(2500);

        // ===== ЧАСТЬ 2: КАБИНЕТ КЛИЕНТА =====
        await showTitle(page, 'Часть 2: Кабинет партнёра', 'Страница входа и личный кабинет');
        await sleep(2500);

        // 6. Страница входа
        await showTitle(page, 'Шаг 6', 'Страница входа партнёра');
        await sleep(2000);

        await page.goto(WP + '/?p=4', { waitUntil: 'networkidle' });
        await sleep(3000);

        // 7. Кабинет
        await showTitle(page, 'Шаг 7', 'Личный кабинет партнёра');
        await sleep(2000);

        await page.goto(WP + '/?p=5', { waitUntil: 'networkidle' });
        await sleep(3000);

        // ===== ЧАСТЬ 3: Структура плагина =====
        await showTitle(page, 'Часть 3: Структура', 'Файлы плагина в wp-content/plugins/');
        await sleep(2000);

        await page.goto(WP + '/wp-admin/plugins.php', { waitUntil: 'networkidle' });
        await sleep(3000);

        // ===== ФИНАЛ =====
        await showTitle(page, 'Готово!', 'WordPress-плагин Partner Cabinet\n\nАвторизация по OTP (Telegram/MAX)\nДашборд, рефералы, выплаты, профиль\nАдмин-панель: партнёры, клиенты, настройки\nТема день/ночь, защита от фрода\n\nГотов к установке на сайт клиента');
        await sleep(5000);

    } finally {
        const video = page.video();
        await page.close();
        await context.close();

        if (video) {
            const videoPath = await video.path();
            await sleep(1500);
            const dest = path.join(OUT_DIR, 'demo-wordpress.webm');
            try { fs.copyFileSync(videoPath, dest); } catch (e) { console.error('Copy error:', e.message); }
            try { fs.unlinkSync(videoPath); } catch {}
        }

        await browser.close();
    }

    console.log('\n✅ Ролик записан: demo/recordings/demo-wordpress.webm');
}

async function showTitle(page, title, subtitle) {
    await page.setContent(`
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
            ">${esc(title)}</div>
            <h1 style="font-size:26px;font-weight:800;margin:0;line-height:1.5;white-space:pre-line">${esc(subtitle)}</h1>
        </div>
    </div>`);
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

async function smoothScroll(page, distance) {
    await page.evaluate((d) => {
        const step = d > 0 ? 20 : -20;
        const steps = Math.abs(d / step);
        let i = 0;
        const timer = setInterval(() => { window.scrollBy(0, step); if (++i >= steps) clearInterval(timer); }, 16);
    }, distance);
    await sleep(Math.abs(distance) / 20 * 16 + 200);
}

main().catch(err => { console.error('Ошибка:', err); process.exit(1); });
