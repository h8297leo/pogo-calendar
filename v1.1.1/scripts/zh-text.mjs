// 活動名稱與加成說明：英文 → 台灣中文（規則式翻譯）
// 只處理能完整辨識的格式；認不出來就回傳 null，由呼叫端保留英文原文，避免中英夾雜的怪翻譯。
// 名稱以 Pokémon GO 官方繁體中文公告（pokemongo.com/zh-Hant）的用法為準；官方沒寫到的才自行翻譯。
// 不可用 Node API（與 core.mjs 相同原則）。

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthNo = (s) => MONTHS.indexOf(String(s || '').toLowerCase()) + 1; // 0 = 不是月份

// GO 對戰聯盟的聯盟／盃賽名稱
const LEAGUES = {
  'great league': '超級聯盟', 'ultra league': '高級聯盟', 'master league': '大師聯盟',
  'little cup': '小小盃', 'halloween cup': '萬聖節盃', 'holiday cup': '假日盃', 'retro cup': '復古盃',
  'fantasy cup': '奇幻盃', 'love cup': '愛情盃', 'spring cup': '春季盃', 'summer cup': '夏日盃',
  'fossil cup': '化石盃', 'jungle cup': '叢林盃', 'catch cup': '速成盃', 'mega catch cup': '超級速成盃',
  'element cup': '元素盃', 'sunshine cup': '陽光盃', 'hisui cup': '洗翠盃', 'kanto cup': '關都盃',
  'johto cup': '城都盃', 'hoenn cup': '豐緣盃', 'sinnoh cup': '神奧盃', 'unova cup': '合眾盃',
  'kalos cup': '卡洛斯盃', 'alola cup': '阿羅拉盃', 'galar cup': '伽勒爾盃', 'paldea cup': '帕底亞盃',
  'willpower cup': '意志力盃', 'fighting cup': '格鬥盃', 'mountain cup': '山岳盃', 'color cup': '四色盃',
  'premier cup': '首要盃', 'evolution cup': '進化盃', 'psychic cup': '超能力盃', 'weather cup': '天氣盃',
};
// 「Mega Edition」等版本後綴
const EDITIONS = { 'mega edition': '超級版', 'great league edition': '超級聯盟版', 'ultra league edition': '高級聯盟版', 'remix': '混合版' };
// GO Championship 地區盃
const CHAMPIONSHIP = { euic: '歐洲盃', naic: '北美洲盃', laic: '拉丁美洲盃', ocic: '大洋洲盃', apac: '亞太盃' };

// 賽季（官方繁中名稱）
const SEASONS = {
  'twilight trails': '黃昏之旅', 'daydream destinations': '夢途漫漫', 'delightful days': '快樂每一天',
};
// 有固定名稱的活動
const NAMED = {
  'twilight wishes': '黃昏時分的心願', 'tropical paradise': '熱帶樂園',
};
// 節日／活動常見詞（只在整段名稱都能對上時使用）
const HOLIDAYS = {
  'halloween': '萬聖節', 'holiday': '節慶', 'holidays': '節慶', 'winter holiday': '冬季節慶',
  'lunar new year': '農曆新年', 'valentine\'s day': '情人節', 'spring into spring': '春日來臨',
  'pokémon day': '寶可夢日', 'pokemon day': '寶可夢日', 'new year\'s': '新年',
};
// 小隕星雨（官方：流星雨名稱）
const METEOR = {
  orionids: '獵戶座流星雨', leonids: '獅子座流星雨', geminids: '雙子座流星雨', perseids: '英仙座流星雨',
  'eta aquariids': '水瓶座η流星雨', 'southern delta aquariids': '水瓶座δ南流星雨', quadrantids: '象限儀座流星雨',
  lyrids: '天琴座流星雨', draconids: '天龍座流星雨', taurids: '金牛座流星雨', ursids: '小熊座流星雨',
};
const TOUR_PLACE = { global: '全球', kaohsiung: '高雄', 'los angeles': '洛杉磯', taipei: '台北', tainan: '台南' };
const TOUR_REGION = { alola: '阿羅拉地區', unova: '合眾地區', sinnoh: '神奧地區', hoenn: '豐緣地區', johto: '城都地區', kanto: '關都地區', kalos: '卡洛斯地區' };
// 形態名稱
const FORMES = {
  normal: '普通', attack: '攻擊', defense: '防禦', speed: '速度', origin: '起源', altered: '別種',
  incarnate: '化身', therian: '靈獸', land: '陸上', sky: '天空', aria: '歌聲', pirouette: '舞步',
};

const RAID_KIND = {
  'mega raids': '超級團體戰', 'mega raid battles': '超級團體戰',
  'shadow raids': '暗影團體戰', 'shadow raid battles': '暗影團體戰',
  'elite raids': '精英團體戰', 'max battles': '極巨對戰',
  'five-star raid battles': '五星團體戰', '5-star raid battles': '五星團體戰', '5-star raids': '五星團體戰',
  'three-star raid battles': '三星團體戰', '3-star raid battles': '三星團體戰',
  'one-star raid battles': '一星團體戰', '1-star raid battles': '一星團體戰',
  'raid battles': '團體戰', 'raids': '團體戰',
};

const lc = (s) => s.toLowerCase().trim();
const splitList = (text) => text.split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/).map((s) => s.trim()).filter(Boolean);

/** 把一串「A, B, and C」或「A and B」的寶可夢英文名翻成「A、B、C」；有任何一隻翻不出來就回傳 null */
function monList(text, mon) {
  const formeZh = (list) => { const z = splitList(list).map((x) => FORMES[lc(x)]); return z.every(Boolean) ? z.join('、') : null; };
  // 「Deoxys (Normal, Defense, Attack, and Speed Formes)」或「Tornadus, Thundurus, and Landorus (Therian Formes)」
  const f = text.match(/^(.+?) \(([^()]+?) Formes?\)$/i);
  if (f && !/\(/.test(f[1])) {
    const mons = splitList(f[1]).map((p) => mon(p));
    const fz = formeZh(f[2]);
    if (!fz || !mons.every(Boolean)) return null;
    return mons.length === 1 ? `${mons[0]}（${fz}形態）` : `${mons.join('、')}（${fz}形態）`;
  }
  // 「Tornadus (Therian Forme), Thundurus (Therian Forme), …」：每隻各自帶形態
  const parts = text.replace(/\(([^()]+)\)/g, (_, x) => `(${x.replace(/,/g, '~')})`).split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const zh = parts.map((p) => {
    const g = p.match(/^(.+?) \(([^()]+?) Formes?\)$/i);
    if (!g) return mon(p);
    const base = mon(g[1]);
    const fz = formeZh(g[2].replace(/~/g, ','));
    return base && fz ? `${base}（${fz}形態）` : null;
  });
  return zh.every(Boolean) ? zh.join('、') : null;
}

/** 一個聯盟／盃賽：「Great League: Mega Edition」「Holiday Cup: Great League Edition」「2027 GO EUIC Cup」 */
function oneLeague(text) {
  let m;
  if ((m = text.match(/^(\d{4}) GO (\w+) Cup$/i)) && CHAMPIONSHIP[lc(m[2])]) return `${m[1]} GO Championship${CHAMPIONSHIP[lc(m[2])]}`;
  const [name, edition] = text.split(/\s*:\s*/);
  const base = LEAGUES[lc(name)];
  if (!base) return null;
  if (!edition) return base;
  const ed = EDITIONS[lc(edition)];
  return ed ? `${base}（${ed}）` : null;
}

function league(text) {
  const parts = text.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).filter(Boolean);
  const zh = parts.map(oneLeague);
  return zh.every(Boolean) ? zh.join('、') : null;
}

/**
 * 翻譯活動名稱。
 * @param {string} name 英文名稱
 * @param {(en: string) => string|null} mon 寶可夢英文名 → 中文名（翻不出來回傳 null）
 * @returns {string|null}
 */
export function translateEventName(name, mon) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  const key = lc(n);
  let m;

  if (SEASONS[key]) return SEASONS[key];
  if (NAMED[key]) return NAMED[key];

  // GO 對戰聯盟：「Great League: Mega Edition, … | Daydream Destinations」
  if ((m = n.match(/^(.+?) \| (.+)$/)) && SEASONS[lc(m[2])]) {
    const l = league(m[1]);
    return l ? `${l}｜${SEASONS[lc(m[2])]}` : null;
  }

  // November Community Day: Charmander／December Community Day 2026／January Community Day Classic
  if ((m = n.match(/^(\w+) Community Day( Classic)?(?: (\d{4}))?(?:: (.+))?$/i)) && monthNo(m[1])) {
    const mons = m[4] ? monList(m[4], mon) : '';
    if (mons === null) return null;
    return `${m[3] ? `${m[3]} 年 ` : ''}${monthNo(m[1])} 月${m[2] ? '經典' : ''}社群日${mons ? `：${mons}` : ''}`;
  }
  // Community Day: X／Community Day Classic: X
  if ((m = n.match(/^Community Day( Classic)?(?: \d{4})?: (.+)$/i))) {
    const mons = monList(m[2], mon);
    return mons ? `${m[1] ? '經典' : ''}社群日：${mons}` : null;
  }
  // Charmander Community Day
  if ((m = n.match(/^(.+?) Community Day( Classic)?$/i))) {
    const mons = monList(m[1], mon);
    return mons ? `${mons}${m[2] ? '經典' : ''}社群日` : null;
  }
  // Gastly Spotlight Hour
  if ((m = n.match(/^(.+?) Spotlight Hour$/i))) {
    const mons = monList(m[1], mon);
    return mons ? `${mons}聚焦時刻` : null;
  }
  if (/^Unannounced Raid Hour$/i.test(n)) return '團體戰時間（頭目尚未公布）';
  // Mega Gengar Raid Hour
  if ((m = n.match(/^(.+?) Raid Hour$/i))) {
    const mons = monList(m[1], mon);
    return mons ? `${mons}團體戰時間` : null;
  }
  if (/^Raid Day$/i.test(n)) return '團體戰日';
  if (/^Super Mega Raid Day$/i.test(n)) return '超級團體戰日';
  if ((m = n.match(/^(.+?) Super Mega Raid Day$/i))) {
    const mons = monList(m[1], mon);
    return mons ? `${mons}超級團體戰日` : null;
  }
  if (/^Hatch Day$/i.test(n)) return '孵化日';
  if (/^Max Battle Day$/i.test(n)) return '極巨對戰日';
  // Gigantamax Inteleon Max Battle Day
  if ((m = n.match(/^(.+?) Max Battle Day$/i))) {
    const mons = monList(m[1], mon);
    return mons ? `${mons}極巨對戰日` : null;
  }
  // Mewtwo Raid Day／Raid Weekend
  if ((m = n.match(/^(.+?) Raid (Day|Weekend)$/i))) {
    const mons = monList(m[1], mon);
    return mons ? `${mons}團體戰${lc(m[2]) === 'day' ? '日' : '週末'}` : null;
  }
  // Ralts Research Day／Hatch Day
  if ((m = n.match(/^(.+?) (Research|Hatch) Day$/i))) {
    const mons = monList(m[1], mon);
    return mons ? `${mons}${lc(m[2]) === 'research' ? '調查日' : '孵化日'}` : null;
  }
  // Pokémon Champions Celebration Event 2026／Pokémon Champions Celebration 5-star Raid Battles
  if ((m = n.match(/^Pokémon Champions Celebration(?: Event)?(?: (\d{4}))?(?: (.+))?$/i))) {
    const kind = m[2] ? RAID_KIND[lc(m[2])] : '';
    if (m[2] && !kind) return null;
    return `${m[1] ? m[1] + ' ' : ''}「Pokémon Champions」慶祝活動${kind ? `：${kind}` : ''}`;
  }
  // Mega Gengar in Mega Raids／Kyogre in 5-star Raid Battles
  if ((m = n.match(/^(.+?) (?:in|Raid Battles? in|returns? to) (.+)$/i)) && RAID_KIND[lc(m[2])]) {
    const mons = monList(m[1], mon);
    return mons ? `${RAID_KIND[lc(m[2])]}：${mons}` : null;
  }
  // Max Monday: Wooloo／Dynamax Cryogonal during Max Monday
  if ((m = n.match(/^Max Mondays?: (.+)$/i)) || (m = n.match(/^(.+?) during Max Mondays?$/i))) {
    const mons = monList(m[1], mon);
    return mons ? `極巨星期一：${mons}` : null;
  }
  // Research Breakthrough: Klink
  if ((m = n.match(/^Research Breakthrough(?: Reward)?: (.+)$/i))) {
    const mons = monList(m[1], mon);
    return mons ? `調查突破：${mons}` : null;
  }
  // GO Battle League: Halloween Cup
  if ((m = n.match(/^GO Battle League: (.+)$/i))) {
    const l = league(m[1]);
    return l ? `GO 對戰聯盟：${l}` : null;
  }
  if (/^GO Battle League$/i.test(n)) return 'GO 對戰聯盟';
  // GO Pass: November
  if ((m = n.match(/^GO Pass: (\w+)$/i)) && monthNo(m[1])) return `GO Pass：${monthNo(m[1])} 月`;
  if ((m = n.match(/^GO Pass: (.+)$/i)) && (SEASONS[lc(m[1])] || NAMED[lc(m[1])])) return `GO Pass：${SEASONS[lc(m[1])] || NAMED[lc(m[1])]}`;
  // Choose Your Path: Daydream Destinations (December 15, 2026)
  if ((m = n.match(/^Choose Your Path: (.+?)(?: \((\w+) (\d+), \d{4}\))?$/i)) && SEASONS[lc(m[1])]) {
    const date = m[2] && monthNo(m[2]) ? `（${monthNo(m[2])}/${m[3]}）` : '';
    return `選擇你的路線：${SEASONS[lc(m[1])]}${date}`;
  }
  // Minior Showers: Geminids 2026
  if ((m = n.match(/^Minior (?:Meteor )?Showers: (.+?)(?: (\d{4}))?$/i)) && METEOR[lc(m[1])]) {
    return `小隕星雨：${METEOR[lc(m[1])]}${m[2] ? ' ' + m[2] : ''}`;
  }
  // Pokémon GO Tour: Alola - Kaohsiung 2027
  if ((m = n.match(/^Pokémon GO Tour: (\w+)(?: - (.+?))?(?: (\d{4}))?$/i)) && TOUR_REGION[lc(m[1])]) {
    const place = m[2] ? TOUR_PLACE[lc(m[2])] : '';
    if (m[2] && !place) return null;
    return `Pokémon GO Tour：${TOUR_REGION[lc(m[1])]}${place ? '－' + place : ''}${m[3] ? ' ' + m[3] : ''}`;
  }
  // adidas × Pokémon Timed Research／Pokémon GO and Duolingo Timed Research
  if ((m = n.match(/^(.+?) (Timed|Special|Field) Research$/i))) {
    const kind = { timed: '限時調查', special: '特別調查', field: '田野調查' }[lc(m[2])];
    const who = m[1].replace(/ and /i, ' × ');
    return /[a-z]/i.test(who) && !/(?:^| )(Day|Event|Hour)$/i.test(who) ? `${who} ${kind}` : null;
  }
  // Team GO Rocket Takeover
  if (/^Team GO Rocket Takeover$/i.test(n) || /^GO Rocket Takeover$/i.test(n)) return 'GO 火箭隊入侵';
  if (/^Team GO Rocket Hideouts?$/i.test(n)) return 'GO 火箭隊據點';
  if (/^Giovanni Special Research(?:: (.+))?$/i.test(n)) return '坂木特別調查';
  // Halloween 2026 Part 1／Holiday Part 2／Halloween 2026
  if ((m = n.match(/^(.+?)(?: (\d{4}))?(?: (?:Event))?(?: Part (\d+))?$/i)) && HOLIDAYS[lc(m[1])]) {
    if (!m[2] && !m[3]) return `${HOLIDAYS[lc(m[1])]}活動`;
    return `${m[2] ? m[2] + ' ' : ''}${HOLIDAYS[lc(m[1])]}活動${m[3] ? `（第 ${m[3]} 部分）` : ''}`;
  }
  return null;
}

const MULT_TARGET = {
  'catch candy': '捕捉獲得的糖果', 'catch stardust': '捕捉獲得的星星沙子', 'catch xp': '捕捉獲得的經驗值',
  'evolution xp': '進化獲得的經驗值', 'evolve xp': '進化獲得的經驗值',
  'transfer candy': '傳送獲得的糖果', 'hatch candy': '孵化獲得的糖果', 'hatch stardust': '孵化獲得的星星沙子',
  'hatch xp': '孵化獲得的經驗值', 'raid xp': '團體戰獲得的經驗值', 'raid stardust': '團體戰獲得的星星沙子',
  'stardust': '星星沙子', 'xp': '經驗值', 'candy': '糖果', 'trade candy': '交換獲得的糖果',
  'spin stardust': '轉動補給站獲得的星星沙子', 'spin xp': '轉動補給站獲得的經驗值',
};
const DURATION_ITEM = {
  'incense': '薰香', 'lure modules': '誘餌模組', 'lures': '誘餌模組', 'lure module': '誘餌模組', 'lure': '誘餌模組',
  'star pieces': '星星碎片', 'star piece': '星星碎片', 'lucky eggs': '幸運蛋', 'lucky egg': '幸運蛋',
};
const UNIT = { hour: '小時', hours: '小時', minute: '分鐘', minutes: '分鐘' };
const FIXED = [
  [/^Increased (?:wild )?Spawns$/i, '野生寶可夢出現量增加'],
  [/^Take a few snapshots(?: during .+?)? for a surprise!?$/i, '活動期間拍照會有驚喜！'],
  [/^One additional Special Trade can be made,? for a maximum of two for the day\.?$/i, '每天可多進行 1 次特別交換（當天最多 2 次）'],
  [/^Trades made will require 50% less Stardust\.?$/i, '交換所需的星星沙子減少 50%'],
  [/^Increased chance to receive Candy XL from catching Pokémon\.?$/i, '捕捉寶可夢時更容易獲得糖果XL'],
  [/^Increased chance to (?:receive|get) Candy XL\.?$/i, '更容易獲得糖果XL'],
  [/^Increased Shiny chance\.?$/i, '更容易遇到異色寶可夢'],
  [/^Increased Shiny (?:Pokémon|Pokemon) encounter rate\.?$/i, '更容易遇到異色寶可夢'],
];

/** 翻譯一條加成說明；認不出來回傳 null */
export function translateBonus(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().replace(/\*+$/, '').replace(/\.$/, '');
  let m;
  // 2x Stardust for catching Pokémon
  if ((m = t.match(/^(\d+)\s*[×x]\s*(Stardust|XP|Candy) for (catching|hatching|evolving|transferring|trading) Pokémon$/i))) {
    const act = { catching: '捕捉', hatching: '孵化', evolving: '進化', transferring: '傳送', trading: '交換' }[lc(m[3])];
    const what = { stardust: '星星沙子', xp: '經驗值', candy: '糖果' }[lc(m[2])];
    return `${act}獲得的${what} ${m[1]} 倍`;
  }
  // 2x Chance for Trainers level 31 and up to receive Candy XL from catching Pokémon
  if ((m = t.match(/^(\d+)\s*[×x]\s*Chance for Trainers level (\d+) and up to receive Candy XL from catching Pokémon$/i))) {
    return `等級 ${m[2]} 以上的訓練家捕捉寶可夢時，獲得糖果XL的機率 ${m[1]} 倍`;
  }
  // 1-hour Lures／3-hour Incense
  if ((m = t.match(/^(\d+)-(hour|minute) (.+)$/i)) && DURATION_ITEM[lc(m[3])]) {
    return `${DURATION_ITEM[lc(m[3])]}效果持續 ${m[1]} ${UNIT[lc(m[2])]}`;
  }
  // Up to two Special Trades can be made per day
  if ((m = t.match(/^Up to (\w+) Special Trades? can be made per day$/i))) {
    const num = { one: 1, two: 2, three: 3 }[lc(m[1])] || m[1];
    return `每天最多可進行 ${num} 次特別交換`;
  }
  if ((m = t.match(/^(1\/\d) Hatch Distance when Eggs are placed (?:in|into) Incubators during the event(?: period)?$/i))) {
    return `活動期間放進孵化器的蛋，孵化距離縮短為 ${m[1]}`;
  }
  for (const [re, zh] of FIXED) if (re.test(t)) return zh;
  // 2× Catch Candy／3x Catch Stardust
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s*[×x]\s*(.+)$/i)) && MULT_TARGET[lc(m[2])]) {
    return `${MULT_TARGET[lc(m[2])]} ${m[1]} 倍`;
  }
  // 1/4 Egg Hatch Distance
  if ((m = t.match(/^(1\/\d)\s*(?:Egg )?Hatch Distance(?: for Eggs .*)?$/i))) return `孵蛋距離縮短為 ${m[1]}`;
  if ((m = t.match(/^(1\/\d)\s*Egg Hatch Distance when Eggs are placed in Incubators during the event$/i))) return `活動期間放進孵化器的蛋，孵化距離縮短為 ${m[1]}`;
  // Incense lasts 3 hours／Lure Modules last 3 hours
  if ((m = t.match(/^(?:Incense \(.*?\)|(.+?)) lasts? (?:for )?(\d+|one|two|three) (hours?|minutes?)$/i))) {
    const item = DURATION_ITEM[lc(m[1] || 'incense')];
    const num = { one: 1, two: 2, three: 3 }[lc(m[2])] || m[2];
    if (item) return `${item}效果持續 ${num} ${UNIT[lc(m[3])]}`;
  }
  if ((m = t.match(/^(?:Incense and Lure Modules|Lure Modules and Incense) last (\d+) hours?$/i))) {
    return `薰香與誘餌模組效果持續 ${m[1]} 小時`;
  }
  return null;
}
