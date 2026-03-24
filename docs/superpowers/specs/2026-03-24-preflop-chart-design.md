# Preflop RFI Chart — Design Spec

**Date:** 2026-03-24
**Status:** Approved

---

## 0. Data Fix — このリビジョンで変更したもの

このスペックは初期実装設計 + データ修正の両方を含む。セクション 1–4 は実装済みの構造（変更なし）。**本リビジョンの変更は `preflopData.ts` のデータのみ**:

| 変更対象 | 内容 |
|---------|------|
| `MATRIX` (13×13) | GTO Wizard 9-max 100BB データに基づいて全値を修正 |
| `GROUP_LABELS` | ポジション名を GTO Wizard の定義（UTG/UTG1+UTG2/LJ+HJ 等）に合わせて更新 |
| `FOLD_COLOR` | 変更なし（既存値を保持） |
| コンポーネント構造 | 変更なし |

### Group 1 vs Group 2 の分割基準

GTO Wizard の UTG レンジ（88+、Axスーテッド各種、AJo+/KQo）を2段階に分割:
- **UTG Strong (group 1)**: UTGプレミアムレンジ = QQ/KK/AA + AKs/AQs + AKo のみ（≈5%）。最強のUTGオープンハンドで全ポジションで必ずレイズ。
- **UTG (group 2)**: スタンダードUTGレンジ = JJ/TT/99/88 + AJs/ATs/A9s(97%)/KQs/KJs/KTs(93%) + AQo/AJo/KQo(70%)。GTOがUTGからレイズ推奨するがプレミアムより一段下。

注: Group 2 は UTG レンジのハンドであり、UTG1 のみのハンドではない。UTG1 の追加ハンド（77/QJs/ATo）は group 3（UTG1+UTG2 マージ）に入る。

### 主な修正例（旧 → 新）

| ハンド | 旧 | 新 | 理由 |
|-------|----|----|------|
| 99 / 88 | `31` (group 3) | `21` (group 2) | 旧設計でUTG2扱いだったがUTGレンジのハンド |
| A9s | `32` (group 3, 75-99%) | `22` (group 2, 75-99%) | UTGの97%ハンド → group 2 |
| KTs | `32` (group 3, 75-99%) | `22` (group 2, 75-99%) | UTGの93%ハンド → group 2 |
| ATo | `41` (group 4) | `32` (group 3, 75-99%) | UTG2の99%ハンド → group 3 |
| K8s–K6s | `51` (group 5) | `61` (group 6) | BTNハンド → group 6 |
| QTo | `0` (fold) | `61` (group 6) | BTNハンド (漏れ修正) |
| 22 | `71` (group 7) | `51` (group 5) | COハンド → group 5 |

---

## 1. Overview

ゲーム画面にボタン一つで全画面モーダルとして表示できるプリフロップ RFI (Raise First In) チャートを追加する。

**条件:** 9-max, 100BB, no ante, no rake
**データソース:** GTO Wizard (v2 solver, 100BB 9-max)
**スコープ:** RFI のみ (vs RFI は将来対応)

---

## 2. Data Structure

### ファイル: `src/components/preflop/preflopData.ts`

#### エンコーディング

```
cell value = group * 10 + freqTier
```

| 値 | 意味 |
|----|------|
| `0` | フォールド |
| tens digit 1–7 | グループ (最初にオープンできるポジション) |
| units digit 1 | 100% (ソリッドレイズ) |
| units digit 2 | 75–99% (混合: 軽インジケーター) |
| units digit 3 | 50–74% (混合: 強インジケーター) |

例: `32` = グループ3 (UTG+1/+2)、75–99%の頻度

#### グループ定義

| グループ | ポジション | 後ろの人数 | カラー |
|---------|-----------|-----------|--------|
| 1 | UTG Strong | 後ろに8人 (premium) | `#B91C1C` Deep Crimson |
| 2 | UTG | 後ろに8人 | `#DC6B20` Burnt Orange |
| 3 | UTG1+UTG2 | 後ろに6・7人 | `#CA8A04` Dark Gold |
| 4 | LJ+HJ | 後ろに4・5人 | `#16A34A` Emerald |
| 5 | CO | 後ろに3人 | `#0D9488` Teal Green |
| 6 | BTN | 後ろに2人 | `#3B82F6` Vivid Blue |
| 7 | SB | 後ろに1人 | `#7C3AED` Violet |

#### 13×13 マトリックス

行 = 第1ランク (高い方)、列 = 第2ランク。順: A K Q J T 9 8 7 6 5 4 3 2
- 対角: ペア
- 右上三角: スーテッド (`i < j`)
- 左下三角: オフスーツ (`i > j`)

```typescript
// src/components/preflop/preflopData.ts
export const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'] as const;

export const MATRIX: number[][] = [
//   A    K    Q    J    T    9    8    7    6    5    4    3    2
  [ 11,  11,  11,  21,  21,  22,  32,  42,  41,  43,  41,  42,  51], // A
  [ 11,  11,  21,  21,  22,  41,  61,  62,  63,  71,  71,  71,  71], // K
  [ 21,  23,  11,  31,  31,  42,  62,  71,  71,  71,  71,  71,  71], // Q
  [ 21,  41,  51,  21,  31,  42,  62,  71,  71,  71,   0,   0,   0], // J
  [ 32,  51,  61,  62,  21,  41,  62,  71,  71,   0,   0,   0,   0], // T
  [ 33,  71,  71,  71,  71,  21,  62,  71,  71,   0,   0,   0,   0], // 9
  [ 51,  71,  71,  72,  71,  72,  21,  71,  71,   0,   0,   0,   0], // 8
  [ 51,  71,  72,   0,   0,   0,   0,  33,  71,  71,   0,   0,   0], // 7
  [ 61,  71,   0,   0,   0,   0,   0,   0,  31,  71,   0,   0,   0], // 6
  [ 61,  71,   0,   0,   0,   0,   0,   0,   0,  41,  71,   0,   0], // 5
  [ 61,  71,   0,   0,   0,   0,   0,   0,   0,   0,  41,   0,   0], // 4
  [ 61,  71,   0,   0,   0,   0,   0,   0,   0,   0,   0,  43,   0], // 3
  [ 61,  71,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  51], // 2
];

export const GROUP_COLORS: Record<number, string> = {
  1: '#B91C1C',
  2: '#DC6B20',
  3: '#CA8A04',
  4: '#16A34A',
  5: '#0D9488',
  6: '#3B82F6',
  7: '#7C3AED',
};

export const GROUP_LABELS: Record<number, string> = {
  1: 'UTG Strong (後ろに8人 premium)',
  2: 'UTG (後ろに8人)',
  3: 'UTG1+UTG2 (後ろに6・7人)',
  4: 'LJ+HJ (後ろに4・5人)',
  5: 'CO (後ろに3人)',
  6: 'BTN (後ろに2人)',
  7: 'SB (後ろに1人)',
};

export const FOLD_COLOR = '#1E293B';

export const getGroup = (v: number): number => Math.floor(v / 10);
export const getFreqTier = (v: number): number => v % 10;
```

---

## 3. Component Architecture

### ファイル構成

```
src/components/preflop/
  ├── preflopData.ts          (データ・ヘルパー)
  ├── PreflopGrid.tsx         (13×13グリッド)
  └── PreflopChartModal.tsx   (フルスクリーンモーダル)
```

### PreflopChartModal

```typescript
// src/components/preflop/PreflopChartModal.tsx
interface Props {
  visible: boolean;
  onClose: () => void;
}
```

- React Native `Modal` (full screen, `animationType="slide"`)
- 背景色: `#0F0F1A`
- ヘッダー: タイトル "Preflop RFI Chart" + 右上 × ボタン
- サブタイトル: "9-max · 100BB · No Ante · RFI Only"
- カラーレジェンド (7グループ + fold): 横スクロール不要の2行グリッド
- `PreflopGrid` を内包

### PreflopGrid

```typescript
// src/components/preflop/PreflopGrid.tsx
// Props なし (preflopData.ts を直接 import)
```

- 行/列ヘッダー (A K Q J T 9 8 7 6 5 4 3 2)
- 13×13 セルを `View` + `map` でレンダリング (FlatList 不要)
- セルは正方形、小さめフォント

### セル表示

| freqTier | 表示 |
|----------|------|
| 0 (fold) | 背景 `#1E293B`、テキスト `#374151` |
| 1 (100%) | グループ色 solid、白テキスト |
| 2 (75–99%) | グループ色 + 右上に白い小丸 (●) |
| 3 (50–74%) | グループ色 薄め (opacity 0.6) + 右上に白い小丸 |

ラベル例:
- 対角: `"AA"`, `"KK"` ... `"22"`
- 右上 (suited): `"AKs"`, `"T8s"`
- 左下 (offsuit): `"AKo"`, `"KQo"`

---

## 4. Game Screen Integration

### ファイル: `app/game.tsx`

`GameView` コンポーネントに以下を追加:

```typescript
const [showChart, setShowChart] = useState(false);
```

JSX に追加:
```tsx
{/* 既存コンテンツ */}
<DebugInfoBar />
<TableLayout />
<ActionButtons />
<ResultOverlay />

{/* 追加 */}
<TouchableOpacity
  style={styles.chartButton}
  onPress={() => setShowChart(true)}
>
  <Text style={styles.chartButtonText}>RFI</Text>
</TouchableOpacity>
<PreflopChartModal visible={showChart} onClose={() => setShowChart(false)} />
```

ボタンスタイル (absolute、右下固定):
```typescript
chartButton: {
  position: 'absolute',
  bottom: 80,   // ActionButtons より上
  right: 12,
  backgroundColor: '#1E3A5F',
  borderRadius: 6,
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderWidth: 1,
  borderColor: '#3B82F6',
},
chartButtonText: {
  color: '#3B82F6',
  fontSize: 11,
  fontWeight: '700',
  letterSpacing: 1,
},
```

---

## 5. Out of Scope (将来対応)

- vs RFI チャート (3bet/call/fold)
- BTB (ボタン対ブラインド) 特化表示
- アニメーション・ハイライト
- ハンド入力による自動ハイライト
