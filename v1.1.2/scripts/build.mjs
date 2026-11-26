#!/usr/bin/env node
// 抓取 ScrapedDuck 活動資料 → 正規化 + 中文名 → 輸出 site/data/events.json 與 site/cal/*.ics
//
// 用法：
//   node scripts/build.mjs                 # 線上抓資料
//   node scripts/build.mjs --input x.json  # 用本機檔案（測試用）
//   node scripts/build.mjs --offline       # 不連 PokeAPI，只用快取的中文名
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTime, typeInfo, icsCalendar, sanitizeId } from './core.mjs';
import { translateEventName, translateBonus } from './zh-text.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const DEFAULT_NAMES_CACHE = join(ROOT, 'data', 'zh-names.json');
const SOURCE_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.min.json';
const SPECIES_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';
const LANG_EN = '9';
const LANG_ZH_HANT = '4';

const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const INPUT = argVal('--input');
const OFFLINE = args.includes('--offline');
const NAMES_CACHE = argVal('--names') ? resolve(argVal('--names')) : DEFAULT_NAMES_CACHE;

// ---------------------------------------------------------------------------
// 中文名
// ---------------------------------------------------------------------------
// 前綴（英文 → 中文），順序很重要：較長的放前面
const PREFIXES = [
  ['Gigantamax', '超極巨化'], ['Dynamax', '極巨化'], ['Mega', '超級'], ['Primal', '原始回歸'],
  ['Shadow', '暗影'], ['Alolan', '阿羅拉'], ['Galarian', '伽勒爾'], ['Hisuian', '洗翠'], ['Paldean', '帕底亞'],
  ['Shiny', '異色'], ['Apex', '頂尖'], ['Dark', '暗黑'], ['Armored', '鎧甲'], ['Origin Forme', '起源形態'],
];

async function loadNames() {
  let cache = { byDex: {}, enToDex: {} };
  if (existsSync(NAMES_CACHE)) {
    try { cache = { ...cache, ...JSON.parse(await readFile(NAMES_CACHE, 'utf8')) }; } catch { /* 損毀就重建 */ }
  }
  if (!OFFLINE && Object.keys(cache.byDex).length < 1000) {
    try {
      const res = await fetch(SPECIES_CSV);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csv = await res.text();
      // pokemon_species_id,local_language_id,name,genus
      for (const line of csv.split('\n').slice(1)) {
        const [id, lang, name] = line.split(',');
        if (!id || !name) continue;
        if (lang === LANG_ZH_HANT) cache.byDex[id] = name;
        if (lang === LANG_EN) cache.enToDex[name.toLowerCase()] = id;
      }
      await mkdir(dirname(NAMES_CACHE), { recursive: true });
      await writeFile(NAMES_CACHE, JSON.stringify(cache));
      console.log(`中文名對照：${Object.keys(cache.byDex).length} 筆`);
    } catch (e) {
      console.warn(`⚠ 無法下載中文名對照（${e.message}），將使用快取或英文名`);
    }
  }
  return cache;
}

function dexFromImage(url = '') {
  const m = url.match(/pokemon_icon_(\d+)/) || url.match(/\/pm(\d+)[._]/);
  return m ? String(parseInt(m[1], 10)) : null;
}

function makeTranslator(names) {
  const enKeys = Object.keys(names.enToDex).sort((a, b) => b.length - a.length);
  return function translate(enName = '', image = '') {
    let rest = enName.trim();
    let prefix = '';
    let changed = true;
    while (changed) {
      changed = false;
      for (const [en, zh] of PREFIXES) {
        if (rest.toLowerCase().startsWith(en.toLowerCase() + ' ')) {
          prefix += zh;
          rest = rest.slice(en.length + 1);
          changed = true;
        }
      }
    }
    let dex = dexFromImage(image);
    let suffix = '';
    const lower = rest.toLowerCase();
    const base = enKeys.find((k) => lower === k || lower.startsWith(k + ' ') || lower.startsWith(k + '('));
    if (base) {
      dex = dex || names.enToDex[base];
      suffix = rest.slice(base.length).trim();
    }
    const zhBase = dex ? names.byDex[dex] : null;
    if (!zhBase) return { nameZh: null, dex };
    return { nameZh: `${prefix}${zhBase}${suffix ? formSuffixZh(suffix) : ''}`, dex };
  };
}

// 形態／性別後綴：「(Incarnate)」→「（化身形態）」；認不出來就保留原文
const FORMS_ZH = {
  normal: '普通形態', attack: '攻擊形態', defense: '防禦形態', speed: '速度形態',
  origin: '起源形態', altered: '別種形態', incarnate: '化身形態', therian: '靈獸形態',
  land: '陸上形態', sky: '天空形態', aria: '歌聲形態', pirouette: '舞步形態',
  male: '公', female: '母',
};
function formSuffixZh(suffix) {
  const m = suffix.match(/^\((.+?)(?: Formes?)?\)$/i);
  const zh = m && FORMS_ZH[m[1].trim().toLowerCase()];
  return zh ? `（${zh}）` : ` ${suffix}`;
}

// ---------------------------------------------------------------------------
// 正規化
// ---------------------------------------------------------------------------
const stripTags = (s = '') => String(s).replace(/<[^>]*>/g, '').replace(/​/g, '').replace(/\s+/g, ' ').trim();

function toMon(p, translate, shinyDefault = false) {
  if (!p || !p.name) return null;
  const { nameZh, dex } = translate(p.name, p.image);
  return {
    name: p.name,
    nameZh,
    dex: dex ? Number(dex) : null,
    image: p.image || null,
    shiny: p.canBeShiny ?? shinyDefault,
  };
}

function normalize(raw, translate) {
  const t = typeInfo(raw.eventType);
  const start = parseTime(raw.start);
  const end = parseTime(raw.end);
  const x = raw.extraData || {};
  let pokemon = [];
  let shinies = [];
  let bonuses = [];
  let pokemonLabel = '登場寶可夢';
  const zhBonus = (b) => translateBonus(b) || b;

  if (x.communityday) {
    const cd = x.communityday;
    const shinyNames = new Set((cd.shinies || []).map((s) => s.name));
    pokemon = (cd.spawns || []).map((p) => toMon(p, translate, shinyNames.has(p.name)));
    shinies = (cd.shinies || []).map((p) => toMon(p, translate, true));
    bonuses = (cd.bonuses || []).map((b) => stripTags(b.text)).filter(Boolean).map(zhBonus);
    pokemonLabel = '社群日寶可夢';
  }
  if (x.spotlight) {
    pokemon = [toMon(x.spotlight, translate)];
    if (x.spotlight.bonus) bonuses = [zhBonus(stripTags(x.spotlight.bonus))];
    pokemonLabel = '聚焦寶可夢';
  }
  if (x.breakthrough) {
    pokemon = [toMon(x.breakthrough, translate)];
    pokemonLabel = '突破獎勵';
  }
  if (x.raidbattles) {
    pokemon = (x.raidbattles.bosses || []).map((p) => toMon(p, translate));
    shinies = (x.raidbattles.shinies || []).map((p) => toMon(p, translate, true));
    pokemonLabel = '團體戰頭目';
  }

  const nameEn = stripTags(raw.name);
  const nameZh = translateEventName(nameEn, (en) => translate(en).nameZh);

  return {
    id: raw.eventID,
    name: nameZh || nameEn,
    nameEn,
    type: raw.eventType || 'event',
    typeZh: t.zh,
    category: t.category,
    heading: raw.heading || '',
    link: raw.link || '',
    image: raw.image || '',
    start: raw.start || null,
    end: raw.end || null,
    startMs: start?.ms ?? null,
    endMs: end?.ms ?? null,
    startUTC: start?.isUTC ?? false,
    endUTC: end?.isUTC ?? false,
    pokemonLabel,
    pokemon: pokemon.filter(Boolean),
    shinies: shinies.filter(Boolean),
    bonuses,
    hasSpawns: !!x.generic?.hasSpawns,
    hasFieldResearch: !!x.generic?.hasFieldResearchTasks,
  };
}

// ---------------------------------------------------------------------------
async function loadSource() {
  if (INPUT) return JSON.parse(await readFile(resolve(INPUT), 'utf8'));
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'pogo-calendar (GitHub Actions)' } });
  if (!res.ok) throw new Error(`ScrapedDuck HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const [rawEvents, names] = await Promise.all([loadSource(), loadNames()]);
  if (!Array.isArray(rawEvents)) throw new Error('來源資料格式錯誤：不是陣列');
  const translate = makeTranslator(names);
  const now = Date.now();
  const keepAfter = now - 3 * 24 * 60 * 60 * 1000; // 已結束超過 3 天的不顯示

  const seen = new Set();
  const events = rawEvents
    .map((r) => normalize(r, translate))
    .filter((e) => e.id && !seen.has(e.id) && seen.add(e.id))
    .filter((e) => e.startMs != null)
    .filter((e) => (e.endMs ?? e.startMs) >= keepAfter)
    .sort((a, b) => a.startMs - b.startMs || (a.endMs ?? 0) - (b.endMs ?? 0));

  const types = [...new Set(events.map((e) => e.type))];
  const generatedAt = new Date(now).toISOString();

  await rm(join(SITE, 'cal'), { recursive: true, force: true });
  await mkdir(join(SITE, 'data'), { recursive: true });
  await mkdir(join(SITE, 'cal', 'event'), { recursive: true });
  // 前端也要用同一份核心（時間、ICS）
  await mkdir(join(SITE, 'assets'), { recursive: true });
  await copyFile(join(ROOT, 'scripts', 'core.mjs'), join(SITE, 'assets', 'core.mjs'));

  await writeFile(join(SITE, 'data', 'events.json'), JSON.stringify({
    generatedAt,
    source: 'ScrapedDuck / LeekDuck.com',
    types: types.map((t) => ({ type: t, ...typeInfo(t) })),
    events,
  }));

  const writeCal = (file, name, list, description) =>
    writeFile(join(SITE, 'cal', file), icsCalendar({ name, description, events: list, dtstamp: now }));

  await writeCal('all.ics', 'Pokemon GO 全部活動', events, 'Pokemon GO 活動曆：全部活動（非官方）');
  for (const t of types) {
    const info = typeInfo(t);
    await writeCal(`${sanitizeId(t)}.ics`, `Pokemon GO ${info.zh}`, events.filter((e) => e.type === t), `Pokemon GO 活動曆：${info.zh}（非官方）`);
  }
  for (const e of events) {
    await writeCal(`event/${sanitizeId(e.id)}.ics`, `Pokemon GO ${e.typeZh}`, [e]);
  }

  const missing = new Set();
  events.forEach((e) => [...e.pokemon, ...e.shinies].forEach((p) => !p.nameZh && missing.add(p.name)));
  console.log(`✔ ${events.length} 個活動、${types.length} 種類型 → ${SITE}`);
  if (missing.size) console.log(`  缺中文名：${[...missing].join(', ')}`);
}

main().catch((e) => { console.error('✘ build 失敗：', e); process.exit(1); });
