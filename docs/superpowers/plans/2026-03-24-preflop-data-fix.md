# Preflop Chart Data Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix MATRIX + GROUP_LABELS in `preflopData.ts` and the corresponding `preflop-chart-9max.html` to accurately reflect GTO Wizard 9-max 100BB RFI data per the approved spec.

**Architecture:** Data-only fix — no structural code changes. Three files change: test file first (TDD), then TypeScript data source, then standalone HTML chart. The HTML `M` matrix is derived by stripping freqTier from the TypeScript MATRIX (`Math.floor(v / 10)`).

**Tech Stack:** TypeScript, Jest, plain HTML/JS

---

## File Map

| File | Change |
|------|--------|
| `tests/ui/components/preflopData.test.ts` | Update 3 wrong test assertions; add 4 spot-check tests |
| `src/components/preflop/preflopData.ts` | Replace MATRIX + GROUP_LABELS |
| `docs/preflop-chart-9max.html` | Replace M matrix + GROUP_NAMES + legend HTML |

**Spec:** `docs/superpowers/specs/2026-03-24-preflop-chart-design.md`

Matrix index reference: `RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2']`
A=0, K=1, Q=2, J=3, T=4, 9=5, 8=6, 7=7, 6=8, 5=9, 4=10, 3=11, 2=12

Encoding: `cell = group * 10 + freqTier` — freqTier 1=100%, 2=75–99%, 3=50–74%, 0=fold

---

## Task 1: Update Tests (TDD — write failing specs first)

**Files:**
- Modify: `tests/ui/components/preflopData.test.ts`

These existing assertions encode old wrong values and must be changed before touching implementation:

| Test | Old expected | New expected | Reason |
|------|-------------|-------------|--------|
| `A9s (0,5)` | `32` (group 3, tier 2) | `22` (group 2, tier 2) | A9s is UTG range (97%) |
| `KQo (2,1)` | `33` (group 3, tier 3) | `23` (group 2, tier 3) | KQo is UTG range (70%) |
| `Q2s (2,12) is fold` | `0` | `71` (SB, 100%) | SB opens all Qxs |
| `22 (diagonal 12,12) is group 7 tier 1` | `71` (SB) | `51` (CO, group 5) | Spec correction: 22 is CO range |

- [ ] **Step 1: Update A9s assertion**

In `tests/ui/components/preflopData.test.ts`, replace:
```typescript
// OLD:
it('A9s (0,5) is group 3 tier 2 (97%)', () => {
  expect(MATRIX[0][5]).toBe(32);
});

// NEW:
it('A9s (0,5) is group 2 tier 2 (97%)', () => {
  expect(MATRIX[0][5]).toBe(22);
});
```

- [ ] **Step 2: Update KQo assertion**

Replace:
```typescript
// OLD:
it('KQo (2,1) is group 3 tier 3 (70%)', () => {
  expect(MATRIX[2][1]).toBe(33);
});

// NEW:
it('KQo (2,1) is group 2 tier 3 (70%)', () => {
  expect(MATRIX[2][1]).toBe(23);
});
```

- [ ] **Step 3: Update Q2s assertion**

Replace:
```typescript
// OLD:
it('Q2s (2,12) is fold', () => {
  expect(MATRIX[2][12]).toBe(0);
});

// NEW:
it('Q2s (2,12) is group 7 tier 1 — SB opens all Qxs', () => {
  expect(MATRIX[2][12]).toBe(71);
});
```

- [ ] **Step 3b: Update 22 assertion**

Replace:
```typescript
// OLD:
it('22 (diagonal 12,12) is group 7 tier 1', () => {
  expect(MATRIX[12][12]).toBe(71);
});

// NEW:
it('22 (diagonal 12,12) is group 5 tier 1 — CO range', () => {
  expect(MATRIX[12][12]).toBe(51);
});
```

- [ ] **Step 4: Add spot-check tests for key spec corrections**

Inside `describe('MATRIX', ...)`, after the existing tests, append:

```typescript
it('99 (5,5) is group 2 tier 1 — UTG range', () => {
  expect(MATRIX[5][5]).toBe(21);
});

it('88 (6,6) is group 2 tier 1 — UTG range', () => {
  expect(MATRIX[6][6]).toBe(21);
});

it('ATo (4,0) is group 3 tier 2 — UTG1+UTG2 range', () => {
  expect(MATRIX[4][0]).toBe(32);
});

it('QTo (4,2) is group 6 tier 1 — BTN range', () => {
  expect(MATRIX[4][2]).toBe(61);
});
```

Why these hands: they are the main corrections from spec Section 0.
- `(4,0)` = T-row, A-col → row(4) > col(0) → lower triangle → offsuit → `${RANKS[0]}${RANKS[4]}o` = ATo
- `(4,2)` = T-row, Q-col → row(4) > col(2) → lower triangle → `${RANKS[2]}${RANKS[4]}o` = QTo

- [ ] **Step 5: Run tests to verify they now fail against current implementation**

```bash
npx jest tests/ui/components/preflopData.test.ts --no-coverage
```

Expected: 7 FAIL (3 updated + 4 new spot-checks all fail against old MATRIX)

---

## Task 2: Update preflopData.ts

**Files:**
- Modify: `src/components/preflop/preflopData.ts`

Replace only `MATRIX` and `GROUP_LABELS`. Everything else (RANKS, GROUP_COLORS, FOLD_COLOR, getGroup, getFreqTier) stays unchanged.

- [ ] **Step 1: Replace MATRIX**

In `src/components/preflop/preflopData.ts`, replace the entire `export const MATRIX` declaration:

```typescript
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
```

- [ ] **Step 2: Replace GROUP_LABELS**

In the same file, replace the entire `export const GROUP_LABELS` declaration:

```typescript
export const GROUP_LABELS: Record<number, string> = {
  1: 'UTG Strong (後ろに8人 premium)',
  2: 'UTG (後ろに8人)',
  3: 'UTG1+UTG2 (後ろに6・7人)',
  4: 'LJ+HJ (後ろに4・5人)',
  5: 'CO (後ろに3人)',
  6: 'BTN (後ろに2人)',
  7: 'SB (後ろに1人)',
};
```

- [ ] **Step 3: Run tests and confirm they pass**

```bash
npx jest tests/ui/components/preflopData.test.ts --no-coverage
```

Expected: all tests PASS (including the 7 that were previously failing)

- [ ] **Step 4: Fix PreflopGrid test for cell (2,12)**

In `tests/ui/components/PreflopGrid.test.tsx`, the test `'fold cell (2,12) has fold background color'` asserts `FOLD_COLOR` for Q2s. Since Q2s is now group 7 (SB), update this assertion before running the suite:

```typescript
// OLD:
it('fold cell (2,12) has fold background color', () => {
  const { getByTestId } = render(<PreflopGrid />);
  const cell = getByTestId('preflop-cell-2-12');
  expect(getBgColor(cell.props.style)).toBe(FOLD_COLOR);
});

// NEW:
it('Q2s cell (2,12) has group 7 (SB) background color', () => {
  const { getByTestId } = render(<PreflopGrid />);
  const cell = getByTestId('preflop-cell-2-12');
  expect(getBgColor(cell.props.style)).toBe(GROUP_COLORS[7]);
});
```

Also update the import line at the top of the file to include `GROUP_COLORS` (it currently only imports `FOLD_COLOR`... check the actual imports first):
```typescript
import { GROUP_COLORS, FOLD_COLOR } from '../../../src/components/preflop/preflopData';
```
(If `GROUP_COLORS` is already imported, no change needed.)

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npx jest --no-coverage
```

Expected: PASS — all tests green including the updated PreflopGrid assertion.

- [ ] **Step 6: Commit**

```bash
git add src/components/preflop/preflopData.ts tests/ui/components/preflopData.test.ts tests/ui/components/PreflopGrid.test.tsx
git commit -m "fix(preflop): update MATRIX and GROUP_LABELS to GTO Wizard 9-max 100BB data"
```

---

## Task 3: Update HTML Chart

**Files:**
- Modify: `docs/preflop-chart-9max.html`

The HTML chart has its own `M` matrix (group numbers only, no freqTier) and `GROUP_NAMES` + legend HTML. All three must be updated to match the corrected `preflopData.ts`.

Derivation: `M[r][c] = Math.floor(MATRIX[r][c] / 10)`

- [ ] **Step 1: Replace `const M` in the `<script>` block**

Find `const M = [` and replace the entire array:

```javascript
const M = [
//  A  K  Q  J  T  9  8  7  6  5  4  3  2
  [ 1, 1, 1, 2, 2, 2, 3, 4, 4, 4, 4, 4, 5], // A
  [ 1, 1, 2, 2, 2, 4, 6, 6, 6, 7, 7, 7, 7], // K
  [ 2, 2, 1, 3, 3, 4, 6, 7, 7, 7, 7, 7, 7], // Q
  [ 2, 4, 5, 2, 3, 4, 6, 7, 7, 7, 0, 0, 0], // J
  [ 3, 5, 6, 6, 2, 4, 6, 7, 7, 0, 0, 0, 0], // T
  [ 3, 7, 7, 7, 7, 2, 6, 7, 7, 0, 0, 0, 0], // 9
  [ 5, 7, 7, 7, 7, 7, 2, 7, 7, 0, 0, 0, 0], // 8
  [ 5, 7, 7, 0, 0, 0, 0, 3, 7, 7, 0, 0, 0], // 7
  [ 6, 7, 0, 0, 0, 0, 0, 0, 3, 7, 0, 0, 0], // 6
  [ 6, 7, 0, 0, 0, 0, 0, 0, 0, 4, 7, 0, 0], // 5
  [ 6, 7, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0], // 4
  [ 6, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0], // 3
  [ 6, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5], // 2
];
```

- [ ] **Step 2: Replace `const GROUP_NAMES` in the `<script>` block**

Find `const GROUP_NAMES = {` and replace:

```javascript
const GROUP_NAMES = {
  0: 'Fold',
  1: 'UTG Strong (後ろに8人 premium)',
  2: 'UTG (後ろに8人)',
  3: 'UTG1+UTG2 (後ろに6・7人)',
  4: 'LJ+HJ (後ろに4・5人)',
  5: 'CO (後ろに3人)',
  6: 'BTN (後ろに2人)',
  7: 'SB (後ろに1人)',
};
```

- [ ] **Step 3: Replace the legend `<div class="legend">` block**

Find `<div class="legend">` and replace the block through `</div>`:

```html
<div class="legend">
  <div class="legend-item"><div class="legend-swatch" style="background:var(--g1)"></div>UTG Strong<span class="legend-pos">(後ろに8人 premium)</span></div>
  <div class="legend-item"><div class="legend-swatch" style="background:var(--g2)"></div>UTG<span class="legend-pos">(後ろに8人)</span></div>
  <div class="legend-item"><div class="legend-swatch" style="background:var(--g3)"></div>UTG1+UTG2<span class="legend-pos">(後ろに6・7人)</span></div>
  <div class="legend-item"><div class="legend-swatch" style="background:var(--g4)"></div>LJ+HJ<span class="legend-pos">(後ろに4・5人)</span></div>
  <div class="legend-item"><div class="legend-swatch" style="background:var(--g5)"></div>CO<span class="legend-pos">(後ろに3人)</span></div>
  <div class="legend-item"><div class="legend-swatch" style="background:var(--g6)"></div>BTN<span class="legend-pos">(後ろに2人)</span></div>
  <div class="legend-item"><div class="legend-swatch" style="background:var(--g7)"></div>SB<span class="legend-pos">(後ろに1人)</span></div>
  <div class="legend-item"><div class="legend-swatch" style="background:var(--fold)"></div>Fold</div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add docs/preflop-chart-9max.html
git commit -m "fix(docs): sync HTML preflop chart M matrix and labels with corrected preflopData"
```
