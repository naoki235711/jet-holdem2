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
            └─ selectAction(equity, potOdds, boardTexture, isIP, spr)
```

`position` は `isIP: boolean` で表現する（IPなら `true`）。

---

## 3. エクイティ計算（`equityCalculator.ts`）

### インターフェース

```typescript
export function estimateEquity(
  holeCards: Card[],
  community: Card[],
  numOpponents: number,
  numSimulations: number = 5000
): number  // 0.0 〜 1.0
```

**`numOpponents` の定義:** `gameState.players` のうち `status === 'active' || status === 'allIn'` のプレイヤー数からBot自身を除いた値。フォールドまたはアウトのプレイヤーは含めない。

### アルゴリズム（モンテカルロ）

1. 残デッキを構築（52枚 − holeCards − community）
2. N回シミュレーション:
   - 残デッキをFisher-Yatesシャッフル
   - 各相手に2枚ずつ配る
   - コミュニティを5枚まで補完する:
     - `community.length === 5`（リバー）の場合はランアウトをスキップ
     - `community.length === 4`（ターン）の場合は1枚追加
     - `community.length === 3`（フロップ）の場合は2枚追加
   - 全員の7枚（holeCards[2] + community[5]）を既存の `evaluate7Cards()` で評価
   - ヒーローが勝ち or 引き分けならカウント
3. `wins / N` を返す

**オールイン相手のカード近似:** オールインしている相手の実際のホールカードは非公開のため、シミュレーションでは残デッキ（コミュニティのみ除外）からランダムにサンプリングする。実際には相手のホールカードが残デッキに存在しないため重複する可能性があるが、この近似は標準誤差と同程度の影響しか持たないため許容する。

**リバーの非効率性:** `community.length === 5` の場合、エクイティは決定的（ランダム要素ゼロ）なため500回シミュレーションは冗長となる。現実装では同じ結果をN回計算する既知の非効率性として受け入れ、将来の最適化課題とする（Section 8 参照）。

### パフォーマンス目安（iPhone 15基準）

| シミュレーション数 | 所要時間 | 精度（標準誤差）※ |
|-----------------|---------|----------------|
| 200回 | ~10ms | ±3.5% |
| 500回 | ~25ms | ±2.2% |
| 1000回 | ~50ms | ±1.6% |
| 5000回 | ~250ms | ±0.7% |

※ 標準誤差は `p=0.5` のベルヌーイ分布における最大値 `sqrt(p(1-p)/n)`。エクイティが偏っている場合（例: 0.9）は実際の誤差はこれより小さい。

**制約:** iPhone 15で400ms以内。デフォルト5000回（推定~250ms、余裕あり）。外部ライブラリ依存なし。

---

## 4. ボードテクスチャ判定

```typescript
type BoardTexture = 'dry' | 'wet';

export function detectBoardTexture(community: Card[]): BoardTexture
```

| 条件 | テクスチャ |
|------|----------|
| モノトーン（3枚以上同スート） | `wet` |
| コネクテッド（**厳密に**連続する3枚のランクが存在） | `wet` |
| それ以外 | `dry` |

**連続判定の簡略化:** ガットショットドロー（例: 8-9-J）やワンギャップコネクター（例: 7-9-T）はストレートドローとして強いボードだが、実装の複雑さを避けるため `dry` として扱う。この簡略化は意図的な近似であり、将来のチューニング課題とする。

`wet` ボードではピュアブラフ頻度を半分に下げる（後述）。

---

## 5. アクション判断ロジック（`postflopStrategy.ts`）

### ヘルパー

```typescript
function calcPotOdds(callAmount: number, pot: number): number {
  // callAmount / (pot + callAmount) = 標準ポットオッズ（全投資額に対する割合）
  return callAmount / (pot + callAmount);
}

function calcSPR(botChips: number, gameState: GameState, botSeat: number): number {
  // effectiveStack = bot chips vs 相手の中で最大チップ数（非フォールド・非アウト）
  const opponentChips = gameState.players
    .filter(p => p.seat !== botSeat && p.status !== 'out' && p.status !== 'folded')
    .map(p => p.chips);
  if (opponentChips.length === 0) return Infinity; // アクティブな相手なし → SPR未定義、deep扱い
  const effectiveStack = Math.min(botChips, Math.max(...opponentChips));
  const totalPot = gameState.pots.reduce((sum, p) => sum + p.amount, 0);
  return effectiveStack / totalPot;
}
```

### ベット直面時（`currentBet > botBet`）

| 優先順位 | 条件 | アクション |
|---------|------|-----------|
| 1 | SPR < 2 かつ equity > 0.50 | **All-in** |
| 2 | equity > 0.70 かつ OOP かつ `random < 0.3` | **レイズ**（OOP再レイズ） |
| 3 | equity > 0.70 かつ レイズ可能 | **レイズ**（pot × 0.75） |
| 4 | equity > potOdds | **コール** |
| 5 | equity < 0.25 かつ IP かつ `random < 0.15` | **レイズ**（ブラフ） |
| 6 | その他 | **フォールド** |

> **優先順位 2 について:** OOP でレイズ（再レイズ）するケースを、一般的なバリューレイズ（優先順位 3）より先に評価する。これによりOOP強ハンドで30%の確率で再レイズが選択される。ベット直面時に「チェックしてから再レイズ」（チェックレイズ）は単一の `decide()` 呼び出しでは実現できないため、ここでは再レイズとして表現する。

### チェック可能時（`currentBet === 0`）

| 優先順位 | 条件 | アクション |
|---------|------|-----------|
| 1 | SPR < 2 かつ equity > 0.50 | **All-in** |
| 2 | equity > 0.65 かつ OOP かつ `random < 0.3` | **チェック**（チェックレイズ待ち） |
| 3 | equity > 0.65 | **ベット**（pot × 0.75） |
| 4 | equity > 0.45 | **ベット**（pot × 0.5） |
| 5 | equity > 0.30 かつ IP かつ `random < 0.4` | **ベット**（pot × 0.5、セミブラフ） |
| 6 | equity < 0.25 かつ IP かつ ドライボード かつ `random < 0.2` | **ベット**（pot × 0.5、ピュアブラフ） |
| 6' | equity < 0.25 かつ IP かつ ウェットボード かつ `random < 0.1` | **ベット**（pot × 0.5、ピュアブラフ頻度半減） |
| 7 | その他 | **チェック** |

> **優先順位 2 について:** equity > 0.65 + OOP のケースを、一般的なベット（優先順位 3）より先に評価する。強ハンドをOOPで30%の確率でチェックすることで、相手のベットを誘うチェックレイズラインを作る。次の `decide()` 呼び出しで相手がベットしていれば優先順位2（OOP再レイズ）が適用される。

> **セミブラフ（優先順位 5）とピュアブラフ（優先順位 6/6'）の非対称性:** セミブラフはウェットボードでも equity > 0.30 のドローアウトがあるため頻度を下げない。ピュアブラフ（equity < 0.25）はウェットボードでは相手のレンジが強く連結しているためフォールドエクイティが低く、頻度を半減する。

### ベットサイズ補正

- 計算されたベット額が `getMinRaiseSize()` 未満の場合は切り上げ
- 計算されたベット額がスタックを超える場合は All-in

---

## 6. ポジション判定

既存設計（`2026-03-24-bot-player-design.md` Section 5）を継承：

- **IP（`isIP = true`）**: BotのseatがディーラーからBB方向で最後にアクションする
- **OOP（`isIP = false`）**: それ以外

---

## 7. テスト方針

### `equityCalculator.test.ts`

- **AA vs 1相手（フロップ）:** equity > 0.75
- **72o vs 1相手（フロップ）:** equity < 0.40
- **ナッツフラッシュ（リバー確定）:**
  ```
  holeCards: ['Ah', 'Kh'], community: ['Qh', 'Jh', '2h', '5d', '8c']
  → equity === 1.0（5枚確定、ランアウトなし）
  ```
- **再現性:** `numSimulations = 1000` で標準誤差 < 0.025

### `postflopStrategy.test.ts`

- **Strong hand（フロップ、チェック可能、IP）** → ベット
- **Strong hand（フロップ、チェック可能、OOP）** → チェックまたはベット（30%でチェック）
- **Weak hand（フロップ、ベット直面、ポットオッズ > エクイティ）** → フォールド
- **SPR < 2 + equity > 0.50 + ベット直面** → All-in
- **IP + equity < 0.25 + ドライボード（確率的テスト）** → ベット確率 ≈ 20%
- **OOP + equity < 0.25 + チェック可能** → チェック（ブラフしない）

---

## 8. Out of Scope（将来対応）

- vs 3ベット / 4ベット プリフロップ改善
- マルチウェイポット対応（現在は全相手を1人として計算）
- リバーでの決定的エクイティ計算（現状はN回同一計算の非効率実装）
- ターン・リバーでの異なるエクイティ閾値チューニング
- ガットショット/ワンギャップコネクターのウェットボード判定
- ブラフ頻度のUI調整
- CFR事前計算テーブル（レベルC完全達成）
