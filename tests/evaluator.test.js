import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../js/cards.js';
import { evaluate, category, describe, bestFive } from '../js/evaluator.js';

const ev = (s) => evaluate(parseCards(s));
const cat = (s) => category(ev(s));

test('категории комбинаций', () => {
  assert.equal(cat('As Kd 9c 7h 4s 3d 2c'), 0);
  assert.equal(cat('As Ad 9c 7h 4s 3d 2c'), 1);
  assert.equal(cat('As Ad 9c 9h 4s 3d 2c'), 2);
  assert.equal(cat('As Ad Ac 9h 4s 3d 2c'), 3);
  assert.equal(cat('As 2d 3c 4h 5s Kd Qc'), 4); // колесо
  assert.equal(cat('Ts Jd Qc Kh As 2d 2c'), 4);
  assert.equal(cat('As 9s 7s 4s 2s Kd Qc'), 5);
  assert.equal(cat('As Ad Ac 9h 9s 3d 2c'), 6);
  assert.equal(cat('As Ad Ac Ah 9s 3d 2c'), 7);
  assert.equal(cat('5s 6s 7s 8s 9s Ad Ac'), 8);
});

test('сравнение рук', () => {
  assert.ok(ev('As Ad Kc 7h 4s') > ev('Ks Kd Qc 7h 4s'));
  assert.ok(ev('As Ad Kc 7h 4s') > ev('Ah Ac Qc 7h 4s')); // кикер
  assert.ok(ev('6s 2d 3c 4h 5s') > ev('As 2d 3c 4h 5s')); // стрит до 6 > колесо
  assert.equal(ev('As Kd 9c 7h 4s'), ev('Ah Kc 9d 7s 4c'));
  assert.ok(ev('As Ad Ac 9h 9s 8d 8c') > ev('Ks Kd Kc Qh Qs Jd Jc'));
  // две тройки → фулл-хаус со старшей тройкой
  assert.equal(describe(ev('9s 9d 9c 5h 5s 5d 2c')), 'Фулл-хаус: девятки и пятёрки');
  // три пары: кикер — лучшая из оставшихся
  assert.ok(ev('As Ad Ks Kd 7c 7h Qd') > ev('As Ad Ks Kd 7c 7h Jd'));
});

test('названия по-русски', () => {
  assert.equal(describe(ev('Qs Qd 9c 7h 4s')), 'Пара: дамы');
  assert.equal(describe(ev('Ts Jd Qc Kh As')), 'Стрит до туза');
  assert.equal(describe(ev('Ts Js Qs Ks As')), 'Роял-флеш');
  assert.equal(describe(ev('As Ad Ac Ah 2c')), 'Каре тузов');
});

test('лучшие пять карт', () => {
  const best = bestFive(parseCards('As 9s 7s 4s 2s Kd Qc'));
  assert.equal(best.length, 5);
  assert.equal(category(evaluate(best)), 5);
});
