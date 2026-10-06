// Принятие решений: одна логика для ботов (с характером) и для тренера (без случайности).
import { handPct, OPEN_RANGE } from './preflop.js';
import { equity } from './equity.js';
import { analyze } from './handinfo.js';

export const STYLES = {
  fish: { key: 'fish', label: 'Рыба', desc: 'любит уравнивать, редко повышает', loose: 1.9, aggr: 0.15, bluff: 0.03, callMargin: 0.12, jitter: 0.15 },
  pro: { key: 'pro', label: 'Профи', desc: 'сильный, сбалансированный игрок', loose: 1.0, aggr: 0.65, bluff: 0.1, callMargin: 0, jitter: 0.05 },
  maniac: { key: 'maniac', label: 'Маньяк', desc: 'постоянно повышает и блефует', loose: 2.0, aggr: 0.95, bluff: 0.35, callMargin: 0.05, jitter: 0.2 },
  rock: { key: 'rock', label: 'Скала', desc: 'играет только сильные руки', loose: 0.6, aggr: 0.45, bluff: 0.02, callMargin: -0.04, jitter: 0.05 },
  student: { key: 'student', label: 'Студент', desc: 'играет много рук, но осторожно', loose: 1.5, aggr: 0.4, bluff: 0.06, callMargin: 0.06, jitter: 0.12 },
  coach: { key: 'coach', label: 'Тренер', loose: 1, aggr: 0.6, bluff: 0, callMargin: 0, jitter: 0 },
};

const round5 = (x) => Math.max(5, Math.round(x / 5) * 5);

function finalizeRaise(L, raiseTo, effStack) {
  let amt = Math.max(L.minTo, Math.min(round5(raiseTo), L.maxTo));
  // если ставка съедает почти весь стек — честнее пойти олл-ин
  if (amt >= 0.45 * effStack) amt = L.maxTo;
  return amt;
}

export function decide(game, idx, style, rng = Math.random, iters = 800) {
  const p = game.players[idx];
  const L = game.legal(idx);
  const effStack = p.stack + p.bet;
  const plan = game.street === 0 ? preflop(game, idx, style, rng, L) : postflop(game, idx, style, rng, L, iters);
  if (plan.type === 'raise') {
    if (!L.canRaise) plan.type = L.canCheck ? 'check' : 'call';
    else plan.amount = finalizeRaise(L, plan.amount, effStack);
  }
  if (plan.type === 'fold' && L.canCheck) plan.type = 'check';
  if (plan.type === 'call' && L.canCheck) plan.type = 'check';
  return plan;
}

function preflop(game, idx, style, rng, L) {
  const p = game.players[idx];
  const bb = game.bb;
  const pos = game.position(idx);
  const pct = handPct(p.hole[0], p.hole[1]);
  const jit = 1 + (rng() - 0.5) * 2 * style.jitter;
  const loose = style.loose * jit;
  const raises = game.raiseCount;
  const facing = game.currentBet;
  const hu = game.n === 2;
  const info = { street: 0, pct, pos, raises, limpers: game.limpers, facing, toCall: L.toCall, pot: game.pot() };
  let type = 'fold', amount = 0, reason;

  if (raises === 0) {
    const openThr = Math.min(0.95, OPEN_RANGE[pos] * loose);
    info.cont = openThr;
    if (pos === 'BB') {
      if (pct <= Math.min(0.9, 0.15 * loose) && style.aggr > 0.25) {
        type = 'raise'; amount = (3 + game.limpers) * bb; reason = 'bb-raise';
      } else { type = 'check'; reason = 'bb-check'; }
    } else {
      const thr = game.limpers > 0 ? openThr * 0.8 : openThr;
      info.cont = thr;
      if (pct <= thr) {
        if (style.aggr < 0.25 && pct > 0.05) { type = 'call'; reason = 'limp'; }
        else { type = 'raise'; amount = (hu ? 2.5 : 2.5 + game.limpers) * bb; reason = game.limpers ? 'iso' : 'open'; }
      } else if (pos === 'SB' && game.limpers === 0 && style.loose > 1.2 && pct <= 0.6 * loose) {
        type = 'call'; reason = 'limp';
      } else if (game.limpers > 0 && style.loose > 1.2 && pct <= thr * 1.3) {
        type = 'call'; reason = 'limp';
      } else { type = 'fold'; reason = 'weak-open'; }
    }
  } else if (raises === 1) {
    const sizeBB = facing / bb;
    let t3 = 0.05 * loose * (0.5 + style.aggr);
    let tc = (pos === 'BB' ? 0.3 : pos === 'SB' ? 0.12 : 0.17) * loose;
    if (hu) { t3 = 0.12 * loose * (0.5 + style.aggr); tc = 0.55 * loose; }
    if (sizeBB > 4.5) { tc *= 0.6; t3 *= 0.8; }
    if (sizeBB > 15) { tc = 0.06 * loose; t3 = 0.03 * loose; }
    info.t3 = t3; info.cont = tc;
    if (pct <= t3) { type = 'raise'; amount = facing * (pos === 'SB' || pos === 'BB' ? 3.5 : 3); reason = '3bet'; }
    else if (pct <= tc) { type = 'call'; reason = 'call-raise'; }
    else { type = 'fold'; reason = 'fold-raise'; }
  } else {
    const t4 = 0.025 * loose;
    const tc = 0.06 * loose;
    info.t3 = t4; info.cont = tc;
    if (pct <= t4) { type = 'raise'; amount = facing * 2.3; reason = '4bet'; }
    else if (pct <= tc) { type = 'call'; reason = 'call-3bet'; }
    else { type = 'fold'; reason = 'fold-3bet'; }
  }

  // характер: агрессивные боты иногда повышают «просто так»
  if (type !== 'raise' && L.canRaise && raises < 2 && pct < 0.65 && rng() < style.bluff * 0.25) {
    type = 'raise';
    amount = raises === 0 ? 3 * bb : facing * 3;
    reason = 'bluff';
  }
  info.reason = reason;
  return { type, amount, info };
}

function postflop(game, idx, style, rng, L, iters) {
  const p = game.players[idx];
  const opps = game.live().filter((q) => q.id !== idx);
  const n = opps.length;
  const eq = equity(p.hole, game.board, opps.map((q) => q.read), iters, rng);
  const a = analyze(p.hole, game.board);
  const pot = game.pot();
  const toCall = L.toCall;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const valueThr = 0.6 * Math.sqrt(2 / (n + 1)) - (style.aggr - 0.5) * 0.08;
  const raiseThr = valueThr + 0.15;
  const strongDraw = (a.flushDraw || a.oesd) && game.street < 3;
  const isCoach = style.key === 'coach';
  const info = { street: game.street, eq, a, pot, toCall, potOdds, n, valueThr, raiseThr, strongDraw };
  let type, amount = 0, reason;

  if (toCall === 0) {
    if (eq >= valueThr) {
      type = 'raise'; amount = (eq > 0.8 ? 0.75 : 0.6) * pot; reason = 'value';
    } else if (strongDraw && (isCoach ? n <= 2 : rng() < style.aggr)) {
      type = 'raise'; amount = 0.5 * pot; reason = 'semibluff';
    } else if (!isCoach && rng() < style.bluff * (n === 1 ? 1 : 0.4)) {
      type = 'raise'; amount = 0.5 * pot; reason = 'bluff';
    } else { type = 'check'; reason = 'weak'; }
  } else {
    const implied = strongDraw ? 0.03 : 0;
    const need = potOdds - style.callMargin - implied;
    info.need = need;
    if (eq >= raiseThr && L.canRaise) {
      type = 'raise'; amount = L.currentBet + 0.75 * (pot + toCall); reason = 'value-raise';
    } else if (eq >= need) { type = 'call'; reason = 'odds-ok'; }
    else if (!isCoach && L.canRaise && rng() < style.bluff * 0.15) {
      type = 'raise'; amount = L.currentBet + 0.75 * (pot + toCall); reason = 'bluff';
    } else { type = 'fold'; reason = 'odds-bad'; }
  }
  info.reason = reason;
  return { type, amount, info };
}
