import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine.js';
import { makeRng } from '../js/cards.js';
import { decide, STYLES } from '../js/ai.js';
import { advise, grade } from '../js/coach.js';

const mk = (n, seed = 1) => new Game({
  players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isHuman: i === 0 })),
  rng: makeRng(seed),
});
const total = (g) => g.players.reduce((s, p) => s + p.stack + p.total * 0, 0);

test('блайнды и очерёдность хода (6 игроков)', () => {
  const g = mk(6);
  g.startHand();
  assert.equal(g.players[g.sbIdx].bet, 10);
  assert.equal(g.players[g.bbIdx].bet, 20);
  assert.equal(g.toAct, (g.bbIdx + 1) % 6);
  assert.equal(g.position(g.dealer), 'BTN');
  assert.equal(g.position(g.toAct), 'UTG');
});

test('хедз-ап: баттон ставит малый блайнд и ходит первым до флопа', () => {
  const g = mk(2);
  g.startHand();
  assert.equal(g.sbIdx, g.dealer);
  assert.equal(g.toAct, g.dealer);
  g.act(g.toAct, { type: 'call' });
  assert.equal(g.toAct, g.bbIdx); // у ББ есть право хода
  g.act(g.toAct, { type: 'check' });
  assert.equal(g.street, 1);
  assert.equal(g.board.length, 3);
  assert.equal(g.toAct, g.bbIdx); // после флопа первым ходит ББ
});

test('все сбросили — банк забирает последний', () => {
  const g = mk(3);
  g.startHand();
  while (g.phase === 'betting') g.act(g.toAct, { type: 'fold' });
  assert.equal(g.phase, 'done');
  assert.equal(g.players.reduce((s, p) => s + p.stack, 0), 6000);
});

test('олл-ин с побочным банком', () => {
  const g = mk(3, 5);
  g.players[0].stack = 300; g.players[1].stack = 1000; g.players[2].stack = 2000;
  g.startHand();
  while (g.phase === 'betting') {
    const L = g.legal();
    g.act(g.toAct, L.canRaise ? { type: 'raise', amount: L.maxTo } : { type: 'call' });
  }
  while (g.phase === 'runout') g.runoutStep();
  assert.equal(g.phase, 'done');
  assert.equal(g.players.reduce((s, p) => s + p.stack, 0), 3300);
  assert.ok(g.result.pots.length >= 2);
});

test('5000 раздач ботов: фишки сохраняются, раздачи завершаются', () => {
  const styles = ['fish', 'pro', 'maniac', 'rock', 'student', 'pro'];
  for (const n of [2, 4, 6]) {
    const rng = makeRng(42 + n);
    const g = new Game({ players: styles.slice(0, n).map((s, i) => ({ name: `B${i}`, style: s })), rng });
    for (let h = 0; h < 5000 / 3 / (n / 2); h++) {
      g.startHand();
      const before = g.players.reduce((s, p) => s + p.stack + p.total, 0);
      let guard = 0;
      while (g.phase === 'betting') {
        const p = g.players[g.toAct];
        const d = decide(g, g.toAct, STYLES[p.style], rng, 60);
        g.act(g.toAct, d);
        assert.ok(++guard < 200, 'зацикливание торговли');
      }
      while (g.phase === 'runout') g.runoutStep();
      assert.equal(g.phase, 'done');
      const after = g.players.reduce((s, p) => s + p.stack, 0);
      assert.equal(after, before, `фишки потерялись в раздаче ${h}`);
      for (const p of g.players) assert.ok(p.stack >= 0);
    }
  }
});

test('тренер даёт совет и оценивает ход', () => {
  const g = mk(4, 9);
  g.startHand();
  const a = advise(g, g.toAct);
  assert.ok(['fold', 'check', 'call', 'raise'].includes(a.type));
  assert.ok(a.lines.length >= 2);
  const gr = grade(a, { type: a.type, amount: a.amount });
  assert.equal(gr.grade, 'good');
});

import { rigForPlayer } from '../js/rig.js';
import { evaluate, category } from '../js/evaluator.js';
import { equityKnown } from '../js/equity.js';

test('подкрутка: колода целая, комбинация собирается к риверу', () => {
  const rng = makeRng(7);
  for (let h = 0; h < 300; h++) {
    const g = new Game({ players: [{ name: 'Ты', isHuman: true }, { name: 'A' }, { name: 'B' }, { name: 'C' }], rng });
    g.onDeal = (gm) => rigForPlayer(gm, 0, rng);
    g.startHand();
    assert.ok(g.rigged);
    const all = [...g.deck, ...g.players.flatMap((p) => p.hole)];
    assert.equal(new Set(all).size, 52);
    const board = g.runoutBoard();
    assert.ok(category(evaluate(g.players[0].hole.concat(board))) >= 2);
    // доска «что было бы» совпадает с реальной раздачей до конца
    while (g.phase === 'betting') g.act(g.toAct, { type: 'call' });
    while (g.phase === 'runout') g.runoutStep();
    assert.deepEqual(g.board, board);
  }
});

test('эквити с известными картами', () => {
  const g = mk(2, 3);
  g.startHand();
  const eq = equityKnown(g.players[0].hole, [g.players[1].hole], [], 20000);
  assert.ok(eq > 0 && eq < 1);
});
