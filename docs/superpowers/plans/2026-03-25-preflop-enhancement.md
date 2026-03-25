# Preflop Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `preflopStrategy.ts` をシナリオ分離型アーキテクチャに書き換え、4-bet レンジ・スタック深さ考慮・BB ディフェンス・スクイーズ・マルチウェイ補正を追加する。

**Architecture:** `decidePreflopAction` が `detectPreflopScenario` でシナリオを判定し、`decideRFI` / `decideFacingRaise` / `decideSqueezeOrFold` / `decideFacingReraise` の 4 つの純粋関数に委譲する。`calcBBDepth`・`countCallers` がヘルパーとして共有される。既存の `preflopData.ts`（MATRIX, getGroup, getFreqTier）と `getPosition`・`makeRaise` は変更しない。

**Tech Stack:** TypeScript, Jest, 既存 `preflopData.ts`（MATRIX, getGroup, getFreqTier）

**Spec:** `docs/superpowers/specs/2026-03-25-preflop-enhancement-design.md`

---

## File Map

| Action | Path | Role |
|--------|------|------|
| Modify | `src/bot/strategy/preflopStrategy.ts` | シナリオ分離型に全面置き換え |
| Modify | `tests/bot/preflopStrategy.test.ts` | 新ロジックに合わせてテスト全面書き換え |

---

## Task 1: テストファイル全面書き換え

**Files:**
- Modify: `tests/bot/preflopStrategy.test.ts`

- [ ] **Step 1: `tests/bot/preflopStrategy.test.ts` を以下で全面置き換え**

```typescript
import { decidePreflopAction } from '../../src/bot/strategy/preflopStrategy';
import { GameState, Player } from '../../src/gameEngine/types';

/** 2人テーブルのデフォルト状態: dealer=2(off-table) → seat 0=BTN, seat 1=BB */
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    seq: 1,
    phase: 'preflop',
    community: [],
    pots: [{ amount: 15, eligible: [0, 1] }],
    currentBet: 10,   // bb
    activePlayer: 0,
    dealer: 2,        // off-table → seat 0 が BTN, seat 1 が BB
    blinds: { sb: 5, bb: 10 },
    players: [
      { seat: 0, name: 'Hero',    chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'Villain', chips: 990, status: 'active', bet: 10, cards: [] },
    ],
    ...overrides,
  };
}

// ─── RFI ──────────────────────────────────────────────────────────────────────

describe('decidePreflopAction — RFI', () => {
  it('AA — BTN で RFI → raise 30', () => {
    // dealer=2(off): seat 0=BTN, currentBet=10=bb → RFI
    const state = makeState({ currentBet: 10 });
    const result = decidePreflopAction(state, ['Ah', 'Ad'], 0);
    expect(['raise', 'allIn']).toContain(result.action);
    if (result.action === 'raise') expect(result.amount).toBe(30); // 3×bb
  });

  it('72o — UTG で RFI → fold（group 0）', () => {
    // 4-player: dealer=0=BTN, SB=1, BB=2, UTG=3
    const players: Player[] = [
      { seat: 0, name: 'BTN', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'SB',  chips: 990, status: 'active', bet: 5,  cards: [] },
      { seat: 2, name: 'BB',  chips: 990, status: 'active', bet: 10, cards: [] },
      { seat: 3, name: 'UTG', chips: 990, status: 'active', bet: 0,  cards: [] },
    ];
    const state = makeState({ players, dealer: 0, currentBet: 10, activePlayer: 3 });
    expect(decidePreflopAction(state, ['7h', '2d'], 3).action).toBe('fold');
  });

  it('BB — currentBet === bb → check（RFI 時は常にチェック）', () => {
    // dealer=2(off): seat 1 が BB、currentBet=10=bb → RFI
    const state = makeState({ currentBet: 10, activePlayer: 1 });
    expect(decidePreflopAction(state, ['Kh', 'Qh'], 1).action).toBe('check');
  });

  it('bbDepth < 15 — AA RFI → allIn（ショートスタック push）', () => {
    // chips=100, bb=10 → bbDepth=10 < 15
    const players: Player[] = [
      { seat: 0, name: 'Hero',    chips: 100, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'Villain', chips: 990, status: 'active', bet: 10, cards: [] },
    ];
    const state = makeState({ players, currentBet: 10 });
    expect(decidePreflopAction(state, ['Ah', 'Ad'], 0).action).toBe('allIn');
  });

  it('6人卓 BTN JTo → fold（マルチウェイ補正でレンジ絞り）', () => {
    // numActive=6, penaltyGroups=3, BTN threshold=6 → effectiveThreshold=3
    // JTo = MATRIX[4][3] = 62 → group 6 > 3 → fold
    const players: Player[] = [
      { seat: 0, name: 'BTN', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'SB',  chips: 990, status: 'active', bet: 5,  cards: [] },
      { seat: 2, name: 'BB',  chips: 990, status: 'active', bet: 10, cards: [] },
      { seat: 3, name: 'UTG', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 4, name: 'HJ',  chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 5, name: 'CO',  chips: 990, status: 'active', bet: 0,  cards: [] },
    ];
    const state = makeState({ players, dealer: 0, currentBet: 10, activePlayer: 0 });
    expect(decidePreflopAction(state, ['Jh', 'Td'], 0).action).toBe('fold');
  });
});

// ─── Facing Raise ─────────────────────────────────────────────────────────────

// 「raiser のみ存在（callers なし）」を再現するため players を明示する。
// seat 1 が raiser（bet=currentBet）、seat 0 が Hero（bet=0）
function makeFacingRaiseState(overrides: Partial<GameState> = {}): GameState {
  const players: Player[] = [
    { seat: 0, name: 'Hero',   chips: 990, status: 'active', bet: 0,  cards: [] },
    { seat: 1, name: 'Raiser', chips: 960, status: 'active', bet: 30, cards: [] },
  ];
  return makeState({ players, currentBet: 30, activePlayer: 0, ...overrides });
}

describe('decidePreflopAction — Facing Raise', () => {
  it('AA — facing raise → raise（バリュー 3-bet）', () => {
    // group 1, bbDepth=99 → raise(90)
    const result = decidePreflopAction(makeFacingRaiseState(), ['Ah', 'Ad'], 0);
    expect(result.action).toBe('raise');
    expect(result.amount).toBe(90); // 3 × 30
  });

  it('AKs — facing raise → raise（バリュー 3-bet）', () => {
    // AKs = MATRIX[0][1]=11 → group 1
    const result = decidePreflopAction(makeFacingRaiseState(), ['Ah', 'Kh'], 0);
    expect(result.action).toBe('raise');
  });

  it('KQs — facing raise, OOP → call（group 2, bluff 3-bet なし）', () => {
    // seat 1 = BB (OOP): dealer=2(off), 2-player → seat 1 = BB
    // BB は OOP → isIP=false → ブラフ 3-bet なし → group 2 → call
    const players: Player[] = [
      { seat: 0, name: 'Raiser', chips: 960, status: 'active', bet: 30, cards: [] },
      { seat: 1, name: 'Hero',   chips: 990, status: 'active', bet: 10, cards: [] },
    ];
    const state = makeState({ players, currentBet: 30, activePlayer: 1 });
    expect(decidePreflopAction(state, ['Kh', 'Qh'], 1).action).toBe('call');
  });

  it('72o — facing raise → fold', () => {
    expect(decidePreflopAction(makeFacingRaiseState(), ['7h', '2d'], 0).action).toBe('fold');
  });

  it('bbDepth < 15 — AA facing raise → allIn（ショートスタック push）', () => {
    // chips=100 → bbDepth=10 < 15
    const players: Player[] = [
      { seat: 0, name: 'Hero',   chips: 100, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'Raiser', chips: 960, status: 'active', bet: 30, cards: [] },
    ];
    const state = makeState({ players, currentBet: 30, activePlayer: 0 });
    expect(decidePreflopAction(state, ['Ah', 'Ad'], 0).action).toBe('allIn');
  });

  it('bbDepth < 15 — KQo facing raise → fold', () => {
    // chips=100 → bbDepth=10 < 15; KQo=group 2 → 15未満では group <= 1 のみ allIn, それ以外 fold
    const players: Player[] = [
      { seat: 0, name: 'Hero',   chips: 100, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'Raiser', chips: 960, status: 'active', bet: 30, cards: [] },
    ];
    const state = makeState({ players, currentBet: 30, activePlayer: 0 });
    expect(decidePreflopAction(state, ['Kh', 'Qd'], 0).action).toBe('fold');
  });

  it('BB — facing steal（currentBet=30）、KQs → call（BB ディフェンス）', () => {
    // seat 1 = BB (OOP); chips=990 → bbDepth=99; group 2 → call
    const players: Player[] = [
      { seat: 0, name: 'Raiser', chips: 960, status: 'active', bet: 30, cards: [] },
      { seat: 1, name: 'Hero',   chips: 990, status: 'active', bet: 10, cards: [] },
    ];
    const state = makeState({ players, currentBet: 30, activePlayer: 1 });
    expect(decidePreflopAction(state, ['Kh', 'Qh'], 1).action).toBe('call');
  });

  it('IP ブラフ 3-bet 頻度（KQs, BTN, facing raise）→ 約 20%', () => {
    // seat 0=BTN(IP), KQs=group 2 → bluff 3-bet 20%
    let raises = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      if (decidePreflopAction(makeFacingRaiseState(), ['Kh', 'Qh'], 0).action === 'raise') raises++;
    }
    const rate = raises / N;
    expect(rate).toBeGreaterThan(0.08);  // 20% ± 許容誤差
    expect(rate).toBeLessThan(0.35);
  });
});

// ─── Squeeze ─────────────────────────────────────────────────────────────────

describe('decidePreflopAction — Squeeze', () => {
  // raiser(bet=30) + caller(bet=20 < currentBet=30) がいる状態
  function makeSqueezeState(): GameState {
    const players: Player[] = [
      { seat: 0, name: 'Hero',   chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'Raiser', chips: 960, status: 'active', bet: 30, cards: [] },
      { seat: 2, name: 'Caller', chips: 970, status: 'active', bet: 20, cards: [] },
    ];
    return makeState({ players, currentBet: 30, activePlayer: 0, dealer: 0 });
  }

  it('AA — squeeze spot（callers=1）→ raise', () => {
    expect(decidePreflopAction(makeSqueezeState(), ['Ah', 'Ad'], 0).action).toBe('raise');
  });

  it('72o — squeeze spot → fold', () => {
    expect(decidePreflopAction(makeSqueezeState(), ['7h', '2d'], 0).action).toBe('fold');
  });
});

// ─── Facing Reraise ──────────────────────────────────────────────────────────

describe('decidePreflopAction — Facing Reraise', () => {
  // Hero が 3-bet 済み（bet=30）、相手がさらにレイズ（currentBet=90）
  function makeFacingReraiseState(heroChips: number = 960): GameState {
    const players: Player[] = [
      { seat: 0, name: 'Hero',    chips: heroChips, status: 'active', bet: 30, cards: [] },
      { seat: 1, name: 'Villain', chips: 900,       status: 'active', bet: 90, cards: [] },
    ];
    return makeState({ players, currentBet: 90, activePlayer: 0 });
  }

  it('AA — facing reraise → raise（4-bet）', () => {
    // bbDepth=96 → normal stack; group 1 → raise(90*2.5=225)
    const result = decidePreflopAction(makeFacingReraiseState(), ['Ah', 'Ad'], 0);
    expect(['raise', 'allIn']).toContain(result.action);
  });

  it('72o — facing reraise → fold', () => {
    expect(decidePreflopAction(makeFacingReraiseState(), ['7h', '2d'], 0).action).toBe('fold');
  });

  it('AA — facing reraise, bbDepth<15 → allIn', () => {
    // chips=100 → bbDepth=10 < 15; group 1 → allIn
    expect(decidePreflopAction(makeFacingReraiseState(100), ['Ah', 'Ad'], 0).action).toBe('allIn');
  });

  it('KQo — facing reraise → fold（bbDepth=30 < 40、group 2 コール条件非該当）', () => {
    // KQo = MATRIX[2][1]=23 → group 2; chips=300 → bbDepth=30 < 40 → fold
    const players: Player[] = [
      { seat: 0, name: 'Hero',    chips: 300, status: 'active', bet: 30, cards: [] },
      { seat: 1, name: 'Villain', chips: 900, status: 'active', bet: 90, cards: [] },
    ];
    const state = makeState({ players, currentBet: 90, activePlayer: 0 });
    expect(decidePreflopAction(state, ['Kh', 'Qd'], 0).action).toBe('fold');
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗を確認**

```bash
npx jest tests/bot/preflopStrategy.test.ts --no-coverage 2>&1 | tail -20
```

Expected: BB check / short stack push / multiway fold / squeeze / facing-reraise 関連が FAIL。

- [ ] **Step 3: Commit**

```bash
git add tests/bot/preflopStrategy.test.ts
git commit -m "test(preflop): add scenario-based failing tests for preflop enhancement"
```

---

## Task 2: ヘルパー関数の追加 + ディスパッチャのスケルトン

**Files:**
- Modify: `src/bot/strategy/preflopStrategy.ts`

既存の `makeRaise` の直前（line 51 付近）にヘルパーを追加し、`decidePreflopAction` 全体をスケルトン dispatcher に置き換える。

- [ ] **Step 1: `src/bot/strategy/preflopStrategy.ts` の `makeRaise` の直前にヘルパーを追加**

```typescript
function calcBBDepth(player: { chips: number }, state: GameState): number {
  return player.chips / state.blinds.bb;
}

function countCallers(state: GameState, seat: number): number {
  return state.players.filter(
    p => p.bet > 0 && p.bet < state.currentBet && p.seat !== seat
  ).length;
}

type PreflopScenario = 'rfi' | 'facing-raise' | 'squeeze' | 'facing-reraise';

function detectPreflopScenario(state: GameState, seat: number): PreflopScenario {
  const bb = state.blinds.bb;
  const player = state.players.find(p => p.seat === seat)!;
  const isRaised = state.currentBet > bb;
  if (!isRaised) return 'rfi';
  if (player.bet > bb && player.bet < state.currentBet) return 'facing-reraise';
  if (countCallers(state, seat) >= 1) return 'squeeze';
  return 'facing-raise';
}
```

- [ ] **Step 2: `decidePreflopAction` 全体を以下のスケルトンに置き換え**

既存の `decidePreflopAction` 関数（line 57〜104）を丸ごと削除して下記で置き換える。4 つのハンドラ関数はスタブ（暫定 fold）として先に定義し、Tasks 3〜6 で順に本実装に置き換える。

```typescript
// ── Scenario handlers (stubs — to be replaced in Tasks 3–6) ──────────────────

function decideRFI(
  _group: number, _freqTier: number, _position: string, _bbDepth: number,
  _numActive: number, _player: { chips: number; bet: number }, _bb: number,
): PlayerAction {
  return { action: 'fold' }; // TODO: Task 3
}

function decideFacingRaise(
  _group: number, _position: string, _bbDepth: number,
  _currentBet: number, _player: { chips: number; bet: number },
): PlayerAction {
  return { action: 'fold' }; // TODO: Task 4
}

function decideSqueezeOrFold(
  _group: number, _numCallers: number, _bbDepth: number,
  _currentBet: number, _player: { chips: number; bet: number },
): PlayerAction {
  return { action: 'fold' }; // TODO: Task 5
}

function decideFacingReraise(
  _group: number, _bbDepth: number,
  _currentBet: number, _player: { chips: number; bet: number },
): PlayerAction {
  return { action: 'fold' }; // TODO: Task 6
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

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

  // group 0 = 無条件フォールド（matrix value 0 のハンド: 72o 等）
  if (group === 0) return { action: 'fold' };

  const position = getPosition(state, seat);
  const bbDepth = calcBBDepth(player, state);
  const scenario = detectPreflopScenario(state, seat);

  switch (scenario) {
    case 'rfi': {
      const numActive = state.players.filter(p => p.status !== 'out').length;
      return decideRFI(group, freqTier, position, bbDepth, numActive, player, bb);
    }
    case 'facing-raise':
      return decideFacingRaise(group, position, bbDepth, state.currentBet, player);
    case 'squeeze':
      return decideSqueezeOrFold(group, countCallers(state, seat), bbDepth, state.currentBet, player);
    case 'facing-reraise':
      return decideFacingReraise(group, bbDepth, state.currentBet, player);
  }
}
```

- [ ] **Step 3: TypeScript コンパイルエラーがないことを確認**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: エラーなし。

- [ ] **Step 4: Commit**

```bash
git add src/bot/strategy/preflopStrategy.ts
git commit -m "refactor(preflop): introduce scenario dispatcher skeleton with helpers"
```

---

## Task 3: `decideRFI` を実装（RFI シナリオ）

**Files:**
- Modify: `src/bot/strategy/preflopStrategy.ts`

- [ ] **Step 1: `decideRFI` スタブを本実装に置き換え**

```typescript
function decideRFI(
  group: number,
  freqTier: number,
  position: string,
  bbDepth: number,
  numActive: number,
  player: { chips: number; bet: number },
  bb: number,
): PlayerAction {
  // BB 特殊ケース: currentBet === bb（RFI シナリオ）では常にチェック
  if (position === 'BB') return { action: 'check' };

  // マルチウェイ補正: 参加者数が増えるほどレンジを絞る
  const penaltyGroups = Math.max(0, numActive - 3);
  const threshold = OPEN_THRESHOLD[position] ?? 2;
  const effectiveThreshold = Math.max(1, threshold - penaltyGroups);

  // ショートスタック（< 15BB）: push or fold
  if (bbDepth < 15) {
    if (group <= 2) return { action: 'allIn' }; // プレミアム + group 2 まで push
    return { action: 'fold' };
  }

  // 通常スタック
  if (group > effectiveThreshold) return { action: 'fold' };
  const raiseProb = freqTier === 1 ? 1.0 : freqTier === 2 ? 0.87 : 0.62;
  if (Math.random() < raiseProb) return makeRaise(bb * 3, player);
  return { action: 'fold' };
}
```

- [ ] **Step 2: RFI テストを実行 → 全部 PASS を確認**

```bash
npx jest tests/bot/preflopStrategy.test.ts --no-coverage -t "RFI" 2>&1 | tail -20
```

Expected: `decidePreflopAction — RFI` の 5 テスト全部 PASS。

- [ ] **Step 3: Commit**

```bash
git add src/bot/strategy/preflopStrategy.ts
git commit -m "feat(preflop): implement decideRFI with multiway penalty and stack depth"
```

---

## Task 4: `decideFacingRaise` を実装（レイズに直面）

**Files:**
- Modify: `src/bot/strategy/preflopStrategy.ts`

- [ ] **Step 1: `decideFacingRaise` スタブを本実装に置き換え**

```typescript
function decideFacingRaise(
  group: number,
  position: string,
  bbDepth: number,
  currentBet: number,
  player: { chips: number; bet: number },
): PlayerAction {
  const isIP = ['BTN', 'CO', 'HJ'].includes(position);

  // ショートスタック（< 15BB）: premium のみ allIn
  if (bbDepth < 15) {
    if (group <= 1) return { action: 'allIn' };
    return { action: 'fold' };
  }

  // ミドルスタック（15–29BB）: 3-bet or fold（コールなし）
  if (bbDepth < 30) {
    if (group <= 1) return makeRaise(currentBet * 3, player);
    return { action: 'fold' };
  }

  // 通常スタック（>= 30BB）
  if (group <= 1) return makeRaise(currentBet * 3, player);  // バリュー 3-bet
  if (group <= 3 && isIP && Math.random() < 0.20) return makeRaise(currentBet * 3, player); // ブラフ 3-bet
  if (group <= 4) {
    const callAmt = Math.min(currentBet - player.bet, player.chips);
    if (callAmt >= player.chips) return { action: 'allIn' };
    return { action: 'call' };
  }
  return { action: 'fold' };
}
```

- [ ] **Step 2: Facing Raise テストを実行 → 全部 PASS を確認**

```bash
npx jest tests/bot/preflopStrategy.test.ts --no-coverage -t "Facing Raise" 2>&1 | tail -20
```

Expected: `decidePreflopAction — Facing Raise` の 8 テスト全部 PASS（確率テストは範囲内であれば OK）。

- [ ] **Step 3: Commit**

```bash
git add src/bot/strategy/preflopStrategy.ts
git commit -m "feat(preflop): implement decideFacingRaise with stack depth and bluff 3-bet"
```

---

## Task 5: `decideSqueezeOrFold` を実装（スクイーズ）

**Files:**
- Modify: `src/bot/strategy/preflopStrategy.ts`

- [ ] **Step 1: `decideSqueezeOrFold` スタブを本実装に置き換え**

```typescript
function decideSqueezeOrFold(
  group: number,
  numCallers: number,
  bbDepth: number,
  currentBet: number,
  player: { chips: number; bet: number },
): PlayerAction {
  // ショートスタック（< 15BB）: premium のみ push
  if (bbDepth < 15) {
    if (group <= 1) return { action: 'allIn' };
    return { action: 'fold' };
  }

  // 通常スタック
  if (group <= 1) return makeRaise(currentBet * 3.5, player); // バリュースクイーズ
  // コーラー 1 人時のみブラフスクイーズ（2 人以上はブラフなし）
  if (group <= 3 && numCallers === 1 && Math.random() < 0.25) return makeRaise(currentBet * 3.5, player);
  return { action: 'fold' };
}
```

- [ ] **Step 2: Squeeze テストを実行 → 全部 PASS を確認**

```bash
npx jest tests/bot/preflopStrategy.test.ts --no-coverage -t "Squeeze" 2>&1 | tail -20
```

Expected: `decidePreflopAction — Squeeze` の 2 テスト PASS。

- [ ] **Step 3: Commit**

```bash
git add src/bot/strategy/preflopStrategy.ts
git commit -m "feat(preflop): implement decideSqueezeOrFold with bluff squeeze"
```

---

## Task 6: `decideFacingReraise` を実装（4-bet）

**Files:**
- Modify: `src/bot/strategy/preflopStrategy.ts`

- [ ] **Step 1: `decideFacingReraise` スタブを本実装に置き換え**

```typescript
function decideFacingReraise(
  group: number,
  bbDepth: number,
  currentBet: number,
  player: { chips: number; bet: number },
): PlayerAction {
  // ショートスタック（< 15BB）: premium のみ jam
  if (bbDepth < 15) {
    if (group <= 1) return { action: 'allIn' };
    return { action: 'fold' };
  }

  // 通常スタック
  if (group <= 1) return makeRaise(currentBet * 2.5, player); // 4-bet / re-jam
  // group 2（AKo/JJ/TT 相当）: 深いスタックのみコール
  if (group === 2 && bbDepth >= 40) {
    const callAmt = Math.min(currentBet - player.bet, player.chips);
    if (callAmt >= player.chips) return { action: 'allIn' };
    return { action: 'call' };
  }
  return { action: 'fold' };
}
```

- [ ] **Step 2: Facing Reraise テストを実行 → 全部 PASS を確認**

```bash
npx jest tests/bot/preflopStrategy.test.ts --no-coverage -t "Facing Reraise" 2>&1 | tail -20
```

Expected: `decidePreflopAction — Facing Reraise` の 4 テスト PASS。

- [ ] **Step 3: テストスイート全体を実行 → 全部 PASS を確認**

```bash
npx jest tests/bot/preflopStrategy.test.ts --no-coverage 2>&1 | tail -10
```

Expected: `Test Suites: 1 passed, 1 total`

- [ ] **Step 4: Commit**

```bash
git add src/bot/strategy/preflopStrategy.ts
git commit -m "feat(preflop): implement decideFacingReraise (4-bet range) and complete enhancement"
```

---

## Task 7: 全テストスイート確認

**Files:** なし（確認のみ）

- [ ] **Step 1: プロジェクト全体のテストを実行**

```bash
npx jest --no-coverage 2>&1 | tail -15
```

Expected: 全テスト PASS（既存テストを壊していないことを確認）。

- [ ] **Step 2: 失敗があれば修正してコミット**

失敗テストがある場合は原因を調査して修正し、コミットする。

```bash
git add src/bot/strategy/preflopStrategy.ts tests/bot/preflopStrategy.test.ts
git commit -m "fix(preflop): fix regression in full test suite"
```
