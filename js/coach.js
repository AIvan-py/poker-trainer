// Тренер: советует ход, объясняет его простыми словами и оценивает решение игрока.
import { decide, STYLES } from './ai.js';
import { handCode, POSITION_INFO } from './preflop.js';
import { drawText } from './handinfo.js';
import { makeRng } from './cards.js';

const pc = (x) => Math.round(x * 100);
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

export function actionLabel(type, amount, L) {
  if (type === 'fold') return 'Фолд';
  if (type === 'check') return 'Чек';
  if (type === 'call') return L.toCall >= L.stack ? `Олл-ин ${L.toCall}` : `Колл ${L.toCall}`;
  if (amount >= L.maxTo) return `Олл-ин ${amount}`;
  return L.currentBet === 0 ? `Ставка ${amount}` : `Рейз до ${amount}`;
}

function strengthWord(pct) {
  if (pct <= 0.06) return 'премиум';
  if (pct <= 0.15) return 'сильная';
  if (pct <= 0.35) return 'средняя';
  return 'слабая';
}

const MADE_TEXT = [
  'пока ничего не собрано',
  'слабая пара — осторожно',
  'топ-пара или выше — хорошая рука',
  'очень сильная рука',
];

export function advise(game, idx) {
  const L = game.legal(idx);
  const rng = makeRng(game.handNo * 1000 + game.log.length * 7 + 1);
  const d = decide(game, idx, STYLES.coach, rng, 3000);
  const info = d.info;
  const lines = [];
  let why = '';
  const p = game.players[idx];

  if (info.street === 0) {
    const code = handCode(p.hole[0], p.hole[1]);
    const posInfo = POSITION_INFO[info.pos];
    lines.push(`${code}: топ-${Math.max(1, pc(info.pct))}% стартовых рук — ${strengthWord(info.pct)}.`);
    lines.push(`Позиция: ${posInfo.name.toLowerCase()} — ${posInfo.note}.`);
    switch (info.reason) {
      case 'open':
        lines.push(`Когда до тебя все сбросили, отсюда открывают примерно ${pc(info.cont)}% лучших рук. Твоя рука подходит — повышай.`);
        why = 'Сильная рука для этой позиции: рейзом забираешь инициативу и можешь сразу выиграть блайнды.';
        break;
      case 'iso':
        lines.push('Перед тобой кто-то просто уравнял (лимп). Со своей рукой повышай, чтобы играть против слабого соперника в большом банке.');
        why = 'Рейз против лимперов наказывает их слабые руки.';
        break;
      case 'weak-open':
      case 'limp':
        lines.push(`Отсюда играют примерно ${pc(info.cont)}% лучших рук, твоя в них не входит. Фолд ничего не стоит.`);
        why = 'Слабая рука для этой позиции — экономим фишки.';
        break;
      case 'bb-check':
        lines.push('Никто не повышал, и ты уже поставил большой блайнд — смотри флоп бесплатно.');
        why = 'Чек на большом блайнде — бесплатная карта.';
        break;
      case 'bb-raise':
        lines.push('Никто не повышал, а у тебя сильная рука — повысь, чтобы банк был больше.');
        why = 'Сильная рука — увеличиваем банк.';
        break;
      case '3bet':
        lines.push(`Соперник повысил до ${info.facing}. Повышать в ответ (3-бет) стоит примерно с ${Math.max(1, pc(info.t3))}% лучших рук — твоя из них.`);
        why = 'Очень сильная рука против рейза — повышаем снова.';
        break;
      case 'call-raise':
        lines.push(`Соперник повысил до ${info.facing} — значит, у него, скорее всего, хорошая рука. Уравнивать стоит примерно с ${pc(info.cont)}% лучших рук — твоя подходит.`);
        why = 'Рука достаточно хороша, чтобы уравнять рейз.';
        break;
      case 'fold-raise':
        lines.push(`Соперник повысил до ${info.facing} — у него, скорее всего, хорошая рука. Продолжают примерно с ${pc(info.cont)}% лучших рук, твоя слабее.`);
        why = 'Против рейза эта рука слишком слабая.';
        break;
      case '4bet':
      case 'call-3bet':
        lines.push('Был рейз и ре-рейз — здесь продолжают только с самыми сильными руками (примерно QQ+, AK). Твоя подходит.');
        why = 'После ре-рейза играют только топ-руки — у тебя такая.';
        break;
      case 'fold-3bet':
        lines.push('Был рейз и ре-рейз — продолжают только с самыми сильными руками (примерно QQ+, AK). Сбрасывай.');
        why = 'После ре-рейза эта рука слишком слабая.';
        break;
      default:
        break;
    }
  } else {
    const a = info.a;
    const draws = drawText(a);
    lines.push(`У тебя: ${a.name.toLowerCase()} — ${MADE_TEXT[a.made]}${draws ? `, плюс ${draws}` : ''}.`);
    if (a.outs > 0 && info.street < 3) {
      const rule = info.street === 1 ? a.outs * 4 : a.outs * 2;
      lines.push(`Аутов: ${a.outs} — столько карт усилят руку до топ-пары и выше. Правило «2 и 4»: ≈${Math.min(rule, 95)}% ${info.street === 1 ? 'до ривера' : 'на ривере'}.`);
    }
    lines.push(`Шанс выиграть (эквити) ≈ ${pc(info.eq)}% против ${info.n} ${plural(info.n, 'соперника', 'соперников', 'соперников')}.`);
    if (info.toCall > 0) {
      lines.push(`Пот-оддсы: платишь ${info.toCall}, чтобы побороться за ${info.pot + info.toCall}. Колл окупается, если выигрываешь чаще ${pc(info.potOdds)}% раз.`);
    }
    switch (info.reason) {
      case 'value':
        lines.push('Рука сильная — ставь, чтобы более слабые руки платили тебе (ставка на ценность).');
        why = 'Сильная рука — ставка на ценность.';
        break;
      case 'semibluff':
        lines.push('Ставка с дро (полублеф): соперник может сбросить сразу, а если уравняет — у тебя ещё есть шанс собрать комбинацию.');
        why = 'Полублеф с сильным дро.';
        break;
      case 'weak':
        lines.push(info.street === 3
          ? 'Рука недостаточно сильная для ставки, а блефовать против уравнивающих невыгодно — чек.'
          : 'Рука недостаточно сильная для ставки — чек, следующая карта бесплатно.');
        why = 'Слабая рука — бесплатно смотрим дальше.';
        break;
      case 'value-raise':
        lines.push('Рука очень сильная — повышай, чтобы соперник вложил в банк больше.');
        why = 'Очень сильная рука — повышаем.';
        break;
      case 'odds-ok':
        lines.push(`${pc(info.eq)}% больше нужных ${pc(info.potOdds)}% — колл выгоден на дистанции.${info.strongDraw ? ' С дро ещё можно выиграть больше, если соберёшь руку.' : ''}`);
        why = 'Шанс выиграть выше пот-оддсов — колл окупается.';
        break;
      case 'odds-bad':
        lines.push(`${pc(info.eq)}% меньше нужных ${pc(info.potOdds)}% — такой колл в долгую теряет фишки.`);
        why = 'Шанс выиграть ниже пот-оддсов — сбрасываем.';
        break;
      default:
        break;
    }
  }

  return { type: d.type, amount: d.amount, label: actionLabel(d.type, d.amount, L), lines, why, info, L };
}

/** Оценка хода игрока: good / ok / bad. */
export function grade(advice, taken) {
  const { info, L } = advice;
  const rec = advice.type;
  let type = taken.type;
  if (type === 'call' && L.toCall === 0) type = 'check';
  if (type === 'raise' && !L.canRaise) type = L.toCall ? 'call' : 'check';

  if (type === rec) return { grade: 'good', title: 'Хороший ход', text: advice.why };
  const better = `Тренер советовал: ${advice.label.toLowerCase()}.`;

  if (type === 'fold' && L.canCheck) {
    return { grade: 'bad', title: 'Ошибка', text: 'Сбрасывать карты, когда можно сделать чек бесплатно, — всегда ошибка.' };
  }

  if (info.street === 0) {
    const pct = info.pct;
    const cont = info.cont ?? 0.2;
    if (rec === 'fold' || rec === 'check') {
      if (type === 'raise' && rec === 'check') return { grade: 'ok', title: 'Допустимо', text: `Можно, но рука не такая сильная, чтобы раздувать банк. ${better}` };
      return pct <= cont * 1.6
        ? { grade: 'ok', title: 'На грани', text: `Рука чуть слабее, чем нужно для этой ситуации. ${better}` }
        : { grade: 'bad', title: 'Ошибка', text: `Слишком слабая рука: такие руки чаще проигрывают и теряют фишки. ${better}` };
    }
    if (rec === 'raise') {
      if (type === 'call' || type === 'check') return { grade: 'ok', title: 'Допустимо', text: `Рейз лучше: так ты забираешь инициативу и банк растёт, пока рука сильная. ${better}` };
      return pct <= cont * 0.5
        ? { grade: 'bad', title: 'Ошибка', text: `Это сильная рука — сбрасывать её дорого обходится. ${better}` }
        : { grade: 'ok', title: 'Допустимо', text: `Осторожно, но рука достаточно хороша, чтобы играть. ${better}` };
    }
    // rec === 'call'
    if (type === 'raise') {
      return pct <= (info.t3 ?? 0.05) * 2.5
        ? { grade: 'ok', title: 'Допустимо', text: `Агрессивно, но с такой рукой можно. ${better}` }
        : { grade: 'bad', title: 'Рискованно', text: `Для повышения рука слабовата — соперник часто будет сильнее. ${better}` };
    }
    return pct <= cont * 0.5
      ? { grade: 'bad', title: 'Ошибка', text: `Рука достаточно сильная, чтобы уравнять. ${better}` }
      : { grade: 'ok', title: 'Допустимо', text: `Осторожный фолд — не страшно. ${better}` };
  }

  const { eq, potOdds, pot, toCall, n } = info;
  if (toCall > 0) {
    const evCall = eq * (pot + toCall) - toCall;
    const big = 0.08 * pot;
    if (type === 'fold') {
      return evCall > big
        ? { grade: 'bad', title: 'Ошибка', text: `Колл был выгоден: шанс выиграть ${pc(eq)}% выше пот-оддсов ${pc(potOdds)}%. ${better}` }
        : { grade: 'ok', title: 'Допустимо', text: `Близкое решение: ${pc(eq)}% против нужных ${pc(potOdds)}%. ${better}` };
    }
    if (type === 'call') {
      if (rec === 'raise') return { grade: 'ok', title: 'Допустимо', text: `Колл неплох, но с такой сильной рукой выгоднее повысить. ${better}` };
      if (info.strongDraw || evCall > -big) return { grade: 'ok', title: 'На грани', text: `Шанс ${pc(eq)}% чуть ниже нужных ${pc(potOdds)}%. ${better}` };
      return { grade: 'bad', title: 'Ошибка', text: `Шанс выиграть ${pc(eq)}% меньше нужных ${pc(potOdds)}% — такой колл теряет фишки на дистанции. ${better}` };
    }
    // raise
    if (rec === 'call') return { grade: 'ok', title: 'Рискованно', text: `Рука хорошая, но для рейза не настолько сильная — колл проще. ${better}` };
    return info.strongDraw
      ? { grade: 'ok', title: 'Полублеф', text: `Рейз с дро — допустимо, но рискованно. ${better}` }
      : { grade: 'bad', title: 'Дорогой блеф', text: `Рейз со слабой рукой. Новичкам лучше блефовать пореже. ${better}` };
  }

  // ставок не было
  if (type === 'check') {
    if (info.reason === 'semibluff') return { grade: 'ok', title: 'Допустимо', text: `Чек тоже нормально, но с дро можно было поставить (полублеф). ${better}` };
    return { grade: 'ok', title: 'Упущенная выгода', text: `Рука сильная — ставкой ты заработал бы больше. ${better}` };
  }
  // поставил вместо чека
  if (eq >= info.valueThr - 0.1) return { grade: 'ok', title: 'Тонкая ставка', text: `Рука средняя — ставка возможна, но чек надёжнее. ${better}` };
  return n === 1
    ? { grade: 'ok', title: 'Блеф', text: `Это блеф. Против одного соперника иногда работает, но новичкам лучше блефовать редко. ${better}` }
    : { grade: 'bad', title: 'Блеф', text: `Блеф против нескольких соперников редко срабатывает — кто-нибудь да уравняет. ${better}` };
}
