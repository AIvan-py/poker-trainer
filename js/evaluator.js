// Оценка руки из 1–7 карт. Чем больше число, тем сильнее рука.
// score = категория * 16^5 + старшинство до пяти рангов.
const BASE = 16 ** 5;

export const CATEGORY_NAMES = [
  'Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит',
  'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш', 'Роял-флеш',
];

function straightHigh(mask) {
  for (let hi = 12; hi >= 4; hi--) if (((mask >> (hi - 4)) & 31) === 31) return hi;
  const wheel = (1 << 12) | 0b1111; // A-2-3-4-5
  return (mask & wheel) === wheel ? 3 : -1;
}

function topRanks(mask, n) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

function pack(cat, ranks) {
  let v = 0;
  for (let i = 0; i < 5; i++) v = v * 16 + (ranks[i] ?? 0);
  return cat * BASE + v;
}

export const category = (score) => Math.floor(score / BASE);
export const ranksOf = (score) => {
  let v = score % BASE;
  const out = [];
  for (let i = 0; i < 5; i++) { out.unshift(v % 16); v = Math.floor(v / 16); }
  return out;
};

export function evaluate(cards) {
  const counts = new Array(13).fill(0);
  const suitMask = [0, 0, 0, 0];
  const suitCnt = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = c >> 2, s = c & 3;
    counts[r]++;
    suitMask[s] |= 1 << r;
    suitCnt[s]++;
    mask |= 1 << r;
  }

  let flushRanks = null;
  for (let s = 0; s < 4; s++) {
    if (suitCnt[s] >= 5) {
      const sf = straightHigh(suitMask[s]);
      if (sf >= 0) return pack(8, [sf]);
      flushRanks = topRanks(suitMask[s], 5);
    }
  }

  const quads = [], trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }

  if (quads.length) return pack(7, [quads[0], ...topRanks(mask & ~(1 << quads[0]), 1)]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    return pack(6, [trips[0], Math.max(trips[1] ?? -1, pairs[0] ?? -1)]);
  }
  if (flushRanks) return pack(5, flushRanks);
  const st = straightHigh(mask);
  if (st >= 0) return pack(4, [st]);
  if (trips.length) return pack(3, [trips[0], ...topRanks(mask & ~(1 << trips[0]), 2)]);
  if (pairs.length >= 2) {
    const rest = mask & ~(1 << pairs[0]) & ~(1 << pairs[1]);
    return pack(2, [pairs[0], pairs[1], ...topRanks(rest, 1)]);
  }
  if (pairs.length === 1) return pack(1, [pairs[0], ...topRanks(mask & ~(1 << pairs[0]), 3)]);
  return pack(0, topRanks(mask, 5));
}

/** Лучшие пять карт из 5–7 (для подсветки на вскрытии). */
export function bestFive(cards) {
  if (cards.length <= 5) return cards.slice();
  let best = null, bestScore = -1;
  const pick = (start, chosen) => {
    if (chosen.length === 5) {
      const s = evaluate(chosen);
      if (s > bestScore) { bestScore = s; best = chosen.slice(); }
      return;
    }
    for (let i = start; i < cards.length; i++) {
      chosen.push(cards[i]);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return best;
}

const NOM = ['двойка', 'тройка', 'четвёрка', 'пятёрка', 'шестёрка', 'семёрка', 'восьмёрка', 'девятка', 'десятка', 'валет', 'дама', 'король', 'туз'];
const NOM_PL = ['двойки', 'тройки', 'четвёрки', 'пятёрки', 'шестёрки', 'семёрки', 'восьмёрки', 'девятки', 'десятки', 'валеты', 'дамы', 'короли', 'тузы'];
const GEN = ['двойки', 'тройки', 'четвёрки', 'пятёрки', 'шестёрки', 'семёрки', 'восьмёрки', 'девятки', 'десятки', 'валета', 'дамы', 'короля', 'туза'];
const GEN_PL = ['двоек', 'троек', 'четвёрок', 'пятёрок', 'шестёрок', 'семёрок', 'восьмёрок', 'девяток', 'десяток', 'валетов', 'дам', 'королей', 'тузов'];

export const rankName = { NOM, NOM_PL, GEN, GEN_PL };

/** Название комбинации по-русски: «Пара дам», «Стрит до туза». */
export function describe(score) {
  const cat = category(score);
  const [r0, r1] = ranksOf(score);
  switch (cat) {
    case 0: return `Старшая карта — ${NOM[r0]}`;
    case 1: return `Пара: ${NOM_PL[r0]}`;
    case 2: return `Две пары: ${NOM_PL[r0]} и ${NOM_PL[r1]}`;
    case 3: return `Тройка: ${NOM_PL[r0]}`;
    case 4: return `Стрит до ${GEN[r0]}`;
    case 5: return `Флеш, старшая — ${NOM[r0]}`;
    case 6: return `Фулл-хаус: ${NOM_PL[r0]} и ${NOM_PL[r1]}`;
    case 7: return `Каре ${GEN_PL[r0]}`;
    case 8: return r0 === 12 ? 'Роял-флеш' : `Стрит-флеш до ${GEN[r0]}`;
    default: return '';
  }
}

export const shortName = (score) => {
  const cat = category(score);
  return cat === 8 && ranksOf(score)[0] === 12 ? CATEGORY_NAMES[9] : CATEGORY_NAMES[cat];
};

/** Карты, из которых состоит сама комбинация (без кикеров) — для подсветки. */
export function comboCards(cards) {
  if (cards.length < 2) return [];
  const score = evaluate(cards);
  const cat = category(score);
  if (cat === 0) return [];
  if (cat === 4 || cat === 5 || cat === 8) return cards.length >= 5 ? bestFive(cards) : [];
  const [r0, r1] = ranksOf(score);
  const ranks = cat === 1 || cat === 3 || cat === 7 ? [r0] : [r0, r1];
  return cards.filter((c) => ranks.includes(c >> 2));
}

/** Короткое правило комбинации для новичка. */
export const RULES = [
  'ничего не собрано — сравнивают старшие карты',
  'две карты одного ранга',
  'две разные пары',
  'три карты одного ранга',
  'пять карт подряд, масти любые',
  'пять карт одной масти',
  'тройка и пара вместе',
  'четыре карты одного ранга',
  'пять карт подряд одной масти',
  'десятка, валет, дама, король и туз одной масти',
];

/** Разбор руки: название, правило, лучшие 5 карт, карты самой комбинации. */
export function explainHand(hole, board) {
  const all = hole.concat(board);
  const score = evaluate(all);
  const cat = category(score);
  const isRoyal = cat === 8 && ranksOf(score)[0] === 12;
  const combo = new Set(comboCards(all));
  // сначала карты комбинации, потом кикеры; внутри — по старшинству
  const five = (all.length >= 5 ? bestFive(all) : all.slice())
    .sort((a, b) => (combo.has(b) - combo.has(a)) || ((b >> 2) - (a >> 2)));
  return {
    score,
    cat,
    name: describe(score),
    short: isRoyal ? CATEGORY_NAMES[9] : CATEGORY_NAMES[cat],
    rule: RULES[isRoyal ? 9 : cat],
    five,
    combo,
    fromHand: five.filter((c) => hole.includes(c)),
  };
}
