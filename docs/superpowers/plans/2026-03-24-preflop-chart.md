# Preflop RFI Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ゲーム画面にボタン一つで表示できる 9-max 100BB RFI プリフロップチャートモーダルを追加する。

**Architecture:** 3 層構成。純粋データモジュール (`preflopData.ts`) が 13×13 マトリックスとヘルパー関数を提供し、`PreflopGrid` がグリッドをレンダリング、`PreflopChartModal` が React Native Modal でラップする。`app/game.tsx` の `GameView` に常時表示の "RFI" ボタンを追加してモーダルを開く。

**Tech Stack:** React Native, TypeScript, `@testing-library/react-native`, Jest (ui project)

---

## File Map

| ファイル | 操作 | 責務 |
|---------|------|------|
| `src/components/preflop/preflopData.ts` | 新規作成 | 13×13 エンコード済みマトリックス、グループカラー/ラベル、ヘルパー関数 |
| `src/components/preflop/PreflopGrid.tsx` | 新規作成 | 13×13 セルグリッド (ランクヘッダー含む)、ラベル・色・freqTier インジケーター |
| `src/components/preflop/PreflopChartModal.tsx` | 新規作成 | React Native Modal ラッパー、タイトルバー、レジェンド、× ボタン |
| `app/game.tsx` | 修正 | "RFI" ボタン追加、showChart state、PreflopChartModal 組み込み |
| `tests/ui/components/preflopData.test.ts` | 新規作成 | データ構造・エンコーディングのユニットテスト |
| `tests/ui/components/PreflopGrid.test.tsx` | 新規作成 | セルラベル・色のレンダリングテスト |
| `tests/ui/components/PreflopChartModal.test.tsx` | 新規作成 | 表示/非表示・onClose のテスト |

---

## Task 1: Data Module

**Files:**
- Create: `src/components/preflop/preflopData.ts`
- Test: `tests/ui/components/preflopData.test.ts`

- [ ] **Step 1: テストファイルを作成して失敗させる**

```typescript
// tests/ui/components/preflopData.test.ts
import {
  MATRIX,
  RANKS,
  GROUP_COLORS,
  GROUP_LABELS,
  getGroup,
  getFreqTier,
} from '../../../src/components/preflop/preflopData';

describe('preflopData', () => {
  describe('getGroup', () => {
    it('extracts tens digit', () => {
      expect(getGroup(11)).toBe(1);
      expect(getGroup(72)).toBe(7);
      expect(getGroup(32)).toBe(3);
    });
    it('returns 0 for fold', () => {
      expect(getGroup(0)).toBe(0);
    });
  });

  describe('getFreqTier', () => {
    it('extracts units digit', () => {
      expect(getFreqTier(11)).toBe(1);
      expect(getFreqTier(32)).toBe(2);
      expect(getFreqTier(33)).toBe(3);
    });
    it('returns 0 for fold', () => {
      expect(getFreqTier(0)).toBe(0);
    });
  });

  describe('MATRIX', () => {
    it('is 13×13', () => {
      expect(MATRIX.length).toBe(13);
      MATRIX.forEach(row => expect(row.length).toBe(13));
    });

    it('all values are 0 or in range 11–73', () => {
      MATRIX.forEach(row =>
        row.forEach(v => {
          expect(v === 0 || (v >= 11 && v <= 73)).toBe(true);
        }),
      );
    });

    it('AA (diagonal 0,0) is group 1 tier 1', () => {
      expect(MATRIX[0][0]).toBe(11);
    });

    it('AKs (upper triangle 0,1) is group 1 tier 1', () => {
      expect(MATRIX[0][1]).toBe(11);
    });

    it('AKo (lower triangle 1,0) is group 1 tier 1', () => {
      expect(MATRIX[1][0]).toBe(11);
    });

    it('A9s (0,5) is group 3 tier 2 (97%)', () => {
      expect(MATRIX[0][5]).toBe(32);
    });

    it('KQo (2,1) is group 3 tier 3 (70%)', () => {
      expect(MATRIX[2][1]).toBe(33);
    });

    it('22 (diagonal 12,12) is group 7 tier 1', () => {
      expect(MATRIX[12][12]).toBe(71);
    });

    it('Q2s (2,12) is fold', () => {
      expect(MATRIX[2][12]).toBe(0);
    });
  });

  describe('GROUP_COLORS', () => {
    it('has entries for groups 1–7', () => {
      for (let g = 1; g <= 7; g++) {
        expect(GROUP_COLORS[g]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe('RANKS', () => {
    it('has 13 ranks starting with A', () => {
      expect(RANKS.length).toBe(13);
      expect(RANKS[0]).toBe('A');
      expect(RANKS[12]).toBe('2');
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx jest tests/ui/components/preflopData.test.ts --selectProjects ui
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: データモジュールを実装**

```typescript
// src/components/preflop/preflopData.ts

export const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'] as const;
export type Rank = typeof RANKS[number];

// エンコーディング: tens digit = group (1–7), units digit = freqTier (1=100%, 2=75–99%, 3=50–74%)
// 0 = fold
// 上三角 (row < col) = suited, 対角 = ペア, 下三角 (row > col) = offsuit
export const MATRIX: number[][] = [
//   A    K    Q    J    T    9    8    7    6    5    4    3    2
  [ 11,  11,  11,  21,  21,  32,  42,  42,  41,  33,  41,  42,  51], // A
  [ 11,  11,  21,  21,  32,  41,  51,  51,  53,  61,  61,  61,  71], // K
  [ 21,  33,  11,  21,  31,  41,  52,  61,  61,  71,  71,  71,   0], // Q
  [ 31,  31,  41,  21,  21,  32,  52,  61,  71,  71,   0,   0,   0], // J
  [ 41,  41,  41,  42,  21,  31,  42,  51,  61,   0,   0,   0,   0], // T
  [ 51,  51,  51,  51,  51,  31,  42,  51,  61,  71,   0,   0,   0], // 9
  [ 61,  61,  61,  62,  61,  63,  31,  41,  51,  61,   0,   0,   0], // 8
  [ 61,  71,  72,  71,  71,  71,  61,  41,  51,  61,  71,   0,   0], // 7
  [ 71,  71,   0,   0,   0,  71,  71,  61,  41,  51,  61,  71,   0], // 6
  [ 71,   0,   0,   0,   0,   0,   0,  71,  61,  51,  61,  71,   0], // 5
  [ 71,   0,   0,   0,   0,   0,   0,   0,  71,  71,  51,  61,  71], // 4
  [  0,   0,   0,   0,   0,   0,   0,   0,   0,  71,  71,  61,  71], // 3
  [  0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  71,  71], // 2
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
  1: '8人・強ハンド',
  2: '後ろに8人 (UTG)',
  3: '後ろに6,7人 (UTG+1/+2)',
  4: '後ろに4,5人 (HJ/LJ)',
  5: '後ろに3人 (CO)',
  6: '後ろに2人 (BTN)',
  7: '後ろに1人 (SB)',
};

export const FOLD_COLOR = '#1E293B';

export const getGroup = (v: number): number => Math.floor(v / 10);
export const getFreqTier = (v: number): number => v % 10;
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx jest tests/ui/components/preflopData.test.ts --selectProjects ui
```
Expected: PASS (7 suites, all green)

- [ ] **Step 5: コミット**

```bash
git add src/components/preflop/preflopData.ts tests/ui/components/preflopData.test.ts
git commit -m "feat: add preflopData module with 9-max RFI matrix and helpers"
```

---

## Task 2: PreflopGrid Component

**Files:**
- Create: `src/components/preflop/PreflopGrid.tsx`
- Test: `tests/ui/components/PreflopGrid.test.tsx`

- [ ] **Step 1: テストファイルを作成して失敗させる**

```typescript
// tests/ui/components/PreflopGrid.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { PreflopGrid } from '../../../src/components/preflop/PreflopGrid';
import { GROUP_COLORS, FOLD_COLOR } from '../../../src/components/preflop/preflopData';

describe('PreflopGrid', () => {
  it('renders 169 data cells', () => {
    const { getAllByTestId } = render(<PreflopGrid />);
    expect(getAllByTestId(/^preflop-cell-/).length).toBe(169);
  });

  it('diagonal cell (0,0) shows pair label "AA"', () => {
    const { getByTestId } = render(<PreflopGrid />);
    const cell = getByTestId('preflop-cell-0-0');
    expect(cell).toHaveTextContent('AA');
  });

  it('upper triangle cell (0,1) shows suited label "AKs"', () => {
    const { getByTestId } = render(<PreflopGrid />);
    const cell = getByTestId('preflop-cell-0-1');
    expect(cell).toHaveTextContent('AKs');
  });

  it('lower triangle cell (1,0) shows offsuit label "AKo"', () => {
    const { getByTestId } = render(<PreflopGrid />);
    const cell = getByTestId('preflop-cell-1-0');
    expect(cell).toHaveTextContent('AKo');
  });

  it('fold cell (2,12) has fold background color', () => {
    const { getByTestId } = render(<PreflopGrid />);
    const cell = getByTestId('preflop-cell-2-12');
    const style = cell.props.style;
    const bgColor = Array.isArray(style)
      ? style.find((s: any) => s?.backgroundColor)?.backgroundColor
      : style?.backgroundColor;
    expect(bgColor).toBe(FOLD_COLOR);
  });

  it('AA cell (0,0) has group 1 color background', () => {
    const { getByTestId } = render(<PreflopGrid />);
    const cell = getByTestId('preflop-cell-0-0');
    const style = cell.props.style;
    const bgColor = Array.isArray(style)
      ? style.find((s: any) => s?.backgroundColor)?.backgroundColor
      : style?.backgroundColor;
    expect(bgColor).toBe(GROUP_COLORS[1]);
  });

  it('tier-2 cell (A9s at 0,5) renders a freq indicator dot', () => {
    const { getByTestId } = render(<PreflopGrid />);
    expect(getByTestId('preflop-freq-dot-0-5')).toBeTruthy();
  });

  it('tier-1 cell (AA at 0,0) does not render a freq indicator dot', () => {
    const { queryByTestId } = render(<PreflopGrid />);
    expect(queryByTestId('preflop-freq-dot-0-0')).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx jest tests/ui/components/PreflopGrid.test.tsx --selectProjects ui
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: PreflopGrid を実装**

```typescript
// src/components/preflop/PreflopGrid.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MATRIX, RANKS, GROUP_COLORS, FOLD_COLOR, getGroup, getFreqTier } from './preflopData';

function cellLabel(row: number, col: number): string {
  const r = RANKS[row];
  const c = RANKS[col];
  if (row === col) return `${r}${c}`;          // pair: AA, KK …
  if (row < col) return `${r}${c}s`;           // suited (upper triangle)
  return `${c}${r}o`;                           // offsuit (lower triangle, higher rank first)
}

function cellBgColor(v: number): string {
  const g = getGroup(v);
  return g === 0 ? FOLD_COLOR : GROUP_COLORS[g];
}

function cellOpacity(v: number): number {
  return getFreqTier(v) === 3 ? 0.6 : 1;
}

export function PreflopGrid() {
  return (
    <View style={styles.grid}>
      {/* Corner */}
      <View style={styles.headerCell} />
      {/* Column headers */}
      {RANKS.map(r => (
        <View key={r} style={styles.headerCell}>
          <Text style={styles.headerText}>{r}</Text>
        </View>
      ))}
      {/* Rows */}
      {MATRIX.map((row, ri) => (
        <React.Fragment key={ri}>
          {/* Row header */}
          <View style={styles.headerCell}>
            <Text style={styles.headerText}>{RANKS[ri]}</Text>
          </View>
          {/* Data cells */}
          {row.map((v, ci) => {
            const tier = getFreqTier(v);
            const showDot = tier === 2 || tier === 3;
            return (
              <View
                key={ci}
                testID={`preflop-cell-${ri}-${ci}`}
                style={[
                  styles.cell,
                  { backgroundColor: cellBgColor(v), opacity: cellOpacity(v) },
                ]}
              >
                <Text style={styles.cellText}>{cellLabel(ri, ci)}</Text>
                {showDot && (
                  <View
                    testID={`preflop-freq-dot-${ri}-${ci}`}
                    style={styles.freqDot}
                  />
                )}
              </View>
            );
          })}
        </React.Fragment>
      ))}
    </View>
  );
}

const CELL = 26;
const GAP = 1;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: (CELL + GAP) * 14,
    gap: GAP,
  },
  headerCell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    color: '#9CA3AF',
    fontSize: 9,
    fontWeight: '600',
  },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
    overflow: 'hidden',
  },
  cellText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  freqDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
});
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx jest tests/ui/components/PreflopGrid.test.tsx --selectProjects ui
```
Expected: PASS (7 tests, all green)

- [ ] **Step 5: コミット**

```bash
git add src/components/preflop/PreflopGrid.tsx tests/ui/components/PreflopGrid.test.tsx
git commit -m "feat: add PreflopGrid component with 13x13 hand matrix cells"
```

---

## Task 3: PreflopChartModal Component

**Files:**
- Create: `src/components/preflop/PreflopChartModal.tsx`
- Test: `tests/ui/components/PreflopChartModal.test.tsx`

- [ ] **Step 1: テストファイルを作成して失敗させる**

```typescript
// tests/ui/components/PreflopChartModal.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PreflopChartModal } from '../../../src/components/preflop/PreflopChartModal';

describe('PreflopChartModal', () => {
  it('renders modal container when visible=true', () => {
    const { getByTestId } = render(
      <PreflopChartModal visible={true} onClose={jest.fn()} />,
    );
    expect(getByTestId('preflop-chart-modal')).toBeTruthy();
  });

  it('does not render content when visible=false', () => {
    const { queryByTestId } = render(
      <PreflopChartModal visible={false} onClose={jest.fn()} />,
    );
    expect(queryByTestId('preflop-chart-modal')).toBeNull();
  });

  it('shows title text', () => {
    const { getByText } = render(
      <PreflopChartModal visible={true} onClose={jest.fn()} />,
    );
    expect(getByText('Preflop RFI Chart')).toBeTruthy();
  });

  it('calls onClose when close button is pressed', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <PreflopChartModal visible={true} onClose={onClose} />,
    );
    fireEvent.press(getByTestId('preflop-chart-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the grid (at least one cell visible)', () => {
    const { getByTestId } = render(
      <PreflopChartModal visible={true} onClose={jest.fn()} />,
    );
    expect(getByTestId('preflop-cell-0-0')).toBeTruthy();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx jest tests/ui/components/PreflopChartModal.test.tsx --selectProjects ui
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: PreflopChartModal を実装**

```typescript
// src/components/preflop/PreflopChartModal.tsx

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { PreflopGrid } from './PreflopGrid';
import { GROUP_COLORS, GROUP_LABELS, FOLD_COLOR } from './preflopData';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PreflopChartModal({ visible, onClose }: Props) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.screen} testID="preflop-chart-modal">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Preflop RFI Chart</Text>
            <Text style={styles.subtitle}>9-max · 100BB · No Ante · RFI Only</Text>
          </View>
          <TouchableOpacity
            testID="preflop-chart-close"
            onPress={onClose}
            style={styles.closeBtn}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Legend */}
          <View style={styles.legend}>
            {([1, 2, 3, 4, 5, 6, 7] as const).map(g => (
              <View key={g} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: GROUP_COLORS[g] }]} />
                <Text style={styles.legendText}>{GROUP_LABELS[g]}</Text>
              </View>
            ))}
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: FOLD_COLOR }]} />
              <Text style={styles.legendText}>Fold</Text>
            </View>
          </View>

          {/* Grid */}
          <View style={styles.gridWrapper}>
            <PreflopGrid />
          </View>

          {/* Freq tier note */}
          <View style={styles.tierNote}>
            <Text style={styles.tierNoteText}>● 75–99%   ● 50–74% (薄色)</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F0F1A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D44',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    color: '#9CA3AF',
    fontSize: 18,
  },
  content: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 12,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    color: '#9CA3AF',
    fontSize: 10,
  },
  gridWrapper: {
    alignItems: 'center',
  },
  tierNote: {
    paddingTop: 4,
  },
  tierNoteText: {
    color: '#64748B',
    fontSize: 10,
  },
});
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx jest tests/ui/components/PreflopChartModal.test.tsx --selectProjects ui
```
Expected: PASS (5 tests, all green)

- [ ] **Step 5: コミット**

```bash
git add src/components/preflop/PreflopChartModal.tsx tests/ui/components/PreflopChartModal.test.tsx
git commit -m "feat: add PreflopChartModal fullscreen modal with grid and legend"
```

---

## Task 4: Game Screen Integration

**Files:**
- Modify: `app/game.tsx`

> ⚠️ `app/game.tsx` は Expo Router ページであり、直接の単体テストは複雑なため手動確認とする。

- [ ] **Step 1: `app/game.tsx` を読む**

`app/game.tsx` の `GameView` 関数と `styles` StyleSheet を確認する。

- [ ] **Step 2: import を追加**

`PreflopChartModal` の import を追加 (既存 import ブロックの末尾):

```typescript
import { PreflopChartModal } from '../src/components/preflop/PreflopChartModal';
```

- [ ] **Step 3: `GameView` に state と JSX を追加**

`GameView` 関数の先頭にある既存 state 宣言の直後に追加:

```typescript
const [showChart, setShowChart] = useState(false);
```

`return` 内の `<ResultOverlay />` の直後に追加:

```tsx
<TouchableOpacity
  testID="rfi-chart-button"
  style={styles.chartButton}
  onPress={() => setShowChart(true)}
>
  <Text style={styles.chartButtonText}>RFI</Text>
</TouchableOpacity>
<PreflopChartModal visible={showChart} onClose={() => setShowChart(false)} />
```

既存の React Native import 行を以下に**置き換える** (既存行を削除してこれに差し替え):

```typescript
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
```

- [ ] **Step 4: styles に chartButton を追加**

`StyleSheet.create` の末尾 `}` の前に:

```typescript
  chartButton: {
    position: 'absolute',
    bottom: 80,
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

- [ ] **Step 5: 全テストが通ることを確認**

```bash
npx jest --selectProjects ui
```
Expected: PASS (既存テスト含め全て green)

- [ ] **Step 6: コミット**

```bash
git add app/game.tsx
git commit -m "feat: integrate PreflopChartModal with RFI button in GameView"
```

---

## 完了後の動作確認

1. `npx expo start` でアプリ起動
2. デバッグモードまたはホットシートモードでゲームを開始
3. 画面右下に "RFI" ボタンが表示されることを確認
4. タップするとチャートモーダルが全画面で開くことを確認
5. × ボタンでモーダルが閉じることを確認
6. 全 169 セルが正しいカラーとラベルで表示されることを確認
7. freqTier 2/3 のセル (例: A9s, KQo) に白丸インジケーターが表示されることを確認
