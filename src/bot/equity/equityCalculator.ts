import { Card } from '../../gameEngine/types';
import { allCards } from '../../gameEngine/Card';
import { evaluate7Cards, compareHands } from '../../gameEngine/HandEvaluator';

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function estimateEquity(
  holeCards: Card[],
  community: Card[],
  numOpponents: number,
  numSimulations: number = 5000
): number {
  if (numOpponents === 0) return 1.0;

  const known = new Set<Card>([...holeCards, ...community]);
  const remaining = allCards().filter(c => !known.has(c));

  let wins = 0;

  for (let sim = 0; sim < numSimulations; sim++) {
    const deck = shuffled(remaining);
    let idx = 0;

    // Deal opponent hands
    const opponentHands: Card[][] = [];
    for (let o = 0; o < numOpponents; o++) {
      opponentHands.push([deck[idx++], deck[idx++]]);
    }

    // Complete community to 5 cards; skip on river (community.length === 5)
    const runout = [...community];
    while (runout.length < 5) {
      runout.push(deck[idx++]);
    }

    const heroHand = evaluate7Cards([...holeCards, ...runout]);

    let heroBeaten = false;
    let heroTied = false;

    for (const oppCards of opponentHands) {
      const oppHand = evaluate7Cards([...oppCards, ...runout]);
      const cmp = compareHands(heroHand, oppHand);
      if (cmp < 0) { heroBeaten = true; break; }
      if (cmp === 0) heroTied = true;
    }

    if (!heroBeaten) wins += heroTied ? 0.5 : 1;
  }

  return wins / numSimulations;
}
