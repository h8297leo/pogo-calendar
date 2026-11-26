// Cloudflare Worker：個人追蹤清單 → 專屬 ICS 訂閱
//
//   GET    /u/<token>.ics              我的追蹤行事曆（iPhone 訂閱這個）
//   GET    /u/<token>                  { tracked: [eventID...] }
//   PUT    /u/<token>/track/<eventID>  追蹤
//   DELETE /u/<token>/track/<eventID>  取消追蹤
//
// 環境變數（wrangler.toml）：EVENTS_URL、ALLOWED_ORIGIN；KV 綁定：TRACKS
import { icsCalendar } from '../../scripts/core.mjs';

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const EVENT_ID_RE = /^[A-Za-z0-9_.-]{1,120}$/;
const MAX_TRACKED = 300;
const CACHE_SECONDS = 3600;

function cors(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = {
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

async function getTracked(env, token) {
  const raw = await env.TRACKS.get(token);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

async function loadEvents(env, ctx) {
  const cache = caches.default;
  const key = new Request(env.EVENTS_URL);
  let res = await cache.match(key);
  if (!res) {
    res = await fetch(env.EVENTS_URL, { headers: { 'User-Agent': 'pogo-calendar-worker' } });
    if (!res.ok) throw new Error(`events.json HTTP ${res.status}`);
    res = new Response(res.body, res);
    res.headers.set('Cache-Control', `public, max-age=${CACHE_SECONDS}`);
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  const data = await res.json();
  return data.events || [];
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, service: 'pogo-calendar' }, 200, h);
    }

    const m = url.pathname.match(/^\/u\/([^/]+?)(\.ics)?(?:\/track\/([^/]+))?\/?$/);
    if (!m) return json({ error: 'not found' }, 404, h);
    const [, token, isIcs, rawId] = m;
    if (!TOKEN_RE.test(token)) return json({ error: 'invalid token' }, 400, h);

    // ---- ICS ----
    if (isIcs) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'method not allowed' }, 405, h);
      const tracked = new Set(await getTracked(env, token));
      let events = [];
      try {
        events = (await loadEvents(env, ctx)).filter((e) => tracked.has(e.id));
      } catch (e) {
        return new Response('暫時無法取得活動資料', { status: 503, headers: { ...h, 'Retry-After': '600' } });
      }
      const body = icsCalendar({ name: '我的寶可夢GO追蹤', description: 'Pokemon GO 活動曆：我追蹤的活動（非官方）', events });
      return new Response(req.method === 'HEAD' ? null : body, {
        headers: {
          ...h,
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'inline; filename="pogo-tracked.ics"',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // ---- 清單 ----
    if (!rawId) {
      if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405, h);
      return json({ tracked: await getTracked(env, token) }, 200, h);
    }

    // ---- 追蹤／取消 ----
    let id;
    try { id = decodeURIComponent(rawId); } catch { return json({ error: 'invalid event id' }, 400, h); }
    if (!EVENT_ID_RE.test(id)) return json({ error: 'invalid event id' }, 400, h);
    const list = await getTracked(env, token);
    let next = list;
    if (req.method === 'PUT') {
      if (!list.includes(id)) {
        if (list.length >= MAX_TRACKED) return json({ error: `最多追蹤 ${MAX_TRACKED} 個活動` }, 409, h);
        next = [...list, id];
      }
    } else if (req.method === 'DELETE') {
      next = list.filter((x) => x !== id);
    } else {
      return json({ error: 'method not allowed' }, 405, h);
    }
    if (next !== list) {
      if (next.length) await env.TRACKS.put(token, JSON.stringify(next));
      else await env.TRACKS.delete(token);
    }
    return json({ tracked: next }, 200, h);
  },
};
