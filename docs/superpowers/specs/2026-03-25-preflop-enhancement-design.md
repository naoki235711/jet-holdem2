# Preflop Enhancement — Design Spec

**Date:** 2026-03-25
**Status:** Approved

---

## 0. Overview

`preflopStrategy.ts` をシナリオ分離型アーキテクチャに書き換え、以下を追加する：

| 機能 | 現状 | 改善後 |
|------|------|--------|
| 4-bet レンジ | なし（3-betされたら常にコール or フォールド） | AA/KK/AKs → 4-bet |
| スタック深さ考慮 | なし | < 15BB はプッシュ/フォールド、< 30BB はコールなし |
| BB ディフェンス | 常にチェック | ブラインドスチールに対して適切なコール/3-bet |
| スクイーズ | なし | レイザー＋コーラー存在時に group 1 以下でスクイーズ |
| マルチウェイ RFI 調整 | なし | 参加者数に応じてレンジを絞る |
| ブラフ 3-bet | なし | IP で group 2-3 のときに 20% 確率でブラフ 3-bet |

**前提:** 既存の `preflopData.ts`（MATRIX, getGroup, getFreqTier）はそのまま使用する。公開シグネチャ `decidePreflopAction(state, holeCards, seat)` は不変。

---

## 1. アーキテクチャ

### シナリオ分離型の構造

```
decidePreflopAction(state, holeCards, seat)
  ↓
detectPreflopScenario()  →  'rfi' | 'facing-raise' | 'squeeze' | 'facing-3bet' | 'facing-4bet'
  ↓ 分岐
decideRFI(group, freqTier, position, bbDepth, numActive)
decideFacingRaise(group, freqTier, position, bbDepth, isIP)
decideSqueezeOrFold(group, numCallers, bbDepth)
decideFacing3Bet(group, bbDepth)
decideFacing4Bet(group)
```

全関数は純粋関数（GameState, holeCards から計算済みパラメータのみ受け取る）。

### ヘルパー関数（新規）

| 関数 | 役割 |
|------|------|
| `calcBBDepth(player, state)` | プレイヤーのチップを BB 換算した effective stack depth |
| `detectPreflopScenario(state, seat)` | 現在のプリフロップシナリオを判定 |
| `countRaisersAndCallers(state, seat)` | 自分以外の raisers 数・callers 数を返す |

既存の `getPosition()` と `makeRaise()` は保持。`getPosition()` は変更なし。

---

## 2. シナリオ検出

`detectPreflopScenario(state, seat)` の判定ロジック：

```
1. currentBet <= bb  →  'rfi'
2. currentBet > bb かつ:
   a. 自分が既にベット済み（player.bet > bb かつ currentBet > player.bet）  →  'facing-3bet'
   b. 自分が 3-bet 済み（player.bet > currentBet の前段）かつ さらにレイズ  →  'facing-4bet'
   c. callers >= 1（コーラーが 1 人以上いる）  →  'squeeze'
   d. それ以外（raiser のみ）  →  'facing-raise'
```

**facing-3bet / facing-4bet の判別：**
- `player.bet === 0` かつ `currentBet > bb` → facing-raise または squeeze
- `player.bet > 0` かつ `player.bet < currentBet` → facing a re-raise（3-bet or 4-bet）
- 簡略化のため：facing-3bet と facing-4bet を統合して `decideFacing3BetOrMore()` とし、group と bbDepth のみで判断する（実装の単純化のため）

---

## 3. 各シナリオのロジック

### 3-1. RFI（`decideRFI`）

```
bbDepth < 15（ショートスタック）:
  group <= 2  →  allIn
  else        →  fold

通常スタック（bbDepth >= 15）:
  multiway 補正: threshold = OPEN_THRESHOLD[position] - max(0, numActive - 2 - 1)
  （numActive が 3 以上の場合、1 人増えるごとに閾値を 1 下げる。最低 1）

  group > threshold  →  fold
  group <= threshold:
    raiseProb = tier1: 1.0 / tier2: 0.87 / tier3: 0.62
    Math.random() < raiseProb  →  raise(bb * 3)
    else                       →  fold

BB 特殊: position === 'BB' かつ currentBet === bb（全員コール or チェック）→ check
  ※ BB vs スチール（currentBet > bb）は facing-raise として処理
```

### 3-2. Facing Raise（`decideFacingRaise`）

```
bbDepth < 15:
  group <= 1  →  allIn（3-bet/プッシュ）
  else        →  fold

bbDepth < 30:
  group <= 1  →  raise(currentBet * 3)（3-bet）
  else        →  fold  ※ コールなし（ショートスタックはコールしない）

通常スタック（bbDepth >= 30）:
  group <= 1   →  raise(currentBet * 3)（バリュー 3-bet）
  group 2–3 + IP + Math.random() < 0.20  →  raise(currentBet * 3)（ブラフ 3-bet）
  group 2–4   →  call
  group >= 5  →  fold
```

**IP 判定：** `getPosition()` を利用し、BTN/CO/HJ → IP とみなす。SB/UTG 系 → OOP。

### 3-3. Squeeze（`decideSqueezeOrFold`）

レイザー＋コーラーが存在する状況（ポットが大きい）：

```
group <= 1   →  raise(currentBet * 3.5)（バリュースクイーズ）
group 2–3 + numCallers === 1 + Math.random() < 0.25  →  raise(currentBet * 3.5)（スクイーズブラフ）
それ以外    →  fold
```

コーラーが多いほどスクイーズブラフは控える（numCallers >= 2 の場合はブラフなし）。

### 3-4. Facing 3-bet or More（`decideFacing3BetOrMore`）

```
bbDepth < 15:
  group === 0（AA/KK のみ）  →  allIn
  else                        →  fold

通常スタック:
  group === 0（AA/KK）         →  raise(currentBet * 2.5)（4-bet）
  group <= 1（AKs/QQ）  + bbDepth >= 40  →  call
  それ以外                     →  fold
```

---

## 4. スタック深さ基準

`calcBBDepth(player, state)` = `player.chips / state.blinds.bb`

| BBDepth | モード |
|---------|--------|
| < 15 BB | プッシュ/フォールドのみ |
| 15–29 BB | 3-bet or fold（コールなし） |
| ≥ 30 BB | 通常プレイ |
| ≥ 40 BB | facing-3bet でのコール許可 |

---

## 5. マルチウェイ RFI 補正

`numActive` = ゲームに参加中のプレイヤー数（`status !== 'out'`）

```
penaltyGroups = max(0, numActive - 3)
effectiveThreshold = max(1, OPEN_THRESHOLD[position] - penaltyGroups)
```

例：6人テーブル（numActive=6）BTN（threshold=6） → penaltyGroups=3 → effective=3

---

## 6. グループ 0 の定義

`group === 0` は matrix 値が `0`（フォールド専用ハンド）。
ただし group 定義として：
- **group 0** 専用ハンド（72o 等、matrix = 0 のもの）→ 常時フォールド（現状維持）
- **group 1 以下** は AA/KK/AKs/QQ レベルのプレミアムハンド（matrix group 1）
- 本スペックで「group === 0」と記載する箇所は **matrix value === 0 のハンド** を指す
- 「group <= 1」は **matrix getGroup() が 1 以下（プレミアム）** を指す

---

## 7. ファイルマップ

| Action | Path | 内容 |
|--------|------|------|
| Modify | `src/bot/strategy/preflopStrategy.ts` | シナリオ分離型に全面置き換え |
| Modify | `tests/bot/preflopStrategy.test.ts` | 新ロジックに合わせてテスト更新・追加 |

---

## 8. テスト方針

TDD で実装する（テスト先行）。既存テストを更新し、以下を追加：

| テストケース | 期待値 |
|-------------|--------|
| AA — 全ポジションで RFI → raise or allIn | `raise` \| `allIn` |
| 72o — UTG で RFI → fold | `fold` |
| AA — facing raise → raise（3-bet） | `raise` |
| AKs — facing raise → raise（3-bet） | `raise` |
| KQs — facing raise、通常スタック → call | `call` |
| 72o — facing raise → fold | `fold` |
| AA — facing 3-bet → raise（4-bet） | `raise` |
| 72o — facing 3-bet → fold | `fold` |
| AA — facing 4-bet（3-bet済み） → allIn | `allIn` |
| KQo — facing 4-bet → fold | `fold` |
| AA — squeeze spot → raise | `raise` |
| 72o — squeeze spot → fold | `fold` |
| bbDepth < 15、AA → allIn | `allIn` |
| bbDepth < 15、KQo → fold | `fold` |
| bbDepth < 30、KQs — facing raise → fold（コールなし） | `fold` |
| numActive=6（6人卓）、BTN、中程度ハンド → fold（multiway タイト） | `fold` |
| IP ブラフ 3-bet 頻度（group2-3）→ 10%–30% の範囲 | 確率検証（N=300） |
| BB — currentBet === bb → check | `check` |
| BB — currentBet > bb（スチール） → call or raise（ディフェンス） | `call` \| `raise` |

---

## 9. Out of Scope

- 4-bet pot での postflop 連動調整
- アンティありゲームでの戦略調整
- GTO 混合戦略のさらなる細分化（tier 4 以上）
- リンプ戦略（SB リンプ等）
