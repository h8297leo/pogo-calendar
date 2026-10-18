// Worker 本機單元測試（模擬 KV 與 caches）：node test/worker.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../worker/src/index.js';
import { validateIcs } from '../scripts/validate-ics.mjs';

const events = JSON.parse(await readFile(new URL('../site/data/events.json', import.meta.url), 'utf8'));
const kv = new Map();
const env = {
  EVENTS_URL: 'https://example.github.io/pogo-calendar/data/events.json',
  ALLOWED_ORIGIN: 'https://example.github.io',
  TRACKS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v), delete: async (k) => kv.delete(k) },
};
globalThis.caches = { default: { match: async () => null, put: async () => {} } };
globalThis.fetch = async () => new Response(JSON.stringify(events));
const ctx = { waitUntil() {} };
const call = (method, path, origin = 'https://example.github.io') =>
  worker.fetch(new Request('https://w.dev' + path, { method, headers: { Origin: origin } }), env, ctx);

const token = 'AbCdEfGhIjKlMnOpQrStUv';
const sample = events.events.find((e) => e.type === 'community-day') || events.events[0];
if (!sample) { console.log('（沒有活動資料，略過 Worker 測試）'); process.exit(0); }
const id = sample.id;

let r = await call('PUT', `/u/${token}/track/${id}`);
assert.equal(r.status, 200);
assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://example.github.io');
assert.deepEqual((await r.json()).tracked, [id]);
r = await call('GET', `/u/${token}.ics`);
const ics = await r.text();
assert.match(r.headers.get('Content-Type'), /text\/calendar/);
assert.ok(ics.includes(`UID:${id}@pogo-calendar`));
assert.deepEqual(validateIcs(ics), []);
r = await call('DELETE', `/u/${token}/track/${id}`);
assert.deepEqual((await r.json()).tracked, []);
assert.ok(!(await (await call('GET', `/u/${token}.ics`)).text()).includes('BEGIN:VEVENT'));
assert.equal((await call('GET', '/u/short')).status, 400);
assert.equal((await call('PUT', `/u/${token}/track/${encodeURIComponent('<bad>')}`)).status, 400);
assert.equal((await call('GET', `/u/${token}`, 'https://evil.com')).headers.get('Access-Control-Allow-Origin'), null);
console.log('✔ Worker 測試全部通過');
