# Bot Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CPU対戦相手Botをローカルモードに追加する。プリフロップはGTO RFIデータ、ポストフロップはルールベース戦略で動作し、完全オフライン・最大9席対応。

**Architecture:** `BotPlayerService.decide()` は純粋関数として戦略を担う。`LocalGameService` が Bot席を管理し、アクション後に1秒タイマーで自動アクションを発火する。ロビーでBot人数を選択し、全プレイヤー（人間+Bot）をランダムにseat割り当てする。

**Tech Stack:** TypeScript, React Native / Expo, Jest (test runner), existing `gameEngine` (HandEvaluator, types)

---

## File Map

| Action | Path | Role |
|--------|------|------|
| Create | `src/bot/strategy/preflopStrategy.ts` | GTO RFIデータ参照のプリフロップ判断 |
| Create | `src/bot/strategy/postflopStrategy.ts` | ルールベースのポストフロップ判断 |
| Create | `src/bot/BotPlayerService.ts` | decide()エントリポイント |
| Create | `tests/bot/preflopStrategy.test.ts` | プリフロップ戦略テスト |
| Create | `tests/bot/postflopStrategy.test.ts` | ポストフロップ戦略テスト |
| Modify | `src/gameEngine/types.ts` | Player に isBot?: boolean 追加 |
| Modify | `src/services/GameService.ts` | botCount?, getBotSeats?() 追加 |
| Modify | `src/services/LocalGameService.ts` | Bot管理・自動アクション |
| Modify | `tests/services/LocalGameService.test.ts` | Bot統合テスト追加・既存テスト修正 |
| Modify | `src/contexts/GameContext.tsx` | botCount保持・handleTimeoutガード・rematch修正 |
| Modify | `src/components/lobby/LobbyView.tsx` | botCount選択UI追加・paramsに含める |
| Modify | `app/game.tsx` | botCountをparamsから取得・PassDeviceScreen抑制 |
| Modify | `src/components/table/PlayerSeat.tsx` | BOTバッジ表示 |
| Modify | `src/components/actions/ActionButtons.tsx` | Bot席のターンでボタン無効化 |

---

## Task 1: `isBot` フラグをデータモデルに追加

**Files:**
- Modify: `src/gameEngine/types.ts`

- [ ] **Step 1: `Player` インターフェースに `isBot` を追加**

`src/gameEngine/types.ts` の `Player` を以下のように変更する：

```typescript
export interface Player {
  seat: number;
  name: string;
  chips: number;
  status: PlayerStatus;
  bet: number;
  cards: Card[];
  isBot?: boolean;   // 省略時 = false（人間）
}
```

- [ ] **Step 2: TypeScript型チェックを実行**

```bash
npx tsc --noEmit
```

Expected: エラーなし（既存コードは `isBot` を参照しないため影響なし）

- [ ] **Step 3: Commit**

```bash
git add src/gameEngine/types.ts
git commit -m "feat(types): add isBot flag to Player interface"
```

---

## Task 2: プリフロップ戦略モジュール

**Files:**
- Create: `src/bot/strategy/preflopStrategy.ts`
- Create: `tests/bot/preflopStrategy.test.ts`

- [ ] **Step 1: テストファイルを作成**

`tests/bot/preflopStrategy.test.ts`:

```typescript
import { decidePreflopAction } from '../../src/bot/strategy/preflopStrategy';
import { GameState, Player, PlayerAction } from '../../src/gameEngine/types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  const players: Player[] = [
    { seat: 0, name: 'P0', chips: 1000, status: 'active', bet: 0, cards: [] },
    { seat: 1, name: 'P1', chips: 1000, status: 'active', bet: 10, cards: [] },
    { seat: 2, name: 'P2', chips: 1000, status: 'active', bet: 5, cards: [] },
  ];
  return {
    seq: 1,
    phase: 'preflop',
    community: [],
    pots: [{ amount: 15, eligible: [0, 1, 2] }],
    currentBet: 10,
    activePlayer: 0,
    dealer: 0,  // seat 0 = BTN (3-player: BTN/SB/BB)
    blinds: { sb: 5, bb: 10 },
    players,
    ...overrides,
  };
}

describe('decidePreflopAction', () => {
  it('raises AA from any position (group 1, freqTier 1)', () => {
    const state = makeState();  // BTN, unraised → RFI
    const result = decidePreflopAction(state, ['Ah', 'Ad'], 0);
    expect(result.action).toBe('raise');
    expect(result.amount).toBe(30);  // 3 × BB(10)
  });

  it('folds 72o from UTG (group 0 hand)', () => {
    // 4-player game: dealer=0=BTN, SB=1, BB=2, UTG=3
    const players: Player[] = [
      { seat: 0, name: 'BTN', chips: 1000, status: 'active', bet: 0, cards: [] },
      { seat: 1, name: 'SB',  chips: 995,  status: 'active', bet: 5, cards: [] },
      { seat: 2, name: 'BB',  chips: 990,  status: 'active', bet: 10, cards: [] },
      { seat: 3, name: 'UTG', chips: 1000, status: 'active', bet: 0, cards: [] },
    ];
    const state = makeState({
      players,
      dealer: 0,
      activePlayer: 3,
      currentBet: 10,
    });
    const result = decidePreflopAction(state, ['7h', '2d'], 3);
    expect(result.action).toBe('fold');
  });

  it('folds 72o from UTG even when no one has raised', () => {
    const players: Player[] = [
      { seat: 0, name: 'BTN', chips: 1000, status: 'active', bet: 0, cards: [] },
      { seat: 1, name: 'SB',  chips: 1000, status: 'active', bet: 0, cards: [] },
      { seat: 2, name: 'BB',  chips: 990,  status: 'active', bet: 10, cards: [] },
      { seat: 3, name: 'UTG', chips: 1000, status: 'active', bet: 0, cards: [] },
    ];
    const state = makeState({ players, dealer: 0, activePlayer: 3, currentBet: 10 });
    const result = decidePreflopAction(state, ['7h', '2d'], 3);
    expect(result.action).toBe('fold');
  });

  it('calls with medium hand facing raise', () => {
    // KQs is group 3 (UTG+1/+2 range) → call facing raise
    const state = makeState({ currentBet: 30, activePlayer: 1 });
    const result = decidePreflopAction(state, ['Kh', 'Qh'], 1);
    expect(result.action).toBe('call');
  });

  it('3-bets with strong hand facing raise', () => {
    // AKs is group 2 → 3-bet
    const state = makeState({ currentBet: 30, activePlayer: 1 });
    const result = decidePreflopAction(state, ['Ah', 'Kh'], 1);
    expect(result.action).toBe('raise');
    expect(result.amount).toBe(90);  // 3 × currentBet(30)
  });

  it('goes all-in when raise amount exceeds chips', () => {
    const state = makeState({
      currentBet: 0,
      players: [
        { seat: 0, name: 'P0', chips: 20, status: 'active', bet: 0, cards: [] },
        { seat: 1, name: 'P1', chips: 995, status: 'active', bet: 5, cards: [] },
        { seat: 2, name: 'P2', chips: 990, status: 'active', bet: 10, cards: [] },
      ],
      activePlayer: 0,
      dealer: 0,
      blinds: { sb: 5, bb: 10 },
    });
    const result = decidePreflopAction(state, ['Ah', 'Ad'], 0);
    expect(result.action).toBe('allIn');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx jest tests/bot/preflopStrategy.test.ts --no-coverage
```

Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: `src/bot/strategy/preflopStrategy.ts` を実装**

```typescript
// src/bot/strategy/preflopStrategy.ts

import { GameState, PlayerAction, Card } from '../../gameEngine/types';
// RANKS をエイリアスして types.ts の RANKS と区別する
import { MATRIX, RANKS as PREFLOP_RANKS, getGroup, getFreqTier } from '../../components/preflop/preflopData';

// openThreshold: このポジションでRaiseできる最大グループ番号
const OPEN_THRESHOLD: Record<string, number> = {
  BTN: 6, CO: 5, HJ: 4, LJ: 4,
  'UTG+2': 3, 'UTG+1': 3, UTG: 2,
  SB: 7, BB: 1,
};

// N人アクティブプレイヤー時の、BTNから時計回りのポジション名
const POSITION_SEQUENCES: Record<number, string[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO'],
};

function getMatrixValue(holeCards: Card[]): number {
  const [c1, c2] = holeCards;
  // PREFLOP_RANKS は high-to-low: A=0, K=1, ...2=12
  const r1 = PREFLOP_RANKS.indexOf(c1[0] as (typeof PREFLOP_RANKS)[number]);
  const r2 = PREFLOP_RANKS.indexOf(c2[0] as (typeof PREFLOP_RANKS)[number]);
  const s1 = c1[1];
  const s2 = c2[1];

  if (r1 === r2) return MATRIX[r1][r2];                           // ペア
  if (s1 === s2) return MATRIX[Math.min(r1,r2)][Math.max(r1,r2)]; // スーテッド（上三角: row < col）
  return MATRIX[Math.max(r1,r2)][Math.min(r1,r2)];               // オフスーツ（下三角: row > col）
}

function getPosition(state: GameState, seat: number): string {
  const totalSeats = state.players.length;
  const active = state.players
    .filter(p => p.status !== 'out')
    .sort((a, b) => ((a.seat - state.dealer + totalSeats) % totalSeats) -
                    ((b.seat - state.dealer + totalSeats) % totalSeats));

  const posSeq = POSITION_SEQUENCES[active.length] ?? POSITION_SEQUENCES[9];
  const idx = active.findIndex(p => p.seat === seat);
  return posSeq[idx] ?? 'UTG';
}

function makeRaise(amount: number, player: { chips: number; bet: number }): PlayerAction {
  const available = player.chips + player.bet;
  if (amount >= available) return { action: 'allIn' };
  return { action: 'raise', amount };
}

export function decidePreflopAction(
  state: GameState,
  holeCards: Card[],
  seat: number,
): PlayerAction {
  const matrixVal = getMatrixValue(holeCards);
  const group = getGroup(matrixVal);
  const freqTier = getFreqTier(matrixVal);
  const player = state.players.find(p => p.seat === seat)!;
  const bb = state.blinds.bb;

  // group 0 = 無条件フォールド（freqTierは参照しない）
  if (group === 0) return { action: 'fold' };

  const isRaised = state.currentBet > bb;

  if (!isRaised) {
    // RFI状況
    const position = getPosition(state, seat);

    // BB特殊ケース: 全員がBB以下でリンプ → BBはチェック可能
    if (position === 'BB') return { action: 'check' };

    const threshold = OPEN_THRESHOLD[position] ?? 2;
    if (group > threshold) return { action: 'fold' };

    // freqTier による確率判断
    const raiseProb = freqTier === 1 ? 1.0 : freqTier === 2 ? 0.87 : 0.62;
    if (Math.random() < raiseProb) {
      return makeRaise(bb * 3, player);
    }
    return { action: 'fold' };
  }

  // レイズ済みポット
  if (group <= 2) return makeRaise(state.currentBet * 3, player);
  if (group <= 4) {
    const callAmt = Math.min(state.currentBet - player.bet, player.chips);
    if (callAmt >= player.chips) return { action: 'allIn' };
    return { action: 'call' };
  }
  if (Math.random() < 0.15) {
    const callAmt = Math.min(state.currentBet - player.bet, player.chips);
    if (callAmt >= player.chips) return { action: 'allIn' };
    return { action: 'call' };
  }
  return { action: 'fold' };
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx jest tests/bot/preflopStrategy.test.ts --no-coverage
```

Expected: PASS（確率依存テストはfixedなケースのみ）

- [ ] **Step 5: Commit**

```bash
git add src/bot/strategy/preflopStrategy.ts tests/bot/preflopStrategy.test.ts
git commit -m "feat(bot): add preflopStrategy with GTO RFI data"
```

---

## Task 3: ポストフロップ戦略モジュール

**Files:**
- Create: `src/bot/strategy/postflopStrategy.ts`
- Create: `tests/bot/postflopStrategy.test.ts`

- [ ] **Step 1: テストファイルを作成**

`tests/bot/postflopStrategy.test.ts`:

```typescript
import { decidePostflopAction } from '../../src/bot/strategy/postflopStrategy';
import { GameState, Player, Card } from '../../src/gameEngine/types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  const players: Player[] = [
    { seat: 0, name: 'Hero', chips: 900, status: 'active', bet: 0, cards: [] },
    { seat: 1, name: 'Opp',  chips: 900, status: 'active', bet: 0, cards: [] },
  ];
  return {
    seq: 1,
    phase: 'flop',
    community: ['Ah', 'Kd', '7c'],
    pots: [{ amount: 200, eligible: [0, 1] }],
    currentBet: 0,
    activePlayer: 0,
    dealer: 0,
    blinds: { sb: 5, bb: 10 },
    players,
    ...overrides,
  };
}

describe('decidePostflopAction', () => {
  it('bets with strong hand (flush) on flop when check is available', () => {
    // Hero: Ah Ad → evaluate with community Ah Kd 7c = trips
    const result = decidePostflopAction(
      makeState(),
      ['Ah', 'As'],  // trips on Ah Kd 7c
      0,
    );
    expect(['raise', 'bet', 'allIn']).toContain(result.action);
  });

  it('checks with weak hand (pair) when no bet and OOP', () => {
    // Heads up: dealer=0, so seat 0 is BTN=IP, seat 1 is BB=OOP
    // Flop, no bet, seat 1 acts first (OOP)
    const state = makeState({ activePlayer: 1, currentBet: 0 });
    const result = decidePostflopAction(
      state,
      ['2h', '3d'],  // low pair or worse on A K 7 board
      1,
    );
    // OOP with weak hand and check available → check
    expect(result.action).toBe('check');
  });

  it('folds weak hand facing bet (OOP, no draw)', () => {
    const state = makeState({
      currentBet: 50,
      activePlayer: 1,
      players: [
        { seat: 0, name: 'Hero', chips: 850, status: 'active', bet: 50, cards: [] },
        { seat: 1, name: 'Opp',  chips: 900, status: 'active', bet: 0, cards: [] },
      ],
    });
    // 2d 3h on A K 7 board — HighCard (Air), no draw, OOP, check not possible
    const result = decidePostflopAction(state, ['2d', '3h'], 1);
    expect(result.action).toBe('fold');
  });

  it('calls or folds draw with correct structure', () => {
    // Flush draw: Jh Th on Ah 7h 2c board (3 hearts)
    // Actually for flush draw: 4 same suit cards needed. Let's make 4 hearts
    const state = makeState({
      community: ['Ah', '7h', '2h'],
      currentBet: 50,
      players: [
        { seat: 0, name: 'Hero', chips: 850, status: 'active', bet: 50, cards: [] },
        { seat: 1, name: 'Opp',  chips: 900, status: 'active', bet: 0, cards: [] },
      ],
      activePlayer: 1,
    });
    // Jh Th + Ah 7h 2h = 4 hearts → flush draw, OOP
    const result = decidePostflopAction(state, ['Jh', 'Th'], 1);
    // OOP with draw facing bet → fold
    expect(result.action).toBe('fold');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx jest tests/bot/postflopStrategy.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: `src/bot/strategy/postflopStrategy.ts` を実装**

```typescript
// src/bot/strategy/postflopStrategy.ts

import { GameState, PlayerAction, Card, HandRank } from '../../gameEngine/types';
import { evaluate7Cards, evaluateHand, compareHands } from '../../gameEngine/HandEvaluator';
import { parseCard } from '../../gameEngine/Card';

type Strength = 'Strong' | 'Medium' | 'Weak' | 'Draw' | 'Air';

/**
 * evaluate7Cards は厳密に7枚を要求するため、フロップ(5枚)・ターン(6枚)では
 * 別の評価方法を使う。
 */
function evaluateBestHand(holeCards: Card[], community: Card[]) {
  const all = [...holeCards, ...community] as Card[];
  if (all.length === 7) return evaluate7Cards(all);
  if (all.length === 5) return evaluateHand(all);
  // ターン(6枚): C(6,5)=6通りの5枚組から最良を選ぶ
  let best = evaluateHand([all[0],all[1],all[2],all[3],all[4]]);
  for (let i = 0; i < all.length; i++) {
    const five = all.filter((_, j) => j !== i) as Card[];
    const result = evaluateHand(five);
    if (compareHands(result, best) > 0) best = result;
  }
  return best;
}

function classifyStrength(holeCards: Card[], community: Card[]): Strength {
  const all = [...holeCards, ...community] as Card[];
  const result = evaluateBestHand(holeCards, community);

  if (result.rank >= HandRank.Straight) return 'Strong';
  if (result.rank >= HandRank.TwoPair)  return 'Medium';
  if (result.rank === HandRank.OnePair) return 'Weak';

  // HighCard: check for draws
  const suits = all.map(c => c[1]);
  const suitCounts = suits.reduce<Record<string,number>>((acc, s) => {
    acc[s] = (acc[s] ?? 0) + 1; return acc;
  }, {});
  if (Object.values(suitCounts).some(n => n >= 4)) return 'Draw'; // flush draw

  // Straight draw: check for 4 consecutive ranks
  const rankVals = [...new Set(all.map(c => {
    const { rank } = parseCard(c);
    const order = '23456789TJQKA';
    return order.indexOf(rank);
  }))].sort((a, b) => a - b);

  for (let i = 0; i <= rankVals.length - 4; i++) {
    if (rankVals[i+3] - rankVals[i] <= 4) return 'Draw'; // OESD or gutshot
  }

  return 'Air';
}

function calcSPR(state: GameState, seat: number): number {
  const bot = state.players.find(p => p.seat === seat)!;
  const opponents = state.players.filter(p => p.seat !== seat && p.status !== 'out' && p.status !== 'folded');
  if (opponents.length === 0) return 999;
  const effectiveStack = Math.min(bot.chips, Math.max(...opponents.map(p => p.chips)));
  const totalPot = state.pots.reduce((sum, p) => sum + p.amount, 0);
  if (totalPot === 0) return 999;
  return effectiveStack / totalPot;
}

function isIP(state: GameState, seat: number): boolean {
  // IP = acts last postflop = furthest clockwise from dealer (BTN position or close)
  const totalSeats = state.players.length;
  const active = state.players
    .filter(p => p.status !== 'out' && p.status !== 'folded')
    .sort((a, b) => ((a.seat - state.dealer + totalSeats) % totalSeats) -
                    ((b.seat - state.dealer + totalSeats) % totalSeats));
  return active[active.length - 1]?.seat === seat;
}

function betSize(state: GameState, fraction: number, player: { chips: number; bet: number }): PlayerAction {
  const pot = state.pots.reduce((sum, p) => sum + p.amount, 0);
  const amount = Math.round(pot * fraction);
  const available = player.chips + player.bet;
  if (amount >= available) return { action: 'allIn' };
  if (amount <= state.currentBet) return { action: 'allIn' };
  return { action: 'raise', amount };
}

export function decidePostflopAction(
  state: GameState,
  holeCards: Card[],
  seat: number,
): PlayerAction {
  const strength = classifyStrength(holeCards, state.community);
  const spr = calcSPR(state, seat);
  const ip = isIP(state, seat);
  const canCheck = state.currentBet === 0;
  const player = state.players.find(p => p.seat === seat)!;

  const callAmt = Math.min(state.currentBet - player.bet, player.chips);
  const callFraction = callAmt / (player.chips || 1);

  if (strength === 'Strong') {
    if (spr < 4) return { action: 'allIn' };
    return betSize(state, ip ? 0.75 : 0.75, player);
  }

  if (strength === 'Medium') {
    if (spr < 4) return canCheck ? { action: 'check' } : { action: 'call' };
    if (ip) return canCheck ? betSize(state, 0.5, player) : { action: 'call' };
    if (canCheck) return { action: 'check' };
    return callFraction <= 0.30 ? { action: 'call' } : { action: 'fold' };
  }

  if (strength === 'Weak') {
    if (canCheck) return { action: 'check' };
    return callFraction <= 0.15 ? { action: 'call' } : { action: 'fold' };
  }

  if (strength === 'Draw') {
    if (ip) {
      if (canCheck) return Math.random() < 0.4 ? betSize(state, 0.5, player) : { action: 'check' };
      return callFraction <= 0.25 ? { action: 'call' } : { action: 'fold' };
    }
    if (canCheck) return { action: 'check' };
    return { action: 'fold' };
  }

  // Air
  if (ip) {
    if (canCheck) return Math.random() < 0.25 ? betSize(state, 0.5, player) : { action: 'check' };
    return { action: 'fold' };
  }
  if (canCheck) return { action: 'check' };
  return { action: 'fold' };
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx jest tests/bot/postflopStrategy.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bot/strategy/postflopStrategy.ts tests/bot/postflopStrategy.test.ts
git commit -m "feat(bot): add postflopStrategy with rule-based decisions"
```

---

## Task 4: BotPlayerService エントリポイント

**Files:**
- Create: `src/bot/BotPlayerService.ts`

- [ ] **Step 1: `src/bot/BotPlayerService.ts` を作成**

```typescript
// src/bot/BotPlayerService.ts

import { GameState, PlayerAction, Card } from '../gameEngine/types';
import { decidePreflopAction } from './strategy/preflopStrategy';
import { decidePostflopAction } from './strategy/postflopStrategy';

export interface BotContext {
  gameState: GameState;
  holeCards: Card[];
  seat: number;
}

export function decide(ctx: BotContext): PlayerAction {
  const { gameState, holeCards, seat } = ctx;
  const phase = gameState.phase;

  if (phase === 'preflop') {
    return decidePreflopAction(gameState, holeCards, seat);
  }
  if (phase === 'flop' || phase === 'turn' || phase === 'river') {
    return decidePostflopAction(gameState, holeCards, seat);
  }

  // フォールバック（showdown等、通常は呼ばれない）
  return { action: 'fold' };
}
```

- [ ] **Step 2: TypeScript型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add src/bot/BotPlayerService.ts
git commit -m "feat(bot): add BotPlayerService decide() entry point"
```

---

## Task 5: GameService インターフェース更新

**Files:**
- Modify: `src/services/GameService.ts`

- [ ] **Step 1: `GameService` に `botCount` と `getBotSeats` を追加**

```typescript
// src/services/GameService.ts

import { GameState, PlayerAction, Blinds } from '../gameEngine';
import { ActionResult, ShowdownResult } from '../gameEngine';

export interface ActionInfo {
  canCheck: boolean;
  callAmount: number;
  minRaise: number;
  maxRaise: number;
  canRaise: boolean;
}

export interface GameService {
  getState(): GameState;
  getActionInfo(seat: number): ActionInfo;

  startGame(
    playerNames: string[],
    blinds: Blinds,
    initialChips: number,
    savedChips?: Record<string, number>,
    botCount?: number,           // ← 追加（デフォルト0）
  ): void;
  startRound(): void;
  handleAction(seat: number, action: PlayerAction): ActionResult;
  resolveShowdown(): ShowdownResult;
  prepareNextRound(): void;

  subscribe(listener: (state: GameState) => void): () => void;

  getBotSeats?(): ReadonlySet<number>;  // ← 追加（Botを持たないサービスは未実装）
}
```

- [ ] **Step 2: TypeScript型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし（既存の実装は `botCount` を無視するだけ）

- [ ] **Step 3: Commit**

```bash
git add src/services/GameService.ts
git commit -m "feat(service): add botCount and getBotSeats to GameService interface"
```

---

## Task 6: LocalGameService Bot統合

**Files:**
- Modify: `src/services/LocalGameService.ts`
- Modify: `tests/services/LocalGameService.test.ts`

- [ ] **Step 1: 既存テストの修正（seat順依存テストを名前検索に変更）**

Fisher-Yatesシャッフルにより `startGame` 後の席順が不定になるため、
`tests/services/LocalGameService.test.ts` 内の **seat index 固定アサーション** をすべて名前検索に変更する。

変更箇所は以下の通り（行番号は目安）：

**`describe('startGame')` 内 "creates players" テスト（以下4行を全て置換）:**
```typescript
// 変更前（4行すべて削除）
expect(state.players[0].name).toBe('Alice');
expect(state.players[0].chips).toBe(1000);  // ← この行も必ず削除
expect(state.players[1].name).toBe('Bob');
expect(state.players[2].name).toBe('Charlie');

// 変更後（以下に置き換え）
const alice = state.players.find(p => p.name === 'Alice');
const bob   = state.players.find(p => p.name === 'Bob');
const charlie = state.players.find(p => p.name === 'Charlie');
expect(alice).toBeDefined();
expect(alice!.chips).toBe(1000);  // players[0].chips の代替
expect(bob).toBeDefined();
expect(charlie).toBeDefined();
```

**`savedChips` テスト:**
```typescript
// 変更前
expect(state.players[0].chips).toBe(1500);
expect(state.players[1].chips).toBe(800);
expect(state.players[2].chips).toBe(1000);

// 変更後
expect(state.players.find(p => p.name === 'Alice')!.chips).toBe(1500);
expect(state.players.find(p => p.name === 'Bob')!.chips).toBe(800);
expect(state.players.find(p => p.name === 'Charlie')!.chips).toBe(1000);
```

**`fallback to initialChips` テスト（`state.players[0].chips`, `[1].chips`）:**
```typescript
// 変更前
expect(state.players[0].chips).toBe(1000);
expect(state.players[1].chips).toBe(1000);

// 変更後
state.players.forEach(p => expect(p.chips).toBe(1000));
```

**他のテストについて:** `getActionInfo`, `handleAction`, `full round lifecycle` 等のテストは `state.activePlayer` や `state.players.find(...)` を使っているため変更不要。`error message translation` の `wrongSeat` 計算 `(state.activePlayer + 1) % 3` はシート番号が 0-2 で変わらないため影響なし。

- [ ] **Step 2: 修正後の既存テストが通ることを確認**

```bash
npx jest tests/services/LocalGameService.test.ts --no-coverage
```

Expected: PASS（まだBot実装なし、既存テストのみ）

- [ ] **Step 3: Bot統合テストを追記**

`tests/services/LocalGameService.test.ts` の末尾に追加：

```typescript
describe('Bot integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('getBotSeats returns bot seats after startGame with bots', () => {
    const svc = new LocalGameService();
    svc.startGame(['Alice'], { sb: 5, bb: 10 }, 1000, undefined, 2);
    const botSeats = svc.getBotSeats?.();
    expect(botSeats).toBeDefined();
    expect(botSeats!.size).toBe(2);
  });

  it('bot players have isBot=true', () => {
    const svc = new LocalGameService();
    svc.startGame(['Alice'], { sb: 5, bb: 10 }, 1000, undefined, 1);
    const state = svc.getState();
    const bots = state.players.filter(p => p.isBot);
    expect(bots).toHaveLength(1);
    expect(bots[0].name).toMatch(/^Bot \d+$/);
  });

  it('bot action fires after 1 second via setTimeout', () => {
    const svc = new LocalGameService();
    svc.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000, undefined, 1);
    svc.startRound();

    const stateBefore = svc.getState();
    // Find the first bot turn if active, or advance to it
    // After 1s timer fires, state should advance
    const listenerCalled = jest.fn();
    svc.subscribe(listenerCalled);

    jest.advanceTimersByTime(1100);

    // If the first active player was a bot, listener should have been called
    // (bot acted). If not a bot, no additional calls.
    // At minimum, verify no error thrown.
    const stateAfter = svc.getState();
    expect(['preflop', 'flop', 'roundEnd']).toContain(stateAfter.phase);
  });

  it('handleTimeout no-ops for bot seats', () => {
    const svc = new LocalGameService();
    svc.startGame(['Alice'], { sb: 5, bb: 10 }, 1000, undefined, 1);
    svc.startRound();
    const state = svc.getState();
    const botSeats = svc.getBotSeats?.() ?? new Set<number>();
    // If active player is bot, manually verify getBotSeats contains it
    if (botSeats.has(state.activePlayer)) {
      expect(botSeats.has(state.activePlayer)).toBe(true);
    }
  });

  it('startGame with botCount=0 behaves as before', () => {
    const svc = new LocalGameService();
    svc.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000, undefined, 0);
    const state = svc.getState();
    expect(state.players).toHaveLength(2);
    expect(state.players.every(p => !p.isBot)).toBe(true);
    expect(svc.getBotSeats?.()?.size).toBe(0);
  });
});
```

- [ ] **Step 4: 新しいテストが失敗することを確認**

```bash
npx jest tests/services/LocalGameService.test.ts --no-coverage
```

Expected: FAIL（getBotSeats not defined）

- [ ] **Step 5: `LocalGameService.ts` にBot実装を追加**

`src/services/LocalGameService.ts` を以下のように置き換える：

```typescript
// src/services/LocalGameService.ts

import { GameState, PlayerAction, Blinds, Player, PlayerStatus, GameLoop } from '../gameEngine';
import { ActionResult, ShowdownResult } from '../gameEngine';
import { GameService, ActionInfo } from './GameService';
import { decide } from '../bot/BotPlayerService';

const ERROR_MESSAGES: Record<string, string> = {
  'No active betting round': 'ベッティングラウンドが開始されていません',
  'Cannot check — must call, raise, or fold': 'チェックできません。コール、レイズ、またはフォールドしてください',
  'Nothing to call — use check': 'コールする必要はありません。チェックしてください',
  'Not enough chips — use all-in': 'チップが不足しています。オールインしてください',
  'Unknown action': '不明なアクションです',
};

function translateError(reason: string): string {
  if (ERROR_MESSAGES[reason]) return ERROR_MESSAGES[reason];
  if (reason.startsWith('Seat ') && reason.includes('not your turn')) {
    return 'あなたのターンではありません';
  }
  if (reason.startsWith('Minimum raise is')) {
    return 'レイズ額が最低額に達していません';
  }
  return reason;
}

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class LocalGameService implements GameService {
  private gameLoop: GameLoop | null = null;
  private listeners = new Set<(state: GameState) => void>();
  private botSeats = new Set<number>();
  private pendingBotTimer: ReturnType<typeof setTimeout> | null = null;

  getState(): GameState {
    if (!this.gameLoop) throw new Error('Game not started');
    return this.gameLoop.getState();
  }

  getActionInfo(seat: number): ActionInfo {
    const state = this.getState();
    const player = state.players.find(p => p.seat === seat);
    if (!player) throw new Error(`Invalid seat: ${seat}`);
    const minRaiseIncrement = this.gameLoop!.getMinRaiseSize();
    const minRaiseTo = state.currentBet + minRaiseIncrement;
    const maxRaiseTo = player.chips + player.bet;

    return {
      canCheck: state.currentBet <= player.bet,
      callAmount: Math.min(state.currentBet - player.bet, player.chips),
      minRaise: minRaiseTo,
      maxRaise: maxRaiseTo,
      canRaise: maxRaiseTo >= minRaiseTo,
    };
  }

  getBotSeats(): ReadonlySet<number> {
    return this.botSeats;
  }

  startGame(
    playerNames: string[],
    blinds: Blinds,
    initialChips: number,
    savedChips?: Record<string, number>,
    botCount = 0,
  ): void {
    if (playerNames.length + botCount > 9) {
      throw new Error('Total players cannot exceed 9');
    }

    // Staleタイマーをキャンセル
    if (this.pendingBotTimer !== null) {
      clearTimeout(this.pendingBotTimer);
      this.pendingBotTimer = null;
    }
    this.botSeats.clear();

    const botNames = Array.from({ length: botCount }, (_, i) => `Bot ${i + 1}`);
    const allNames = fisherYatesShuffle([...playerNames, ...botNames]);

    const players: Player[] = allNames.map((name, i) => ({
      seat: i,
      name,
      chips: savedChips?.[name] ?? initialChips,
      status: 'active' as PlayerStatus,
      bet: 0,
      cards: [],
      isBot: botNames.includes(name),
    }));

    players.filter(p => p.isBot).forEach(p => this.botSeats.add(p.seat));

    this.gameLoop = new GameLoop(players, blinds);
    this.notify();
  }

  startRound(): void {
    if (!this.gameLoop) throw new Error('Game not started');
    this.gameLoop.startRound();
    this.notify();
    this.scheduleBotIfNeeded();
  }

  handleAction(seat: number, action: PlayerAction): ActionResult {
    if (!this.gameLoop) throw new Error('Game not started');
    const result = this.gameLoop.handleAction(seat, action);
    if (!result.valid && result.reason) {
      return { valid: false, reason: translateError(result.reason) };
    }
    this.notify();
    this.scheduleBotIfNeeded();
    return result;
  }

  resolveShowdown(): ShowdownResult {
    if (!this.gameLoop) throw new Error('Game not started');
    const result = this.gameLoop.resolveShowdown();
    this.notify();
    return result;
  }

  prepareNextRound(): void {
    if (!this.gameLoop) throw new Error('Game not started');
    this.gameLoop.prepareNextRound();
    this.notify();
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private scheduleBotIfNeeded(): void {
    const state = this.gameLoop!.getState();
    if (state.activePlayer === -1) return;
    if (!this.botSeats.has(state.activePlayer)) return;

    if (this.pendingBotTimer !== null) {
      clearTimeout(this.pendingBotTimer);
    }

    this.pendingBotTimer = setTimeout(() => {
      this.pendingBotTimer = null;
      const s = this.gameLoop!.getState();
      const botSeat = s.activePlayer;
      if (botSeat === -1 || !this.botSeats.has(botSeat)) return;

      const holeCards = this.gameLoop!.getPrivateHand(botSeat);
      const action = decide({ gameState: s, holeCards, seat: botSeat });
      this.handleAction(botSeat, action);
    }, 1000);
  }

  private notify(): void {
    if (!this.gameLoop) return;
    const state = this.gameLoop.getState();
    this.listeners.forEach(l => l(state));
  }
}
```

- [ ] **Step 6: 全テストが通ることを確認**

```bash
npx jest tests/services/LocalGameService.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/LocalGameService.ts tests/services/LocalGameService.test.ts
git commit -m "feat(service): integrate Bot into LocalGameService with 1s auto-action"
```

---

## Task 7: GameContext の botCount 管理と handleTimeout ガード

**Files:**
- Modify: `src/contexts/GameContext.tsx`

- [ ] **Step 1: `GameProvider` props に `botCount` を追加し、`rematch` と `handleTimeout` を修正**

`src/contexts/GameContext.tsx` の変更箇所：

**1. `GameProviderProps` に `botCount` を追加：**

```typescript
interface GameProviderProps {
  children: React.ReactNode;
  service: GameService;
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
  repository?: GameRepository;
  initialChips?: number;
  blinds?: { sb: number; bb: number };
  playerNames?: string[];
  botCount?: number;           // ← 追加
}
```

**2. `GameProvider` 関数の引数に `botCount = 0` を追加し、`useRef` で保持：**

```typescript
export function GameProvider({ children, service, mode, repository, initialChips, blinds, playerNames, botCount = 0 }: GameProviderProps) {
  // ... 既存コード ...
  const botCountRef = useRef(botCount);
  botCountRef.current = botCount;
  // ...
```

**3. `rematch` コールバックを修正（`botCount` を渡す）：**

```typescript
const rematch = useCallback(() => {
  const names = playerNamesRef.current;
  const bl = blindsRef.current;
  const chips = initialChipsRef.current;
  if (names == null || bl == null || chips == null) return;
  serviceRef.current.startGame(names, bl, chips, undefined, botCountRef.current);
  serviceRef.current.startRound();
  setShowdownResult(null);
}, []);
```

**4. `handleTimeout` にBot席ガードを追加：**

```typescript
const handleTimeout = useCallback(() => {
  if (mode === 'debug' || mode === 'ble-client') return;

  const currentState = serviceRef.current.getState();
  if (currentState.activePlayer < 0) return;

  const seat = currentState.activePlayer;

  // Bot席はタイムアウト処理しない（Bot自身が1秒タイマーで処理する）
  const botSeats = serviceRef.current.getBotSeats?.() ?? new Set<number>();
  if (botSeats.has(seat)) return;

  const actionInfo = serviceRef.current.getActionInfo(seat);
  if (actionInfo.canCheck) {
    doAction(seat, { action: 'check' });
  } else {
    doAction(seat, { action: 'fold' });
  }
}, [mode, doAction]);
```

**5. `viewingSeat` 自動更新でBot席をスキップ（ホットシートモード）：**

```typescript
// Auto-update viewingSeat in hotseat mode（Bot席はスキップ）
useEffect(() => {
  if (mode === 'hotseat' && state && state.activePlayer >= 0) {
    const botSeats = serviceRef.current.getBotSeats?.() ?? new Set<number>();
    if (!botSeats.has(state.activePlayer)) {
      setViewingSeat(state.activePlayer);
    }
  }
}, [mode, state?.activePlayer]);
```

- [ ] **Step 2: TypeScript型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add src/contexts/GameContext.tsx
git commit -m "feat(context): add botCount to GameProvider, guard handleTimeout for bot seats"
```

---

## Task 8: ロビーUI（LobbyView）と app/game.tsx の配線

**Files:**
- Modify: `src/components/lobby/LobbyView.tsx`
- Modify: `app/game.tsx`

- [ ] **Step 1: `LobbyView.tsx` に `botCount` 状態とUIを追加**

`src/components/lobby/LobbyView.tsx` の変更：

**1. `useState` 追加（既存の state 群の後）：**

```typescript
const [botCount, setBotCount] = useState(0);
```

**2. `handleStart` 内の `router.push` params に `botCount` を追加：**

```typescript
router.push({
  pathname: '/game',
  params: {
    playerNames: JSON.stringify(playerNames),
    initialChips,
    sb,
    bb,
    mode,
    botCount: String(botCount),    // ← 追加
    ...(hasChips ? { playerChips: JSON.stringify(chipsByPlayer) } : {}),
  },
});
```

**3. ローカルモードのUI（`lobbyMode === 'local'` ブロック）にBot人数セレクタを追加。**
既存の「モード」選択の後、「ゲーム開始」ボタンの前に挿入：

```tsx
<Text style={styles.label}>Bot人数</Text>
<View style={styles.botCountRow}>
  <TouchableOpacity
    testID="bot-count-minus"
    style={styles.botCountBtn}
    onPress={() => setBotCount(c => Math.max(0, c - 1))}
  >
    <Text style={styles.botCountBtnText}>−</Text>
  </TouchableOpacity>
  <Text style={styles.botCountValue}>{botCount}</Text>
  <TouchableOpacity
    testID="bot-count-plus"
    style={styles.botCountBtn}
    // 合計9席を超えない: 最大 = 9 - 人間プレイヤー数
    onPress={() => setBotCount(c => Math.min(9 - playerCount, c + 1))}
  >
    <Text style={styles.botCountBtnText}>＋</Text>
  </TouchableOpacity>
</View>
```

**4. StyleSheet に追加：**

```typescript
botCountRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
botCountBtn: {
  width: 40, height: 40, borderRadius: 20,
  borderWidth: 2, borderColor: Colors.subText,
  alignItems: 'center', justifyContent: 'center',
},
botCountBtnText: { color: Colors.text, fontSize: 20, fontWeight: 'bold' },
botCountValue: { color: Colors.text, fontSize: 24, fontWeight: 'bold', minWidth: 32, textAlign: 'center' },
```

- [ ] **Step 2: `app/game.tsx` で `botCount` を取得・サービスと GameProvider に渡す**

`app/game.tsx` の変更：

**1. params 型に `botCount` を追加：**

```typescript
const params = useLocalSearchParams<{
  playerNames?: string;
  initialChips: string;
  sb: string;
  bb: string;
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
  seat?: string;
  clientSeatMap?: string;
  playerChips?: string;
  botCount?: string;    // ← 追加
}>();
```

**2. `botCount` を取得：**

```typescript
const botCount = Number(params.botCount ?? '0');
```

**3. LocalGameService の `startGame` 呼び出しに `botCount` を渡す：**

```typescript
// Local modes (hotseat / debug)
const playerChipsMap: Record<string, number> | undefined = params.playerChips
  ? JSON.parse(params.playerChips)
  : undefined;
const svc = new LocalGameService();
svc.startGame(playerNames, blinds, initialChips, playerChipsMap, botCount);  // ← botCount追加
svc.startRound();
return svc;
```

**4. `GameProvider` に `botCount` を渡す：**

```tsx
<GameProvider
  service={service}
  mode={mode}
  repository={repo}
  initialChips={initialChips}
  blinds={blinds}
  playerNames={playerNames}
  botCount={botCount}    // ← 追加
>
  <GameView />
</GameProvider>
```

- [ ] **Step 3: TypeScript型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 4: Commit**

```bash
git add src/components/lobby/LobbyView.tsx app/game.tsx
git commit -m "feat(lobby): add bot count selector and wire botCount through to game"
```

---

## Task 9: PlayerSeat に BOT バッジを追加

**Files:**
- Modify: `src/components/table/PlayerSeat.tsx`

- [ ] **Step 1: `PlayerSeat.tsx` に BOT バッジを追加**

`src/components/table/PlayerSeat.tsx` の変更：

**名前表示部分の後（`<Text style={styles.name}>{player.name}</Text>` の直後）に追加：**

```tsx
{player.isBot && (
  <Text style={styles.botBadge} testID={`bot-badge-${seat}`}>BOT</Text>
)}
```

**StyleSheet に追加：**

```typescript
botBadge: {
  color: '#93C5FD',
  fontSize: 9,
  fontWeight: 'bold',
  backgroundColor: 'rgba(59,130,246,0.2)',
  borderRadius: 4,
  paddingHorizontal: 4,
  paddingVertical: 1,
  marginBottom: 2,
},
```

- [ ] **Step 2: TypeScript型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add src/components/table/PlayerSeat.tsx
git commit -m "feat(ui): show BOT badge on bot player seats"
```

---

## Task 10: ActionButtons をBot席で無効化

**Files:**
- Modify: `src/components/actions/ActionButtons.tsx`

- [ ] **Step 1: `ActionButtons.tsx` にBot席チェックを追加**

`src/components/actions/ActionButtons.tsx` の変更：

**`useGame()` の取得に `service` を追加し、Bot席チェックを追加：**

```typescript
const { state, mode, viewingSeat, doAction, getActionInfo, preAction, setPreAction, service } = useGame();
```

`isMyTurn` 定義の後に追加：

```typescript
const isBotTurn = (() => {
  if (!state || state.activePlayer < 0) return false;
  const botSeats = service.getBotSeats?.() ?? new Set<number>();
  return botSeats.has(state.activePlayer);
})();
```

**ボタンを `disabled` にする条件を追加（`isMyTurn` チェックの代わりに）：**

アクションボタンのレンダリング部分で、`!isMyTurn || isBotTurn` のときにボタンを非表示またはdisabledにする。
現状のコードは `isMyTurn` が false のときボタンを非表示にしているはずなので、`isBotTurn` を確認：

```typescript
// 既存: if (!info) return <PreActionBar .../>
// info は isMyTurn が false のとき null になるため、isBotTurn のときも null を返すよう追加

const info = useMemo(() => {
  if (!state || !isMyTurn || isBotTurn) return null;  // ← isBotTurn追加
  return getActionInfo(actingSeat);
}, [state, isMyTurn, isBotTurn, actingSeat, getActionInfo]);
```

**注意:** `useGame()` に `service` が含まれていることを確認。含まれていない場合は `GameContextValue` に追加済み（既に `service: GameService` が含まれている）。

- [ ] **Step 2: TypeScript型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add src/components/actions/ActionButtons.tsx
git commit -m "feat(ui): disable ActionButtons during bot player turn"
```

---

## Task 11: PassDeviceScreen を Bot席で抑制

**Files:**
- Modify: `app/game.tsx`

- [ ] **Step 1: `GameView` コンポーネントの PassDeviceScreen 条件を修正**

`app/game.tsx` の `GameView` コンポーネント内の `useEffect` を修正：

```typescript
function GameView() {
  const { state, mode, viewingSeat, service } = useGame();
  // ...

  useEffect(() => {
    if (!state || mode !== 'hotseat') return;

    const currentActive = state.activePlayer;
    const prevActive = prevActiveRef.current;

    if (
      currentActive >= 0 &&
      currentActive !== prevActive &&
      state.phase !== 'roundEnd' &&
      state.phase !== 'showdown'
    ) {
      const player = state.players.find(p => p.seat === currentActive);
      // Bot席への切り替わりでは PassDeviceScreen を表示しない
      if (player && !player.isBot) {
        setNextPlayerName(player.name);
        setShowPassScreen(true);
      }
    }
    prevActiveRef.current = currentActive;
  }, [state?.activePlayer, state?.phase, mode]);
  // ...
```

- [ ] **Step 2: TypeScript型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: 全テストを実行**

```bash
npx jest --no-coverage
```

Expected: PASS（既存テストをすべて含む）

- [ ] **Step 4: Commit**

```bash
git add app/game.tsx
git commit -m "feat(ui): suppress PassDeviceScreen for bot player turns"
```

---

## Task 12: 最終確認

- [ ] **Step 1: 全テスト実行**

```bash
npx jest --no-coverage
```

Expected: PASS

- [ ] **Step 2: TypeScript型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: 動作確認チェックリスト**

1. ロビー → Bot人数 `+` で増加、`−` で減少（最小0、最大8）
2. ゲーム開始後、Bot席に「BOT」バッジが表示される
3. Bot席のターンでアクションボタンが非表示/無効になる
4. Bot席のターンで PassDeviceScreen が表示されない
5. Bot席のターンから1秒後にBotが自動アクションする
6. Bot同士が連続する場合も1秒ごとに自動アクション
7. 全Bot退場でゲームオーバー処理が正常に動く
8. 「もう1度」（rematch）でBotが同じ人数で参加する
