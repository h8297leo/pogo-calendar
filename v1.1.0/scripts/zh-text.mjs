// 活動名稱與加成說明：英文 → 台灣中文（規則式翻譯）
// 只處理能完整辨識的格式；認不出來就回傳 null，由呼叫端保留英文原文，避免中英夾雜的怪翻譯。
// 不可用 Node API（與 core.mjs 相同原則）。

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// GO 對戰聯盟的聯盟／盃賽名稱
const LEAGUES = {
  'great league': '超級聯盟', 'ultra league': '高級聯盟', 'master league': '大師聯盟',
  'little cup': '小小盃', 'halloween cup': '萬聖節盃', 'holiday cup': '節慶盃', 'retro cup': '復古盃',
  'fantasy cup': '奇幻盃', 'love cup': '戀愛盃', 'spring cup': '春季盃', 'summer cup': '夏日盃',
  'fossil cup': '化石盃', 'jungle cup': '叢林盃', 'catch cup': '捕捉盃', 'element cup': '元素盃',
  'sunshine cup': '陽光盃', 'kanto cup': '關都盃', 'johto cup': '城都盃', 'hoenn cup': '豐緣盃',
  'sinnoh cup': '神奧盃', 'unova cup': '合眾盃', 'kalos cup': '卡洛斯盃', 'alola cup': '阿羅拉盃',
  'galar cup': '伽勒爾盃', 'paldea cup': '帕底亞盃', 'willpower cup': '意志盃', 'mega master league': '超級大師聯盟',
  'premier cup': '首要盃', 'evolution cup': '進化盃', 'color cup': '色彩盃', 'psychic cup': '超能力盃',
};
const LEAGUE_SUFFIX = [[/ edition$/i, '版'], [/^great league remix$/i, '超級聯盟混合版'], [/^ultra league remix$/i, '高級聯盟混合版']];

// 節日／活動常見詞（只在整段名稱都能對上時使用）
const HOLIDAYS = {
  'halloween': '萬聖節', 'holiday': '節慶', 'holidays': '節慶', 'winter holiday': '冬季節慶',
  'lunar new year': '農曆新年', 'valentine\'s day': '情人節', 'spring into spring': '春日來臨',
  'pokémon day': '寶可夢日', 'pokemon day': '寶可夢日', 'new year\'s': '新年',
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

/** 把一串「A, B, and C」或「A and B」的寶可夢英文名翻成「A、B、C」；有任何一隻翻不出來就回傳 null */
function monList(text, mon) {
  const parts = text.split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const zh = parts.map((p) => mon(p));
  return zh.every(Boolean) ? zh.join('、') : null;
}

function league(text) {
  const key = lc(text);
  if (LEAGUES[key]) return LEAGUES[key];
  for (const [re, zh] of LEAGUE_SUFFIX) {
    if (re.test(text)) {
      if (zh.length > 1) return zh;
      const base = league(text.replace(re, ''));
      return base ? base + zh : null;
    }
  }
  // 「Great League, Ultra League」這種多聯盟
  const parts = text.split(/\s*[,&]\s*|\s+and\s+/).filter(Boolean);
  if (parts.length > 1) {
    const zh = parts.map((p) => LEAGUES[lc(p)]);
    if (zh.every(Boolean)) return zh.join('、');
  }
  return null;
}

/**
 * 翻譯活動名稱。
 * @param {string} name 英文名稱
 * @param {(en: string) => string|null} mon 寶可夢英文名 → 中文名（翻不出來回傳 null）
 * @returns {string|null}
 */
export function translateEventName(name, mon) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  let m;

  // November Community Day: Charmander／Community Day: X／Community Day Classic: X
  if ((m = n.match(/^(?:(\w+) )?Community Day( Classic)?(?: \d{4})?: (.+)$/i))) {
    const month = m[1] ? MONTHS.indexOf(lc(m[1])) : -1;
    if (m[1] && month < 0) return null;
    const mons = monList(m[3], mon);
    if (!mons) return null;
    return `${month >= 0 ? `${month + 1} 月` : ''}社群日${m[2] ? '經典' : ''}：${mons}`;
  }
  // Charmander Community Day
  if ((m = n.match(/^(.+?) Community Day( Classic)?$/i))) {
    const mons = monList(m[1], mon);
    return mons ? `${mons}社群日${m[2] ? '經典' : ''}` : null;
  }
  // Gastly Spotlight Hour
  if ((m = n.match(/^(.+?) Spotlight Hour$/i))) {
    const mons = monList(m[1], mon);
    return mons ? `${mons}聚焦時刻` : null;
  }
  // Mega Gengar Raid Hour
  if ((m = n.match(/^(.+?) Raid Hour$/i))) {
    const mons = monList(m[1], mon);
    return mons ? `${mons}團體戰時間` : null;
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
  // Mega Gengar in Mega Raids／Kyogre in 5-star Raid Battles
  if ((m = n.match(/^(.+?) (?:in|Raid Battles? in|returns? to) (.+)$/i)) && RAID_KIND[lc(m[2])]) {
    const mons = monList(m[1], mon);
    return mons ? `${RAID_KIND[lc(m[2])]}：${mons}` : null;
  }
  // Max Monday: Wooloo
  if ((m = n.match(/^Max Mondays?: (.+)$/i))) {
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
  // Team GO Rocket Takeover
  if (/^Team GO Rocket Takeover$/i.test(n) || /^GO Rocket Takeover$/i.test(n)) return 'GO 火箭隊入侵';
  if (/^Team GO Rocket Hideouts?$/i.test(n)) return 'GO 火箭隊據點';
  if ((m = n.match(/^Giovanni Special Research(?:: (.+))?$/i))) return '坂木特別調查';
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
  'incense': '薰香', 'lure modules': '誘餌模組', 'lures': '誘餌模組', 'lure module': '誘餌模組',
  'star pieces': '星星碎片', 'star piece': '星星碎片', 'lucky eggs': '幸運蛋', 'lucky egg': '幸運蛋',
};
const UNIT = { hour: '小時', hours: '小時', minute: '分鐘', minutes: '分鐘' };
const FIXED = [
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
  const t = String(text || '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  let m;
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
