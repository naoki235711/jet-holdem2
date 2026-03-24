# Bot Postflop Enhancement — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Parent spec:** `docs/superpowers/specs/2026-03-24-bot-player-design.md`

---

## 1. Overview

既存の `postflopStrategy.ts`（ルールベース・ハンド強度分類）を、**モンテカルロ エクイティ計算**ベースの判断に置き換える。さらに**拡張ルール**（チェックレイズ・セミブラフ・ボードテクスチャ考慮）を組み合わせ、中級者を安定して倒せる強度を目指す。

**目標強度:** 中級者に安定勝利（レベルB）、GTOに近い判断（レベルCへの基盤）

**制約:** 完全オフライン動作（機内モード）、iPhoneで許容できるレスポンス（既存の1秒ディレイ内に収める）

---

## 2. アーキテクチャ

### 変更・追加ファイル

| 操作 | ファイル | 内容 |
|------|---------|------|
| 新規作成 | `src/bot/equity/equityCalculator.ts` | モンテカルロ エクイティ計算 |
| 修正 | `src/bot/strategy/postflopStrategy.ts` | エクイティベース判断に全面置き換え |
| 新規作成 | `tests/bot/equityCalculator.test.ts` | エクイティ計算ユニットテスト |
| 修正 | `tests/bot/postflopStrategy.test.ts` | 新ロジックに合わせてテスト更新 |

`BotPlayerService.ts` および `preflopStrategy.ts` は変更なし。

### 呼び出しフロー

```
decide(ctx)
  └─ phase !== 'preflop'
       └─ decidePostflopAction(gameState, holeCards, seat)
            ├─ estimateEquity(holeCards, community, numOpponents)
            ├─ calcPotOdds(callAmount, pot)
            ├─ detectBoardTexture(community)
            └─ selectAction(equity, potOdds, boardTexture, position, spr)
```

---

## 3. エクイティ計算（`equityCalculator.ts`）

### インターフェース

```typescript
export function estimateEquity(
  holeCards: Card[],
  community: Card[],
  numOpponents: number,
  numSimulations: number = 500
): number  // 0.0 〜 1.0
```

### アルゴリズム（モンテカルロ）

1. 残デッキを構築（52枚 − holeCards − community）
2. N回シミュレーション:
   - 残デッキをFisher-Yatesシャッフル
   - 各相手に2枚ずつ配る
   - コミュニティを5枚まで補完（フロップなら+2枚、ターンなら+1枚）
   - 全員の7枚を既存の `evaluate7Cards()` で評価
   - ヒーローが勝ち or 引き分けならカウント
3. `wins / N` を返す

### パフォーマンス目安（iPhone）

| シミュレーション数 | 所要時間 | 精度（標準誤差） |
|-----------------|---------|----------------|
| 200回 | ~10ms | ±3.5% |
| 500回 | ~25ms | ±2.2% |
| 1000回 | ~50ms | ±1.6% |

デフォルト500回。既存の1秒ディレイ内に十分収まる。外部ライブラリ依存なし。

---

## 4. ボードテクスチャ判定

```typescript
type BoardTexture = 'dry' | 'wet';

export function detectBoardTexture(community: Card[]): BoardTexture
```

| 条件 | テクスチャ |
|------|----------|
| モノトーン（3枚以上同スート） | `wet` |
| コネクテッド（連続する3枚が存在） | `wet` |
| それ以外 | `dry` |

`wet` ボードではピュアブラフ頻度を半分に下げる（後述）。

---

## 5. アクション判断ロジック（`postflopStrategy.ts`）

### ヘルパー

```typescript
function calcPotOdds(callAmount: number, pot: number): number {
  return callAmount / (pot + callAmount);
}

function calcSPR(botChips: number, maxOpponentChips: number, pot: number): number {
  return Math.min(botChips, maxOpponentChips) / pot;
}
```

### ベット直面時（`currentBet > botBet`）

| 優先順位 | 条件 | アクション |
|---------|------|-----------|
| 1 | SPR < 2 かつ equity > 0.50 | **All-in** |
| 2 | equity > 0.70 かつ レイズ可能 | **レイズ**（pot × 0.75） |
| 3 | equity > 0.70 かつ OOP かつ `random < 0.3` | **レイズ**（チェックレイズ） |
| 4 | equity > potOdds | **コール** |
| 5 | equity < 0.25 かつ IP かつ `random < 0.15` | **レイズ**（ブラフ） |
| 6 | その他 | **フォールド** |

### チェック可能時（`currentBet === 0`）

| 優先順位 | 条件 | アクション |
|---------|------|-----------|
| 1 | SPR < 2 かつ equity > 0.50 | **All-in** |
| 2 | equity > 0.65 | **ベット**（pot × 0.75） |
| 3 | equity > 0.65 かつ OOP かつ `random < 0.3` | **チェック**（チェックレイズ待ち） |
| 4 | equity > 0.45 | **ベット**（pot × 0.5） |
| 5 | equity > 0.30 かつ IP かつ `random < 0.4` | **ベット**（pot × 0.5、セミブラフ） |
| 6 | equity < 0.25 かつ IP かつ ドライボード かつ `random < 0.2` | **ベット**（pot × 0.5、ピュアブラフ） |
| 6' | equity < 0.25 かつ IP かつ ウェットボード かつ `random < 0.1` | **ベット**（pot × 0.5、ピュアブラフ、頻度半減） |
| 7 | その他 | **チェック** |

> **注:** 優先順位3（チェックレイズ待ち）は優先順位2の前に評価する。equity > 0.65 + OOP + 確率条件を満たした場合のみ、強い手を持ちながらあえてチェックする。

### ベットサイズ補正

- 計算されたベット額が `getMinRaiseSize()` 未満の場合は切り上げ
- 計算されたベット額がスタックを超える場合は All-in

---

## 6. ポジション判定

既存設計（`2026-03-24-bot-player-design.md` Section 5）を継承：

- **IP (In Position)**: BotのseatがディーラーからBB方向で最後にアクションする
- **OOP (Out of Position)**: それ以外

---

## 7. テスト方針

### `equityCalculator.test.ts`

- AA vs ランダムハンド（フロップ）: equity > 0.75 を期待
- 72o vs ランダムハンド（フロップ）: equity < 0.40 を期待
- ナッツフラッシュ（5枚コミュ確定）: equity ≈ 1.0
- 再現性: `numSimulations = 1000` で標準誤差 < 0.025

### `postflopStrategy.test.ts`

- Strong hand（AA、フロップ） + チェック可能 → ベットまたはチェック（レイズ待ち）
- Weak hand（72o、フロップ） + ベット直面 → フォールド（ポットオッズ < エクイティ）
- SPR < 2 + equity > 0.50 → All-in
- IP + Air + ドライボード → 20%でブラフベット（確率的テスト）
- OOP + Strong + チェック可能 → 30%でチェック（確率的テスト）

---

## 8. Out of Scope（将来対応）

- vs 3ベット / 4ベット プリフロップ改善
- マルチウェイポット対応（現在は全相手を1人として計算）
- ターン・リバーでの異なるエクイティ閾値チューニング
- ブラフ頻度のUI調整
- CFR事前計算テーブル（レベルC完全達成）
