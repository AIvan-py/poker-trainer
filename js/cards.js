// Карты кодируются числом 0..51: ранг = c >> 2 (0 = двойка … 12 = туз), масть = c & 3.
export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc'; // пики, червы, бубны, трефы
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];

export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;

export const cardStr = (c) => RANKS[rankOf(c)] + SUITS[suitOf(c)];
export const parseCard = (s) => RANKS.indexOf(s[0]) * 4 + SUITS.indexOf(s[1]);
export const parseCards = (s) => s.trim().split(/\s+/).filter(Boolean).map(parseCard);

/** Подпись ранга на карте: десятка пишется «10». */
export const rankLabel = (r) => (r === 8 ? '10' : RANKS[r]);
export const prettyCard = (c) => rankLabel(rankOf(c)) + SUIT_SYMBOLS[suitOf(c)];

/** Детерминированный ГСЧ (mulberry32) — удобно для тестов. */
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffledDeck(rng) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
