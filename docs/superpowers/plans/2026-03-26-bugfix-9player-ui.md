# Bug Fix + 9-Player UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 bugs in the 9-player UI: compact seat too narrow, viewer's own seat incorrectly compacted, preflop shows 5 dark card slots, community cards left-aligned, and minWidth values inconsistent with display.

**Architecture:** Three independent changes across three files. Each task is self-contained: `PlayerSeat.tsx` (minWidth), `app/game.tsx` (BC seat logic), `CommunityCards.tsx` (slot count + centering). Tests already exist for all three components — mostly updates to existing assertions plus a few new cases.

**Tech Stack:** React Native / Expo, TypeScript, Jest + @testing-library/react-native

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `src/components/table/PlayerSeat.tsx` | `containerCompact.minWidth: 52 → 60` |
| Modify | `tests/ui/components/PlayerSeat.test.tsx` | Update `minWidth` expectation 52 → 60 |
| Modify | `app/game.tsx` | `compact && name !== 'BC'` in `seat()` helper |
| Modify | `tests/ui/components/TableLayout.test.tsx` | Update minWidth refs, fix seat checked, add BC test |
| Modify | `src/components/table/CommunityCards.tsx` | `totalSlots` logic + `alignSelf: 'stretch'` |
| Modify | `tests/ui/components/CommunityCards.test.tsx` | Update preflop expectation, add post-flop test |

---

## Task 1: Fix compact seat minWidth (52 → 60)

**Files:**
- Modify: `src/components/table/PlayerSeat.tsx:140-143`
- Modify: `tests/ui/components/PlayerSeat.test.tsx:137-144`

`containerCompact.minWidth: 52` is too narrow for chip amounts like `2,999` at fontSize 10, causing text truncation. Correct value is `60`.

- [ ] **Step 1: Update the failing test**

In `tests/ui/components/PlayerSeat.test.tsx`, find the test at line 137 and change `minWidth: 52` to `minWidth: 60`:

```ts
it('applies compact container style when compact=true', () => {
  const { getByTestId } = renderWithGame(<PlayerSeat seat={0} compact />, {
    state: createMockGameState(),
  });
  expect(getByTestId('player-seat-0').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ minWidth: 60 })]),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/ui/components/PlayerSeat.test.tsx --testNamePattern="applies compact container style"
```

Expected: FAIL — received `minWidth: 52`, expected `minWidth: 60`.

- [ ] **Step 3: Update the implementation**

In `src/components/table/PlayerSeat.tsx`, find `containerCompact` in the `StyleSheet.create` block (around line 140) and change `minWidth: 52` to `minWidth: 60`:

```ts
containerCompact: {
  padding: 4,
  minWidth: 60,
},
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/ui/components/PlayerSeat.test.tsx
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/table/PlayerSeat.tsx tests/ui/components/PlayerSeat.test.tsx
git commit -m "fix: increase compact seat minWidth from 52 to 60 to prevent chip text truncation"
```

---

## Task 2: BC seat (viewer's own seat) always normal

**Files:**
- Modify: `app/game.tsx:34-37`
- Modify: `tests/ui/components/TableLayout.test.tsx:47-65`

The viewer's own seat is always assigned to the `BC` slot by `getTableSlots`. Currently all seats receive `compact={compact}`, so the viewer's seat also shrinks at 5+ players. Fix: only apply `compact` to non-BC slots.

**Background on slot assignment:** With `viewingSeat: 0` and 5 players, `getTableSlots` maps seat 0 → `BC`, seat 1 → `BL`, seats 2-4 → `LT/TC/TR`. So `player-seat-1` is in BL (compact), while `player-seat-0` is in BC (should be normal).

- [ ] **Step 1: Update the TableLayout tests**

Replace the entire `'uses compact seats when 5 or more players'` and `'does not use compact seats for 4 or fewer players'` tests, and add a new BC test. The file is `tests/ui/components/TableLayout.test.tsx`. Replace lines 47-65 with:

```ts
  it('uses compact seats for non-BC slots when 5 or more players', () => {
    const { getByTestId } = renderWithGame(<TableLayout />, {
      state: makeState(5),
      viewingSeat: 0,
    });
    // seat 1 is at BL (non-BC), should be compact
    expect(getByTestId('player-seat-1').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ minWidth: 60 })]),
    );
  });

  it('does not use compact seats for 4 or fewer players', () => {
    const { getByTestId } = renderWithGame(<TableLayout />, {
      state: makeState(4),
      viewingSeat: 0,
    });
    // seat 1 is at BL, should be normal (4 players, no compact)
    expect(getByTestId('player-seat-1').props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ minWidth: 60 })]),
    );
  });

  it('BC seat (viewer own seat) is never compact even with 5+ players', () => {
    const { getByTestId } = renderWithGame(<TableLayout />, {
      state: makeState(5),
      viewingSeat: 0,
    });
    // seat 0 is at BC, should never have compact style
    expect(getByTestId('player-seat-0').props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ minWidth: 60 })]),
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/components/TableLayout.test.tsx
```

Expected: The `'BC seat is never compact'` test FAILs because BC currently receives `compact={true}`. The updated `'uses compact seats'` test also FAILs due to old `minWidth: 52` in the code (already fixed in Task 1, so it may pass — but the BC test will still fail).

- [ ] **Step 3: Update the implementation**

In `app/game.tsx`, find the `seat()` helper inside `TableLayout` (around line 34) and change `compact={compact}` to exclude `BC`:

```tsx
  const seat = (name: keyof typeof slots) =>
    slots[name] !== undefined ? (
      <PlayerSeat seat={slots[name]!} compact={compact && name !== 'BC'} />
    ) : null;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/components/TableLayout.test.tsx
```

Expected: All 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/game.tsx tests/ui/components/TableLayout.test.tsx
git commit -m "fix: viewer's own seat (BC) always renders in normal size regardless of player count"
```

---

## Task 3: Fix CommunityCards preflop display and centering

**Files:**
- Modify: `src/components/table/CommunityCards.tsx:8-42`
- Modify: `tests/ui/components/CommunityCards.test.tsx:9-34`

Two bugs in one component:
- **Preflop**: `community: []` causes 5 dark empty slots to appear on an otherwise clean table
- **Centering**: the container doesn't fill the full width of the center area, causing visual left-alignment

Fix: derive `totalSlots` from whether any cards are dealt (`cards.length === 0 ? 0 : 5`), and add `alignSelf: 'stretch'` to fill the center View width.

- [ ] **Step 1: Update the existing test and add a new one**

In `tests/ui/components/CommunityCards.test.tsx`, replace the first test (`'renders 5 card slots'`) and add a new post-flop test:

```ts
// REPLACE existing "renders 5 card slots" test with:
it('renders 0 card slots when no community cards (preflop)', () => {
  const { queryAllByTestId } = renderWithGame(<CommunityCards />, {
    state: createMockGameState({ community: [] }),
  });
  expect(queryAllByTestId('card-slot')).toHaveLength(0);
});

// ADD new test after the above:
it('renders 5 card slots once community cards are dealt (flop+)', () => {
  const community: Card[] = ['Ah', 'Kd', 'Qs'];
  const { getAllByTestId } = renderWithGame(<CommunityCards />, {
    state: createMockGameState({ community, phase: 'flop' }),
  });
  expect(getAllByTestId('card-slot')).toHaveLength(5);
});
```

Keep the existing `'renders dealt cards face-up'` and `'renders empty slots for undealt cards'` tests unchanged — they use `community: ['Ah', 'Kd', 'Qs']` which has length 3 > 0, so they will still pass after the fix.

The full file after edits:

```ts
// tests/ui/components/CommunityCards.test.tsx

import React from 'react';
import { screen } from '@testing-library/react-native';
import { CommunityCards } from '../../../src/components/table/CommunityCards';
import { renderWithGame, createMockGameState } from '../helpers/renderWithGame';
import { Card } from '../../../src/gameEngine';

describe('CommunityCards', () => {
  it('renders 0 card slots when no community cards (preflop)', () => {
    const { queryAllByTestId } = renderWithGame(<CommunityCards />, {
      state: createMockGameState({ community: [] }),
    });
    expect(queryAllByTestId('card-slot')).toHaveLength(0);
  });

  it('renders 5 card slots once community cards are dealt (flop+)', () => {
    const community: Card[] = ['Ah', 'Kd', 'Qs'];
    const { getAllByTestId } = renderWithGame(<CommunityCards />, {
      state: createMockGameState({ community, phase: 'flop' }),
    });
    expect(getAllByTestId('card-slot')).toHaveLength(5);
  });

  it('renders dealt cards face-up', () => {
    const community: Card[] = ['Ah', 'Kd', 'Qs'];
    renderWithGame(<CommunityCards />, {
      state: createMockGameState({ community }),
    });
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('K')).toBeTruthy();
    expect(screen.getByText('Q')).toBeTruthy();
  });

  it('renders empty slots for undealt cards', () => {
    const { getAllByTestId } = renderWithGame(<CommunityCards />, {
      state: createMockGameState({ community: ['Ah', 'Kd', 'Qs'] as Card[] }),
    });
    const emptySlots = getAllByTestId('empty-slot');
    expect(emptySlots).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/components/CommunityCards.test.tsx
```

Expected: `'renders 0 card slots when no community cards'` FAILs (currently renders 5). `'renders 5 card slots once community cards are dealt'` passes with existing code (3 cards → already 5 slots). So only the preflop test fails.

- [ ] **Step 3: Update the implementation**

Replace the entire `CommunityCards.tsx` with:

```tsx
// src/components/table/CommunityCards.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { PlayingCard } from '../common/PlayingCard';

export function CommunityCards() {
  const { state } = useGame();
  const cards = state?.community ?? [];

  const totalSlots = cards.length === 0 ? 0 : 5;

  return (
    <View style={styles.container}>
      {Array.from({ length: totalSlots }, (_, i) => (
        <View key={i} testID="card-slot">
          {i < cards.length ? (
            <PlayingCard card={cards[i]} faceUp size="community" />
          ) : (
            <View testID="empty-slot" style={styles.emptySlot} />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  emptySlot: {
    width: 45,
    height: 65,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/components/CommunityCards.test.tsx
```

Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/table/CommunityCards.tsx tests/ui/components/CommunityCards.test.tsx
git commit -m "fix: hide community card slots in preflop; center cards across full table width"
```

---

## Final Verification

Run the full test suite to confirm no regressions:

```bash
npx jest
```

Expected: All tests pass.
