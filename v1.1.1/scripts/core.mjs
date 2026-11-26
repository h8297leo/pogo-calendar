// 共用核心：活動類型對照、時間處理、ICS 產生。
// 這個檔案不可使用任何 Node 專屬 API，因為 Cloudflare Worker 也會 import 它。

export const SITE_TZ = 'Asia/Taipei';
export const SITE_OFFSET_MS = 8 * 60 * 60 * 1000; // 台灣無日光節約時間，固定 +08:00
export const UID_DOMAIN = 'pogo-calendar';

// ---------------------------------------------------------------------------
// 活動類型（ScrapedDuck wiki 列出的全部類型）
// category 決定網頁上的配色
// ---------------------------------------------------------------------------
export const EVENT_TYPES = {
  'community-day': { zh: '社群日', category: 'cd' },
  'event': { zh: '活動', category: 'event' },
  'live-event': { zh: '實體活動', category: 'event' },
  'pokemon-go-fest': { zh: 'GO Fest', category: 'big' },
  'global-challenge': { zh: '全球挑戰', category: 'event' },
  'safari-zone': { zh: '狩獵地帶', category: 'big' },
  'ticketed-event': { zh: '售票活動', category: 'big' },
  'location-specific': { zh: '地區限定', category: 'event' },
  'bonus-hour': { zh: '加成時間', category: 'hour' },
  'pokemon-spotlight-hour': { zh: '聚焦時刻', category: 'hour' },
  'potential-ultra-unlock': { zh: '潛在解鎖', category: 'event' },
  'update': { zh: '遊戲更新', category: 'misc' },
  'season': { zh: '賽季', category: 'misc' },
  'pokemon-go-tour': { zh: 'GO Tour', category: 'big' },
  'go-pass': { zh: 'GO Pass', category: 'misc' },
  'choose-your-path': { zh: '選擇路線', category: 'event' },
  'ticketed': { zh: '售票', category: 'big' },
  'pokestop-showcase': { zh: '補給站展示', category: 'misc' },
  'wild-area': { zh: '野外區域', category: 'big' },
  'city-safari': { zh: '城市狩獵', category: 'big' },
  'research': { zh: '調查', category: 'research' },
  'timed-research': { zh: '限時調查', category: 'research' },
  'limited-research': { zh: '限定調查', category: 'research' },
  'research-breakthrough': { zh: '調查突破', category: 'research' },
  'special-research': { zh: '特別調查', category: 'research' },
  'research-day': { zh: '調查日', category: 'research' },
  'raid-day': { zh: '團體戰日', category: 'raid' },
  'raid-battles': { zh: '團體戰', category: 'raid' },
  'raid-hour': { zh: '團體戰時間', category: 'raid' },
  'raid-weekend': { zh: '團體戰週末', category: 'raid' },
  'go-battle-league': { zh: 'GO 對戰聯盟', category: 'battle' },
  'elite-raids': { zh: '精英團體戰', category: 'raid' },
  'max-battles': { zh: '極巨對戰', category: 'raid' },
  'max-mondays': { zh: '極巨星期一', category: 'raid' },
  'go-rocket-takeover': { zh: '火箭隊入侵', category: 'rocket' },
  'team-go-rocket': { zh: 'GO 火箭隊', category: 'rocket' },
  'giovanni-special-research': { zh: '坂木特別調查', category: 'rocket' },
};

export function typeInfo(type) {
  return EVENT_TYPES[type] || { zh: type || '其他', category: 'misc' };
}

// ---------------------------------------------------------------------------
// 時間
// ScrapedDuck：結尾有 Z（或時區位移）= 全球同時；否則 = 玩家當地時間。
// 網站以台灣時間計算，所以當地時間視為 +08:00。
// ---------------------------------------------------------------------------
export function parseTime(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  const isUTC = /(Z|[+-]\d\d:?\d\d)$/.test(s);
  const iso = isUTC ? s : s.replace(/\.\d+$/, '') + '+08:00';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return { ms, isUTC };
}

// 把 epoch 轉成台灣牆上時間的各欄位
export function taipeiParts(ms) {
  const d = new Date(ms + SITE_OFFSET_MS);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    hh: d.getUTCHours(), mm: d.getUTCMinutes(), ss: d.getUTCSeconds(),
    dow: d.getUTCDay(),
  };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

function icsUTC(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function icsFloating(ms) {
  const p = taipeiParts(ms);
  return `${p.y}${pad(p.m)}${pad(p.d)}T${pad(p.hh)}${pad(p.mm)}${pad(p.ss)}`;
}

// ---------------------------------------------------------------------------
// ICS（RFC 5545）
// ---------------------------------------------------------------------------
export function icsEscape(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();
// 每行不得超過 75 octets；續行以一個空白開頭。不可切斷多位元組字元。
export function foldLine(line) {
  if (encoder.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = encoder.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = ' ';
      curBytes = 1;
      limit = 75;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

function prop(name, value) {
  return foldLine(`${name}:${value}`);
}

export function sanitizeId(id) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 120);
}

function eventSummary(ev) {
  const names = (ev.pokemon || []).slice(0, 3).map((p) => p.nameZh || p.name);
  const extra = names.length ? `（${names.join('、')}）` : '';
  return `【${ev.typeZh}】${ev.name}${extra}`;
}

function eventDescription(ev) {
  const lines = [`類型：${ev.typeZh}`];
  if (ev.pokemon?.length) {
    lines.push(`寶可夢：${ev.pokemon.map((p) => (p.nameZh && p.nameZh !== p.name ? `${p.nameZh}(${p.name})` : p.name) + (p.shiny ? '✨' : '')).join('、')}`);
  }
  if (ev.bonuses?.length) lines.push(`加成：${ev.bonuses.join('；')}`);
  lines.push(ev.startUTC ? '時間：全球同步' : '時間：依當地時間');
  if (ev.link) lines.push(`詳情：${ev.link}`);
  lines.push('資料來源：LeekDuck.com／ScrapedDuck（非官方）');
  return lines.join('\n');
}

export function icsEvent(ev, { dtstamp = Date.now() } = {}) {
  if (ev.startMs == null) return '';
  const endMs = ev.endMs != null && ev.endMs > ev.startMs ? ev.endMs : ev.startMs + 60 * 60 * 1000;
  const startUTC = !!ev.startUTC;
  const endUTC = ev.endMs != null ? !!ev.endUTC : startUTC;
  const lines = [
    'BEGIN:VEVENT',
    prop('UID', `${sanitizeId(ev.id)}@${UID_DOMAIN}`),
    prop('DTSTAMP', icsUTC(dtstamp)),
    prop('DTSTART', startUTC ? icsUTC(ev.startMs) : icsFloating(ev.startMs)),
    prop('DTEND', endUTC ? icsUTC(endMs) : icsFloating(endMs)),
    prop('SUMMARY', icsEscape(eventSummary(ev))),
    prop('DESCRIPTION', icsEscape(eventDescription(ev))),
    prop('CATEGORIES', icsEscape(ev.typeZh)),
  ];
  if (ev.link) lines.push(prop('URL', ev.link));
  const duration = endMs - ev.startMs;
  if (duration <= 3 * 24 * 60 * 60 * 1000) {
    const alarm = (trigger, text) => [
      'BEGIN:VALARM', 'ACTION:DISPLAY', prop('DESCRIPTION', icsEscape(text)), `TRIGGER:${trigger}`, 'END:VALARM',
    ];
    lines.push(...alarm('-PT1H', `${ev.typeZh} 一小時後開始：${ev.name}`));
    if (ev.type === 'community-day') lines.push(...alarm('-P1D', `明天社群日：${ev.name}`));
  }
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

export function icsCalendar({ name, description = '', events = [], dtstamp = Date.now() }) {
  const head = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pokemon GO 活動曆//pogo-calendar//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    prop('X-WR-CALNAME', icsEscape(name)),
    prop('X-WR-CALDESC', icsEscape(description || name)),
    'X-PUBLISHED-TTL:PT6H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
  ];
  const body = events.map((ev) => icsEvent(ev, { dtstamp })).filter(Boolean);
  return [...head, ...body, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
