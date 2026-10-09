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

const TRAIN_TARGETS = [[0, 5], [1, 20], [2, 22], [3, 15], [4, 15], [5, 15], [6, 9], [7, 2], [8, 1]];

function pickWeighted(list, rng) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = rng() * total;
  for (const [v, w] of list) if ((x -= w) < 0) return v;
  return list[0][0];
}

function shuffle(rng) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

/** Раздача для тренировки: борд и руки n игроков, у большинства собрана комбинация именно с участием руки. */
export function dealTrainingSet(n, rng) {
  const deck = shuffle(rng);
  const board = deck.slice(0, 5);
  const boardCat = category(evaluate(board));
  let pool = deck.slice(5);
  const holes = [];
  // цели только те, что можно собрать с участием руки на этом борде
  const targets = TRAIN_TARGETS.filter(([cat]) => cat === 0 || cat > boardCat);
  for (let i = 0; i < n; i++) {
    let found = null;
    for (let attempt = 0; attempt < 6 && !found; attempt++) {
      const target = pickWeighted(targets, rng);
      for (let tries = 0; tries < 400 && !found; tries++) {
        const a = pool[Math.floor(rng() * pool.length)];
        const b = pool[Math.floor(rng() * pool.length)];
        if (a === b) continue;
        const cat = category(evaluate([a, b, ...board]));
        if (cat === target && (cat > boardCat || cat === 0)) found = [a, b];
      }
    }
    if (!found) found = [pool[0], pool[1]];
    holes.push(found);
    pool = pool.filter((c) => !found.includes(c));
  }
  return { board, holes };
}

/** Перекладывает карты уже розданной раздачи так, чтобы у всех за столом чаще были комбинации. */
export function rigTable(game, rng) {
  const { board, holes } = dealTrainingSet(game.n, rng);
  game.players.forEach((p, i) => { p.hole = holes[i]; });
  const used = new Set([...board, ...holes.flat()]);
  const rest = shuffle(rng).filter((c) => !used.has(c));
  const L = game.deck.length; // 52 − 2n
  // порядок выдачи с конца: сжечь, флоп ×3, сжечь, тёрн, сжечь, ривер
  const slots = [L - 2, L - 3, L - 4, L - 6, L - 8];
  const deck = new Array(L);
  slots.forEach((i, k) => { deck[i] = board[k]; });
  let r = 0;
  for (let i = 0; i < L; i++) if (deck[i] === undefined) deck[i] = rest[r++];
  game.deck = deck;
  return true;
}
