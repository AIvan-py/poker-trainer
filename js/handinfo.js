// Анализ руки на текущем борде: что собрано, какие дро, сколько аутов.
import { evaluate, category, ranksOf, describe } from './evaluator.js';
import { rankOf, suitOf } from './cards.js';

const maxRank = (cards) => cards.reduce((m, c) => Math.max(m, rankOf(c)), -1);

/** 0 — ничего, 1 — слабая пара, 2 — топ-пара/оверпара, 3 — две пары и сильнее. */
export function madeClass(hole, board) {
  const score = evaluate(hole.concat(board));
  const cat = category(score);
  if (board.length === 0) return rankOf(hole[0]) === rankOf(hole[1]) ? 2 : 0;
  const boardCat = category(evaluate(board));
  if (cat <= boardCat) return 0;
  if (cat >= 3) return 3;
  const top = maxRank(board);
  const [r0, r1] = ranksOf(score);
  if (cat === 2) {
    if (boardCat >= 1) {
      // одна пара лежит на столе — считаем по второй
      const boardPair = ranksOf(evaluate(board))[0];
      const own = r0 === boardPair ? r1 : r0;
      return own >= top ? 2 : 1;
    }
    return 3;
  }
  return r0 >= top ? 2 : 1;
}

function straightCompleters(hole, board) {
  const all = hole.concat(board);
  let mask = 0, boardMask = 0;
  for (const c of all) mask |= 1 << rankOf(c);
  for (const c of board) boardMask |= 1 << rankOf(c);
  const has = (m) => {
    for (let hi = 12; hi >= 4; hi--) if (((m >> (hi - 4)) & 31) === 31) return true;
    const wheel = (1 << 12) | 0b1111;
    return (m & wheel) === wheel;
  };
  if (has(mask)) return 0;
  let n = 0;
  for (let r = 0; r < 13; r++) {
    if (mask & (1 << r)) continue;
    if (has(mask | (1 << r)) && !has(boardMask | (1 << r))) n++;
  }
  return n;
}

export function analyze(hole, board) {
  const score = evaluate(hole.concat(board));
  const made = madeClass(hole, board);
  const info = {
    score,
    name: describe(score),
    made,
    flushDraw: false,
    oesd: false,
    gutshot: false,
    outs: 0,
    cls: made,
  };
  if (board.length < 3 || board.length > 4) return info;

  const all = hole.concat(board);
  if (category(score) < 5) {
    for (let s = 0; s < 4; s++) {
      const cnt = all.filter((c) => suitOf(c) === s).length;
      if (cnt === 4 && hole.some((c) => suitOf(c) === s)) info.flushDraw = true;
    }
  }
  if (category(score) < 4) {
    const completers = straightCompleters(hole, board);
    if (completers >= 2) info.oesd = true;
    else if (completers === 1) info.gutshot = true;
  }

  // Ауты: карты, которые делают руку как минимум топ-парой и сильнее, чем сейчас.
  const known = new Set(all);
  for (let c = 0; c < 52; c++) {
    if (known.has(c)) continue;
    const next = madeClass(hole, board.concat(c));
    if (next >= 2 && next > made) info.outs++;
  }

  if (info.flushDraw || info.oesd) info.cls = Math.max(made, 2);
  else if (info.gutshot) info.cls = Math.max(made, 1);
  return info;
}

export const drawText = (a) => {
  const parts = [];
  if (a.flushDraw) parts.push('дро флеша');
  if (a.oesd) parts.push('двустороннее дро стрита');
  if (a.gutshot) parts.push('гатшот (дро стрита в одну карту)');
  return parts.join(' + ');
};

/** Быстрая оценка без подсчёта аутов — для симуляций. */
export function quickClass(hole, board) {
  const made = madeClass(hole, board);
  if (made >= 2 || board.length < 3 || board.length > 4) return made;
  const all = hole.concat(board);
  for (let s = 0; s < 4; s++) {
    let cnt = 0;
    for (const c of all) if (suitOf(c) === s) cnt++;
    if (cnt === 4 && hole.some((c) => suitOf(c) === s)) return 2;
  }
  const completers = straightCompleters(hole, board);
  if (completers >= 2) return 2;
  if (completers === 1) return Math.max(made, 1);
  return made;
}
