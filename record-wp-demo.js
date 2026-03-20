/**
 * Запись демо-ролика на реальном WordPress
 * WordPress на localhost:8088 (docker-compose)
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const WP = 'http://localhost:8088';
const OUT_DIR = path.join(__dirname, 'recordings');

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
        await title(page, 'WordPress-плагин Partner Cabinet', 'Демонстрация на реальном WordPress\nСторона клиента + Сторона администратора');
        await sleep(3500);

        // ===== ЧАСТЬ 1: АДМИНКА =====
        await title(page, 'Часть 1: Администратор', 'Вход в WordPress и управление партнёрами');
        await sleep(2500);

        // Вход
        await title(page, 'Вход в WordPress', 'admin / admin123');
        await sleep(2000);
        await page.goto(WP + '/wp-login.php', { waitUntil: 'networkidle' });
        await sleep(1500);
        await page.fill('#user_login', 'admin');
        await sleep(300);
        await page.fill('#user_pass', 'admin123');
        await sleep(500);
        await page.click('#wp-submit');
        await page.waitForURL('**/wp-admin/**', { timeout: 15000 });
        await sleep(2000);

        // Плагины
        await title(page, 'Плагин активен', 'Partner Cabinet в списке плагинов WordPress');
        await sleep(2000);
        await page.goto(WP + '/wp-admin/plugins.php', { waitUntil: 'networkidle' });
        await sleep(3000);

        // Партнёры
        await title(page, 'Раздел «Партнёры»', 'Список партнёров с балансами и статистикой');
        await sleep(2000);
        await page.goto(WP + '/wp-admin/admin.php?page=partner-cabinet', { waitUntil: 'networkidle' });
        await sleep(3000);

        // Клиенты
        await title(page, 'Раздел «Клиенты»', 'Все привлечённые клиенты со статусами');
        await sleep(2000);
        await page.goto(WP + '/wp-admin/admin.php?page=pc-referrals', { waitUntil: 'networkidle' });
        await sleep(3000);

        // Выплаты
        await title(page, 'Раздел «Выплаты»', 'Заявки на выплату от партнёров');
        await sleep(2000);
        await page.goto(WP + '/wp-admin/admin.php?page=pc-payouts', { waitUntil: 'networkidle' });
        await sleep(3000);

        // Настройки
        await title(page, 'Раздел «Настройки»', 'Уровни, вознаграждения, Telegram, Google Sheets');
        await sleep(2000);
        await page.goto(WP + '/wp-admin/admin.php?page=pc-settings', { waitUntil: 'networkidle' });
        await sleep(2000);
        await scroll(page, 500);
        await sleep(3000);

        // ===== ЧАСТЬ 2: КЛИЕНТ =====
        await title(page, 'Часть 2: Партнёр', 'Страница входа по шорткоду [partner_login]');
        await sleep(2500);

        // Разлогин из WP
        await page.goto(WP + '/wp-login.php?action=logout', { waitUntil: 'networkidle' });
        await sleep(1000);
        const logoutLink = await page.$('a[href*="action=logout"]');
        if (logoutLink) { await logoutLink.click(); await sleep(2000); }

        // Страница входа
        await title(page, 'Страница входа', 'Форма с OTP-кодом в дизайне Т-Банка');
        await sleep(2000);

        await page.goto(WP + '/%D0%B2%D1%85%D0%BE%D0%B4/', { waitUntil: 'networkidle' });
        await sleep(3000);
        await scroll(page, 300);
        await sleep(2000);

        // ===== ФИНАЛ =====
        await title(page, 'WordPress-плагин готов!', '✓ Админ-панель в меню WordPress\n✓ Шорткоды [partner_login] и [partner_cabinet]\n✓ OTP-авторизация через Telegram / MAX\n✓ Реферальная программа с автоначислением\n✓ Выплаты, профиль, тема день/ночь\n✓ Защита от фрода\n\nГотов к установке на сайт клиента');
        await sleep(5000);

    } finally {
        const video = page.video();
        await page.close();
        await context.close();

        if (video) {
            const videoPath = await video.path();
            await sleep(1500);
            const dest = path.join(OUT_DIR, 'demo-wordpress.webm');
            try { fs.copyFileSync(videoPath, dest); } catch (e) { console.error(e.message); }
            try { fs.unlinkSync(videoPath); } catch {}
        }

        await browser.close();
    }

    console.log('\n✅ Ролик: recordings/demo-wordpress.webm');
}

async function title(page, t, sub) {
    await page.setContent(`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#0D0D0D;color:#F5F5F5;font-family:Inter,-apple-system,sans-serif;text-align:center;padding:40px"><div style="background:#181818;border-radius:24px;padding:56px 72px;box-shadow:0 8px 30px rgba(0,0,0,.6);max-width:720px"><div style="background:#FFDD2D;color:#1A1A1A;display:inline-block;padding:8px 24px;border-radius:20px;font-size:14px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-bottom:20px">${esc(t)}</div><h1 style="font-size:24px;font-weight:800;margin:0;line-height:1.6;white-space:pre-line">${esc(sub)}</h1></div></div>`);
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

async function scroll(page, d) {
    await page.evaluate(d => { const s=d>0?20:-20,n=Math.abs(d/s);let i=0;const t=setInterval(()=>{window.scrollBy(0,s);if(++i>=n)clearInterval(t)},16) }, d);
    await sleep(Math.abs(d)/20*16+200);
}

main().catch(err => { console.error('Ошибка:', err); process.exit(1); });
