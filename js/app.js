// Интерфейс: экраны, стол, тренер, разбор раздачи, статистика.
import { Game, STREET_NAMES } from './engine.js';
import { decide, STYLES } from './ai.js';
import { advise, grade, actionLabel } from './coach.js';
import { rankOf, suitOf, rankLabel, SUIT_SYMBOLS, SUITS, parseCards, prettyCard } from './cards.js';
import { analyze, drawText } from './handinfo.js';
import { handPct, POSITION_INFO } from './preflop.js';
import { evaluate, shortName, rankName, comboCards, explainHand } from './evaluator.js';
import { equityKnown } from './equity.js';
import { rigForPlayer } from './rig.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => n.toLocaleString('ru-RU');
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const isF = (id) => !!meta[id]?.f;

const store = {
  get(k, d) {
    try { const v = localStorage.getItem('kt:' + k); return v ? JSON.parse(v) : d; } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('kt:' + k, JSON.stringify(v)); } catch { /* хранилище недоступно — не страшно */ }
  },
};

const BOTS = [
  { name: 'Борис', style: 'fish', color: '#5aa9c9' },
  { name: 'Лена', style: 'pro', color: '#c9a35b', f: true },
  { name: 'Гоша', style: 'maniac', color: '#e0664d' },
  { name: 'Нина', style: 'rock', color: '#a3aab0', f: true },
  { name: 'Петя', style: 'student', color: '#93c463' },
];
const OPP_HINT = {
  1: 'Один на один с Борисом. Он любит уравнивать — хороший соперник для старта.',
  3: 'Борис (Рыба), Лена (Профи) и Гоша (Маньяк) — три разных стиля игры.',
  5: 'Полный стол на шестерых, как в настоящем покер-руме.',
};
// Места по часовой стрелке от игрока (внизу): [x%, y%]
const LAYOUTS = {
  2: [[50, 87], [50, 13]],
  4: [[50, 87], [13, 33], [50, 13], [87, 33]],
  6: [[50, 87], [12, 72], [12, 33], [50, 13], [88, 33], [88, 72]],
};

const settings = Object.assign({ opponents: 3, hintMode: 'auto', speed: 'normal', fourColor: false, comboBoost: false }, store.get('settings', {}));
const stats = Object.assign({ hands: 0, won: 0, net: 0, good: 0, ok: 0, bad: 0, mistakes: [] }, store.get('stats', {}));

let game = null;
let meta = [];
const ui = {
  advice: null, open: false, asked: false, feedback: null, review: [],
  raiseTo: 0, timer: null, dealtBoard: 0, newDeal: false, revealAll: false,
  handStart: 0, lastStreet: 0, resultShown: false, whatIf: null,
};

/* ---------- Карты ---------- */
function cardHTML(c, cls = '') {
  if (c === null || c === undefined) return `<div class="card slot ${cls}"></div>`;
  if (c === 'back') return `<div class="card back ${cls}"></div>`;
  const s = suitOf(c);
  const red = s === 1 || s === 2 ? 'red' : '';
  return `<div class="card ${red} s${SUITS[s]} ${cls}" role="img" aria-label="${prettyCard(c)}"><span class="r">${rankLabel(rankOf(c))}</span><span class="ss">${SUIT_SYMBOLS[s]}</span><span class="s">${SUIT_SYMBOLS[s]}</span></div>`;
}

/* ---------- Навигация ---------- */
let current = 'home';
function showScreen(name) {
  current = name;
  for (const el of $$('.screen')) el.hidden = el.id !== `screen-${name}`;
  if (name === 'home') renderHome();
  if (name === 'stats') renderStats();
}

function openSheet(id, focus = null) {
  if (id === 'combos') renderCombos(focus);
  if (id === 'log') renderLog();
  if (id === 'explain' && !renderExplain()) return;
  $(`#${id}`).hidden = false;
  $(`#${id}-backdrop`).hidden = false;
  if (id === 'combos' && focus) $('#combo-list .current')?.scrollIntoView({ block: 'center' });
}
function closeSheet(id) {
  $(`#${id}`).hidden = true;
  $(`#${id}-backdrop`).hidden = true;
}

/* ---------- Главный экран ---------- */
function renderHome() {
  for (const seg of $$('.seg')) {
    const key = seg.dataset.setting;
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-checked', String(String(settings[key]) === b.dataset.value));
    for (const b of seg.querySelectorAll('button')) b.setAttribute('role', 'radio');
  }
  $('#opt-4color').checked = settings.fourColor;
  $('#opt-combo').checked = settings.comboBoost;
  $('#opp-hint').textContent = OPP_HINT[settings.opponents];
  $('#btn-play').textContent = game ? 'Вернуться за стол' : 'Сесть за стол';
  document.body.classList.toggle('four-color', settings.fourColor);
}

function saveSettings() {
  store.set('settings', settings);
  renderHome();
}

/* ---------- Стол ---------- */
function startTable() {
  const bots = settings.opponents === 1 ? [BOTS[0]] : settings.opponents === 3 ? BOTS.slice(0, 3) : BOTS;
  game = new Game({ players: [{ name: 'Ты', isHuman: true }, ...bots.map((b) => ({ name: b.name, style: b.style }))] });
  meta = [{ color: '#ebe7db' }, ...bots];
  game.onDeal = (g) => settings.comboBoost && Math.random() < 0.4 && rigForPlayer(g, 0, Math.random);
  showScreen('table');
  newHand();
}

function newHand() {
  // новая раздача — только когда текущая закончилась (защита от двойного нажатия)
  if (game.phase !== 'done' && game.phase !== 'idle') return;
  clearTimeout(ui.timer);
  game.startHand();
  Object.assign(ui, {
    advice: null, open: false, asked: false, feedback: null, review: [],
    dealtBoard: 0, newDeal: true, revealAll: false, resultShown: false, lastStreet: 0, whatIf: null,
  });
  const me = game.players[0];
  ui.handStart = me.stack + me.total;
  hideResult();
  if (game.rebought.includes(0)) toast('Фишки закончились — ты докупился на 2 000. Это тренировка, всё в порядке.');
  loop();
}

function botDelay() {
  const base = settings.speed === 'fast' ? 320 : 950;
  return game.players[0].folded ? Math.min(base, 260) : base;
}

function loop() {
  clearTimeout(ui.timer);
  let pause = 0;
  if (game.street !== ui.lastStreet) {
    pause = settings.speed === 'fast' ? 250 : 600;
    ui.lastStreet = game.street;
  }

  if (game.phase === 'betting') {
    const idx = game.toAct;
    const p = game.players[idx];
    if (p.isHuman) {
      ui.advice = advise(game, 0);
      ui.asked = false;
      // защита от двойного касания: кнопки оживают не сразу после появления
      ui.actReadyAt = performance.now() + 450;
      const L = game.legal(0);
      const coachSize = settings.hintMode === 'auto' && ui.advice.type === 'raise';
      ui.raiseTo = coachSize ? ui.advice.amount : presets(L)[0]?.amount ?? L.minTo;
      render();
      return;
    }
    const delay = botDelay() + pause;
    document.documentElement.style.setProperty('--think', `${delay}ms`);
    render();
    ui.timer = setTimeout(() => {
      const d = decide(game, idx, STYLES[p.style], Math.random, 700);
      // «что было бы» для соперника — только когда его фолд завершил раздачу один на один
      if (d.type === 'fold' && !game.players[0].folded && game.live().length === 2) ui.whatIf = snapshot('bot', [idx]);
      game.act(idx, d);
      loop();
    }, delay);
  } else if (game.phase === 'runout') {
    render();
    ui.timer = setTimeout(() => { game.runoutStep(); loop(); }, 1100);
  } else if (game.phase === 'done') {
    render();
    if (!ui.resultShown) {
      ui.resultShown = true;
      recordHand();
      ui.timer = setTimeout(showResult, game.result.showdown ? 900 : 500);
    }
  }
}

function humanAct(type) {
  if (!game || game.phase !== 'betting' || game.toAct !== 0) return;
  if (performance.now() < (ui.actReadyAt ?? 0)) return;
  const L = game.legal(0);
  const amount = type === 'raise' ? ui.raiseTo : undefined;
  const shownType = type === 'call' && L.toCall === 0 ? 'check' : type;
  if (ui.advice) {
    const g = grade(ui.advice, { type, amount });
    const fb = { ...g, label: actionLabel(shownType, amount, L), street: game.street, advice: ui.advice.label };
    ui.feedback = fb;
    ui.review.push(fb);
    stats[g.grade]++;
    if (g.grade === 'bad') {
      stats.mistakes.unshift({ street: STREET_NAMES[fb.street], label: fb.label, text: g.text, cards: game.players[0].hole.map(prettyCard).join(' '), board: game.board.map(prettyCard).join(' ') });
      stats.mistakes = stats.mistakes.slice(0, 8);
    }
    store.set('stats', stats);
  }
  if (type === 'fold' && !L.canCheck) {
    const opps = game.live().filter((q) => q.id !== 0).map((q) => q.id);
    ui.whatIf = snapshot('me', opps, ui.advice?.info?.eq);
  }
  ui.advice = null;
  closeSheet('explain');
  game.act(0, { type, amount });
  loop();
}

/* ---------- Строки вскрытия: кто с чем и из каких карт ---------- */
/** Строки списка: победители первыми, потом по силе руки. Для каждого — 5 лучших карт с подсветкой комбинации. */
function handRows(entries, board) {
  const sorted = [...entries].sort((a, b) => (b.won - a.won) || (b.score - a.score));
  return sorted.map((x) => {
    const p = game.players[x.id];
    const ex = explainHand(p.hole, board);
    const who = x.id === 0 ? 'Ты' : esc(p.name);
    const inCombo = ex.fromHand.filter((c) => ex.combo.has(c));
    const whose = x.id === 0 ? 'твоей руки' : 'руки';
    const fromHand = inCombo.length ? `В комбинации из ${whose}: ${inCombo.map(prettyCard).join(' ')}`
      : ex.fromHand.length ? `Из ${whose} в счёт идёт только кикер: ${ex.fromHand.map(prettyCard).join(' ')}`
        : `Комбинация целиком на столе, ${x.id === 0 ? 'твоя' : ''} рука не участвует`;
    return `<li class="${x.won ? 'won' : ''}" data-combo="${esc(ex.short)}" role="button" tabindex="0" title="Открыть в справочнике">
      <div class="sd-top">
        <span class="sd-cards">${p.hole.map((c) => cardHTML(c, ex.combo.has(c) ? 'combo' : 'dim')).join('')}</span>
        <span class="sd-who"><b>${who}${x.won ? ' · выиграл' + (x.id !== 0 && isF(x.id) ? 'а' : '') : ''}</b><small>${esc(ex.name)}</small></span>
      </div>
      <div class="sd-five">${ex.five.map((c) => cardHTML(c, ex.combo.has(c) ? 'combo' : '')).join('')}</div>
      <span class="sd-rule">${esc(cap(ex.rule))}. ${esc(fromHand)}.</span>
    </li>`;
  }).join('');
}

/* ---------- Что было бы, если доиграть до конца ---------- */
function snapshot(by, oppIds, coachEq) {
  const me = game.players[0];
  const oppHoles = oppIds.map((id) => game.players[id].hole);
  return {
    by,
    oppIds,
    street: game.street,
    board: game.board.slice(),
    runout: game.runoutBoard(),
    hole: me.hole.slice(),
    oppHoles,
    eq: null, // считаем лениво — только когда показываем итог
    coachEq,
  };
}

function whatIfHTML(w) {
  const me = game.players[0];
  if (w.eq === null) w.eq = equityKnown(w.hole, w.oppHoles, w.board, 10000);
  const scores = [{ id: 0, score: evaluate(me.hole.concat(w.runout)) },
    ...w.oppIds.map((id) => ({ id, score: evaluate(game.players[id].hole.concat(w.runout)) }))];
  const best = Math.max(...scores.map((x) => x.score));
  const winners = scores.filter((x) => x.score === best).map((x) => x.id);
  const meWins = winners.includes(0);
  const others = winners.filter((id) => id !== 0);
  const verb = others.length > 1 ? 'выиграли бы' : isF(others[0]) ? 'выиграла бы' : 'выиграл бы';
  const verdict = meWins ? (winners.length > 1 ? 'ты бы разделил банк' : 'ты бы выиграл') : `${verb} ${others.map((id) => game.players[id].name).join(' и ')}`;
  const eq = Math.round(w.eq * 100);
  const where = STREET_NAMES[w.street].toLowerCase();
  let head, lesson;
  if (w.by === 'me') {
    head = `Ты сбросил на ${where === 'префлоп' ? 'префлопе' : where === 'флоп' ? 'флопе' : where === 'тёрн' ? 'тёрне' : 'ривере'}. Если доиграть до конца, ${verdict}.`;
    lesson = eq >= 50
      ? `Зная карты соперников, твой шанс был ${eq}% — ты был фаворитом. Этот фолд стоил фишек.`
      : eq >= 30
        ? `Зная карты соперников, твой шанс был ${eq}%. Шансы средние: решай по пот-оддсам — сколько стоит колл относительно банка.`
        : `Зная карты соперников, твой шанс был всего ${eq}% — фолд правильный${meWins ? ', даже если в этот раз повезло бы' : ''}.`;
  } else {
    const opp = game.players[w.oppIds[0]].name;
    const f = isF(w.oppIds[0]);
    head = `${opp} ${f ? 'сбросила' : 'сбросил'}. Если бы ${f ? 'она доиграла' : 'он доиграл'} до конца, ${verdict}.`;
    lesson = `Твой шанс против ${f ? 'её' : 'его'} карт в тот момент: ${eq}%.`;
  }
  const coach = w.coachEq !== undefined ? ` Тренер, не видя чужих карт, оценивал ${Math.round(w.coachEq * 100)}%.` : '';
  const rows = handRows(scores.map((x) => ({ ...x, won: winners.includes(x.id) })), w.runout);
  const myCombo = new Set(comboCards(me.hole.concat(w.runout)));
  return `<div class="section-label">Что было бы, если доиграть до конца</div>
    <p class="whatif-head">${esc(head)}</p>
    <div class="whatif-board">${w.runout.map((c, k) => cardHTML(c, [k >= w.board.length ? 'future' : '', myCombo.has(c) ? 'combo' : ''].join(' '))).join('')}</div>
    <ul class="sd-list">${rows}</ul>
    <p class="whatif-lesson">${esc(lesson + coach)} Один исход — это везение или невезение; учись по проценту.</p>`;
}

/* ---------- Размер ставки ---------- */
const round5 = (x) => Math.max(5, Math.round(x / 5) * 5);
function presets(L) {
  if (!L.canRaise) return [];
  const bb = game.bb;
  const pot = game.pot();
  let list;
  if (game.street === 0) {
    list = game.raiseCount === 0
      ? [['2.5 ББ', (2.5 + game.limpers) * bb], ['3 ББ', (3 + game.limpers) * bb], ['4 ББ', (4 + game.limpers) * bb]]
      : [['×2.5', game.currentBet * 2.5], ['×3', game.currentBet * 3], ['×4', game.currentBet * 4]];
  } else {
    list = [['½ банка', L.currentBet + 0.5 * (pot + L.toCall)], ['¾', L.currentBet + 0.75 * (pot + L.toCall)], ['Банк', L.currentBet + pot + L.toCall]];
  }
  list.push(['Олл-ин', L.maxTo]);
  const seen = new Set();
  return list
    .map(([label, a]) => ({ label, amount: label === 'Олл-ин' ? L.maxTo : Math.max(L.minTo, Math.min(round5(a), L.maxTo)) }))
    .filter((p) => (seen.has(p.amount) && p.label !== 'Олл-ин' ? false : (seen.add(p.amount), true)))
    .filter((p, i, arr) => p.label === 'Олл-ин' || p.amount < L.maxTo || !arr.some((q) => q.label === 'Олл-ин'));
}

/* ---------- Отрисовка ---------- */
function render() {
  if (!game) return;
  $('#hand-no').textContent = `Раздача ${game.handNo}`;
  const done = game.phase === 'done';
  $('#hand-sub').textContent = `${done ? (game.result.showdown ? 'Вскрытие' : 'Конец раздачи') : game.phase === 'runout' ? 'Олл-ин' : STREET_NAMES[game.street]}`;
  renderSeats();
  renderCenter();
  renderHero();
  renderCoach();
  renderActions();
  ui.newDeal = false;
}

function winnersSet() {
  const r = game.result;
  if (!r) return new Set();
  return new Set(r.pots.flatMap((p) => p.winners));
}

function bestCardsOfMainWinner() {
  const r = game.result;
  if (!r?.showdown) return null;
  const w = r.pots[0].winners[0];
  return new Set(r.hands[w].best);
}

function renderSeats() {
  const pos = LAYOUTS[game.n];
  const winners = winnersSet();
  const best = bestCardsOfMainWinner();
  const done = game.phase === 'done';
  let html = '';
  game.players.forEach((p, i) => {
    const [x, y] = pos[i];
    const cls = ['seat'];
    if (p.folded) cls.push('folded');
    if (game.phase === 'betting' && game.toAct === i) cls.push('active');
    if (done && winners.has(i)) cls.push('winner');
    const showFaces = i !== 0 && ((done && game.result.showdown && !p.folded) || ui.revealAll);
    if (showFaces) cls.push('showdown');

    let cards = '';
    if (i !== 0 && (!p.folded || ui.revealAll)) {
      const deal = ui.newDeal ? 'deal' : '';
      cards = showFaces
        ? p.hole.map((c) => cardHTML(c, best ? (best.has(c) && winners.has(i) ? 'win' : '') : '')).join('')
        : cardHTML('back', deal) + cardHTML('back', deal);
    }
    const st = meta[i].style ? STYLES[meta[i].style] : null;
    const a = p.lastAction;
    const bubbleCls = a ? (a.type === 'fold' ? 'fold' : a.type === 'raise' ? 'raise' : '') : '';
    const below = y < 20 ? 'style="top:50%;left:calc(100% + 6px);transform:translateY(-50%)"' : '';
    const showBubble = a && !done && a.type !== 'blind';
    const stackText = p.allIn && !done ? 'олл-ин' : fmt(p.stack);
    html += `<div class="${cls.join(' ')}" style="left:${x}%;top:${y}%" data-seat="${i}">
      ${i !== 0 ? `<div class="seat-cards">${cards}</div>` : ''}
      <div class="plate">
        <span class="avatar" style="--c:${meta[i].color}">${i === 0 ? 'Я' : esc(p.name[0])}</span>
        <span class="plate-text"><b>${esc(p.name)}</b><small>${stackText}</small></span>
        ${showBubble ? `<span class="bubble ${bubbleCls}" ${below}>${esc(a.text)}</span>` : ''}
        ${done && winners.has(i) && game.result.winnings[i] ? `<span class="bubble raise" ${below}>+${fmt(game.result.winnings[i])}</span>` : ''}
        ${i === game.dealer ? `<span class="dealer${x > 70 ? ' inner' : ''}" title="Баттон (дилер)">D</span>` : ''}
      </div>
      ${p.bet > 0 && !done ? `<span class="bet bet-${betSide(x, y)}"><span class="chip"></span>${fmt(p.bet)}</span>` : ''}
      <span class="pos-tag">${game.position(i)}${st ? ` · ${st.label.toLowerCase()}` : ''}</span>
    </div>`;
  });
  $('#seats').innerHTML = html;
}

/** С какой стороны таблички показывать ставку — всегда в сторону центра стола. */
function betSide(x, y) {
  if (x < 30) return 'right';
  if (x > 70) return 'left';
  return y < 50 ? 'below' : 'above';
}

function renderCenter() {
  const pot = game.pot();
  const done = game.phase === 'done';
  $('#pot').innerHTML = pot && !done ? `<span class="chip"></span>Банк ${fmt(pot)}` : done ? `<span class="chip"></span>Банк ${fmt(Object.values(game.result.winnings).reduce((a, b) => a + b, 0))}` : '';
  const best = bestCardsOfMainWinner();
  let html = '';
  for (let k = 0; k < 5; k++) {
    const c = game.board[k];
    if (c === undefined) { html += cardHTML(null); continue; }
    const cls = [];
    if (k >= ui.dealtBoard) cls.push('deal');
    if (best) cls.push(best.has(c) ? 'win' : 'dim');
    else if (liveCombo().has(c)) cls.push('combo');
    html += cardHTML(c, cls.join(' '));
  }
  ui.dealtBoard = game.board.length;
  $('#board').innerHTML = html;
}

function liveCombo() {
  const me = game.players[0];
  if (me.folded || game.phase === 'done') return new Set();
  return new Set(comboCards(me.hole.concat(game.board)));
}

function preflopName(hole) {
  const [a, b] = hole;
  const hi = Math.max(rankOf(a), rankOf(b)), lo = Math.min(rankOf(a), rankOf(b));
  if (hi === lo) return `Пара: ${rankName.NOM_PL[hi]}`;
  return `${cap(rankName.NOM[hi])} и ${rankName.NOM[lo]}${suitOf(a) === suitOf(b) ? ', одной масти' : ''}`;
}

function renderHero() {
  const me = game.players[0];
  const done = game.phase === 'done';
  const winners = winnersSet();
  const best = bestCardsOfMainWinner();
  const combo = liveCombo();
  const cards = me.hole.map((c) => cardHTML(c, [ui.newDeal ? 'deal' : '', me.folded ? 'dim' : '', best && winners.has(0) && best.has(c) ? 'win' : '', combo.has(c) ? 'combo' : ''].join(' '))).join('');
  let name, extra = '';
  if (game.board.length === 0) {
    name = preflopName(me.hole);
    extra = `топ-${Math.max(1, Math.round(handPct(me.hole[0], me.hole[1]) * 100))}% рук`;
  } else {
    const a = analyze(me.hole, game.board);
    name = a.name;
    const ex = explainHand(me.hole, game.board);
    extra = [ex.cat > 0 ? ex.rule : '', drawText(a)].filter(Boolean).join(' · ');
  }
  const pos = game.position(0);
  $('#hero').innerHTML = `
    <div class="hero-cards">${cards}</div>
    <div class="hero-text">
      <span class="label">${me.folded ? 'Ты сбросил карты' : combo.size ? 'Комбинация' : 'Твоя рука'}${game.rigged ? ' · подкручено' : ''}</span>
      <span class="hero-hand">${esc(name)}</span>
      <span class="hero-meta">
        ${extra ? `<span>${esc(extra)}</span>` : ''}
        <span class="tag" title="${esc(POSITION_INFO[pos].note)}">${pos} · ${POSITION_INFO[pos].name}</span>
      </span>
    </div>`;
}

function gradeChip(g) {
  const word = g.grade === 'good' ? 'Хорошо' : g.grade === 'ok' ? 'Допустимо' : 'Ошибка';
  return `<span class="grade ${g.grade}">${word}</span>`;
}

function renderExplain() {
  const adv = ui.advice;
  if (!adv) return false;
  $('#explain').innerHTML = `<div class="sheet-head"><h2>Тренер: ${esc(adv.label.toLowerCase())}</h2>
      <button type="button" class="icon-btn" data-close="explain" aria-label="Закрыть">✕</button></div>
    <ul class="coach-lines">${adv.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <button type="button" class="btn-primary" data-close="explain">Понятно</button>`;
  return true;
}

function renderCoach() {
  const el = $('#coach');
  const myTurn = game.phase === 'betting' && game.toAct === 0 && ui.advice;
  if (myTurn) {
    if (settings.hintMode === 'button' && !ui.asked) {
      el.innerHTML = `<button type="button" class="coach-ask" id="ask">Спросить тренера</button>`;
      return;
    }
    const adv = ui.advice;
    el.innerHTML = `<div class="coach-box">
      <div class="coach-row">
        <span class="coach-who">Тренер</span>
        <span class="coach-main">Советую: ${esc(adv.label.toLowerCase())}</span>
        <button type="button" class="link-btn" id="why">Почему?</button>
      </div>
    </div>`;
    return;
  }
  if (ui.feedback) {
    const f = ui.feedback;
    el.innerHTML = `<div class="coach-box">
      <div class="coach-row">${gradeChip(f)}<span class="coach-main">${esc(f.title)}: ${esc(f.label.toLowerCase())}</span></div>
      <div class="fb-text">${esc(f.text)}</div>
    </div>`;
    return;
  }
  let text = 'Тренер следит за раздачей.';
  if (game.phase === 'betting') {
    const p = game.players[game.toAct];
    const st = STYLES[p.style];
    text = `Ходит ${p.name}${st ? ` (${st.label.toLowerCase()}: ${st.desc})` : ''}…`;
  }
  el.innerHTML = `<div class="coach-box"><div class="coach-row"><span class="coach-who">Тренер</span><span class="coach-main muted">${esc(text)}</span></div></div>`;
}

function renderActions() {
  const el = $('#actions');
  const myTurn = game.phase === 'betting' && game.toAct === 0;
  if (!myTurn) {
    const me = game.players[0];
    const msg = game.phase === 'done' ? 'Раздача окончена'
      : me.folded ? 'Ты сбросил карты — досматриваем раздачу'
      : game.phase === 'runout' ? 'Открываем оставшиеся карты'
      : 'Ждём ход соперника';
    el.innerHTML = `<div class="waiting">${msg}</div>
      <div class="act-row">
        <button type="button" class="act fold" disabled>Фолд<small>сбросить</small></button>
        <button type="button" class="act call" disabled>Чек / Колл<small>уравнять</small></button>
        <button type="button" class="act raise" disabled>Рейз<small>повысить</small></button>
      </div>`;
    return;
  }
  const L = game.legal(0);
  const showSuggest = settings.hintMode === 'auto' || ui.asked;
  const sug = showSuggest && ui.advice ? ui.advice.type : null;
  const list = presets(L);
  const raiseTo = Math.max(L.minTo, Math.min(ui.raiseTo, L.maxTo));
  ui.raiseTo = raiseTo;
  const raiseWord = raiseTo >= L.maxTo ? `Олл-ин ${fmt(raiseTo)}` : L.currentBet === 0 ? `Ставка ${fmt(raiseTo)}` : `Рейз до ${fmt(raiseTo)}`;
  const callAllIn = L.toCall >= L.stack;
  const callText = L.canCheck ? 'Чек<small>пропустить</small>'
    : callAllIn ? `Олл-ин ${fmt(L.toCall)}<small>уравнять всем стеком</small>`
    : `Колл ${fmt(L.toCall)}<small>уравнять</small>`;
  el.innerHTML = `
    ${L.canRaise ? `<div class="sizes" role="group" aria-label="Размер ставки">
      <button type="button" class="step" data-step="-1" aria-label="Меньше">−</button>
      ${list.map((p) => `<button type="button" class="preset" data-amount="${p.amount}" aria-pressed="${p.amount === raiseTo}">${p.label}</button>`).join('')}
      <button type="button" class="step" data-step="1" aria-label="Больше">+</button>
    </div>` : ''}
    <div class="act-row">
      <button type="button" class="act fold ${sug === 'fold' ? 'suggested' : ''}" data-act="fold">Фолд<small>сбросить</small></button>
      <button type="button" class="act call ${sug === 'check' || sug === 'call' ? 'suggested' : ''}" data-act="${L.canCheck ? 'check' : 'call'}">${callText}</button>
      <button type="button" class="act raise ${sug === 'raise' ? 'suggested' : ''}" data-act="raise" ${L.canRaise ? '' : 'disabled'}>${L.canRaise ? raiseWord : 'Рейз'}<small>${L.currentBet === 0 ? 'поставить' : 'повысить'}</small></button>
    </div>`;
}

/* ---------- Итог раздачи ---------- */
function recordHand() {
  const me = game.players[0];
  const net = me.stack - ui.handStart;
  stats.hands++;
  stats.net += net;
  if (net > 0) stats.won++;
  store.set('stats', stats);
}

function showResult() {
  const r = game.result;
  if (!r || game.phase !== 'done') return;
  const me = game.players[0];
  const net = me.stack - ui.handStart;
  const total = Object.values(r.winnings).reduce((a, b) => a + b, 0);
  const winnerIds = Object.keys(r.winnings).map(Number);
  const names = winnerIds.map((id) => (id === 0 ? 'ты' : game.players[id].name));
  let title;
  if (r.winnings[0] && winnerIds.length === 1) title = `Ты выиграл банк ${fmt(total)}`;
  else if (r.winnings[0]) title = `Ты забираешь ${fmt(r.winnings[0])} из ${fmt(total)}`;
  else title = `Банк ${fmt(total)} забирает ${names.join(', ')}`;
  const sub = r.showdown
    ? `Вскрытие. Итог для тебя: ${net > 0 ? '+' : ''}${fmt(net)}`
    : `Остальные сбросили карты. Итог для тебя: ${net > 0 ? '+' : ''}${fmt(net)}`;

  let sd = '';
  if (r.showdown) {
    const entries = game.players.filter((p) => !p.folded).map((p) => ({ id: p.id, score: r.hands[p.id].score, won: !!r.winnings[p.id] }));
    sd = `<div class="section-label">Вскрытие: кто с чем</div><ul class="sd-list">${handRows(entries, game.board)}</ul>`;
  }
  const folded = game.players.filter((p) => p.id !== 0 && p.folded);
  const reveal = folded.length && !ui.revealAll
    ? `<button type="button" class="btn-ghost" id="reveal">Показать карты всех</button>` : '';

  const review = ui.review.length
    ? `<div class="section-label">Разбор твоих решений</div><ul class="review">${ui.review.map((f) => `
        <li><span class="rv-head">${gradeChip(f)}${STREET_NAMES[f.street]}: ${esc(f.label.toLowerCase())}</span>
        <span class="rv-text">${esc(f.text)}</span></li>`).join('')}</ul>`
    : '<p class="result-sub">В этой раздаче тебе не пришлось принимать решений.</p>';

  const showWhatIf = ui.whatIf && (ui.whatIf.by === 'me' || !r.showdown);
  const el = $('#result');
  el.innerHTML = `<div class="result-scroll"><div class="sheet-head"><h2>${esc(title)}</h2></div>
    <p class="result-sub">${esc(sub)}</p>${sd}${showWhatIf ? whatIfHTML(ui.whatIf) : ''}${review}</div>
    <div class="result-actions">${reveal}<button type="button" class="btn-primary" id="next-hand">Следующая раздача</button></div>`;
  el.hidden = false;
}
function hideResult() { $('#result').hidden = true; }

/* ---------- Листы ---------- */
const COMBOS = [
  ['Роял-флеш', 'Ts Js Qs Ks As', 'Стрит от десятки до туза одной масти. Сильнее не бывает.', '0,003%'],
  ['Стрит-флеш', '5h 6h 7h 8h 9h', 'Пять карт подряд одной масти.', '0,03%'],
  ['Каре', 'Qs Qh Qd Qc 7s', 'Четыре карты одного ранга.', '0,17%'],
  ['Фулл-хаус', 'Ks Kh Kd 4c 4s', 'Тройка и пара одновременно.', '2,6%'],
  ['Флеш', 'Ad Jd 8d 6d 2d', 'Пять карт одной масти, не обязательно подряд.', '3,0%'],
  ['Стрит', '5c 6d 7h 8s 9c', 'Пять карт подряд, масти любые. Туз бывает и внизу: A-2-3-4-5.', '4,6%'],
  ['Тройка', '7s 7h 7d Kc 2s', 'Три карты одного ранга. Если пара у тебя на руках и третья на столе — это «сет».', '4,8%'],
  ['Две пары', 'Js Jd 4h 4c Ac', 'Две разные пары. Пятая карта — кикер — решает при равенстве.', '23,5%'],
  ['Пара', 'Ts Th Ks 6d 3c', 'Две карты одного ранга.', '43,8%'],
  ['Старшая карта', 'As Jd 8c 5h 3s', 'Ничего не собрано. Сравнивают старшие карты по очереди.', '17,4%'],
];

function renderCombos(focus = null) {
  let currentName = focus;
  if (!focus && game && current === 'table' && !game.players[0].folded) {
    const me = game.players[0];
    currentName = shortName(evaluate(me.hole.concat(game.board)));
  }
  $('#combo-list').innerHTML = COMBOS.map(([name, cards, desc, freq]) => `
    <li class="${name === currentName ? 'current' : ''}">
      <span class="combo-name">${name}${name === currentName ? `<small>${focus ? 'эта' : 'у тебя сейчас'}</small>` : ''}</span>
      <span class="combo-freq">${freq}</span>
      <span class="combo-cards">${parseCards(cards).map((c) => cardHTML(c)).join('')}</span>
      <span class="combo-desc">${desc}</span>
    </li>`).join('');
}

function renderLog() {
  if (!game) return;
  const rows = [`<li class="street-row">Префлоп</li>`];
  for (const e of game.log) {
    if (e.type === 'street') { rows.push(`<li class="street-row">${esc(e.text)}</li>`); continue; }
    const p = game.players[e.idx];
    rows.push(`<li class="${e.idx === 0 ? 'me' : ''}">${esc(p.name)}: ${esc(e.text)}</li>`);
  }
  $('#log-list').innerHTML = rows.join('');
}

function renderStats() {
  const total = stats.good + stats.ok + stats.bad;
  const pct = (x) => (total ? Math.round((x / total) * 100) : 0);
  const bb = Math.round(stats.net / 20);
  const body = $('#stats-body');
  if (!stats.hands) {
    body.innerHTML = '<p class="empty-note">Здесь появится статистика после первых раздач: сколько ты выиграл, насколько точны твои решения и какие ошибки повторяются.</p><button type="button" class="btn-primary" data-open="table-new">Сыграть первую раздачу</button>';
    return;
  }
  body.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><b>${fmt(stats.hands)}</b><span>раздач сыграно</span></div>
      <div class="stat"><b>${fmt(stats.won)}</b><span>раздач выиграно</span></div>
      <div class="stat"><b>${bb > 0 ? '+' : ''}${fmt(bb)} ББ</b><span>итог в больших блайндах</span></div>
      <div class="stat"><b>${pct(stats.good)}%</b><span>решений совпало с тренером</span></div>
    </div>
    <div class="section-label">Качество решений · ${fmt(total)}</div>
    <div class="bar" role="img" aria-label="Хорошо ${pct(stats.good)}%, допустимо ${pct(stats.ok)}%, ошибки ${pct(stats.bad)}%">
      <i style="width:${pct(stats.good)}%;background:var(--good)"></i><i style="width:${pct(stats.ok)}%;background:var(--warn)"></i><i style="width:${pct(stats.bad)}%;background:var(--bad)"></i>
    </div>
    <div class="legend"><span style="--c:var(--good)">Хорошо ${stats.good}</span><span style="--c:var(--warn)">Допустимо ${stats.ok}</span><span style="--c:var(--bad)">Ошибки ${stats.bad}</span></div>
    <div class="section-label">Последние ошибки — повтори их</div>
    ${stats.mistakes.length ? `<ul class="review">${stats.mistakes.map((m) => `
      <li><span class="rv-head"><span class="grade bad">Ошибка</span>${esc(m.street)}: ${esc(m.label.toLowerCase())}</span>
      <span class="rv-text">Рука ${esc(m.cards)}${m.board ? `, на столе ${esc(m.board)}` : ''}. ${esc(m.text)}</span></li>`).join('')}</ul>`
      : '<p class="empty-note">Ошибок пока нет.</p>'}
    <button type="button" class="btn-ghost" id="reset-stats">Сбросить статистику</button>`;
}

/* ---------- Мелочи ---------- */
let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- События ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-seat], [data-combo]');
  if (!t) return;
  if (t.dataset.combo) return openSheet('combos', t.dataset.combo);

  const seg = t.closest('.seg');
  if (seg) {
    const key = seg.dataset.setting;
    const v = t.dataset.value;
    const val = key === 'opponents' ? Number(v) : v;
    if (key === 'opponents' && val !== settings.opponents) game = null;
    settings[key] = val;
    saveSettings();
    return;
  }
  if (t.dataset.open) {
    const what = t.dataset.open;
    if (what === 'combos') openSheet('combos');
    else if (what === 'table-new') { if (game) { showScreen('table'); resume(); } else startTable(); }
    else showScreen(what);
    return;
  }
  if (t.dataset.close) return closeSheet(t.dataset.close);
  if (t.hasAttribute('data-back')) return showScreen(game && current !== 'stats' && current !== 'rules' ? 'table' : 'home');
  if (t.dataset.act) return humanAct(t.dataset.act);
  if (t.dataset.amount) { ui.raiseTo = Number(t.dataset.amount); return renderActions(); }
  if (t.dataset.step) {
    const L = game.legal(0);
    ui.raiseTo = Math.max(L.minTo, Math.min(ui.raiseTo + Number(t.dataset.step) * game.bb, L.maxTo));
    return renderActions();
  }
  if (t.dataset.seat !== undefined) {
    const i = Number(t.dataset.seat);
    if (i === 0) return;
    const st = STYLES[game.players[i].style];
    return toast(`${game.players[i].name} — ${st.label.toLowerCase()}: ${st.desc}.`);
  }
  switch (t.id) {
    case 'btn-play': return game ? (showScreen('table'), resume()) : startTable();
    case 'btn-leave': clearTimeout(ui.timer); return showScreen('home');
    case 'btn-log': return openSheet('log');
    case 'why': return openSheet('explain');
    case 'ask':
      ui.asked = true;
      if (ui.advice?.type === 'raise') ui.raiseTo = ui.advice.amount;
      renderCoach(); renderActions();
      return openSheet('explain');
    case 'next-hand': return newHand();
    case 'reveal': ui.revealAll = true; renderSeats(); return showResult();
    case 'reset-stats':
      Object.assign(stats, { hands: 0, won: 0, net: 0, good: 0, ok: 0, bad: 0, mistakes: [] });
      store.set('stats', stats);
      return renderStats();
    default:
  }
});
for (const id of ['combos', 'log', 'explain']) $(`#${id}-backdrop`).addEventListener('click', () => closeSheet(id));
$('#opt-4color').addEventListener('change', (e) => { settings.fourColor = e.target.checked; saveSettings(); });
$('#opt-combo').addEventListener('change', (e) => { settings.comboBoost = e.target.checked; saveSettings(); });

function resume() {
  if (game.phase === 'done') { render(); if (ui.resultShown) showResult(); return; }
  loop();
}

renderHome();
showScreen('home');

try {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
} catch { /* в песочнице service worker недоступен */ }

// Отладка: доступ к состоянию из консоли только при локальном запуске.
if (location.hostname === 'localhost') window.__kt = { get game() { return game; }, ui, settings };
