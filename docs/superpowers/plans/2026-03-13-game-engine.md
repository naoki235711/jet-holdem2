# Jet Holdem - Game Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Texas Hold'em game engine with full TDD coverage — deck, hand evaluation, betting rounds, pot management, and game loop — as a pure TypeScript library testable with Jest.

**Architecture:** Host-authoritative game engine where all logic runs on one device. The engine is a pure TypeScript module with no React Native dependencies, enabling full test coverage on Windows with Jest. State machine drives phase transitions (preflop → flop → turn → river → showdown).

**Tech Stack:** TypeScript, Jest, ts-jest, Expo (project scaffold only)

**Scope Note:** This is Plan 1 of 4. Subsequent plans cover: (2) BLE Communication, (3) UI, (4) Data Persistence. This plan produces a fully tested game engine that the other plans depend on.

---

## File Structure

```
jet-holdem2/
├── package.json
├── tsconfig.json
├── jest.config.js
├── babel.config.js
├── app.json
├── App.tsx                          # Minimal Expo entry point (placeholder)
├── src/
│   └── gameEngine/
│       ├── types.ts                 # All shared types (Card, Player, GameState, etc.)
│       ├── Card.ts                  # Card parsing, rank values, utilities
│       ├── Deck.ts                  # Shuffle (Fisher-Yates) and deal
│       ├── HandEvaluator.ts         # 5-card and 7-card hand evaluation
│       ├── PotManager.ts            # Main pot and side pot calculation
│       ├── BettingRound.ts          # Betting round state, action validation, turn logic
│       ├── GameLoop.ts              # Phase progression, blind posting, dealer rotation
│       └── index.ts                 # Public API re-exports
└── tests/
    └── gameEngine/
        ├── Card.test.ts
        ├── Deck.test.ts
        ├── HandEvaluator.test.ts
        ├── PotManager.test.ts
        ├── BettingRound.test.ts
        └── GameLoop.test.ts
```

---

## Chunk 1: Project Setup, Types, Card, Deck

### Task 1: Project Initialization

- [ ] **Step 1: Initialize Expo TypeScript project**

```bash
cd /home/ub180822/00_hobby/jet-holdem2
npx create-expo-app@latest . --template blank-typescript --yes
```

If this fails due to non-empty directory, use:

```bash
cd /tmp && npx create-expo-app@latest jet-holdem-init --template blank-typescript --yes
cp -n /tmp/jet-holdem-init/* /home/ub180822/00_hobby/jet-holdem2/ 2>/dev/null
cp -rn /tmp/jet-holdem-init/.* /home/ub180822/00_hobby/jet-holdem2/ 2>/dev/null
rm -rf /tmp/jet-holdem-init
cd /home/ub180822/00_hobby/jet-holdem2
```

- [ ] **Step 2: Install dev dependencies for testing**

```bash
npm install --save-dev jest ts-jest @types/jest
```

- [ ] **Step 3: Create jest.config.js**

Create `jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
};
```

- [ ] **Step 4: Verify tsconfig.json includes src and tests paths**

Expo's template generates a `tsconfig.json` with `"extends": "expo/tsconfig.base"`. Modify it to add `strict` mode and include test paths. The result should look like:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

Do NOT remove the `extends` field — it provides Expo's module resolution, JSX settings, and other defaults.

- [ ] **Step 5: Create source and test directories**

```bash
mkdir -p src/gameEngine tests/gameEngine
```

- [ ] **Step 6: Add test script to package.json**

Add to `"scripts"` in `package.json`:

```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 7: Create a smoke test and run it**

Create `tests/gameEngine/smoke.test.ts`:

```typescript
describe('Jest setup', () => {
  it('runs a test', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 test passed.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: initialize Expo TypeScript project with Jest"
```

---

### Task 2: Type Definitions

- [ ] **Step 1: Create types.ts**

Create `src/gameEngine/types.ts`:

```typescript
// Card notation: 2-character string, e.g., "Ah" = Ace of Hearts
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Suit = 'h' | 'd' | 's' | 'c';
export type Card = `${Rank}${Suit}`;

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS: Suit[] = ['h', 'd', 's', 'c'];

export enum HandRank {
  HighCard = 0,
  OnePair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
}

export interface HandResult {
  rank: HandRank;
  cards: Card[];       // The best 5 cards
  values: number[];    // Numeric values for comparison [rankCategory, ...kickers]
  description: string; // Human-readable, e.g., "Full House, Kings over Sevens"
}

export type PlayerStatus = 'active' | 'folded' | 'allIn' | 'out';

export interface Player {
  seat: number;        // 0-3
  name: string;
  chips: number;
  status: PlayerStatus;
  bet: number;         // Current round bet
  cards: Card[];       // Hole cards (2 cards)
}

export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'roundEnd' | 'gameOver';

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allIn';

export interface PlayerAction {
  action: ActionType;
  amount?: number;     // Required for 'raise'
}

export interface Pot {
  amount: number;
  eligible: number[];  // Seat numbers eligible for this pot
}

export interface Blinds {
  sb: number;
  bb: number;
}

export interface GameState {
  seq: number;
  phase: Phase;
  community: Card[];
  pots: Pot[];
  currentBet: number;
  activePlayer: number; // Seat number of player who must act
  dealer: number;       // Seat number of dealer button
  blinds: Blinds;
  players: Player[];
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit src/gameEngine/types.ts`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/gameEngine/types.ts
git commit -m "feat: add game engine type definitions"
```

---

### Task 3: Card Utilities

- [ ] **Step 1: Write failing tests for Card utilities**

Create `tests/gameEngine/Card.test.ts`:

```typescript
import { rankValue, parseCard, allCards, compareValues } from '../../src/gameEngine/Card';
import { Card } from '../../src/gameEngine/types';

describe('Card', () => {
  describe('rankValue', () => {
    it('returns 2 for rank 2', () => {
      expect(rankValue('2')).toBe(2);
    });

    it('returns 14 for Ace', () => {
      expect(rankValue('A')).toBe(14);
    });

    it('returns 10 for T', () => {
      expect(rankValue('T')).toBe(10);
    });

    it('returns 13 for King', () => {
      expect(rankValue('K')).toBe(13);
    });
  });

  describe('parseCard', () => {
    it('parses Ah to rank A, suit h', () => {
      expect(parseCard('Ah')).toEqual({ rank: 'A', suit: 'h' });
    });

    it('parses Td to rank T, suit d', () => {
      expect(parseCard('Td')).toEqual({ rank: 'T', suit: 'd' });
    });
  });

  describe('allCards', () => {
    it('returns 52 unique cards', () => {
      const cards = allCards();
      expect(cards).toHaveLength(52);
      expect(new Set(cards).size).toBe(52);
    });
  });

  describe('compareValues', () => {
    it('returns positive when first is higher', () => {
      expect(compareValues([9, 14], [9, 13])).toBeGreaterThan(0);
    });

    it('returns negative when first is lower', () => {
      expect(compareValues([5], [6])).toBeLessThan(0);
    });

    it('returns 0 for equal values', () => {
      expect(compareValues([9, 14, 13], [9, 14, 13])).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/gameEngine/Card.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Card.ts**

Create `src/gameEngine/Card.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/gameEngine/Card.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gameEngine/Card.ts tests/gameEngine/Card.test.ts
git commit -m "feat: add Card utilities with parsing and comparison"
```

---

### Task 4: Deck

- [ ] **Step 1: Write failing tests for Deck**

Create `tests/gameEngine/Deck.test.ts`:

```typescript
import { Deck } from '../../src/gameEngine/Deck';

describe('Deck', () => {
  let deck: Deck;

  beforeEach(() => {
    deck = new Deck();
  });

  it('starts with 52 cards', () => {
    expect(deck.remaining).toBe(52);
  });

  it('deals one card and decrements remaining', () => {
    const card = deck.deal();
    expect(card).toBeDefined();
    expect(typeof card).toBe('string');
    expect(card).toHaveLength(2);
    expect(deck.remaining).toBe(51);
  });

  it('deals 52 unique cards', () => {
    const dealt: string[] = [];
    for (let i = 0; i < 52; i++) {
      dealt.push(deck.deal());
    }
    expect(new Set(dealt).size).toBe(52);
  });

  it('throws when dealing from empty deck', () => {
    for (let i = 0; i < 52; i++) deck.deal();
    expect(() => deck.deal()).toThrow('No cards remaining');
  });

  it('dealMultiple returns requested number of cards', () => {
    const cards = deck.dealMultiple(5);
    expect(cards).toHaveLength(5);
    expect(deck.remaining).toBe(47);
  });

  it('shuffle produces different order (statistical)', () => {
    const deck1 = new Deck();
    const deck2 = new Deck();
    const cards1 = Array.from({ length: 52 }, () => deck1.deal());
    const cards2 = Array.from({ length: 52 }, () => deck2.deal());
    // Extremely unlikely to be identical after independent shuffles
    const same = cards1.every((c, i) => c === cards2[i]);
    expect(same).toBe(false);
  });

  it('reset restores full deck', () => {
    deck.dealMultiple(10);
    deck.reset();
    expect(deck.remaining).toBe(52);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/gameEngine/Deck.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Deck.ts**

Create `src/gameEngine/Deck.ts`:

```typescript
import { Card } from './types';
import { allCards } from './Card';

export class Deck {
  private cards: Card[] = [];

  constructor() {
    this.reset();
  }

  get remaining(): number {
    return this.cards.length;
  }

  reset(): void {
    this.cards = allCards();
    this.shuffle();
  }

  /** Fisher-Yates shuffle */
  private shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(): Card {
    if (this.cards.length === 0) {
      throw new Error('No cards remaining');
    }
    return this.cards.pop()!;
  }

  dealMultiple(count: number): Card[] {
    const result: Card[] = [];
    for (let i = 0; i < count; i++) {
      result.push(this.deal());
    }
    return result;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/gameEngine/Deck.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gameEngine/Deck.ts tests/gameEngine/Deck.test.ts
git commit -m "feat: add Deck with Fisher-Yates shuffle and deal"
```

- [ ] **Step 6: Delete smoke test**

Remove `tests/gameEngine/smoke.test.ts` — no longer needed.

```bash
rm tests/gameEngine/smoke.test.ts
git add -u
git commit -m "chore: remove smoke test"
```

---

## Chunk 2: Hand Evaluator

### Task 5: HandEvaluator — 5-Card Evaluation

- [ ] **Step 1: Write failing tests for 5-card hand evaluation**

Create `tests/gameEngine/HandEvaluator.test.ts`:

```typescript
import { evaluateHand, evaluate7Cards, compareHands } from '../../src/gameEngine/HandEvaluator';
import { Card, HandRank } from '../../src/gameEngine/types';

describe('HandEvaluator', () => {
  describe('evaluateHand (5 cards)', () => {
    it('detects Royal Flush', () => {
      const cards: Card[] = ['Ah', 'Kh', 'Qh', 'Jh', 'Th'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.RoyalFlush);
    });

    it('detects Straight Flush', () => {
      const cards: Card[] = ['9s', '8s', '7s', '6s', '5s'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.StraightFlush);
    });

    it('detects Four of a Kind', () => {
      const cards: Card[] = ['Kh', 'Kd', 'Ks', 'Kc', '3h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.FourOfAKind);
    });

    it('detects Full House', () => {
      const cards: Card[] = ['Kh', 'Kd', 'Ks', '7c', '7h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.FullHouse);
      expect(result.description).toBe('Full House, Kings over Sevens');
    });

    it('detects Flush', () => {
      const cards: Card[] = ['Ah', '9h', '7h', '4h', '2h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.Flush);
    });

    it('detects Straight', () => {
      const cards: Card[] = ['9h', '8d', '7s', '6c', '5h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.Straight);
    });

    it('detects Ace-low Straight (wheel)', () => {
      const cards: Card[] = ['Ah', '2d', '3s', '4c', '5h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.Straight);
      // Ace-low straight: value should be 5 (highest card in the straight)
      expect(result.values[1]).toBe(5);
    });

    it('detects Three of a Kind', () => {
      const cards: Card[] = ['Jh', 'Jd', 'Js', '8c', '3h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.ThreeOfAKind);
    });

    it('detects Two Pair', () => {
      const cards: Card[] = ['Kh', 'Kd', '7s', '7c', '3h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.TwoPair);
    });

    it('detects One Pair', () => {
      const cards: Card[] = ['Ah', 'Ad', '9s', '7c', '3h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.OnePair);
    });

    it('detects High Card', () => {
      const cards: Card[] = ['Ah', 'Jd', '9s', '7c', '3h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.HighCard);
    });

    it('Ace-low straight flush', () => {
      const cards: Card[] = ['Ac', '2c', '3c', '4c', '5c'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.StraightFlush);
    });
  });

  describe('kicker comparison', () => {
    it('higher kicker wins in One Pair', () => {
      const hand1 = evaluateHand(['Ah', 'Ad', 'Ks', '7c', '3h'] as Card[]);
      const hand2 = evaluateHand(['Ah', 'Ad', 'Qs', '7c', '3h'] as Card[]);
      // hand1 has K kicker, hand2 has Q kicker
      expect(compareHands(hand1, hand2)).toBeGreaterThan(0);
    });

    it('same hand with same kickers is a tie', () => {
      const hand1 = evaluateHand(['Ah', 'Ad', 'Ks', '7c', '3h'] as Card[]);
      const hand2 = evaluateHand(['As', 'Ac', 'Kd', '7h', '3d'] as Card[]);
      expect(compareHands(hand1, hand2)).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/gameEngine/HandEvaluator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement HandEvaluator.ts (5-card evaluation)**

Create `src/gameEngine/HandEvaluator.ts`:

```typescript
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
  const ranks = parsed.map(p => p.rank);

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/gameEngine/HandEvaluator.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gameEngine/HandEvaluator.ts tests/gameEngine/HandEvaluator.test.ts
git commit -m "feat: add HandEvaluator with 5-card evaluation and all hand ranks"
```

---

### Task 6: HandEvaluator — 7-Card Evaluation & Advanced Tests

- [ ] **Step 1: Add 7-card evaluation and comparison tests**

Add the following `describe` blocks **inside** the existing `describe('HandEvaluator', ...)` block in `tests/gameEngine/HandEvaluator.test.ts`, before the closing `});`:

```typescript
  describe('evaluate7Cards', () => {
    it('finds best 5 from 7 cards', () => {
      // 7 cards contain a flush in hearts
      const cards: Card[] = ['Ah', 'Kh', '9h', '7h', '2h', 'Qs', '3d'];
      const result = evaluate7Cards(cards);
      expect(result.rank).toBe(HandRank.Flush);
    });

    it('finds hidden straight in 7 cards', () => {
      const cards: Card[] = ['9h', '8d', '7s', '6c', '5h', 'Kd', '2s'];
      const result = evaluate7Cards(cards);
      expect(result.rank).toBe(HandRank.Straight);
      expect(result.values[1]).toBe(9);
    });

    it('prefers full house over two pair in 7 cards', () => {
      // KKK77 is in there plus extra cards
      const cards: Card[] = ['Kh', 'Kd', 'Ks', '7c', '7h', '3d', '2s'];
      const result = evaluate7Cards(cards);
      expect(result.rank).toBe(HandRank.FullHouse);
    });

    it('finds best full house when two are possible', () => {
      // Cards: KKK 77 33 — best is KKK over 77
      const cards: Card[] = ['Kh', 'Kd', 'Ks', '7c', '7h', '3d', '3s'];
      const result = evaluate7Cards(cards);
      expect(result.rank).toBe(HandRank.FullHouse);
      expect(result.description).toBe('Full House, Kings over Sevens');
    });
  });

  describe('compareHands', () => {
    it('flush beats straight', () => {
      const flush = evaluateHand(['Ah', '9h', '7h', '4h', '2h'] as Card[]);
      const straight = evaluateHand(['9h', '8d', '7s', '6c', '5h'] as Card[]);
      expect(compareHands(flush, straight)).toBeGreaterThan(0);
    });

    it('higher pair beats lower pair', () => {
      const aces = evaluateHand(['Ah', 'Ad', '9s', '7c', '3h'] as Card[]);
      const kings = evaluateHand(['Kh', 'Kd', '9s', '7c', '3h'] as Card[]);
      expect(compareHands(aces, kings)).toBeGreaterThan(0);
    });

    it('returns 0 for equivalent hands', () => {
      const hand1 = evaluateHand(['Ah', 'Kd', '9s', '7c', '3h'] as Card[]);
      const hand2 = evaluateHand(['As', 'Kc', '9d', '7h', '3d'] as Card[]);
      expect(compareHands(hand1, hand2)).toBe(0);
    });
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- tests/gameEngine/HandEvaluator.test.ts`
Expected: All tests PASS (new tests use already-implemented code).

- [ ] **Step 3: Commit**

```bash
git add tests/gameEngine/HandEvaluator.test.ts
git commit -m "test: add 7-card evaluation and hand comparison tests"
```

---

## Chunk 3: Pot Manager and Betting Round

### Task 7: PotManager

- [ ] **Step 1: Write failing tests for PotManager**

Create `tests/gameEngine/PotManager.test.ts`:

```typescript
import { PotManager } from '../../src/gameEngine/PotManager';

describe('PotManager', () => {
  let pm: PotManager;

  beforeEach(() => {
    pm = new PotManager();
  });

  describe('simple pot (no all-in)', () => {
    it('collects bets into main pot', () => {
      // 4 players each bet 100
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: false },
        { seat: 1, amount: 100, isAllIn: false },
        { seat: 2, amount: 100, isAllIn: false },
        { seat: 3, amount: 100, isAllIn: false },
      ]);

      const pots = pm.getPots();
      expect(pots).toHaveLength(1);
      expect(pots[0].amount).toBe(400);
      expect(pots[0].eligible).toEqual([0, 1, 2, 3]);
    });

    it('accumulates across multiple betting rounds', () => {
      pm.collectBets([
        { seat: 0, amount: 50, isAllIn: false },
        { seat: 1, amount: 50, isAllIn: false },
      ]);
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: false },
        { seat: 1, amount: 100, isAllIn: false },
      ]);

      const pots = pm.getPots();
      expect(pots).toHaveLength(1);
      expect(pots[0].amount).toBe(300);
    });
  });

  describe('side pots', () => {
    it('creates side pot when one player is all-in for less', () => {
      // Player 0 all-in for 100, Players 1,2 bet 300
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: true },
        { seat: 1, amount: 300, isAllIn: false },
        { seat: 2, amount: 300, isAllIn: false },
      ]);

      const pots = pm.getPots();
      expect(pots).toHaveLength(2);
      // Main pot: 100 * 3 = 300 (all three eligible)
      expect(pots[0].amount).toBe(300);
      expect(pots[0].eligible).toEqual([0, 1, 2]);
      // Side pot: 200 * 2 = 400 (only 1 and 2)
      expect(pots[1].amount).toBe(400);
      expect(pots[1].eligible).toEqual([1, 2]);
    });

    it('handles three-way all-in at different amounts', () => {
      // Player A (100), B (300), C (500) all-in
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: true },
        { seat: 1, amount: 300, isAllIn: true },
        { seat: 2, amount: 500, isAllIn: true },
      ]);

      const pots = pm.getPots();
      expect(pots).toHaveLength(3);
      // Main: 100 * 3 = 300
      expect(pots[0].amount).toBe(300);
      expect(pots[0].eligible).toEqual([0, 1, 2]);
      // Side 1: 200 * 2 = 400
      expect(pots[1].amount).toBe(400);
      expect(pots[1].eligible).toEqual([1, 2]);
      // Side 2: 200 * 1 = 200 (returned to C)
      expect(pots[2].amount).toBe(200);
      expect(pots[2].eligible).toEqual([2]);
    });

    it('handles 4-player with 2 all-ins at same amount', () => {
      pm.collectBets([
        { seat: 0, amount: 200, isAllIn: true },
        { seat: 1, amount: 200, isAllIn: true },
        { seat: 2, amount: 500, isAllIn: false },
        { seat: 3, amount: 500, isAllIn: false },
      ]);

      const pots = pm.getPots();
      expect(pots).toHaveLength(2);
      // Main: 200 * 4 = 800
      expect(pots[0].amount).toBe(800);
      expect(pots[0].eligible).toEqual([0, 1, 2, 3]);
      // Side: 300 * 2 = 600
      expect(pots[1].amount).toBe(600);
      expect(pots[1].eligible).toEqual([2, 3]);
    });
  });

  describe('folded players', () => {
    it('folded players are not eligible for pots', () => {
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: false },
        { seat: 1, amount: 50, isAllIn: false },  // will fold
        { seat: 2, amount: 100, isAllIn: false },
      ]);
      pm.removeFoldedPlayer(1);

      const pots = pm.getPots();
      expect(pots).toHaveLength(1);
      expect(pots[0].amount).toBe(250);
      expect(pots[0].eligible).toEqual([0, 2]);
    });
  });

  describe('reset', () => {
    it('clears all pots', () => {
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: false },
        { seat: 1, amount: 100, isAllIn: false },
      ]);
      pm.reset();
      expect(pm.getPots()).toHaveLength(0);
      expect(pm.getTotal()).toBe(0);
    });
  });

  describe('getTotal', () => {
    it('returns sum of all pots', () => {
      pm.collectBets([
        { seat: 0, amount: 100, isAllIn: true },
        { seat: 1, amount: 300, isAllIn: false },
        { seat: 2, amount: 300, isAllIn: false },
      ]);
      expect(pm.getTotal()).toBe(700);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/gameEngine/PotManager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PotManager.ts**

Create `src/gameEngine/PotManager.ts`:

```typescript
import { Pot } from './types';

export interface BetEntry {
  seat: number;
  amount: number;
  isAllIn: boolean;
}

export class PotManager {
  private pots: Pot[] = [];

  collectBets(bets: BetEntry[]): void {
    if (bets.length === 0) return;

    // Sort by amount ascending for side pot calculation
    const sorted = [...bets].sort((a, b) => a.amount - b.amount);

    // Find all-in amounts that create pot boundaries
    const allInAmounts = sorted
      .filter(b => b.isAllIn)
      .map(b => b.amount);
    const boundaries = [...new Set(allInAmounts)].sort((a, b) => a - b);

    if (boundaries.length === 0) {
      // No all-ins: everything goes to main pot
      const total = bets.reduce((sum, b) => sum + b.amount, 0);
      const eligible = bets.map(b => b.seat).sort((a, b) => a - b);
      this.addToPot(total, eligible);
      return;
    }

    let previousBoundary = 0;

    for (const boundary of boundaries) {
      const layerAmount = boundary - previousBoundary;
      if (layerAmount <= 0) continue;

      // Players who contributed at least this boundary amount
      const eligible = bets
        .filter(b => b.amount >= boundary)
        .map(b => b.seat)
        .sort((a, b) => a - b);
      // Players who contributed to this layer (amount > previousBoundary)
      const contributors = bets.filter(b => b.amount > previousBoundary);
      const potAmount = layerAmount * contributors.length;

      this.addToPot(potAmount, eligible);
      previousBoundary = boundary;
    }

    // Remaining amount above all all-in boundaries
    const maxAllIn = boundaries[boundaries.length - 1];
    const remainingBets = bets.filter(b => b.amount > maxAllIn);
    if (remainingBets.length > 0) {
      const remainingTotal = remainingBets.reduce((sum, b) => sum + b.amount - maxAllIn, 0);
      const eligible = remainingBets.map(b => b.seat).sort((a, b) => a - b);
      this.addToPot(remainingTotal, eligible);
    }
  }

  private addToPot(amount: number, eligible: number[]): void {
    // Try to merge with existing pot that has same eligible players
    const existing = this.pots.find(p =>
      p.eligible.length === eligible.length &&
      p.eligible.every((s, i) => s === eligible[i])
    );
    if (existing) {
      existing.amount += amount;
    } else {
      this.pots.push({ amount, eligible: [...eligible] });
    }
  }

  removeFoldedPlayer(seat: number): void {
    for (const pot of this.pots) {
      pot.eligible = pot.eligible.filter(s => s !== seat);
    }
  }

  getPots(): Pot[] {
    return this.pots.map(p => ({ ...p, eligible: [...p.eligible] }));
  }

  getTotal(): number {
    return this.pots.reduce((sum, p) => sum + p.amount, 0);
  }

  reset(): void {
    this.pots = [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/gameEngine/PotManager.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gameEngine/PotManager.ts tests/gameEngine/PotManager.test.ts
git commit -m "feat: add PotManager with side pot calculation"
```

---

### Task 8: BettingRound

- [ ] **Step 1: Write failing tests for BettingRound**

Create `tests/gameEngine/BettingRound.test.ts`:

```typescript
import { BettingRound } from '../../src/gameEngine/BettingRound';
import { Player, PlayerAction, Blinds } from '../../src/gameEngine/types';

function makePlayers(count: number, chips = 1000): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    seat: i,
    name: `Player${i}`,
    chips,
    status: 'active' as const,
    bet: 0,
    cards: [],
  }));
}

describe('BettingRound', () => {
  describe('basic actions', () => {
    it('fold changes player status', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      const result = round.handleAction(0, { action: 'fold' });
      expect(result.valid).toBe(true);
      expect(players[0].status).toBe('folded');
    });

    it('check is valid when no bet to match', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      const result = round.handleAction(0, { action: 'check' });
      expect(result.valid).toBe(true);
    });

    it('check is invalid when there is a bet to match', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      // Player 0 raises
      round.handleAction(0, { action: 'raise', amount: 100 });
      // Player 1 tries to check
      const result = round.handleAction(1, { action: 'check' });
      expect(result.valid).toBe(false);
    });

    it('call matches current bet', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'raise', amount: 100 });
      const result = round.handleAction(1, { action: 'call' });
      expect(result.valid).toBe(true);
      expect(players[1].bet).toBe(100);
      expect(players[1].chips).toBe(900);
    });

    it('raise increases the bet', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      const result = round.handleAction(0, { action: 'raise', amount: 200 });
      expect(result.valid).toBe(true);
      expect(round.currentBet).toBe(200);
      expect(players[0].bet).toBe(200);
      expect(players[0].chips).toBe(800);
    });

    it('raise below minimum is invalid', () => {
      const players = makePlayers(4);
      // minRaise = BB = 10
      const round = new BettingRound(players, 0, 10);
      round.handleAction(0, { action: 'raise', amount: 100 });
      // Min re-raise is 100 + (100-0) = 200, so 150 is invalid
      const result = round.handleAction(1, { action: 'raise', amount: 150 });
      expect(result.valid).toBe(false);
    });

    it('all-in with less than call amount is valid', () => {
      const players = makePlayers(2);
      players[1].chips = 50; // Can't afford full call
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'raise', amount: 100 });
      const result = round.handleAction(1, { action: 'allIn' });
      expect(result.valid).toBe(true);
      expect(players[1].status).toBe('allIn');
      expect(players[1].chips).toBe(0);
      expect(players[1].bet).toBe(50);
    });
  });

  describe('turn management', () => {
    it('rejects action from wrong player', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      const result = round.handleAction(2, { action: 'check' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not your turn');
    });

    it('advances to next active player', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'check' });
      expect(round.activePlayerSeat).toBe(1);
    });

    it('skips folded players', () => {
      const players = makePlayers(4);
      players[1].status = 'folded';
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'check' });
      expect(round.activePlayerSeat).toBe(2); // Skipped seat 1
    });

    it('skips all-in players', () => {
      const players = makePlayers(4);
      players[1].status = 'allIn';
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'check' });
      expect(round.activePlayerSeat).toBe(2);
    });
  });

  describe('round completion', () => {
    it('round ends when all active players have acted and bets match', () => {
      const players = makePlayers(3);
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'check' });
      round.handleAction(1, { action: 'check' });
      round.handleAction(2, { action: 'check' });
      expect(round.isComplete).toBe(true);
    });

    it('round is not complete when a raise reopens action', () => {
      const players = makePlayers(3);
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'check' });
      round.handleAction(1, { action: 'raise', amount: 100 });
      expect(round.isComplete).toBe(false);
      // Seat 2 and seat 0 still need to act
    });

    it('round ends when only one player remains (all others folded)', () => {
      const players = makePlayers(3);
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'fold' });
      round.handleAction(1, { action: 'fold' });
      expect(round.isComplete).toBe(true);
    });
  });

  describe('preflop with blinds', () => {
    it('creates round with blinds already posted', () => {
      const players = makePlayers(4);
      const blinds: Blinds = { sb: 5, bb: 10 };
      // Dealer is seat 0, SB is seat 1, BB is seat 2, UTG (first to act) is seat 3
      const round = BettingRound.createPreflop(players, 0, blinds);
      expect(players[1].bet).toBe(5);
      expect(players[1].chips).toBe(995);
      expect(players[2].bet).toBe(10);
      expect(players[2].chips).toBe(990);
      expect(round.currentBet).toBe(10);
      expect(round.activePlayerSeat).toBe(3); // UTG acts first
    });

    it('BB gets option to raise when no one raised preflop', () => {
      const players = makePlayers(3);
      const blinds: Blinds = { sb: 5, bb: 10 };
      // Dealer seat 0, SB seat 1, BB seat 2, first to act seat 0 (BTN)
      const round = BettingRound.createPreflop(players, 0, blinds);
      round.handleAction(0, { action: 'call' });    // BTN calls
      round.handleAction(1, { action: 'call' });    // SB calls
      // BB has not acted yet — round should NOT be complete
      expect(round.isComplete).toBe(false);
      expect(round.activePlayerSeat).toBe(2);       // BB gets option
      round.handleAction(2, { action: 'check' });   // BB checks
      expect(round.isComplete).toBe(true);
    });

    it('heads-up: dealer posts SB, other posts BB', () => {
      const players = makePlayers(2);
      const blinds: Blinds = { sb: 5, bb: 10 };
      // Dealer (seat 0) is SB, seat 1 is BB
      const round = BettingRound.createPreflop(players, 0, blinds);
      expect(players[0].bet).toBe(5);   // Dealer = SB
      expect(players[1].bet).toBe(10);  // BB
      expect(round.activePlayerSeat).toBe(0); // Dealer/SB acts first preflop in heads-up
    });
  });

  describe('getBets', () => {
    it('returns current bets for pot collection', () => {
      const players = makePlayers(3);
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'raise', amount: 100 });
      round.handleAction(1, { action: 'call' });
      round.handleAction(2, { action: 'fold' });

      const bets = round.getBets();
      expect(bets).toHaveLength(2); // Only players who bet
      expect(bets.find(b => b.seat === 0)?.amount).toBe(100);
      expect(bets.find(b => b.seat === 1)?.amount).toBe(100);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/gameEngine/BettingRound.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement BettingRound.ts**

Create `src/gameEngine/BettingRound.ts`:

```typescript
import { Player, PlayerAction, Blinds } from './types';
import { BetEntry } from './PotManager';

export interface ActionResult {
  valid: boolean;
  reason?: string;
}

export class BettingRound {
  private players: Player[];
  private _currentBet: number;
  private _activeSeat: number;      // Seat number of player who must act next
  private actedSet: Set<number>;    // Seats that have acted since last raise
  private lastRaiserSeat: number | null;
  private minRaiseSize: number;     // Minimum raise increment

  constructor(players: Player[], firstToActSeat: number, currentBet: number) {
    this.players = players;
    this._currentBet = currentBet;
    this.actedSet = new Set();
    this.lastRaiserSeat = null;
    this.minRaiseSize = currentBet; // Initial min raise = BB or current bet
    this._activeSeat = firstToActSeat;
  }

  static createPreflop(players: Player[], dealer: number, blinds: Blinds): BettingRound {
    const activePlayers = players.filter(p => p.status === 'active');
    const seatOrder = activePlayers.map(p => p.seat);

    let sbSeat: number;
    let bbSeat: number;
    let firstToActSeat: number;

    if (activePlayers.length === 2) {
      // Heads-up: dealer = SB, other = BB
      sbSeat = dealer;
      bbSeat = seatOrder.find(s => s !== dealer)!;
      firstToActSeat = sbSeat; // SB acts first preflop in heads-up
    } else {
      // 3-4 players: SB is left of dealer, BB left of SB
      const dealerIdx = seatOrder.indexOf(dealer);
      sbSeat = seatOrder[(dealerIdx + 1) % seatOrder.length];
      bbSeat = seatOrder[(dealerIdx + 2) % seatOrder.length];
      firstToActSeat = seatOrder[(dealerIdx + 3) % seatOrder.length];
    }

    // Post blinds
    const sbPlayer = players.find(p => p.seat === sbSeat)!;
    const bbPlayer = players.find(p => p.seat === bbSeat)!;

    const sbAmount = Math.min(blinds.sb, sbPlayer.chips);
    sbPlayer.chips -= sbAmount;
    sbPlayer.bet = sbAmount;
    if (sbPlayer.chips === 0) sbPlayer.status = 'allIn';

    const bbAmount = Math.min(blinds.bb, bbPlayer.chips);
    bbPlayer.chips -= bbAmount;
    bbPlayer.bet = bbAmount;
    if (bbPlayer.chips === 0) bbPlayer.status = 'allIn';

    const round = new BettingRound(players, firstToActSeat, blinds.bb);
    round.minRaiseSize = blinds.bb;
    return round;
  }

  get currentBet(): number {
    return this._currentBet;
  }

  get activePlayerSeat(): number {
    if (this.getActionablePlayers().length === 0) return -1;
    return this._activeSeat;
  }

  get isComplete(): boolean {
    // Only one non-folded player left
    const nonFolded = this.players.filter(p => p.status !== 'folded' && p.status !== 'out');
    if (nonFolded.length <= 1) return true;

    // No one left who can act (all are all-in or folded)
    const actionable = this.getActionablePlayers();
    if (actionable.length === 0) return true;

    // Everyone who can act has acted since last raise, and bets are matched
    for (const p of actionable) {
      if (!this.actedSet.has(p.seat)) return false;
    }
    return true;
  }

  handleAction(seat: number, action: PlayerAction): ActionResult {
    // Validate turn
    if (seat !== this.activePlayerSeat) {
      return { valid: false, reason: `Seat ${seat}: not your turn (active: ${this.activePlayerSeat})` };
    }

    const player = this.players.find(p => p.seat === seat)!;

    switch (action.action) {
      case 'fold':
        return this.handleFold(player);
      case 'check':
        return this.handleCheck(player);
      case 'call':
        return this.handleCall(player);
      case 'raise':
        return this.handleRaise(player, action.amount ?? 0);
      case 'allIn':
        return this.handleAllIn(player);
      default:
        return { valid: false, reason: 'Unknown action' };
    }
  }

  getBets(): BetEntry[] {
    return this.players
      .filter(p => p.bet > 0)
      .map(p => ({
        seat: p.seat,
        amount: p.bet,
        isAllIn: p.status === 'allIn',
      }));
  }

  // --- Private methods ---

  private handleFold(player: Player): ActionResult {
    player.status = 'folded';
    this.actedSet.add(player.seat);
    this.advanceTurn();
    return { valid: true };
  }

  private handleCheck(player: Player): ActionResult {
    if (player.bet < this._currentBet) {
      return { valid: false, reason: 'Cannot check — must call, raise, or fold' };
    }
    this.actedSet.add(player.seat);
    this.advanceTurn();
    return { valid: true };
  }

  private handleCall(player: Player): ActionResult {
    const toCall = this._currentBet - player.bet;
    if (toCall <= 0) {
      return { valid: false, reason: 'Nothing to call — use check' };
    }

    const amount = Math.min(toCall, player.chips);
    player.chips -= amount;
    player.bet += amount;
    if (player.chips === 0) player.status = 'allIn';

    this.actedSet.add(player.seat);
    this.advanceTurn();
    return { valid: true };
  }

  /** @param totalAmount - The total bet amount to raise TO (not the increment). E.g., raise to 200 means totalAmount=200. */
  private handleRaise(player: Player, totalAmount: number): ActionResult {
    const raiseIncrement = totalAmount - this._currentBet;
    if (raiseIncrement < this.minRaiseSize && totalAmount < player.chips + player.bet) {
      return {
        valid: false,
        reason: `Minimum raise is ${this._currentBet + this.minRaiseSize}, got ${totalAmount}`,
      };
    }

    const toAdd = totalAmount - player.bet;
    if (toAdd > player.chips) {
      return { valid: false, reason: 'Not enough chips — use all-in' };
    }

    player.chips -= toAdd;
    player.bet = totalAmount;
    this.minRaiseSize = raiseIncrement;
    this._currentBet = totalAmount;
    this.lastRaiserSeat = player.seat;

    // Reset acted set — everyone needs to act again
    this.actedSet.clear();
    this.actedSet.add(player.seat);

    this.advanceTurn();
    return { valid: true };
  }

  private handleAllIn(player: Player): ActionResult {
    const amount = player.chips;
    player.bet += amount;
    player.chips = 0;
    player.status = 'allIn';

    // If this all-in is a raise (bet > currentBet by at least minRaise), reopen action
    const raiseIncrement = player.bet - this._currentBet;
    if (raiseIncrement >= this.minRaiseSize) {
      this.minRaiseSize = raiseIncrement;
      this._currentBet = player.bet;
      this.actedSet.clear();
    }
    if (player.bet > this._currentBet) {
      this._currentBet = player.bet;
    }

    this.actedSet.add(player.seat);
    this.advanceTurn();
    return { valid: true };
  }

  /** Advance to the next player who can act, walking seats in order. */
  private advanceTurn(): void {
    const actionable = this.getActionablePlayers();
    if (actionable.length === 0) return;

    const seats = actionable.map(p => p.seat);
    const currentIdx = seats.indexOf(this._activeSeat);

    if (currentIdx === -1) {
      // Current seat was removed (fold/allIn) — find next seat after it in circular order
      this._activeSeat = seats.find(s => s > this._activeSeat) ?? seats[0];
    } else {
      this._activeSeat = seats[(currentIdx + 1) % seats.length];
    }
  }

  private getActionablePlayers(): Player[] {
    return this.players.filter(p => p.status === 'active');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/gameEngine/BettingRound.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gameEngine/BettingRound.ts tests/gameEngine/BettingRound.test.ts
git commit -m "feat: add BettingRound with action validation and turn management"
```

---

## Chunk 4: Game Loop and Public API

### Task 9: GameLoop

- [ ] **Step 1: Write failing tests for GameLoop**

Create `tests/gameEngine/GameLoop.test.ts`:

```typescript
import { GameLoop } from '../../src/gameEngine/GameLoop';
import { Blinds, Player, Card } from '../../src/gameEngine/types';

const DEFAULT_BLINDS: Blinds = { sb: 5, bb: 10 };

function makeGamePlayers(count: number, chips = 1000): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    seat: i,
    name: `Player${i}`,
    chips,
    status: 'active' as const,
    bet: 0,
    cards: [],
  }));
}

describe('GameLoop', () => {
  describe('initialization', () => {
    it('starts in waiting phase', () => {
      const game = new GameLoop(makeGamePlayers(4), DEFAULT_BLINDS);
      expect(game.phase).toBe('waiting');
    });
  });

  describe('startRound', () => {
    it('transitions to preflop and deals hole cards', () => {
      const game = new GameLoop(makeGamePlayers(4), DEFAULT_BLINDS);
      game.startRound();
      expect(game.phase).toBe('preflop');
      // Each active player has 2 hole cards
      for (const p of game.players) {
        expect(p.cards).toHaveLength(2);
      }
    });

    it('posts blinds correctly for 4 players', () => {
      const players = makeGamePlayers(4);
      const game = new GameLoop(players, DEFAULT_BLINDS);
      // Dealer starts at seat 0 by default
      game.startRound();
      // SB = seat 1, BB = seat 2
      expect(players[1].bet).toBe(5);
      expect(players[1].chips).toBe(995);
      expect(players[2].bet).toBe(10);
      expect(players[2].chips).toBe(990);
    });

    it('posts blinds correctly for 3 players', () => {
      const players = makeGamePlayers(3);
      const game = new GameLoop(players, DEFAULT_BLINDS);
      game.startRound();
      expect(players[1].bet).toBe(5);  // SB
      expect(players[2].bet).toBe(10); // BB
    });

    it('posts blinds correctly for 2 players (heads-up)', () => {
      const players = makeGamePlayers(2);
      const game = new GameLoop(players, DEFAULT_BLINDS);
      game.startRound();
      // Dealer (seat 0) = SB, seat 1 = BB
      expect(players[0].bet).toBe(5);
      expect(players[1].bet).toBe(10);
    });
  });

  describe('phase progression', () => {
    it('advances to flop after preflop betting completes', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      // Heads-up preflop: SB (seat 0) acts first
      game.handleAction(0, { action: 'call' });
      game.handleAction(1, { action: 'check' });
      expect(game.phase).toBe('flop');
      expect(game.community).toHaveLength(3);
    });

    it('advances from flop to turn', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      game.handleAction(0, { action: 'call' });
      game.handleAction(1, { action: 'check' });
      // Flop: BB acts first post-flop
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      expect(game.phase).toBe('turn');
      expect(game.community).toHaveLength(4);
    });

    it('advances from turn to river', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      game.handleAction(0, { action: 'call' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      // Turn
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      expect(game.phase).toBe('river');
      expect(game.community).toHaveLength(5);
    });

    it('advances from river to showdown', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      game.handleAction(0, { action: 'call' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      // River
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      expect(game.phase).toBe('showdown');
    });
  });

  describe('early termination', () => {
    it('ends round immediately when all but one fold', () => {
      const game = new GameLoop(makeGamePlayers(4), DEFAULT_BLINDS);
      game.startRound();
      // UTG (seat 3) folds, BTN (seat 0) folds, SB (seat 1) folds
      // Preflop: UTG acts first in 4-player
      game.handleAction(3, { action: 'fold' });
      game.handleAction(0, { action: 'fold' });
      game.handleAction(1, { action: 'fold' });
      // BB (seat 2) wins by default
      expect(game.phase).toBe('roundEnd');
    });
  });

  describe('showdown', () => {
    it('resolveShowdown awards pot to winner and transitions to roundEnd', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      // Play through all streets with checks
      game.handleAction(0, { action: 'call' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      expect(game.phase).toBe('showdown');

      const result = game.resolveShowdown();
      expect(result).toBeDefined();
      expect(result.winners.length).toBeGreaterThan(0);
      expect(game.phase).toBe('roundEnd');

      // Total chips should be conserved
      const totalChips = game.players.reduce((sum, p) => sum + p.chips, 0);
      expect(totalChips).toBe(2000); // 2 players * 1000
    });
  });

  describe('dealer rotation', () => {
    it('moves dealer button after startRound', () => {
      const game = new GameLoop(makeGamePlayers(4), DEFAULT_BLINDS);
      expect(game.dealer).toBe(0);
      game.startRound();
      // After first round resolution, prepare next round
      // Fold everyone except seat 1
      game.handleAction(3, { action: 'fold' });
      game.handleAction(0, { action: 'fold' });
      game.handleAction(1, { action: 'fold' });

      game.prepareNextRound();
      expect(game.dealer).toBe(1); // Moved from 0 to 1
    });
  });

  describe('player elimination', () => {
    it('marks player with 0 chips as out', () => {
      const players = makeGamePlayers(3);
      players[0].chips = 10; // Will go all-in with SB and lose
      const game = new GameLoop(players, DEFAULT_BLINDS);
      game.startRound();

      // After round ends and player 0 has 0 chips, prepareNextRound should mark them out
      // For this test, manually set chips to 0
      players[0].chips = 0;
      players[0].status = 'active';
      game.prepareNextRound();
      expect(players[0].status).toBe('out');
    });
  });

  describe('game over', () => {
    it('transitions to gameOver when only one player has chips', () => {
      const players = makeGamePlayers(2);
      players[1].chips = 0;
      players[1].status = 'out';
      const game = new GameLoop(players, DEFAULT_BLINDS);
      game.prepareNextRound();
      expect(game.phase).toBe('gameOver');
    });
  });

  describe('getState', () => {
    it('returns serializable game state', () => {
      const game = new GameLoop(makeGamePlayers(4), DEFAULT_BLINDS);
      game.startRound();
      const state = game.getState();
      expect(state.phase).toBe('preflop');
      expect(state.players).toHaveLength(4);
      expect(state.blinds).toEqual(DEFAULT_BLINDS);
      expect(typeof state.seq).toBe('number');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/gameEngine/GameLoop.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement GameLoop.ts**

Create `src/gameEngine/GameLoop.ts`:

```typescript
import { Player, Phase, Card, Blinds, GameState, PlayerAction, Pot } from './types';
import { Deck } from './Deck';
import { BettingRound, ActionResult } from './BettingRound';
import { PotManager } from './PotManager';
import { evaluate7Cards, compareHands } from './HandEvaluator';

export interface ShowdownResult {
  winners: { seat: number; hand: string; potAmount: number }[];
  hands: { seat: number; cards: Card[]; description: string }[];
}

export class GameLoop {
  private _players: Player[];
  private _phase: Phase;
  private _community: Card[];
  private _dealer: number;
  private _blinds: Blinds;
  private _seq: number;
  private deck: Deck;
  private bettingRound: BettingRound | null;
  private potManager: PotManager;

  constructor(players: Player[], blinds: Blinds, dealer = 0) {
    this._players = players;
    this._blinds = blinds;
    this._dealer = dealer;
    this._phase = 'waiting';
    this._community = [];
    this._seq = 0;
    this.deck = new Deck();
    this.bettingRound = null;
    this.potManager = new PotManager();
  }

  get phase(): Phase { return this._phase; }
  get community(): Card[] { return [...this._community]; }
  get dealer(): number { return this._dealer; }
  get players(): Player[] { return this._players; }

  startRound(): void {
    // Reset for new round
    this.deck.reset();
    this._community = [];
    this.potManager.reset();
    this._seq++;

    for (const p of this._players) {
      if (p.status !== 'out') {
        p.status = 'active';
        p.bet = 0;
        p.cards = [];
      }
    }

    // Deal hole cards
    const activePlayers = this._players.filter(p => p.status === 'active');
    for (const p of activePlayers) {
      p.cards = this.deck.dealMultiple(2);
    }

    // Start preflop betting
    this._phase = 'preflop';
    this.bettingRound = BettingRound.createPreflop(this._players, this._dealer, this._blinds);
  }

  handleAction(seat: number, action: PlayerAction): ActionResult {
    if (!this.bettingRound) {
      return { valid: false, reason: 'No active betting round' };
    }

    const result = this.bettingRound.handleAction(seat, action);
    if (!result.valid) return result;

    // Check if the round should end early (all folded except one)
    const nonFolded = this._players.filter(p => p.status !== 'folded' && p.status !== 'out');
    if (nonFolded.length === 1) {
      this.collectBetsFromRound();
      this.awardPotToLastPlayer(nonFolded[0]);
      this._phase = 'roundEnd';
      this.bettingRound = null;
      return result;
    }

    // Check if betting round is complete
    if (this.bettingRound.isComplete) {
      this.collectBetsFromRound();
      this.advancePhase();
    }

    return result;
  }

  resolveShowdown(): ShowdownResult {
    if (this._phase !== 'showdown') {
      throw new Error('Not in showdown phase');
    }

    const pots = this.potManager.getPots();
    const hands: ShowdownResult['hands'] = [];
    const winners: ShowdownResult['winners'] = [];

    // Evaluate hands for all non-folded players
    const activePlayers = this._players.filter(p => p.status !== 'folded' && p.status !== 'out');
    const handResults = new Map<number, ReturnType<typeof evaluate7Cards>>();

    for (const p of activePlayers) {
      const allCards = [...p.cards, ...this._community] as Card[];
      const result = evaluate7Cards(allCards);
      handResults.set(p.seat, result);
      hands.push({ seat: p.seat, cards: p.cards, description: result.description });
    }

    // Award each pot
    for (const pot of pots) {
      const eligibleHands = pot.eligible
        .filter(seat => handResults.has(seat))
        .map(seat => ({ seat, hand: handResults.get(seat)! }));

      if (eligibleHands.length === 0) continue;

      // Find best hand(s)
      eligibleHands.sort((a, b) => compareHands(b.hand, a.hand));
      const bestHand = eligibleHands[0].hand;
      const potWinners = eligibleHands.filter(h => compareHands(h.hand, bestHand) === 0);

      // Split pot among winners
      const share = Math.floor(pot.amount / potWinners.length);
      const remainder = pot.amount - share * potWinners.length;

      potWinners.forEach((w, i) => {
        const amount = share + (i === 0 ? remainder : 0);
        const player = this._players.find(p => p.seat === w.seat)!;
        player.chips += amount;
        winners.push({ seat: w.seat, hand: w.hand.description, potAmount: amount });
      });
    }

    this._phase = 'roundEnd';
    return { winners, hands };
  }

  prepareNextRound(): void {
    // Mark players with 0 chips as out
    for (const p of this._players) {
      if (p.chips === 0 && p.status !== 'out') {
        p.status = 'out';
      }
    }

    // Check if game is over
    const playersWithChips = this._players.filter(p => p.status !== 'out');
    if (playersWithChips.length <= 1) {
      this._phase = 'gameOver';
      return;
    }

    // Rotate dealer to next active player
    const activeSeatOrder = this._players
      .filter(p => p.status !== 'out')
      .map(p => p.seat);
    const currentDealerIdx = activeSeatOrder.indexOf(this._dealer);
    this._dealer = activeSeatOrder[(currentDealerIdx + 1) % activeSeatOrder.length];

    this._phase = 'waiting';
  }

  getState(): GameState {
    return {
      seq: this._seq,
      phase: this._phase,
      community: [...this._community],
      pots: this.potManager.getPots(),
      currentBet: this.bettingRound?.currentBet ?? 0,
      activePlayer: this.bettingRound?.activePlayerSeat ?? -1,
      dealer: this._dealer,
      blinds: { ...this._blinds },
      players: this._players.map(p => ({
        ...p,
        cards: [...p.cards],
      })),
    };
  }

  /** Get a specific player's private hand (for BLE PrivateHand characteristic) */
  getPrivateHand(seat: number): Card[] {
    const player = this._players.find(p => p.seat === seat);
    return player ? [...player.cards] : [];
  }

  // --- Private methods ---

  private collectBetsFromRound(): void {
    if (!this.bettingRound) return;
    const bets = this.bettingRound.getBets();
    if (bets.length > 0) {
      this.potManager.collectBets(bets);
    }
    // Remove folded players from pot eligibility
    for (const p of this._players) {
      if (p.status === 'folded') {
        this.potManager.removeFoldedPlayer(p.seat);
      }
    }
    // Reset bets for next round
    for (const p of this._players) {
      p.bet = 0;
    }
  }

  private advancePhase(): void {
    const nextPhases: Record<string, Phase> = {
      preflop: 'flop',
      flop: 'turn',
      turn: 'river',
      river: 'showdown',
    };

    const next = nextPhases[this._phase];
    if (!next) return;

    this._phase = next;

    // Deal community cards
    switch (next) {
      case 'flop':
        this.deck.deal(); // Burn
        this._community.push(...this.deck.dealMultiple(3));
        break;
      case 'turn':
      case 'river':
        this.deck.deal(); // Burn
        this._community.push(this.deck.deal());
        break;
      case 'showdown':
        this.bettingRound = null;
        return; // No new betting round for showdown
    }

    // Start new betting round (post-flop: first active player after dealer)
    if (next !== 'showdown') {
      const activePlayers = this._players.filter(p => p.status === 'active');
      if (activePlayers.length <= 1) {
        // All but one (or zero) are all-in — skip to next phase
        this.advancePhase();
        return;
      }

      const seatOrder = activePlayers.map(p => p.seat);
      const dealerIdx = seatOrder.indexOf(this._dealer);
      // Find first active player after dealer
      let firstToAct: number;
      if (dealerIdx === -1) {
        firstToAct = seatOrder[0];
      } else {
        firstToAct = seatOrder[(dealerIdx + 1) % seatOrder.length];
      }
      this.bettingRound = new BettingRound(this._players, firstToAct, 0);
    }
  }

  private awardPotToLastPlayer(player: Player): void {
    const total = this.potManager.getTotal();
    player.chips += total;
    this.potManager.reset();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/gameEngine/GameLoop.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gameEngine/GameLoop.ts tests/gameEngine/GameLoop.test.ts
git commit -m "feat: add GameLoop with phase progression, blinds, and showdown"
```

---

### Task 10: Index Module and Final Verification

- [ ] **Step 1: Create index.ts to re-export public API**

Create `src/gameEngine/index.ts`:

```typescript
export { Card, Rank, Suit, HandRank, HandResult, Player, PlayerStatus, Phase, ActionType, PlayerAction, Pot, Blinds, GameState } from './types';
export { RANKS, SUITS } from './types';
export { rankValue, parseCard, cardRankValue, allCards, compareValues } from './Card';
export { Deck } from './Deck';
export { evaluateHand, evaluate7Cards, compareHands } from './HandEvaluator';
export { PotManager, BetEntry } from './PotManager';
export { BettingRound, ActionResult } from './BettingRound';
export { GameLoop, ShowdownResult } from './GameLoop';
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests PASS across all test files.

- [ ] **Step 3: Commit**

```bash
git add src/gameEngine/index.ts
git commit -m "feat: add gameEngine public API index"
```

- [ ] **Step 4: Run full test suite with coverage**

Run: `npm test -- --coverage`
Expected: High coverage across all game engine modules. Review any uncovered branches.

- [ ] **Step 5: Final commit with any coverage-driven fixes**

If coverage reveals untested edge cases, add tests and commit:

```bash
git add -A
git commit -m "test: improve game engine test coverage"
```

---

## Summary

| Task | Module | Tests |
|---|---|---|
| 1 | Project Setup | Smoke test |
| 2 | types.ts | Compile check |
| 3 | Card.ts | rankValue, parseCard, allCards, compareValues |
| 4 | Deck.ts | 52 cards, deal, shuffle, reset, empty |
| 5 | HandEvaluator (5-card) | All 10 hand ranks, kickers, ties |
| 6 | HandEvaluator (7-card) | Best-of-7 selection, comparison |
| 7 | PotManager.ts | Simple pot, side pots, multi-way all-in, fold |
| 8 | BettingRound.ts | All actions, validation, turn order, preflop blinds |
| 9 | GameLoop.ts | Phase flow, early termination, showdown, dealer rotation |
| 10 | index.ts | Full suite, coverage |
