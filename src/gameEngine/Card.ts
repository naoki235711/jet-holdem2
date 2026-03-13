import { Rank, Suit, Card, RANKS, SUITS } from './types';

const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export function rankValue(rank: Rank): number {
  return RANK_VALUES[rank];
}

export function parseCard(card: Card): { rank: Rank; suit: Suit } {
  return { rank: card[0] as Rank, suit: card[1] as Suit };
}

export function cardRankValue(card: Card): number {
  return rankValue(card[0] as Rank);
}

export function allCards(): Card[] {
  const cards: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      cards.push(`${rank}${suit}` as Card);
    }
  }
  return cards;
}

/** Compare two numeric value arrays lexicographically. Returns >0, <0, or 0. */
export function compareValues(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
