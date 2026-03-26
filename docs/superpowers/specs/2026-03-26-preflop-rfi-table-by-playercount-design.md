# Preflop RFI Table by Player Count — Design Spec

**Date**: 2026-03-26
**Status**: Approved

## 問題

`preflopStrategy.ts` の RFI ロジックに二重補正バグがある。

- `OPEN_THRESHOLD` はすでに9人フルリング想定で設計されている（`GROUP_LABELS` に「後ろに8人」等と明記）
- しかし `decideRFI` 内でさらに `penaltyGroups = numActive - 3` のマルチウェイ補正を適用している
- 9人テーブルでは `penaltyGroups = 6` となり、全ポジションの `effectiveThreshold` が1になる
- 結果として、どのポジションでもグループ1（AA/KK/QQ/AKs/AKo）しか開けない

**観察された症状**:
- HJ で A9o（グループ3）をフォールド
- BTN で A8o（グループ5）が RFI しない

## 解決策

`OPEN_THRESHOLD` をプレイヤー数ごとのテーブルに拡張し、マルチウェイ補正ロジックを削除する。

## 設計

### データ定義

`preflopStrategy.ts` 内の `OPEN_THRESHOLD` を以下に置き換える：

```typescript
const OPEN_THRESHOLD_BY_COUNT: Record<number, Partial<Record<string, number>>> = {
  2: { BTN: 7, BB: 1 },
  3: { BTN: 7, SB: 7, BB: 1 },
  4: { BTN: 7, SB: 7, BB: 1, UTG: 5 },
  5: { BTN: 7, SB: 7, BB: 1, UTG: 4, CO: 6 },
  6: { BTN: 6, SB: 7, BB: 1, UTG: 3, HJ: 5, CO: 6 },
  7: { BTN: 6, SB: 7, BB: 1, UTG: 3, LJ: 4, HJ: 5, CO: 5 },
  8: { BTN: 6, SB: 7, BB: 1, UTG: 3, 'UTG+1': 3, LJ: 4, HJ: 4, CO: 5 },
  9: { BTN: 6, SB: 7, BB: 1, UTG: 2, 'UTG+1': 3, 'UTG+2': 3, LJ: 4, HJ: 4, CO: 5 },
};
```

しきい値の設計根拠（「後ろに何人いるか」に対応）：

| 後ろの人数 | しきい値 | 代表例 |
|---|---|---|
| 1人 | 7 | SB→BB、HU BTN |
| 2人 | 6-7 | 3人BTN |
| 3人 | 5-6 | 4人UTG、5人CO |
| 4-5人 | 4-5 | 6人HJ |
| 6-7人 | 3 | 6-7人UTG |
| 8人 | 2 | 9人UTG |

### ロジック変更

`decideRFI` 関数を以下のように変更する：

**削除**:
```typescript
// 削除するコード
const penaltyGroups = Math.max(0, numActive - 3);
const threshold = OPEN_THRESHOLD[position] ?? 2;
const effectiveThreshold = Math.max(1, threshold - penaltyGroups);
```

**置き換え**:
```typescript
// 新しいコード
const thresholdTable = OPEN_THRESHOLD_BY_COUNT[numActive] ?? OPEN_THRESHOLD_BY_COUNT[9];
const effectiveThreshold = thresholdTable[position] ?? 2;
```

### 関数シグネチャの変更

`decideRFI` に渡している `numActive` は引き続き使用するため、シグネチャは変更不要。

## スコープ

- **変更対象**: `src/bot/strategy/preflopStrategy.ts` のみ
- **変更しない**: `preflopData.ts`（マトリクスデータはそのまま）、他の戦略ファイル
- **削除**: `OPEN_THRESHOLD`（旧テーブル）、マルチウェイ補正ロジック

## テスト

既存テスト `tests/bot/preflopStrategy.test.ts` を更新する：

- 9人テーブルでの各ポジション動作（既存テストの期待値を確認）
- HJ で A9o（グループ3）が RFI すること（バグ再現ケース）
- BTN で A8o（グループ5）が RFI すること（バグ再現ケース）
- 2人テーブルで BTN がグループ7まで RFI すること
- 4人テーブルで UTG がグループ5まで RFI すること
