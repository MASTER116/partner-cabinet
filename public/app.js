(function(){
'use strict';

const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
let TOKEN = localStorage.getItem('pc_token') || '';
let PHONE = '';
const SL = {lead:'Лид',in_progress:'В работе',contract:'Договор',paid:'Оплачен'};
const PL = {new:'Новая',processing:'В обработке',paid:'Выплачено',rejected:'Отклонена'};
const ML = {card:'Банковская карта',account:'Расчётный счёт',other:'Другое'};
const fmt = n => Number(n||0).toLocaleString('ru-RU');
const esc = s => { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };

// ===== API =====
async function api(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    return r.json();
}
const GET = url => api('GET', url);
const POST = (url, body) => api('POST', url, body);

// ===== Theme =====
function initTheme() {
    const saved = localStorage.getItem('pc_theme');
    const pref = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
    document.body.setAttribute('data-theme', saved || pref);
    $('#b-theme')?.addEventListener('click', () => {
        const n = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        document.body.setAttribute('data-theme', n);
        localStorage.setItem('pc_theme', n);
    });
}

// ===== Screens =====
function show(id) { $$('.screen').forEach(s=>s.classList.remove('active')); $(`#screen-${id}`)?.classList.add('active'); }
function showStep(id) { $$('.step').forEach(s=>s.classList.remove('active')); $(`#step-${id}`)?.classList.add('active'); }

// ===== Tabs =====
function initTabs(navId) {
    const nav = $(`#${navId}`);
    if (!nav) return;
    nav.querySelectorAll('.nav-b').forEach(btn => {
        btn.addEventListener('click', () => {
            nav.querySelectorAll('.nav-b').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            // Find parent screen's tabs
            const screen = btn.closest('.screen') || document;
            screen.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
            $(`#t-${btn.dataset.t}`)?.classList.add('active');
        });
    });
}

// ===== Auth =====
function initAuth() {
    const ph = $('#i-phone');
    ph?.addEventListener('input', () => {
        let v = ph.value.replace(/\D/g,'');
        if (v.startsWith('8')) v = '7' + v.slice(1);
        if (!v.startsWith('7')) v = '7' + v;
        // Только российские мобильные: +7 9XX
        if (v.length > 1 && v[1] !== '9') v = '79';
        // Ограничиваем длину: 7 + 10 цифр = 11
        v = v.slice(0, 11);
        let f = '+7';
        if (v.length>1) f+=' ('+v.slice(1,4);
        if (v.length>4) f+=') '+v.slice(4,7);
        if (v.length>7) f+='-'+v.slice(7,9);
        if (v.length>9) f+='-'+v.slice(9,11);
        ph.value = f;
    });

    $('#b-otp')?.addEventListener('click', async () => {
        PHONE = '+' + ph.value.replace(/\D/g,'');
        if (PHONE.length < 12) return showMsg('auth-msg','err','Введите корректный номер');
        hideMsg('auth-msg');
        const r = await POST('/api/auth/request-otp', { phone: PHONE });
        if (!r.ok) return showMsg('auth-msg','err',r.error);
        $('#s-phone').textContent = ph.value;
        showStep('code');
        setTimeout(() => $('.cd[data-i="0"]')?.focus(), 200);
    });

    // Code digits
    $$('.cd').forEach(inp => {
        inp.addEventListener('input', e => {
            const v = e.target.value.replace(/\D/g,'');
            e.target.value = v.slice(0,1);
            if (v) e.target.classList.add('ok'); else e.target.classList.remove('ok');
            if (v && +e.target.dataset.i < 5) $(`.cd[data-i="${+e.target.dataset.i+1}"]`)?.focus();
            if (getCode().length === 6) setTimeout(() => $('#b-verify')?.click(), 150);
        });
        inp.addEventListener('keydown', e => {
            if (e.key==='Backspace' && !e.target.value && +e.target.dataset.i>0) {
                const prev = $(`.cd[data-i="${+e.target.dataset.i-1}"]`);
                if (prev) { prev.focus(); prev.value=''; prev.classList.remove('ok'); }
            }
        });
        inp.addEventListener('paste', e => {
            e.preventDefault();
            const t = (e.clipboardData||window.clipboardData).getData('text').replace(/\D/g,'');
            t.split('').slice(0,6).forEach((c,i) => { const el=$(`.cd[data-i="${i}"]`); if(el){el.value=c;el.classList.add('ok');} });
            if (t.length>=6) setTimeout(() => $('#b-verify')?.click(), 150);
        });
    });

    $('#b-verify')?.addEventListener('click', async () => {
        hideMsg('auth-msg');
        const code = getCode();
        if (code.length !== 6) return showMsg('auth-msg','err','Введите 6-значный код');
        const r = await POST('/api/auth/verify-otp', { phone: PHONE, code });
        if (!r.ok) { showMsg('auth-msg','err',r.error); clearCode(); return; }
        if (r.action === 'login') { TOKEN = r.token; localStorage.setItem('pc_token', TOKEN); enterCabinet(); }
        else showStep('reg');
    });

    $('#b-reg')?.addEventListener('click', async () => {
        hideMsg('auth-msg');
        const name = $('#i-name').value.trim();
        if (!name) return showMsg('auth-msg','err','Введите ФИО');
        if (!$('#i-agree').checked) return showMsg('auth-msg','err','Примите условия');
        const r = await POST('/api/auth/register', { phone: PHONE, full_name: name });
        if (!r.ok) return showMsg('auth-msg','err',r.error);
        TOKEN = r.token; localStorage.setItem('pc_token', TOKEN); enterCabinet();
    });

    $('#b-back')?.addEventListener('click', () => { showStep('phone'); clearCode(); });
}

function getCode() { return Array.from($$('.cd')).map(e=>e.value).join(''); }
function clearCode() { $$('.cd').forEach(el=>{el.value='';el.classList.remove('ok')}); $('.cd[data-i="0"]')?.focus(); }

// ===== Cabinet =====
async function enterCabinet() {
    // Check if admin route
    if (location.pathname === '/admin') { show('admin'); loadAdmin(); return; }

    show('cab');
    const r = await GET('/api/partner/dashboard');
    if (!r.ok) { TOKEN=''; localStorage.removeItem('pc_token'); show('auth'); showStep('phone'); return; }

    const p = r.partner;
    $('#h-name').textContent = p.full_name;
    $('#d-accrued').textContent = fmt(p.balance_accrued) + ' ₽';
    $('#d-avail').textContent = fmt(p.balance_available) + ' ₽';
    $('#d-cli').textContent = p.total_clients;
    $('#d-cli-s').textContent = `${p.paid_clients} оплатили`;
    $('#d-url').value = p.referral_url;
    $('#d-promo').textContent = p.promo_code;

    // Level
    const lc = $('#c-level');
    lc.innerHTML = `<div class="card-h">Ваш уровень</div><span class="lvl lvl-${p.level_slug}">${esc(p.level_name)}</span>`;
    if (r.next_level) {
        const pct = Math.min(100, (p.paid_clients / r.next_level.min_clients) * 100);
        lc.innerHTML += `<div class="pbar"><div class="pfill" style="width:${pct}%"></div></div><div class="card-s">До «${esc(r.next_level.name)}»: ${p.paid_clients} из ${r.next_level.min_clients} клиентов</div>`;
    }

    // TG
    const tgb = $('#tg-block');
    if (p.tg_linked) tgb.innerHTML = '<div class="card card-ok">&#10003; Telegram привязан — уведомления включены</div>';
    else tgb.innerHTML = `<div class="card card-warn"><div class="card-h">Привяжите Telegram</div><p style="color:var(--t2);font-size:14px;margin-bottom:14px">Для уведомлений о начислениях</p><button class="btn btn-y" id="b-link-tg" style="width:auto">Привязать Telegram</button><div id="tg-res" style="display:none;margin-top:14px"></div></div>`;

    $('#b-link-tg')?.addEventListener('click', async () => {
        const lr = await POST('/api/partner/link-telegram');
        if (lr.ok && lr.link) {
            $('#tg-res').innerHTML = `<a href="${lr.link}" target="_blank" class="btn btn-o btn-s" style="width:auto">&#10148; Открыть Telegram-бот</a><button class="btn btn-y btn-s" id="b-confirm-tg" style="margin-left:8px">Я запустил бота</button>`;
            $('#tg-res').style.display = 'block';
            $('#b-confirm-tg')?.addEventListener('click', async () => {
                await POST('/api/partner/confirm-telegram');
                tgb.innerHTML = '<div class="card card-ok">&#10003; Telegram привязан — уведомления включены</div>';
            });
        }
    });

    // Profile
    $('#p-name').value = p.full_name;
    $('#p-phone').value = p.phone;
    $('#p-city').value = p.city || '';
    $('#p-pay').value = p.payment_details || '';

    // Min payout hint
    const settings = await GET('/api/admin/settings');
    const minPay = settings.ok ? (settings.settings?.min_payout_amount || '1000') : '1000';
    $('#min-pay-hint').textContent = `Минимальная сумма: ${fmt(+minPay)} ₽`;
    if (settings.ok && settings.settings?.program_description) {
        $('#program-desc').innerHTML = settings.settings.program_description.replace(/\n/g,'<br>');
    }

    loadReferrals();
    loadTransactions();
    loadPayouts();
}

async function loadReferrals() {
    const r = await GET('/api/partner/referrals');
    if (!r.ok) return;
    const tb = $('#ref-tb');
    if (!r.referrals.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--t3);padding:30px">Пока нет клиентов</td></tr>'; return; }
    tb.innerHTML = r.referrals.map(x => `<tr>
        <td>${x.created_at?.slice(0,10)||''}</td>
        <td>${esc(x.client_name)}<br><small style="color:var(--t3)">${x.phone_masked}</small></td>
        <td><span class="st st-${x.status}">${x.status_label}</span></td>
        <td>${x.contract_amount ? fmt(x.contract_amount)+' ₽' : '—'}</td>
        <td>${x.bonus_amount ? fmt(x.bonus_amount)+' ₽' : '—'}</td>
        <td>${x.source==='promo'?'Промокод':'Ссылка'}</td>
    </tr>`).join('');
}

async function loadTransactions() {
    const r = await GET('/api/partner/transactions');
    if (!r.ok) return;
    const tb = $('#tx-tb');
    if (!r.transactions.length) { tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--t3);padding:30px">Нет операций</td></tr>'; return; }
    tb.innerHTML = r.transactions.map(t => `<tr>
        <td>${t.created_at||''}</td>
        <td>${t.type_label}</td>
        <td class="${t.is_positive?'amt-p':'amt-m'}">${t.is_positive?'+':'-'}${fmt(t.amount)} ₽</td>
        <td>${esc(t.comment)}</td>
    </tr>`).join('');
}

async function loadPayouts() {
    const r = await GET('/api/partner/payouts');
    if (!r.ok) return;
    const tb = $('#pay-tb');
    if (!r.payouts.length) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--t3);padding:30px">Нет заявок</td></tr>'; return; }
    tb.innerHTML = r.payouts.map(p => `<tr>
        <td>${p.created_at?.slice(0,10)||''}</td>
        <td>${fmt(p.amount)} ₽</td>
        <td>${ML[p.payment_method]||p.payment_method||'—'}</td>
        <td><span class="st st-${p.status}">${p.status_label}</span></td>
        <td>${p.processed_at?.slice(0,10)||'—'}</td>
    </tr>`).join('');
}

// ===== Cabinet actions =====
function initCabinetActions() {
    $('#b-logout')?.addEventListener('click', async () => {
        await POST('/api/auth/logout');
        TOKEN=''; localStorage.removeItem('pc_token');
        show('auth'); showStep('phone');
    });

    // Copy
    document.addEventListener('click', e => {
        const btn = e.target.closest('.copy-btn');
        if (!btn) return;
        const el = $(`#${btn.dataset.c}`);
        const text = el?.value || el?.textContent || '';
        navigator.clipboard.writeText(text).then(() => {
            btn.classList.add('copied');
            const orig = btn.textContent;
            btn.textContent = 'Скопировано!';
            setTimeout(() => { btn.classList.remove('copied'); btn.textContent = orig; }, 1500);
        });
    });

    // Payout
    $('#b-pay')?.addEventListener('click', async () => {
        hideMsg('pay-msg');
        const r = await POST('/api/partner/request-payout', {
            amount: +$('#pay-amt').value,
            payment_method: $('#pay-meth').value,
            payment_details: $('#pay-det').value,
        });
        if (!r.ok) return showMsg('pay-msg','err',r.error);
        showMsg('pay-msg','ok',r.message);
        $('#pay-amt').value = '';
        loadPayouts();
        // Refresh dashboard
        const d = await GET('/api/partner/dashboard');
        if (d.ok) { $('#d-avail').textContent = fmt(d.partner.balance_available)+' ₽'; }
    });

    // Profile
    $('#b-prof')?.addEventListener('click', async () => {
        hideMsg('prof-msg');
        const r = await POST('/api/partner/update-profile', {
            full_name: $('#p-name').value,
            city: $('#p-city').value,
            payment_details: $('#p-pay').value,
        });
        if (!r.ok) return showMsg('prof-msg','err',r.error);
        showMsg('prof-msg','ok',r.message);
        $('#h-name').textContent = $('#p-name').value;
    });
}

// ===== ADMIN =====
async function loadAdmin() {
    await loadAdminPartners();
    await loadAdminReferrals();
    await loadAdminPayouts();
    await loadAdminSettings();
}

async function loadAdminPartners(search) {
    const r = await GET('/api/admin/partners' + (search ? '?search='+encodeURIComponent(search) : ''));
    if (!r.ok) return;
    const tb = $('#a-p-tb');
    tb.innerHTML = r.partners.map(p => `<tr>
        <td>${p.id}</td><td>${esc(p.full_name)}</td><td>${p.phone}</td>
        <td>${esc(p.level_name||'—')}</td><td>${fmt(p.balance_accrued)} ₽</td>
        <td>${fmt(p.balance_available)} ₽</td><td>${p.total_clients} (${p.paid_clients} опл.)</td>
        <td><button class="btn btn-o btn-s a-edit-p" data-id="${p.id}">Ред.</button></td>
    </tr>`).join('');
}

async function loadAdminReferrals() {
    const r = await GET('/api/admin/referrals');
    if (!r.ok) return;
    const tb = $('#a-r-tb');
    tb.innerHTML = r.referrals.map(x => `<tr>
        <td>${x.id}</td><td>${esc(x.client_name)}</td><td>${x.client_phone}</td>
        <td>${esc(x.partner_name||'')}</td>
        <td><span class="st st-${x.status}">${x.status_label}</span></td>
        <td>${fmt(x.contract_amount)} ₽</td><td>${fmt(x.bonus_amount)} ₽</td>
        <td><button class="btn btn-o btn-s a-edit-r" data-id="${x.id}" data-status="${x.status}" data-amount="${x.contract_amount}" data-partner="${esc(x.partner_name||'')}">Ред.</button></td>
    </tr>`).join('');
}

async function loadAdminPayouts() {
    const r = await GET('/api/admin/payouts');
    if (!r.ok) return;
    const tb = $('#a-py-tb');
    tb.innerHTML = r.payouts.map(p => `<tr>
        <td>${p.id}</td><td>${esc(p.partner_name||'')}</td><td>${fmt(p.amount)} ₽</td>
        <td>${ML[p.payment_method]||p.payment_method||'—'}</td>
        <td><span class="st st-${p.status}">${p.status_label}</span></td>
        <td>${p.created_at?.slice(0,10)||''}</td>
        <td>${['new','processing'].includes(p.status)?`<button class="btn btn-o btn-s a-edit-py" data-id="${p.id}" data-partner="${esc(p.partner_name||'')}" data-amount="${p.amount}">Обработать</button>`:'—'}</td>
    </tr>`).join('');
}

async function loadAdminSettings() {
    const r = await GET('/api/admin/settings');
    if (!r.ok) return;
    const s = r.settings;
    if ($('#as-cookie')) $('#as-cookie').value = s.cookie_lifetime_days || 30;
    if ($('#as-minpay')) $('#as-minpay').value = s.min_payout_amount || 1000;
    if ($('#as-desc')) $('#as-desc').value = s.program_description || '';
    if ($('#as-tg')) $('#as-tg').value = s.telegram_bot_token || '';
    if ($('#as-tgu')) $('#as-tgu').value = s.telegram_bot_username || '';
    if ($('#as-max')) $('#as-max').value = s.max_bot_token || '';
    renderLevels(r.levels || []);
}

function renderLevels(levels) {
    const tb = $('#a-lv-tb');
    if (!tb) return;
    tb.innerHTML = levels.map((l,i) => `<tr>
        <td><input class="inp lv-n" value="${esc(l.name)}" style="padding:8px"></td>
        <td><input type="number" class="inp lv-mc" value="${l.min_clients}" min="0" style="padding:8px"></td>
        <td><input type="number" class="inp lv-ma" value="${l.min_amount}" min="0" step="0.01" style="padding:8px"></td>
        <td><select class="inp lv-rt" style="padding:8px"><option value="percent" ${l.reward_type==='percent'?'selected':''}>%</option><option value="fixed" ${l.reward_type==='fixed'?'selected':''}>Фикс.</option></select></td>
        <td><input type="number" class="inp lv-rv" value="${l.reward_value}" min="0" step="0.01" style="padding:8px"></td>
        <td><button class="btn btn-o btn-s lv-del">&#10005;</button></td>
    </tr>`).join('');
}

function initAdmin() {
    // Search
    $('#a-search-btn')?.addEventListener('click', () => loadAdminPartners($('#a-search').value));
    $('#a-search')?.addEventListener('keydown', e => { if(e.key==='Enter') loadAdminPartners($('#a-search').value); });

    // Export
    $('#a-export-p')?.addEventListener('click', () => downloadCSV('partners'));
    $('#a-export-py')?.addEventListener('click', () => downloadCSV('payouts'));

    // Edit partner
    document.addEventListener('click', async e => {
        if (e.target.classList.contains('a-edit-p')) {
            const r = await GET(`/api/admin/partner/${e.target.dataset.id}`);
            if (!r.ok) return;
            const p = r.partner;
            openModal(`
                <h2>${esc(p.full_name)}</h2>
                <p style="color:var(--t2);margin:8px 0">${p.phone} | ${p.city||'—'} | Реф: <code>${p.referral_code}</code> | Промо: <code>${p.promo_code}</code></p>
                <div class="fg" style="margin-top:16px"><label>Уровень</label><select class="inp" id="m-lv">${r.levels.map(l=>`<option value="${l.id}" ${l.id===p.level_id?'selected':''}>${l.name}</option>`).join('')}</select></div>
                <button class="btn btn-y btn-s" id="m-sv-lv" data-id="${p.id}">Сохранить уровень</button>
                <hr style="margin:20px 0;border-color:var(--bd)">
                <h3>Коррекция баланса</h3>
                <div class="frow" style="margin-top:12px"><div class="fg"><label>Сумма</label><input type="number" class="inp" id="m-adj-a" step="0.01" placeholder="+ или -"></div><div class="fg"><label>Комментарий</label><input type="text" class="inp" id="m-adj-c"></div></div>
                <button class="btn btn-o btn-s" id="m-adj" data-id="${p.id}">Применить</button>
            `);
        }

        if (e.target.id === 'm-sv-lv') {
            await POST(`/api/admin/partner/${e.target.dataset.id}/level`, { level_id: +$('#m-lv').value });
            closeModal(); loadAdminPartners();
        }

        if (e.target.id === 'm-adj') {
            await POST(`/api/admin/partner/${e.target.dataset.id}/adjust`, { amount: +$('#m-adj-a').value, comment: $('#m-adj-c').value });
            closeModal(); loadAdminPartners();
        }

        // Edit referral
        if (e.target.classList.contains('a-edit-r')) {
            const d = e.target.dataset;
            openModal(`
                <h2>Клиент #${d.id}</h2><p style="color:var(--t2);margin:8px 0">Партнёр: ${d.partner}</p>
                <div class="fg"><label>Статус</label><select class="inp" id="m-rst"><option value="lead" ${d.status==='lead'?'selected':''}>Лид</option><option value="in_progress" ${d.status==='in_progress'?'selected':''}>В работе</option><option value="contract" ${d.status==='contract'?'selected':''}>Договор</option><option value="paid" ${d.status==='paid'?'selected':''}>Оплачен</option></select></div>
                <div class="fg"><label>Сумма договора</label><input type="number" class="inp" id="m-ramt" value="${d.amount}" step="0.01"></div>
                <button class="btn btn-y btn-s" id="m-sv-r" data-id="${d.id}">Сохранить</button>
            `);
        }

        if (e.target.id === 'm-sv-r') {
            await POST(`/api/admin/referral/${e.target.dataset.id}`, { status: $('#m-rst').value, contract_amount: +$('#m-ramt').value });
            closeModal(); loadAdminReferrals(); loadAdminPartners();
        }

        // Edit payout
        if (e.target.classList.contains('a-edit-py')) {
            const d = e.target.dataset;
            openModal(`
                <h2>Выплата #${d.id}</h2><p style="color:var(--t2);margin:8px 0">${d.partner} — ${fmt(d.amount)} ₽</p>
                <div class="fg"><label>Статус</label><select class="inp" id="m-pyst"><option value="processing">В обработке</option><option value="paid">Выплачено</option><option value="rejected">Отклонена</option></select></div>
                <div class="fg"><label>Комментарий</label><input type="text" class="inp" id="m-pyc"></div>
                <button class="btn btn-y btn-s" id="m-sv-py" data-id="${d.id}">Сохранить</button>
            `);
        }

        if (e.target.id === 'm-sv-py') {
            await POST(`/api/admin/payout/${e.target.dataset.id}`, { status: $('#m-pyst').value, comment: $('#m-pyc').value });
            closeModal(); loadAdminPayouts();
        }

        // Delete level row
        if (e.target.classList.contains('lv-del')) e.target.closest('tr').remove();
    });

    // Save settings
    $('#a-save-s')?.addEventListener('click', async () => {
        await POST('/api/admin/settings', {
            cookie_lifetime_days: $('#as-cookie').value,
            min_payout_amount: $('#as-minpay').value,
            program_description: $('#as-desc').value,
            telegram_bot_token: $('#as-tg').value,
            telegram_bot_username: $('#as-tgu').value,
            max_bot_token: $('#as-max').value,
        });
        alert('Настройки сохранены');
    });

    // Add level
    $('#a-add-lv')?.addEventListener('click', () => {
        const tb = $('#a-lv-tb');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input class="inp lv-n" value="" placeholder="Название" style="padding:8px"></td>
            <td><input type="number" class="inp lv-mc" value="0" min="0" style="padding:8px"></td>
            <td><input type="number" class="inp lv-ma" value="0" min="0" step="0.01" style="padding:8px"></td>
            <td><select class="inp lv-rt" style="padding:8px"><option value="percent">%</option><option value="fixed">Фикс.</option></select></td>
            <td><input type="number" class="inp lv-rv" value="0" min="0" step="0.01" style="padding:8px"></td>
            <td><button class="btn btn-o btn-s lv-del">&#10005;</button></td>`;
        tb.appendChild(tr);
    });

    // Save levels
    $('#a-save-lv')?.addEventListener('click', async () => {
        const rows = $$('#a-lv-tb tr');
        const levels = Array.from(rows).map(tr => ({
            name: tr.querySelector('.lv-n').value,
            min_clients: +tr.querySelector('.lv-mc').value,
            min_amount: +tr.querySelector('.lv-ma').value,
            reward_type: tr.querySelector('.lv-rt').value,
            reward_value: +tr.querySelector('.lv-rv').value,
        }));
        await POST('/api/admin/levels', { levels });
        alert('Уровни сохранены');
    });
}

async function downloadCSV(type) {
    const r = await fetch(`/api/admin/export/${type}`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${type}.csv`; a.click();
    URL.revokeObjectURL(url);
}

// ===== Modal =====
function openModal(html) {
    $('#modal-body').innerHTML = html;
    $('#modal').style.display = 'flex';
}
function closeModal() { $('#modal').style.display = 'none'; }

$('#modal-close')?.addEventListener('click', closeModal);
$('#modal')?.addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

// ===== Utils =====
function showMsg(id, type, msg) {
    const el = $(`#${id}`);
    el.className = `msg msg-${type === 'err' ? 'err' : 'ok'}`;
    el.textContent = msg; el.style.display = 'block';
    if (type === 'ok') setTimeout(() => el.style.display = 'none', 3000);
}
function hideMsg(id) { const el = $(`#${id}`); if (el) el.style.display = 'none'; }

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initAuth();
    initTabs('nav');
    initTabs('admin-nav');
    initCabinetActions();
    initAdmin();

    // Route
    if (location.pathname === '/admin') {
        show('admin');
        loadAdmin();
    } else if (TOKEN) {
        enterCabinet();
    } else {
        show('auth');
    }
});

})();
