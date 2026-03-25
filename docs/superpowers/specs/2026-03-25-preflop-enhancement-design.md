# Preflop Enhancement — Design Spec

**Date:** 2026-03-25
**Status:** Approved

---

## 0. Overview

`preflopStrategy.ts` をシナリオ分離型アーキテクチャに書き換え、以下を追加する：

| 機能 | 現状 | 改善後 |
|------|------|--------|
| 4-bet レンジ | なし（3-betされたら常にコール or フォールド） | AA/KK/QQ/AKs → 4-bet |
| スタック深さ考慮 | なし | < 15BB はプッシュ/フォールド、< 30BB はコールなし |
| BB ディフェンス | 常にチェック | ブラインドスチールに対して適切なコール/3-bet |
| スクイーズ | なし | レイザー＋コーラー存在時に group 1 以下でスクイーズ |
| マルチウェイ RFI 調整 | なし | 参加者数に応じてレンジを絞る |
| ブラフ 3-bet | なし | IP（BTN/CO/HJ）で group 2-3 のときに 20% 確率でブラフ 3-bet |

**前提:** 既存の `preflopData.ts`（MATRIX, getGroup, getFreqTier）はそのまま使用する。公開シグネチャ `decidePreflopAction(state, holeCards, seat)` は不変。

---

## 1. アーキテクチャ

### シナリオ分離型の構造

```
decidePreflopAction(state, holeCards, seat)
  ↓
detectPreflopScenario()  →  'rfi' | 'facing-raise' | 'squeeze' | 'facing-reraise'
  ↓ 分岐
decideRFI(group, freqTier, position, bbDepth, numActive)
decideFacingRaise(group, position, bbDepth)
decideSqueezeOrFold(group, numCallers, bbDepth)
decideFacingReraise(group, bbDepth)
```

全関数は純粋関数（GameState, holeCards から計算済みパラメータのみ受け取る）。

### ヘルパー関数（新規）

| 関数 | 役割 |
|------|------|
| `calcBBDepth(player, state)` | `player.chips / state.blinds.bb`（ブラインド投稿後の残りチップを BB 換算） |
| `detectPreflopScenario(state, seat)` | 現在のプリフロップシナリオを判定 |
| `countCallers(state, seat)` | 自分以外のコーラー数 = `p.bet > 0 && p.bet < currentBet && p.seat !== seat` な player の数 |

既存の `getPosition()` と `makeRaise()` は保持する。

---

## 2. シナリオ検出

`detectPreflopScenario(state, seat)` の判定ロジック：

```
const bb = state.blinds.bb;
const player = state.players.find(p => p.seat === seat);
const isRaised = state.currentBet > bb;

1. !isRaised                                    →  'rfi'
2. isRaised かつ player.bet > bb
   かつ player.bet < currentBet               →  'facing-reraise'
   （自分が任意ベット済みだがさらにレイズされた。BB の blind post は player.bet === bb なので除外）
3. isRaised かつ countCallers(state, seat) >= 1  →  'squeeze'
4. isRaised（上記以外）                         →  'facing-raise'
```

**facing-reraise の捕捉：** `player.bet > bb` は BB の強制投稿（= bb）と区別するために必要。3-bet も 4-bet も同条件として一意に検出できる。3-bet か 4-bet かはゲーム状態から区別せず、同一ハンドラ `decideFacingReraise` で処理する（実用的な判断は group と bbDepth のみで十分）。

---

## 3. 各シナリオのロジック

### 3-1. RFI（`decideRFI`）

**BB 特殊ケース（先に評価）：**
`position === 'BB'` かつ `currentBet === bb`（全員コール or チェック）→ `check`
BB vs スチール（`currentBet > bb`）は `facing-raise` として処理される。

**マルチウェイ補正の閾値（Section 5 参照）：**
```
penaltyGroups = max(0, numActive - 3)
effectiveThreshold = max(1, OPEN_THRESHOLD[position] - penaltyGroups)
```

**ショートスタック（bbDepth < 15）：**
```
group === 0（matrix value 0 のハンド）  →  fold
group <= 1（プレミアム）                →  allIn
group <= 2                              →  allIn（ショートスタックは中堅以上も push）
else                                    →  fold
```

**通常スタック（bbDepth >= 15）：**
```
group === 0  →  fold
group > effectiveThreshold  →  fold
group <= effectiveThreshold:
  raiseProb = tier1: 1.0 / tier2: 0.87 / tier3: 0.62
  Math.random() < raiseProb  →  raise(bb * 3)
  else                       →  fold
```

### 3-2. Facing Raise（`decideFacingRaise`）

**IP 定義:** `getPosition(state, seat)` が `['BTN', 'CO', 'HJ']` のいずれかの場合 IP。それ以外（SB, BB, LJ, UTG 系）は OOP。

**BB の考慮:** BB は既に `bb` を投稿済みなので `player.chips` は投稿後の値。`calcBBDepth` はその `player.chips / bb` を使う（投稿後の残りスタックで計算）。

```
bbDepth < 15（ショートスタック）:
  group <= 1  →  allIn（3-bet/プッシュ）
  else        →  fold

bbDepth < 30（ミドルスタック）:
  group <= 1  →  raise(currentBet * 3)（3-bet）
  else        →  fold  ※ コールなし

通常スタック（bbDepth >= 30）:
  group <= 1                                              →  raise(currentBet * 3)（バリュー 3-bet）
  group 2–3 + isIP + Math.random() < 0.20               →  raise(currentBet * 3)（ブラフ 3-bet）
  group 2–4                                              →  call
  group >= 5                                             →  fold
```

**BB ディフェンス補足:** BB が facing-raise に来た場合も上記ロジックを適用する。BB は OOP のためブラフ 3-bet は発生しないが、group 2–4 のコールレンジは通常通り適用される（BB は pot odds が有利なため妥当）。`bbDepth < 30` 制限は BB にも適用されるが、BB の `player.chips` はすでに bb 分減っているため、実際には 29 BB 相当チップを持つ BB は計算上 `bbDepth ≈ 28` となる点に注意。

### 3-3. Squeeze（`decideSqueezeOrFold`）

レイザー＋コーラーが存在する状況（ポットが大きい）：

```
group === 0  →  fold
bbDepth < 15:
  group <= 1  →  allIn
  else        →  fold

通常:
  group <= 1                                           →  raise(currentBet * 3.5)（バリュースクイーズ）
  group 2–3 + numCallers === 1 + Math.random() < 0.25  →  raise(currentBet * 3.5)（スクイーズブラフ）
  それ以外                                              →  fold
```

コーラーが 2 人以上（`numCallers >= 2`）の場合はブラフスクイーズなし。

### 3-4. Facing Reraise（`decideFacingReraise`）

自分がレイズ済みでさらにレイズされた状況（3-bet or 4-bet）。GameState からは回数を区別できないため、group と bbDepth のみで判断する：

```
group === 0  →  fold

bbDepth < 15:
  group <= 1（AA/KK/QQ/AKs）  →  allIn
  else                         →  fold

通常スタック:
  group <= 1（AA/KK/QQ/AKs）           →  raise(currentBet * 2.5)（4-bet または re-jam）
  group === 2（AKo/JJ/TT 相当）+ bbDepth >= 40  →  call
  それ以外                              →  fold
```

---

## 4. グループ番号の定義

`getGroup(matrixValue) = Math.floor(matrixValue / 10)`

| group | 意味 | 代表ハンド |
|-------|------|-----------|
| 0 | フォールド専用（matrix value = 0） | 72o など |
| 1 | プレミアム | AA, KK, QQ, AKs, AQs, AKo |
| 2 | UTG 相当 | JJ, TT, 99, AJs, KQs 等 |
| 3 | UTG+1/+2 相当 | ATo, QJs, 77 等 |
| 4 | LJ/HJ 相当 | A9s, KTs, KJo 等 |
| 5 | CO 相当 | 66, A5s, K9s 等 |
| 6 | BTN 相当 | 22, Q9s, JTs 等 |
| 7 | SB 相当 | 弱いスーテッド等 |

本スペックで `group <= 1` と記載する場合は **getGroup() が 1 以下（プレミアム）** を指す。`group === 0` は matrix value が 0 のフォールド専用ハンドのみを指す。

---

## 5. マルチウェイ RFI 補正

`numActive` = ゲームに参加中のプレイヤー数（`status !== 'out'`）

```
penaltyGroups = max(0, numActive - 3)
effectiveThreshold = max(1, OPEN_THRESHOLD[position] - penaltyGroups)
```

例：6人テーブル（numActive=6）BTN（threshold=6）→ penaltyGroups=3 → effectiveThreshold=3

---

## 6. スタック深さ基準

`calcBBDepth(player, state)` = `player.chips / state.blinds.bb`（ブラインド投稿後の残りチップを使用）

| BBDepth | モード |
|---------|--------|
| < 15 BB | プッシュ/フォールドのみ |
| 15–29 BB | 3-bet or fold（コールなし） |
| ≥ 30 BB | 通常プレイ（コール可） |
| ≥ 40 BB | facing-reraise でのコール許可 |

---

## 7. ファイルマップ

| Action | Path | 内容 |
|--------|------|------|
| Modify | `src/bot/strategy/preflopStrategy.ts` | シナリオ分離型に全面置き換え |
| Modify | `tests/bot/preflopStrategy.test.ts` | 新ロジックに合わせてテスト更新・追加 |

---

## 8. テスト方針

TDD で実装する（テスト先行）。`makeState` ヘルパー関数でゲーム状態を構築する。

### makeState の構造例

```typescript
function makeState(overrides = {}): GameState {
  return {
    seq: 1, phase: 'preflop',
    community: [],
    pots: [{ amount: 15, eligible: [0, 1] }],
    currentBet: 10,   // bb
    activePlayer: 0,
    dealer: 2,        // dealer off-table → 2人テーブルでは seat 0 が BTN
    blinds: { sb: 5, bb: 10 },
    players: [
      { seat: 0, name: 'Hero',    chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'Villain', chips: 990, status: 'active', bet: 10, cards: [] },
    ],
    ...overrides,
  };
}
```

### テストケース一覧

| テストケース | セットアップ | 期待値 |
|-------------|-------------|--------|
| AA — BTN で RFI → raise | currentBet=bb, dealer=1（seat 0 が BTN） | `raise` or `allIn` |
| 72o — UTG で RFI → fold | currentBet=bb, 9人テーブル相当 | `fold` |
| AA — facing raise → 3-bet | currentBet=30, player.bet=0 | `raise` |
| AKs — facing raise → 3-bet | currentBet=30, player.bet=0 | `raise` |
| KQs — facing raise、通常スタック → call | currentBet=30, player.bet=0, chips=990 | `call` |
| 72o — facing raise → fold | currentBet=30, player.bet=0 | `fold` |
| AA — facing reraise → raise（4-bet） | currentBet=90, player.bet=30 | `raise` |
| 72o — facing reraise → fold | currentBet=90, player.bet=30 | `fold` |
| AA — facing reraise、bbDepth<15 → allIn | currentBet=90, player.bet=30, chips=100 | `allIn` |
| KQo — facing reraise → fold | currentBet=90, player.bet=30 | `fold` |
| AA — squeeze spot（callers=1）→ raise | currentBet=30, caller 1 人 | `raise` |
| 72o — squeeze spot → fold | currentBet=30, caller 1 人 | `fold` |
| bbDepth < 15、AA — RFI → allIn | chips=100, bb=10 | `allIn` |
| bbDepth < 15、KQo — facing raise → fold | chips=140, bb=10, currentBet=30 | `fold` |
| numActive=6（6人卓）、BTN、JTo → fold（multiway タイト） | players x 6, JTo | `fold` |
| IP ブラフ 3-bet 頻度（KQs、BTN、facing raise）→ 10%–30% | N=300 | 確率検証 |
| BB — currentBet === bb → check | position=BB, currentBet=10 | `check` |
| BB — facing steal（currentBet=30）、KQs → call | position=BB, group=2 | `call` |

---

## 9. Out of Scope

- 4-bet pot での postflop 連動調整
- アンティありゲームでの戦略調整
- GTO 混合戦略のさらなる細分化（tier 4 以上）
- リンプ戦略（SB リンプ等）
- 3-bet / 4-bet 回数の厳密な区別（現実的には不要）
