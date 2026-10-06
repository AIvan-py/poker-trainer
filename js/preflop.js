// Рейтинг 169 стартовых рук по формуле Чена → «входит в топ X% рук».
import { rankOf, suitOf, RANKS } from './cards.js';

function chen(hi, lo, suited) {
  const val = (r) => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
  if (hi === lo) return Math.max(5, val(hi) * 2);
  let s = val(hi) + (suited ? 2 : 0);
  const gap = hi - lo - 1;
  s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 10) s += 1;
  return Math.ceil(s);
}

const classIndex = (hi, lo, suited) => (hi * 13 + lo) * 2 + (suited ? 1 : 0);

const PCT = new Float64Array(13 * 13 * 2);
const CLASSES = [];
for (let hi = 0; hi < 13; hi++) {
  for (let lo = 0; lo <= hi; lo++) {
    if (hi === lo) CLASSES.push({ hi, lo, suited: false, combos: 6, score: chen(hi, lo, false) });
    else {
      CLASSES.push({ hi, lo, suited: true, combos: 4, score: chen(hi, lo, true) });
      CLASSES.push({ hi, lo, suited: false, combos: 12, score: chen(hi, lo, false) });
    }
  }
}
CLASSES.sort((a, b) => b.score - a.score || b.hi - a.hi || b.lo - a.lo || b.suited - a.suited);
let cum = 0;
for (const c of CLASSES) {
  cum += c.combos;
  c.pct = cum / 1326;
  PCT[classIndex(c.hi, c.lo, c.suited)] = c.pct;
}

/** Доля рук, которые не хуже этой (0.01 = топ-1%). */
export function handPct(c1, c2) {
  const r1 = rankOf(c1), r2 = rankOf(c2);
  const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  return PCT[classIndex(hi, lo, hi !== lo && suitOf(c1) === suitOf(c2))];
}

/** Обозначение класса руки: «AKs», «QQ», «T9o». */
export function handCode(c1, c2) {
  const r1 = rankOf(c1), r2 = rankOf(c2);
  const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  if (hi === lo) return RANKS[hi] + RANKS[lo];
  return RANKS[hi] + RANKS[lo] + (suitOf(c1) === suitOf(c2) ? 's' : 'o');
}

export const POSITION_INFO = {
  'BTN/SB': { name: 'Баттон / малый блайнд', note: 'вдвоём баттон ставит малый блайнд и после флопа ходит последним' },
  SB: { name: 'Малый блайнд', note: 'после флопа ходишь первым — это неудобно' },
  BB: { name: 'Большой блайнд', note: 'уже вложил большой блайнд, поэтому дешевле продолжать' },
  UTG: { name: 'Ранняя позиция', note: 'после тебя ходят все — играй только сильные руки' },
  MP: { name: 'Средняя позиция', note: 'после тебя ещё много игроков — играй довольно тайтово' },
  CO: { name: 'Катофф', note: 'предпоследнее место перед баттоном — можно играть шире' },
  BTN: { name: 'Баттон', note: 'после флопа ходишь последним — лучшая позиция за столом' },
};

/** Какую долю лучших рук стоит открывать рейзом с позиции. */
export const OPEN_RANGE = { UTG: 0.14, MP: 0.19, CO: 0.27, BTN: 0.45, SB: 0.38, 'BTN/SB': 0.8, BB: 0.15 };
