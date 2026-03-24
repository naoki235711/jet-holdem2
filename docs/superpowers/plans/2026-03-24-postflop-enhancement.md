# Bot Postflop Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `postflopStrategy.ts` をモンテカルロ エクイティ計算ベースに書き換え、チェックレイズ・セミブラフ・ボードテクスチャ考慮を追加することで、ポストフロップの判断精度を大幅に向上させる。

**Architecture:** 新規 `equityCalculator.ts` がモンテカルロで equity を計算し、既存の `evaluate7Cards()` を再利用する。`postflopStrategy.ts` はその値と pot odds・SPR・ポジション・ボードテクスチャを組み合わせてアクションを決定する純粋関数として動作する。

**Tech Stack:** TypeScript, Jest, 既存 `gameEngine`（`HandEvaluator.evaluate7Cards`, `compareHands`, `Card.allCards`, `types`）

> **前提:** 本プランはベースとなるbot実装（`src/bot/BotPlayerService.ts`, `src/bot/strategy/postflopStrategy.ts` 等）が既に実装されていることを前提とする。未実装の場合は `docs/superpowers/plans/2026-03-24-bot-player.md` を先に実行すること。

---

## File Map

| Action | Path | Role |
|--------|------|------|
| Modify | `jest.config.js` | `tests/bot` をエンジンプロジェクトの roots に追加 |
| Create | `src/bot/equity/equityCalculator.ts` | モンテカルロ エクイティ計算 |
| Create | `tests/bot/equityCalculator.test.ts` | エクイティ計算ユニットテスト |
| Modify | `src/bot/strategy/postflopStrategy.ts` | エクイティベース判断に全面置き換え |
| Modify | `tests/bot/postflopStrategy.test.ts` | 新ロジックに合わせてテスト更新 |

---

## Task 0: jest.config.js に `tests/bot` を追加

**Files:**
- Modify: `jest.config.js`

- [ ] **Step 1: `jest.config.js` の `engine` プロジェクトの roots に `tests/bot` を追加**

`jest.config.js` の `roots` 行を以下のように変更する:

```js
roots: [
  '<rootDir>/tests/gameEngine',
  '<rootDir>/tests/services',
  '<rootDir>/tests/ble',
  '<rootDir>/tests/persistence',
  '<rootDir>/tests/integration',
  '<rootDir>/tests/bot',   // ← 追加
],
```

- [ ] **Step 2: Commit**

```bash
git add jest.config.js
git commit -m "chore(jest): add tests/bot to engine project roots"
```

---

## Task 1: equityCalculator — モンテカルロ エクイティ計算

**Files:**
- Create: `src/bot/equity/equityCalculator.ts`
- Create: `tests/bot/equityCalculator.test.ts`

- [ ] **Step 1: テストファイルを作成**

`tests/bot/equityCalculator.test.ts`:

```typescript
import { estimateEquity } from '../../src/bot/equity/equityCalculator';

describe('estimateEquity', () => {
  it('returns 1.0 when numOpponents is 0', () => {
    expect(estimateEquity(['Ah', 'Ad'], [], 0)).toBe(1.0);
  });

  it('AA vs 1 opponent on flop has equity > 0.75', () => {
    const equity = estimateEquity(['Ah', 'Ad'], ['2c', '7h', 'Ks'], 1, 1000);
    expect(equity).toBeGreaterThan(0.75);
  });

  it('72o vs 1 opponent on AKQ flop has equity < 0.40', () => {
    const equity = estimateEquity(['7h', '2d'], ['As', 'Kc', 'Qd'], 1, 1000);
    expect(equity).toBeLessThan(0.40);
  });

  it('Royal Flush on river (5 community cards) has equity === 1.0', () => {
    // Ah Kh + Qh Jh Th 5d 8c → Royal Flush; Th excluded from deck so no opponent can beat it
    const equity = estimateEquity(['Ah', 'Kh'], ['Qh', 'Jh', 'Th', '5d', '8c'], 1, 100);
    expect(equity).toBe(1.0);
  });

  it('returns value between 0 and 1', () => {
    const equity = estimateEquity(['Th', 'Ts'], ['2c', '5h', '9d'], 2, 200);
    expect(equity).toBeGreaterThanOrEqual(0);
    expect(equity).toBeLessThanOrEqual(1);
  });

  it('standard deviation across 5 runs (n=1000) is below 0.025', () => {
    const results = Array.from({ length: 5 }, () =>
      estimateEquity(['Ah', 'Kh'], ['2c', '7d', 'Ts'], 1, 1000)
    );
    const mean = results.reduce((a, b) => a + b) / results.length;
    const variance = results.reduce((s, r) => s + (r - mean) ** 2, 0) / results.length;
    expect(Math.sqrt(variance)).toBeLessThan(0.025);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx jest tests/bot/equityCalculator.test.ts --no-coverage
```

Expected: `Cannot find module '../../src/bot/equity/equityCalculator'`

- [ ] **Step 3: `src/bot/equity/equityCalculator.ts` を作成**

```typescript
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
  numSimulations: number = 500
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
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx jest tests/bot/equityCalculator.test.ts --no-coverage
```

Expected: 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/bot/equity/equityCalculator.ts tests/bot/equityCalculator.test.ts
git commit -m "feat(bot): add Monte Carlo equity calculator"
```

---

## Task 2: postflopStrategy — エクイティベース判断に置き換え

**Files:**
- Modify: `src/bot/strategy/postflopStrategy.ts`
- Modify: `tests/bot/postflopStrategy.test.ts`

- [ ] **Step 1: テストファイルを更新**

`tests/bot/postflopStrategy.test.ts` の内容を以下で**全て置き換える**:

```typescript
import { decidePostflopAction } from '../../src/bot/strategy/postflopStrategy';
import { GameState, Player } from '../../src/gameEngine/types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  const players: Player[] = [
    { seat: 0, name: 'Hero',    chips: 1000, status: 'active', bet: 0, cards: [] },
    { seat: 1, name: 'Villain', chips: 1000, status: 'active', bet: 0, cards: [] },
  ];
  return {
    seq: 1,
    phase: 'flop',
    community: ['2c', '8h', 'Ks'],
    pots: [{ amount: 100, eligible: [0, 1] }],
    currentBet: 0,
    activePlayer: 0,
    dealer: 2,   // dealer off-table → seat 0 acts last (IP)
    blinds: { sb: 5, bb: 10 },
    players,
    ...overrides,
  };
}

describe('decidePostflopAction', () => {
  describe('strong hand (AA)', () => {
    it('bets or goes all-in when can check (IP)', () => {
      const state = makeState();
      const result = decidePostflopAction(state, ['Ah', 'Ad'], 0);
      expect(['raise', 'allIn']).toContain(result.action);
    });

    it('does not fold when facing a bet', () => {
      const state = makeState({
        currentBet: 30,
        players: [
          { seat: 0, name: 'Hero',    chips: 1000, status: 'active', bet: 0,  cards: [] },
          { seat: 1, name: 'Villain', chips: 1000, status: 'active', bet: 30, cards: [] },
        ],
      });
      const result = decidePostflopAction(state, ['Ah', 'Ad'], 0);
      expect(result.action).not.toBe('fold');
    });

    it('OOP strong hand: checks at least some of the time (check-raise bait)', () => {
      // dealer=0 → seat 0 is IP, seat 1 is OOP
      const state = makeState({ dealer: 0 });
      const N = 60;
      const checks = Array.from({ length: N }, () =>
        decidePostflopAction(state, ['Ah', 'Ad'], 1)
      ).filter(r => r.action === 'check').length;
      // Expect ~30% check: at least one check in 60 trials
      expect(checks).toBeGreaterThan(0);
    });
  });

  describe('weak hand (air)', () => {
    it('folds 3s4d on AKQ flop facing large bet (pot odds > equity)', () => {
      const state = makeState({
        community: ['As', 'Kc', 'Qd'],
        currentBet: 90,
        pots: [{ amount: 100, eligible: [0, 1] }],
        players: [
          { seat: 0, name: 'Hero',    chips: 1000, status: 'active', bet: 0,  cards: [] },
          { seat: 1, name: 'Villain', chips: 1000, status: 'active', bet: 90, cards: [] },
        ],
      });
      const result = decidePostflopAction(state, ['3s', '4d'], 0);
      expect(result.action).toBe('fold');
    });

    it('checks OOP with air — never bluffs out of position', () => {
      // dealer=0 → seat 0 is IP, seat 1 is OOP
      const state = makeState({ dealer: 0 });
      const results = Array.from({ length: 30 }, () =>
        decidePostflopAction(state, ['3s', '4d'], 1)
      );
      expect(results.every(r => r.action === 'check')).toBe(true);
    });
  });

  describe('SPR < 2', () => {
    it('goes all-in with equity > 0.50 when SPR is low', () => {
      // pot=600, hero chips=1000, villain chips=1200 → effective=1000, SPR=1000/600≈1.67
      const state = makeState({
        pots: [{ amount: 600, eligible: [0, 1] }],
        players: [
          { seat: 0, name: 'Hero',    chips: 1000, status: 'active', bet: 0, cards: [] },
          { seat: 1, name: 'Villain', chips: 1200, status: 'active', bet: 0, cards: [] },
        ],
      });
      const result = decidePostflopAction(state, ['Ah', 'Ad'], 0);
      expect(result.action).toBe('allIn');
    });
  });

  describe('bluff frequency', () => {
    it('IP bluff with air on dry board is roughly 20% (5%–35%)', () => {
      // dealer=2 → seat 0 is IP; 3s4d on 2c-8h-Ks is air
      const state = makeState({ dealer: 2 });
      const N = 300;
      const bets = Array.from({ length: N }, () =>
        decidePostflopAction(state, ['3s', '4d'], 0)
      ).filter(r => r.action === 'raise').length;
      expect(bets / N).toBeGreaterThan(0.05);
      expect(bets / N).toBeLessThan(0.35);
    });

    it('IP bluff with air on wet board is at most 10% (0%–20%)', () => {
      // monotone board = wet
      const state = makeState({
        community: ['8h', '9h', 'Th'],
        dealer: 2,
      });
      const N = 300;
      const bets = Array.from({ length: N }, () =>
        decidePostflopAction(state, ['3s', '4d'], 0)
      ).filter(r => r.action === 'raise').length;
      expect(bets / N).toBeLessThan(0.20);
    });
  });
});
```

- [ ] **Step 2: テストを実行して現状を確認**

```bash
npx jest tests/bot/postflopStrategy.test.ts --no-coverage
```

Expected: 旧ロジックでは一部失敗する

- [ ] **Step 3: `src/bot/strategy/postflopStrategy.ts` を全面置き換え**

```typescript
import { GameState, Card, PlayerAction } from '../../gameEngine/types';
import { estimateEquity } from '../equity/equityCalculator';

type BoardTexture = 'dry' | 'wet';

const RANK_MAP: Record<string, number> = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
  'T':10,'J':11,'Q':12,'K':13,'A':14,
};

export function detectBoardTexture(community: Card[]): BoardTexture {
  if (community.length < 3) return 'dry';

  // Monotone: 3+ cards of same suit
  const suitCounts: Record<string, number> = {};
  for (const card of community) {
    const suit = card[1];
    suitCounts[suit] = (suitCounts[suit] ?? 0) + 1;
    if (suitCounts[suit] >= 3) return 'wet';
  }

  // Connected: 3 strictly consecutive ranks (gap straights are treated as dry)
  const vals = community.map(c => RANK_MAP[c[0]] ?? 0).sort((a, b) => a - b);
  for (let i = 0; i <= vals.length - 3; i++) {
    if (vals[i + 1] === vals[i] + 1 && vals[i + 2] === vals[i] + 2) return 'wet';
  }

  return 'dry';
}

function calcSPR(botChips: number, gameState: GameState, botSeat: number): number {
  const opponentChips = gameState.players
    .filter(p => p.seat !== botSeat && p.status !== 'out' && p.status !== 'folded')
    .map(p => p.chips);
  if (opponentChips.length === 0) return Infinity;
  const effectiveStack = Math.min(botChips, Math.max(...opponentChips));
  const totalPot = gameState.pots.reduce((sum, p) => sum + p.amount, 0);
  if (totalPot === 0) return Infinity;
  return effectiveStack / totalPot;
}

function detectIP(gameState: GameState, seat: number): boolean {
  const active = gameState.players
    .filter(p => p.status === 'active' || p.status === 'allIn')
    .map(p => p.seat);
  if (active.length === 0) return true;

  const numSeats = Math.max(...gameState.players.map(p => p.seat)) + 1;
  const dealer = gameState.dealer;

  // Post-flop index: 0 = first to act (left of dealer), higher = later = IP
  const pfIdx = (s: number) => (s - dealer - 1 + numSeats) % numSeats;
  const ipSeat = active.reduce((best, s) => pfIdx(s) > pfIdx(best) ? s : best);
  return ipSeat === seat;
}

function betAmount(equity: number, totalPot: number, botChips: number, minBet: number): number {
  const multiplier = equity > 0.65 ? 0.75 : 0.5;
  return Math.min(Math.max(Math.round(totalPot * multiplier), minBet), botChips);
}

export function decidePostflopAction(
  gameState: GameState,
  holeCards: Card[],
  seat: number
): PlayerAction {
  const player = gameState.players.find(p => p.seat === seat)!;
  const totalPot = gameState.pots.reduce((sum, p) => sum + p.amount, 0);
  const callAmount = gameState.currentBet - player.bet;

  const numOpponents = gameState.players.filter(
    p => p.seat !== seat && (p.status === 'active' || p.status === 'allIn')
  ).length;

  const equity = numOpponents > 0
    ? estimateEquity(holeCards, gameState.community, numOpponents)
    : 1.0;

  const spr = calcSPR(player.chips, gameState, seat);
  const isIP = detectIP(gameState, seat);
  const texture = detectBoardTexture(gameState.community);
  const minBet = gameState.blinds.bb;
  // Minimum raise TO = currentBet + last raise increment (approximated as max(currentBet, BB))
  const minRaiseTo = gameState.currentBet + Math.max(gameState.currentBet, gameState.blinds.bb);

  if (callAmount > 0) {
    // Facing a bet
    const potOdds = callAmount / (totalPot + callAmount);

    // 1. SPR commit + equity advantage → all-in
    if (spr < 2 && equity > 0.50) return { action: 'allIn' };

    // 2. OOP re-raise (exploits check-raise line)
    if (equity > 0.70 && !isIP && Math.random() < 0.3) {
      const amt = betAmount(equity, totalPot, player.chips, minRaiseTo);
      if (amt >= minRaiseTo) return { action: 'raise', amount: amt };
    }

    // 3. Value raise
    if (equity > 0.70 && player.chips + player.bet >= minRaiseTo) {
      const amt = betAmount(equity, totalPot, player.chips, minRaiseTo);
      if (amt >= minRaiseTo) return { action: 'raise', amount: amt };
    }

    // 4. Profitable call
    if (equity > potOdds) {
      if (callAmount >= player.chips) return { action: 'allIn' };
      return { action: 'call' };
    }

    // 5. Bluff raise (IP only)
    if (equity < 0.25 && isIP && Math.random() < 0.15) {
      const amt = betAmount(equity, totalPot, player.chips, minRaiseTo);
      if (amt >= minRaiseTo) return { action: 'raise', amount: amt };
    }

    return { action: 'fold' };

  } else {
    // Can check

    // 1. SPR commit + equity advantage → all-in
    if (spr < 2 && equity > 0.50) return { action: 'allIn' };

    // 2. OOP check-raise bait (check with strong hand)
    if (equity > 0.65 && !isIP && Math.random() < 0.3) return { action: 'check' };

    // 3. Strong value bet
    if (equity > 0.65) {
      return { action: 'raise', amount: betAmount(equity, totalPot, player.chips, minBet) };
    }

    // 4. Thin value bet
    if (equity > 0.45) {
      return { action: 'raise', amount: betAmount(equity, totalPot, player.chips, minBet) };
    }

    // 5. Semi-bluff (IP only)
    if (equity > 0.30 && isIP && Math.random() < 0.4) {
      return { action: 'raise', amount: betAmount(equity, totalPot, player.chips, minBet) };
    }

    // 6. Pure bluff (IP only, halved frequency on wet board)
    const bluffFreq = texture === 'wet' ? 0.1 : 0.2;
    if (equity < 0.25 && isIP && Math.random() < bluffFreq) {
      return { action: 'raise', amount: betAmount(equity, totalPot, player.chips, minBet) };
    }

    return { action: 'check' };
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx jest tests/bot/postflopStrategy.test.ts --no-coverage
```

Expected: 全テスト pass

- [ ] **Step 5: Commit**

```bash
git add src/bot/strategy/postflopStrategy.ts tests/bot/postflopStrategy.test.ts
git commit -m "feat(bot): replace postflop strategy with equity-based decision logic"
```

---

## Task 3: フルテストスイート確認

**Files:** なし（確認のみ）

- [ ] **Step 1: 全テストを実行**

```bash
npx jest --no-coverage
```

Expected: 全テスト pass。失敗する場合は `BotPlayerService.ts` が `decidePostflopAction` を正しく呼んでいるか確認する（シグネチャ: `decidePostflopAction(gameState, holeCards, seat)`）。

- [ ] **Step 2: TypeScript型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: 型エラーがあった場合のみ修正してコミット**

```bash
git add src/bot/strategy/postflopStrategy.ts src/bot/equity/equityCalculator.ts
git commit -m "fix(bot): resolve type errors in postflop enhancement"
```
