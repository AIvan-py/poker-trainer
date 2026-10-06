// Режим «Чаще комбинации»: иногда подкладываем игроку карты, из которых к риверу соберётся сильная рука.
import { evaluate, category } from './evaluator.js';

const TARGETS = [[2, 18], [3, 20], [4, 20], [5, 20], [6, 16], [7, 6]]; // [категория, вес]

function pickTarget(rng) {
  const total = TARGETS.reduce((s, [, w]) => s + w, 0);
  let x = rng() * total;
  for (const [cat, w] of TARGETS) if ((x -= w) < 0) return cat;
  return 4;
}

function findSeven(target, rng) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let tries = 0; tries < 30000; tries++) {
    for (let k = 0; k < 7; k++) {
      const j = k + Math.floor(rng() * (52 - k));
      [deck[k], deck[j]] = [deck[j], deck[k]];
    }
    const seven = deck.slice(0, 7);
    if (category(evaluate(seven)) !== target) continue;
    // комбинация должна получаться благодаря картам игрока, а не лежать целиком на столе
    if (category(evaluate(seven.slice(2))) >= target) continue;
    return seven;
  }
  return null;
}

/** Перекладывает карты в уже розданной раздаче. Позиции борда в колоде — с учётом сжигаемых карт. */
export function rigForPlayer(game, idx, rng) {
  const seven = findSeven(pickTarget(rng), rng);
  if (!seven) return false;
  const L = game.deck.length;
  // порядок выдачи: сжечь, флоп ×3, сжечь, тёрн, сжечь, ривер (pop с конца)
  const boardSlots = [L - 2, L - 3, L - 4, L - 6, L - 8];
  const me = game.players[idx];
  const targets = [
    { arr: me.hole, i: 0 }, { arr: me.hole, i: 1 },
    ...boardSlots.map((i) => ({ arr: game.deck, i })),
  ];
  const locate = (c) => {
    for (const p of game.players) {
      const k = p.hole.indexOf(c);
      if (k !== -1) return { arr: p.hole, i: k };
    }
    return { arr: game.deck, i: game.deck.indexOf(c) };
  };
  seven.forEach((c, n) => {
    const to = targets[n];
    const from = locate(c);
    if (from.arr === to.arr && from.i === to.i) return;
    from.arr[from.i] = to.arr[to.i];
    to.arr[to.i] = c;
  });
  return true;
}
