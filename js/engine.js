// Движок техасского холдема (No-Limit): раздача, торговля, побочные банки, вскрытие.
import { shuffledDeck, makeRng, prettyCard } from './cards.js';
import { evaluate, bestFive, describe } from './evaluator.js';

export const STREET_NAMES = ['Префлоп', 'Флоп', 'Тёрн', 'Ривер'];

export class Game {
  constructor({ players, sb = 10, bb = 20, startStack = 2000, rng = makeRng() }) {
    this.sb = sb;
    this.bb = bb;
    this.startStack = startStack;
    this.rng = rng;
    this.players = players.map((p, i) => ({
      id: i,
      name: p.name,
      isHuman: !!p.isHuman,
      style: p.style ?? null,
      stack: p.stack ?? startStack,
      rebuys: 0,
      hole: [],
      bet: 0,
      total: 0,
      folded: false,
      allIn: false,
      acted: false,
      lastAction: null,
      read: { pct: 1, aggr: 0, calls: 0 },
    }));
    this.dealer = Math.floor(rng() * this.players.length);
    this.handNo = 0;
    this.phase = 'idle'; // betting | runout | done
  }

  get n() { return this.players.length; }
  next(i) { return (i + 1) % this.n; }
  live() { return this.players.filter((p) => !p.folded); }
  pot() { return this.players.reduce((s, p) => s + p.total, 0); }

  emit(ev) { this.log.push({ street: this.street, ...ev }); }

  startHand() {
    this.handNo++;
    this.rebought = [];
    for (const p of this.players) {
      if (p.stack <= 0) {
        p.stack = this.startStack;
        p.rebuys++;
        this.rebought.push(p.id);
      }
    }
    this.dealer = this.next(this.dealer);
    this.deck = shuffledDeck(this.rng);
    this.board = [];
    this.street = 0;
    this.log = [];
    this.result = null;
    this.raiseCount = 0;
    this.limpers = 0;
    this.lastAggressor = null;
    for (const p of this.players) {
      Object.assign(p, {
        hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, lastAction: null,
        read: { pct: 1, aggr: 0, calls: 0 },
      });
    }
    for (let k = 0; k < 2; k++) {
      for (let j = 1; j <= this.n; j++) this.players[(this.dealer + j) % this.n].hole.push(this.deck.pop());
    }
    this.rigged = this.onDeal ? !!this.onDeal(this) : false;
    if (this.n === 2) {
      this.sbIdx = this.dealer;
      this.bbIdx = this.next(this.dealer);
    } else {
      this.sbIdx = this.next(this.dealer);
      this.bbIdx = this.next(this.sbIdx);
    }
    this.post(this.sbIdx, this.sb, 'МБ');
    this.post(this.bbIdx, this.bb, 'ББ');
    this.currentBet = this.bb;
    this.minRaise = this.bb;
    this.phase = 'betting';
    this.toAct = this.bbIdx;
    this.toAct = this.findNextToAct(this.bbIdx);
    if (this.toAct === -1) this.endRound();
  }

  post(i, amount, label) {
    const p = this.players[i];
    const amt = Math.min(amount, p.stack);
    this.put(p, amt);
    p.lastAction = { type: 'blind', text: `${label} ${amt}` };
    this.emit({ idx: i, type: 'blind', amount: amt, text: `ставит ${label === 'МБ' ? 'малый' : 'большой'} блайнд ${amt}` });
  }

  put(p, amt) {
    p.stack -= amt;
    p.bet += amt;
    p.total += amt;
    if (p.stack === 0) p.allIn = true;
  }

  /** Позиция игрока относительно баттона. */
  position(i) {
    if (this.n === 2) return i === this.dealer ? 'BTN/SB' : 'BB';
    if (i === this.sbIdx) return 'SB';
    if (i === this.bbIdx) return 'BB';
    if (i === this.dealer) return 'BTN';
    // сколько мест от игрока до баттона
    let d = 0;
    for (let j = i; j !== this.dealer; j = this.next(j)) d++;
    return ['BTN', 'CO', 'MP', 'UTG'][Math.min(d, 3)];
  }

  needsAction(p) {
    return !p.folded && !p.allIn && (!p.acted || p.bet < this.currentBet);
  }

  findNextToAct(from) {
    const actors = this.live().filter((p) => !p.allIn);
    if (actors.length === 0) return -1;
    if (actors.length === 1) {
      const p = actors[0];
      const maxBet = Math.max(...this.live().map((q) => q.bet));
      if (p.bet >= maxBet) return -1;
    }
    for (let k = 1; k <= this.n; k++) {
      const j = (from + k) % this.n;
      if (this.needsAction(this.players[j])) return j;
    }
    return -1;
  }

  legal(i = this.toAct) {
    const p = this.players[i];
    const toCall = Math.min(this.currentBet - p.bet, p.stack);
    const maxTo = p.bet + p.stack;
    const othersCanAct = this.live().some((q) => q.id !== i && !q.allIn);
    const canRaise = maxTo > this.currentBet && othersCanAct;
    const minTo = Math.min(this.currentBet + this.minRaise, maxTo);
    return { toCall, canCheck: toCall === 0, canRaise, minTo, maxTo, stack: p.stack, currentBet: this.currentBet };
  }

  act(i, action) {
    if (this.phase !== 'betting' || i !== this.toAct) throw new Error('Сейчас не ход этого игрока');
    const p = this.players[i];
    const L = this.legal(i);
    const potBefore = this.pot();
    let { type } = action;
    if (type === 'check' && !L.canCheck) type = 'call';
    if (type === 'call' && L.toCall === 0) type = 'check';
    if (type === 'raise' && !L.canRaise) type = L.toCall ? 'call' : 'check';

    let text;
    if (type === 'fold') {
      p.folded = true;
      text = 'фолд';
      p.lastAction = { type, text: 'Фолд' };
    } else if (type === 'check') {
      text = 'чек';
      p.lastAction = { type, text: 'Чек' };
    } else if (type === 'call') {
      this.put(p, L.toCall);
      text = p.allIn ? `колл ${L.toCall} (олл-ин)` : `колл ${L.toCall}`;
      p.lastAction = { type, text: p.allIn ? 'Олл-ин' : `Колл ${L.toCall}` };
      this.updateRead(p, 'call');
    } else {
      const raiseTo = Math.max(L.minTo, Math.min(Math.round(action.amount ?? L.minTo), L.maxTo));
      const wasBet = this.currentBet === 0;
      const inc = raiseTo - this.currentBet;
      this.put(p, raiseTo - p.bet);
      if (inc >= this.minRaise) this.minRaise = inc;
      if (raiseTo > this.currentBet) {
        this.currentBet = raiseTo;
        for (const q of this.players) if (q !== p) q.acted = false;
      }
      this.updateRead(p, 'raise');
      this.raiseCount++;
      this.lastAggressor = i;
      const word = wasBet ? 'Ставка' : 'Рейз до';
      text = `${word.toLowerCase()} ${raiseTo}${p.allIn ? ' (олл-ин)' : ''}`;
      p.lastAction = { type, text: p.allIn ? `Олл-ин ${raiseTo}` : `${word} ${raiseTo}` };
    }
    if (type === 'call' && this.street === 0 && this.raiseCount === 0) this.limpers++;
    p.acted = true;
    this.emit({ idx: i, type, text, pot: potBefore });
    this.afterAction();
    return type;
  }

  /** Обновляем «чтение» соперника: каким диапазоном рук он, скорее всего, играет. */
  updateRead(p, kind) {
    const r = p.read;
    if (this.street === 0) {
      if (kind === 'raise') r.pct = Math.min(r.pct, this.raiseCount === 0 ? 0.25 : this.raiseCount === 1 ? 0.08 : 0.035);
      else if (kind === 'call') {
        const isSbComplete = this.raiseCount === 0 && p.id === this.sbIdx;
        r.pct = Math.min(r.pct, this.raiseCount === 0 ? (isSbComplete ? 0.65 : 0.55) : this.raiseCount === 1 ? 0.28 : 0.08);
      }
    } else if (kind === 'raise') r.aggr += this.currentBet > 0 && this.raiseCount > 0 ? 2 : 1;
    else if (kind === 'call') r.calls++;
  }

  afterAction() {
    if (this.live().length === 1) return this.finishUncontested();
    const nextIdx = this.findNextToAct(this.toAct);
    if (nextIdx !== -1) {
      this.toAct = nextIdx;
      return;
    }
    this.endRound();
  }

  endRound() {
    if (this.live().length === 1) return this.finishUncontested();
    this.returnUncalled();
    const actors = this.live().filter((p) => !p.allIn);
    if (this.street === 3) return this.showdown();
    if (actors.length <= 1) {
      this.phase = 'runout';
      this.toAct = -1;
      return;
    }
    this.nextStreet();
    this.toAct = this.findNextToAct(this.dealer);
    if (this.toAct === -1) this.endRound();
  }

  /** Непокрытая часть ставки возвращается игроку (например, олл-ин против короткого стека). */
  returnUncalled() {
    const live = this.live();
    const sorted = [...this.players].sort((a, b) => b.bet - a.bet);
    const top = sorted[0];
    const second = sorted[1]?.bet ?? 0;
    if (top && live.includes(top) && top.bet > second) {
      const back = top.bet - second;
      top.bet -= back;
      top.total -= back;
      top.stack += back;
      if (top.stack > 0) top.allIn = false;
    }
  }

  nextStreet() {
    this.street++;
    this.deck.pop(); // карта в сброс, как в живой игре
    const count = this.street === 1 ? 3 : 1;
    for (let k = 0; k < count; k++) this.board.push(this.deck.pop());
    for (const p of this.players) {
      p.bet = 0;
      p.acted = false;
      if (!p.folded && !p.allIn) p.lastAction = null;
    }
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.raiseCount = 0;
    this.emit({ idx: -1, type: 'street', text: `${STREET_NAMES[this.street]}: ${this.board.map(prettyCard).join(' ')}` });
  }

  /** Какой была бы доска, если раздачу доиграть до конца (колода не меняется от фолдов). */
  runoutBoard() {
    const deck = this.deck.slice();
    const board = this.board.slice();
    while (board.length < 5) {
      deck.pop();
      const count = board.length === 0 ? 3 : 1;
      for (let k = 0; k < count; k++) board.push(deck.pop());
    }
    return board;
  }

  /** При олл-ине карты открываются по одной улице — UI вызывает это с паузами. */
  runoutStep() {
    if (this.phase !== 'runout') return;
    if (this.street === 3) return this.showdown();
    this.nextStreet();
  }

  finishUncontested() {
    const winner = this.live()[0];
    const amount = this.pot();
    winner.stack += amount;
    this.phase = 'done';
    this.toAct = -1;
    this.result = {
      showdown: false,
      pots: [{ amount, winners: [winner.id] }],
      winnings: { [winner.id]: amount },
      hands: {},
    };
    this.emit({ idx: winner.id, type: 'win', text: `забирает банк ${amount} — все остальные сбросили карты` });
  }

  showdown() {
    while (this.board.length < 5) this.board.push(this.deck.pop());
    this.street = 3;
    const live = this.live();
    const hands = {};
    for (const p of live) {
      const all = p.hole.concat(this.board);
      const score = evaluate(all);
      hands[p.id] = { score, name: describe(score), best: bestFive(all) };
    }

    // побочные банки
    const levels = [...new Set(live.map((p) => p.total))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lvl of levels) {
      const amount = this.players.reduce((s, p) => s + Math.min(p.total, lvl) - Math.min(p.total, prev), 0);
      const eligible = live.filter((p) => p.total >= lvl);
      if (amount > 0) pots.push({ amount, eligible });
      prev = lvl;
    }

    const winnings = {};
    const potResults = [];
    for (const pot of pots) {
      const best = Math.max(...pot.eligible.map((p) => hands[p.id].score));
      const winners = pot.eligible.filter((p) => hands[p.id].score === best);
      // нечётная фишка — первому слева от баттона
      winners.sort((a, b) => ((a.id - this.dealer + this.n) % this.n || this.n) - ((b.id - this.dealer + this.n) % this.n || this.n));
      const share = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - share * winners.length;
      for (const w of winners) {
        const got = share + (rem-- > 0 ? 1 : 0);
        w.stack += got;
        winnings[w.id] = (winnings[w.id] ?? 0) + got;
      }
      potResults.push({ amount: pot.amount, winners: winners.map((w) => w.id), eligible: pot.eligible.map((p) => p.id) });
    }

    this.phase = 'done';
    this.toAct = -1;
    this.result = { showdown: true, pots: potResults, winnings, hands };
    for (const [id, amt] of Object.entries(winnings)) {
      this.emit({ idx: Number(id), type: 'win', text: `выигрывает ${amt} — ${hands[id].name.toLowerCase()}` });
    }
  }
}
