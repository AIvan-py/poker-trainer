// Эквити методом Монте-Карло: доигрываем раздачу тысячи раз со случайными картами соперников.
import { evaluate } from './evaluator.js';
import { handPct } from './preflop.js';
import { quickClass } from './handinfo.js';

/** Насколько правдоподобна рука соперника с учётом его ставок после флопа. */
function acceptProb(read, cls) {
  if (read.aggr >= 2) return cls >= 3 ? 1 : cls === 2 ? 0.6 : cls === 1 ? 0.2 : 0.08;
  if (read.aggr === 1) return cls >= 2 ? 1 : cls === 1 ? 0.6 : 0.25;
  if (read.calls >= 1) return cls >= 1 ? 1 : 0.4;
  return 1;
}

/**
 * @param hole  две карты героя
 * @param board карты на столе (0–5)
 * @param reads «чтения» соперников: { pct, aggr, calls }
 */
export function equity(hole, board, reads, iters = 2000, rng = Math.random) {
  const known = new Uint8Array(52);
  for (const c of hole) known[c] = 1;
  for (const c of board) known[c] = 1;
  const avail = [];
  for (let c = 0; c < 52; c++) if (!known[c]) avail.push(c);

  const used = new Int32Array(52);
  let gen = 0;
  const randomFree = () => {
    let c;
    do c = avail[Math.floor(rng() * avail.length)]; while (used[c] === gen);
    return c;
  };

  const full = board.slice();
  const hero = hole.slice();
  const filterPostflop = board.length >= 3;
  let wins = 0;

  for (let it = 0; it < iters; it++) {
    gen++;
    const oppCards = [];
    for (const read of reads) {
      let a, b;
      for (let tries = 0; tries < 60; tries++) {
        a = randomFree();
        do b = randomFree(); while (b === a);
        if (handPct(a, b) > read.pct) continue;
        if (filterPostflop && (read.aggr || read.calls) && rng() > acceptProb(read, quickClass([a, b], board))) continue;
        break;
      }
      used[a] = gen;
      used[b] = gen;
      oppCards.push(a, b);
    }
    for (let i = board.length; i < 5; i++) {
      const c = randomFree();
      used[c] = gen;
      full[i] = c;
    }
    const heroScore = evaluate(hero.concat(full));
    let best = -1, ties = 0;
    for (let k = 0; k < oppCards.length; k += 2) {
      const s = evaluate([oppCards[k], oppCards[k + 1], ...full]);
      if (s > best) { best = s; ties = 0; }
      if (s === best) ties++;
    }
    if (heroScore > best) wins += 1;
    else if (heroScore === best) wins += 1 / (ties + 1);
  }
  return wins / iters;
}

/** Шанс выиграть, когда карты соперников известны: перебираем случайные доигровки борда. */
export function equityKnown(hole, oppHoles, board, iters = 20000, rng = Math.random) {
  const used = new Uint8Array(52);
  for (const c of [...hole, ...board, ...oppHoles.flat()]) used[c] = 1;
  const avail = [];
  for (let c = 0; c < 52; c++) if (!used[c]) avail.push(c);
  const need = 5 - board.length;
  if (need === 0) iters = 1;
  const full = board.slice();
  let wins = 0;
  for (let it = 0; it < iters; it++) {
    for (let k = 0; k < need; k++) {
      const j = k + Math.floor(rng() * (avail.length - k));
      [avail[k], avail[j]] = [avail[j], avail[k]];
      full[board.length + k] = avail[k];
    }
    const me = evaluate(hole.concat(full));
    let best = -1, ties = 0;
    for (const h of oppHoles) {
      const s = evaluate(h.concat(full));
      if (s > best) { best = s; ties = 0; }
      if (s === best) ties++;
    }
    if (me > best) wins += 1;
    else if (me === best) wins += 1 / (ties + 1);
  }
  return wins / iters;
}
