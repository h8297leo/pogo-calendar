import config from './config.js';
import { taipeiParts, SITE_OFFSET_MS, icsCalendar, sanitizeId } from './assets/core.mjs';

const DAY = 24 * 60 * 60 * 1000;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 私密模式 */ } },
};

const state = {
  events: [],
  types: [],
  tab: store.get('pogo.tab', 'week'),
  type: 'all',
  channel: 'stable',
  tracked: new Set(store.get('pogo.tracked', [])),
  token: store.get('pogo.token', null),
};

// ---------------------------------------------------------------------------
// 時間範圍（台灣時間）
// ---------------------------------------------------------------------------
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const p2 = (n) => String(n).padStart(2, '0');
const tpMidnight = (y, m, d) => Date.UTC(y, m - 1, d) - SITE_OFFSET_MS;

function ranges(now = Date.now()) {
  const t = taipeiParts(now);
  const today = tpMidnight(t.y, t.m, t.d);
  const weekStart = today - ((t.dow + 6) % 7) * DAY;
  const q = Math.floor((t.m - 1) / 3);
  return {
    live: { label: '進行中', from: now, to: now, desc: '目前正在進行的活動' },
    week: { label: '本週', from: weekStart, to: weekStart + 7 * DAY, desc: `${fmtMD(weekStart)}（一）– ${fmtMD(weekStart + 6 * DAY)}（日）` },
    month: { label: '本月', from: tpMidnight(t.y, t.m, 1), to: tpMidnight(t.y, t.m + 1, 1), desc: `${t.y} 年 ${t.m} 月` },
    quarter: { label: '本季', from: tpMidnight(t.y, q * 3 + 1, 1), to: tpMidnight(t.y, q * 3 + 4, 1), desc: `${t.y} 年第 ${q + 1} 季（${q * 3 + 1}–${q * 3 + 3} 月）` },
    all: { label: '全部', from: -Infinity, to: Infinity, desc: '所有已公布的活動' },
  };
}

function fmtMD(ms) { const p = taipeiParts(ms); return `${p.m}/${p.d}`; }
function fmtFull(ms) { const p = taipeiParts(ms); return `${p.m}/${p.d}（${WEEK[p.dow]}）${p2(p.hh)}:${p2(p.mm)}`; }
function fmtTime(ms) { const p = taipeiParts(ms); return `${p2(p.hh)}:${p2(p.mm)}`; }

function fmtWhen(e) {
  if (e.endMs == null) return `${fmtFull(e.startMs)} 起`;
  const sameDay = fmtMD(e.startMs) === fmtMD(e.endMs);
  return sameDay ? `${fmtFull(e.startMs)} – ${fmtTime(e.endMs)}` : `${fmtFull(e.startMs)} – ${fmtFull(e.endMs)}`;
}

function relative(ms, now) {
  const diff = ms - now;
  const abs = Math.abs(diff);
  if (abs < 60 * 60 * 1000) return `${Math.max(1, Math.round(abs / 60000))} 分鐘`;
  if (abs < DAY) return `${Math.round(abs / 3600000)} 小時`;
  return `${Math.round(abs / DAY)} 天`;
}

function status(e, now) {
  const end = e.endMs ?? e.startMs + 60 * 60 * 1000;
  if (now < e.startMs) return { key: 'soon', text: `${relative(e.startMs, now)}後開始` };
  if (now < end) return { key: 'live', text: e.endMs == null ? '進行中' : `進行中・剩 ${relative(end, now)}` };
  return { key: 'ended', text: '已結束' };
}

const overlaps = (e, r) => {
  const end = e.endMs ?? e.startMs + 60 * 60 * 1000;
  return e.startMs <= r.to && end >= r.from;
};

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------
function inTab(e, key, R, now) {
  if (key === 'live') return status(e, now).key === 'live';
  return overlaps(e, R[key]);
}

function renderTabs() {
  const now = Date.now();
  const R = ranges(now);
  $('#tabs').innerHTML = Object.entries(R).map(([k, r]) => {
    const n = state.events.filter((e) => inTab(e, k, R, now)).length;
    return `<button class="tab" role="tab" type="button" data-tab="${k}" aria-selected="${k === state.tab}">${r.label}<span class="n">${n}</span></button>`;
  }).join('');
  $('#range-label').textContent = R[state.tab].desc;
}

function renderChips() {
  const now = Date.now();
  const R = ranges(now);
  const inRange = state.events.filter((e) => inTab(e, state.tab, R, now));
  const counts = {};
  inRange.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
  const tracked = inRange.filter((e) => state.tracked.has(e.id)).length;
  const chip = (key, label, cat, n) =>
    `<button class="chip" type="button" data-type="${key}" aria-pressed="${state.type === key}" style="--c: var(--c-${cat})">${cat ? '<i></i>' : ''}${esc(label)} ${n}</button>`;
  const types = state.types.filter((t) => counts[t.type]);
  if (state.type !== 'all' && state.type !== 'tracked' && !counts[state.type]) state.type = 'all';
  $('#chips').innerHTML = [
    chip('all', '全部', '', inRange.length),
    tracked ? chip('tracked', '⭐ 我的追蹤', '', tracked) : '',
    ...types.map((t) => chip(t.type, t.zh, t.category, counts[t.type])),
  ].join('');
}

function monHTML(p) {
  const zh = p.nameZh || p.name;
  return `<li class="mon">
    <div class="pic">${p.image ? `<img src="${esc(p.image)}" alt="${esc(zh)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>
    ${p.shiny ? '<span class="sparkle" title="可能遇到異色" aria-label="可能遇到異色">✨</span>' : ''}
    <span class="zh">${esc(zh)}</span>
    ${p.nameZh && p.nameZh !== p.name ? `<span class="en">${esc(p.name)}</span>` : ''}
  </li>`;
}

function cardHTML(e, now) {
  const st = status(e, now);
  const tracked = state.tracked.has(e.id);
  const mons = e.pokemon.length ? `<div>
      <p class="mon-label">${esc(e.pokemonLabel)}</p>
      <ul class="mons">${e.pokemon.map(monHTML).join('')}</ul>
    </div>` : '';
  const extraShinies = e.shinies.filter((s) => !e.pokemon.some((p) => p.name === s.name));
  const shinies = extraShinies.length ? `<div class="shinies">✨ 異色：${extraShinies.map((s) =>
    s.image ? `<img src="${esc(s.image)}" alt="${esc(s.nameZh || s.name)}" title="${esc(s.nameZh || s.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(this.alt + ' ')">` : `<span>${esc(s.nameZh || s.name)}</span>`).join('')}</div>` : '';
  const bonuses = e.bonuses.length ? `<ul class="bonuses">${e.bonuses.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
  const noDetail = !e.pokemon.length && !e.bonuses.length;
  return `<li class="card ${e.image ? '' : 'no-img'}" data-cat="${e.category}" data-id="${esc(e.id)}">
    <div class="banner">
      ${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.card').classList.add('img-failed');this.remove()">` : ''}
      <span class="status ${st.key}">${st.text}</span>
    </div>
    <div class="body">
      <div class="meta-row">
        <span class="type">${esc(e.typeZh)}</span>
        ${e.startUTC ? '<span class="global" title="全球同一時刻開始，已換算成台灣時間">全球同步</span>' : ''}
        ${e.image ? '' : `<span class="status-inline">${st.text}</span>`}
      </div>
      <h3>${esc(e.name)}</h3>
      ${e.nameEn && e.nameEn !== e.name ? `<p class="name-en" lang="en">${esc(e.nameEn)}</p>` : ''}
      <p class="when">${fmtWhen(e)}</p>
      ${mons}${shinies}${bonuses}
      ${noDetail && e.hasSpawns ? '<p class="mon-label">此活動有特別出現的寶可夢，詳見活動頁。</p>' : ''}
      <div class="actions">
        <button class="btn btn-track" type="button" data-track="${esc(e.id)}" aria-pressed="${tracked}">
          <span class="s">${tracked ? '★' : '☆'}</span>${tracked ? '已追蹤' : '追蹤'}
        </button>
        <a class="btn btn-soft" href="cal/event/${sanitizeId(e.id)}.ics" aria-label="把 ${esc(e.name)} 加入行事曆（單次）">加入行事曆</a>
        ${e.link ? `<a class="btn btn-soft" href="${esc(e.link)}" target="_blank" rel="noopener">詳情</a>` : ''}
      </div>
    </div>
  </li>`;
}

function render() {
  const now = Date.now();
  const R = ranges(now);
  renderTabs();
  renderChips();
  let list = state.events.filter((e) => inTab(e, state.tab, R, now));
  if (state.type === 'tracked') list = list.filter((e) => state.tracked.has(e.id));
  else if (state.type !== 'all') list = list.filter((e) => e.type === state.type);
  // 進行中/即將開始的優先，已結束的放最後
  const rank = { live: 0, soon: 1, ended: 2 };
  list.sort((a, b) => rank[status(a, now).key] - rank[status(b, now).key] || a.startMs - b.startMs);
  $('#cards').innerHTML = list.map((e) => cardHTML(e, now)).join('');
  const empty = $('#empty');
  empty.hidden = list.length > 0;
  empty.textContent = state.events.length ? '這個範圍目前沒有活動。' : '目前沒有活動資料。';
}

// ---------------------------------------------------------------------------
// 追蹤同步
// ---------------------------------------------------------------------------
const workerURL = () => config.worker?.[state.channel] || '';

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

function ensureToken() {
  if (!state.token) { state.token = newToken(); store.set('pogo.token', state.token); }
  return state.token;
}
const personalICS = () => `${workerURL()}/u/${state.token}.ics`;
const webcal = (httpsURL) => httpsURL.replace(/^https?:\/\//, 'webcal://');

async function api(method, path) {
  const res = await fetch(`${workerURL()}${path}`, { method, headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function syncFromServer() {
  if (!workerURL() || !state.token) return;
  try {
    const data = await api('GET', `/u/${state.token}`);
    state.tracked = new Set(data.tracked || []);
    store.set('pogo.tracked', [...state.tracked]);
    render();
  } catch (e) { console.warn('同步追蹤清單失敗', e); }
}

async function toggleTrack(id) {
  const was = state.tracked.has(id);
  const first = !was && !store.get('pogo.onboarded', false);
  was ? state.tracked.delete(id) : state.tracked.add(id);
  store.set('pogo.tracked', [...state.tracked]);
  render();
  if (workerURL()) {
    ensureToken();
    try {
      await api(was ? 'DELETE' : 'PUT', `/u/${state.token}/track/${encodeURIComponent(id)}`);
      toast(was ? '已取消追蹤，行事曆會在下次更新時移除' : '已追蹤，會同步到你的訂閱行事曆');
    } catch {
      was ? state.tracked.add(id) : state.tracked.delete(id);
      store.set('pogo.tracked', [...state.tracked]);
      render();
      toast('同步失敗，請稍後再試');
      return;
    }
  } else {
    toast(was ? '已取消追蹤' : '已追蹤（存在這台裝置）');
  }
  if (first) { store.set('pogo.onboarded', true); openSubscribe(); }
}

function renderMine() {
  const el = $('#mine-body');
  const n = state.tracked.size;
  if (workerURL()) {
    ensureToken();
    const url = personalICS();
    el.innerHTML = `
      <p class="hint">按卡片上的「☆ 追蹤」，活動就會自動加入這個行事曆。<b>只需要訂閱一次</b>，之後追蹤或取消都會自動同步。目前追蹤 ${n} 個活動。</p>
      <div class="row">
        <a class="btn btn-primary" href="${esc(webcal(url))}">訂閱我的追蹤行事曆</a>
        <button class="btn btn-ghost" type="button" id="copy-link">複製我的訂閱連結</button>
      </div>
      <details>
        <summary>換手機或換瀏覽器？還原追蹤清單</summary>
        <p class="hint" style="margin-top:8px">在舊裝置按「複製我的訂閱連結」，把連結貼到這裡即可還原。請把連結當密碼保管。</p>
        <div class="restore">
          <input id="restore-input" type="url" placeholder="貼上訂閱連結" autocomplete="off">
          <button class="btn btn-ghost" type="button" id="restore-btn">還原</button>
        </div>
      </details>`;
  } else {
    el.innerHTML = `
      <p class="hint">追蹤清單目前存在這台裝置（${n} 個活動）。可下載成行事曆檔一次加入；之後新追蹤的活動需要再下載一次。</p>
      <div class="row"><button class="btn btn-primary" type="button" id="download-mine" ${n ? '' : 'disabled'}>下載我的追蹤（.ics）</button></div>`;
  }
}

function renderSubList() {
  const root = new URL('../cal/', location.href).href;
  const typesWithEvents = state.types;
  $('#sub-list').innerHTML = [
    `<a class="chip all" href="${esc(webcal(root + 'all.ics'))}">全部活動</a>`,
    ...typesWithEvents.map((t) => `<a class="chip" style="--c: var(--c-${t.category})" href="${esc(webcal(root + sanitizeId(t.type) + '.ics'))}"><i></i>${esc(t.zh)}</a>`),
  ].join('');
}

function openSubscribe() {
  renderMine();
  renderSubList();
  const dlg = $('#subscribe');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

function downloadMine() {
  const list = state.events.filter((e) => state.tracked.has(e.id));
  const ics = icsCalendar({ name: '我的寶可夢GO追蹤', events: list });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'pogo-tracked.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function restore() {
  const v = $('#restore-input').value.trim();
  const m = v.match(/\/u\/([A-Za-z0-9_-]{22})(?:\.ics)?/);
  if (!m || !TOKEN_RE.test(m[1])) { toast('連結格式不正確'); return; }
  state.token = m[1];
  store.set('pogo.token', state.token);
  await syncFromServer();
  renderMine();
  toast(`已還原，共 ${state.tracked.size} 個追蹤`);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------------------------------------------------------------------------
// 啟動
// ---------------------------------------------------------------------------
async function loadVersionInfo() {
  $('#version-label').textContent = config.version;
  try {
    const res = await fetch('../versions.json', { cache: 'no-store' });
    if (!res.ok) return;
    const versions = await res.json();
    const me = versions.find((v) => v.version === config.version);
    state.channel = me?.status === 'stable' ? 'stable' : 'test';
    if (me && me.status !== 'stable') {
      const stable = versions.find((v) => v.status === 'stable');
      const b = $('#test-banner');
      b.innerHTML = me.status === 'archived'
        ? `這是舊版本 ${esc(config.version)}。${stable ? `<a href="../${esc(stable.version)}/">前往正式版</a>` : ''}`
        : `🧪 測試版 ${esc(config.version)}${stable ? ` · <a href="../${esc(stable.version)}/">前往正式版 ${esc(stable.version)}</a>` : ''}`;
      b.hidden = false;
    }
  } catch { /* 單獨開啟版本資料夾時沒有 versions.json */ }
}

async function main() {
  document.addEventListener('click', (ev) => {
    const tab = ev.target.closest('[data-tab]');
    if (tab) { state.tab = tab.dataset.tab; store.set('pogo.tab', state.tab); render(); return; }
    const chip = ev.target.closest('[data-type]');
    if (chip) { state.type = chip.dataset.type; render(); return; }
    const tr = ev.target.closest('[data-track]');
    if (tr) { toggleTrack(tr.dataset.track); return; }
    if (ev.target.closest('#open-subscribe')) { openSubscribe(); return; }
    if (ev.target.closest('#download-mine')) { downloadMine(); return; }
    if (ev.target.closest('#restore-btn')) { restore(); return; }
    if (ev.target.closest('#copy-link')) {
      navigator.clipboard?.writeText(personalICS()).then(() => toast('已複製訂閱連結'), () => toast(personalICS()));
    }
  });
  const dlg = $('#subscribe');
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });

  await loadVersionInfo();
  try {
    const res = await fetch('data/events.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.events = data.events;
    state.types = data.types.length ? data.types : [];
    const gen = new Date(data.generatedAt).getTime();
    $('#updated').textContent = `資料更新：${fmtFull(gen)}`;
  } catch (e) {
    $('#updated').textContent = '資料載入失敗，請重新整理';
    console.error(e);
  }
  if (!ranges()[state.tab]) state.tab = 'week';
  state.types.sort((a, b) => a.zh.localeCompare(b.zh, 'zh-Hant'));
  render();
  syncFromServer();
  setInterval(render, 60 * 1000); // 倒數每分鐘更新
}

main();
