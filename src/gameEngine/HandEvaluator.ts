import { Card, HandRank, HandResult } from './types';
import { parseCard, rankValue, compareValues } from './Card';

/** Evaluate a 5-card poker hand */
export function evaluateHand(cards: Card[]): HandResult {
  if (cards.length !== 5) throw new Error('evaluateHand requires exactly 5 cards');

  const parsed = cards.map(c => {
    const { rank, suit } = parseCard(c);
    return { card: c, rank, suit, value: rankValue(rank) };
  });

  // Sort by value descending
  parsed.sort((a, b) => b.value - a.value);

  const values = parsed.map(p => p.value);
  const suits = parsed.map(p => p.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;

  // Normal straight check
  if (values[0] - values[4] === 4 && new Set(values).size === 5) {
    isStraight = true;
    straightHigh = values[0];
  }
  // Ace-low straight: A-2-3-4-5
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5; // 5-high straight
  }

  // Count occurrences of each rank value
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const countEntries = [...counts.entries()].sort((a, b) => {
    // Sort by count desc, then by value desc
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const countPattern = countEntries.map(e => e[1]).join('');

  // Determine hand rank
  if (isFlush && isStraight && straightHigh === 14) {
    return makeResult(HandRank.RoyalFlush, cards, [HandRank.RoyalFlush, 14], 'Royal Flush');
  }
  if (isFlush && isStraight) {
    return makeResult(HandRank.StraightFlush, cards, [HandRank.StraightFlush, straightHigh],
      `Straight Flush, ${rankName(straightHigh)}-high`);
  }
  if (countPattern === '41') {
    const quadVal = countEntries[0][0];
    const kicker = countEntries[1][0];
    return makeResult(HandRank.FourOfAKind, cards, [HandRank.FourOfAKind, quadVal, kicker],
      `Four of a Kind, ${rankName(quadVal)}s`);
  }
  if (countPattern === '32') {
    const tripVal = countEntries[0][0];
    const pairVal = countEntries[1][0];
    return makeResult(HandRank.FullHouse, cards, [HandRank.FullHouse, tripVal, pairVal],
      `Full House, ${rankName(tripVal)}s over ${rankName(pairVal)}s`);
  }
  if (isFlush) {
    return makeResult(HandRank.Flush, cards, [HandRank.Flush, ...values],
      `Flush, ${rankName(values[0])}-high`);
  }
  if (isStraight) {
    return makeResult(HandRank.Straight, cards, [HandRank.Straight, straightHigh],
      `Straight, ${rankName(straightHigh)}-high`);
  }
  if (countPattern === '311') {
    const tripVal = countEntries[0][0];
    const kickers = countEntries.slice(1).map(e => e[0]).sort((a, b) => b - a);
    return makeResult(HandRank.ThreeOfAKind, cards, [HandRank.ThreeOfAKind, tripVal, ...kickers],
      `Three of a Kind, ${rankName(tripVal)}s`);
  }
  if (countPattern === '221') {
    const highPair = Math.max(countEntries[0][0], countEntries[1][0]);
    const lowPair = Math.min(countEntries[0][0], countEntries[1][0]);
    const kicker = countEntries[2][0];
    return makeResult(HandRank.TwoPair, cards, [HandRank.TwoPair, highPair, lowPair, kicker],
      `Two Pair, ${rankName(highPair)}s and ${rankName(lowPair)}s`);
  }
  if (countPattern === '2111') {
    const pairVal = countEntries[0][0];
    const kickers = countEntries.slice(1).map(e => e[0]).sort((a, b) => b - a);
    return makeResult(HandRank.OnePair, cards, [HandRank.OnePair, pairVal, ...kickers],
      `One Pair, ${rankName(pairVal)}s`);
  }

  // High card
  return makeResult(HandRank.HighCard, cards, [HandRank.HighCard, ...values],
    `High Card, ${rankName(values[0])}`);
}

function makeResult(rank: HandRank, cards: Card[], values: number[], description: string): HandResult {
  return { rank, cards: [...cards], values, description };
}

const VALUE_NAMES: Record<number, string> = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven',
  8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};

function rankName(value: number): string {
  return VALUE_NAMES[value] ?? String(value);
}

/** Evaluate best 5-card hand from 7 cards */
export function evaluate7Cards(cards: Card[]): HandResult {
  if (cards.length !== 7) throw new Error('evaluate7Cards requires exactly 7 cards');

  let best: HandResult | null = null;

  // Generate all C(7,5) = 21 combinations
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      // Exclude cards at index i and j
      const hand = cards.filter((_, idx) => idx !== i && idx !== j);
      const result = evaluateHand(hand);
      if (best === null || compareValues(result.values, best.values) > 0) {
        best = result;
      }
    }
  }

  return best!;
}

/** Compare two HandResults. Returns >0 if a wins, <0 if b wins, 0 if tie. */
export function compareHands(a: HandResult, b: HandResult): number {
  return compareValues(a.values, b.values);
}
