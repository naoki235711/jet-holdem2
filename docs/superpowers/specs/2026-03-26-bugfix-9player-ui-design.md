# Bug Fix + 9-Player UI Polish Design

**Date:** 2026-03-26
**Scope:** Fix 5 bugs/issues in the existing 9-player UI implementation in a single PR.

---

## Overview

The 9-player UI was merged (PR #17) but has residual bugs. This spec covers all fixes in one PR:

- Category A: 3 bugs in the current code
- Category B: 2 corrections to the 9-player plan values

Issue 6 (TL seat always empty) was reviewed and **accepted as intended behavior** — TL is the natural empty corner in a 10-slot grid with 9 players.

---

## Changes

### 1. `src/components/table/PlayerSeat.tsx` — compact minWidth 52 → 60

**Problem:** `containerCompact.minWidth: 52` is too narrow. A chip amount like `2,999` at fontSize 10 needs ~58px, causing truncation displayed as `2,99…`.

**Fix:** Change `minWidth` in `containerCompact` from `52` to `60`.

```ts
containerCompact: {
  padding: 4,
  minWidth: 60,   // was 52
},
```

**Tests:** Update `PlayerSeat.test.tsx` expectation from `minWidth: 52` to `minWidth: 60`.

---

### 2. `app/game.tsx` — BC seat always normal (never compact)

**Problem:** The viewer's own seat (BC) is rendered compact when 5+ players are at the table. The viewer's seat should always be normal size for readability.

**Fix:** Change the `seat()` helper in `TableLayout` to exclude BC from compact mode:

```ts
// Before
<PlayerSeat seat={slots[name]!} compact={compact} />

// After
<PlayerSeat seat={slots[name]!} compact={compact && name !== 'BC'} />
```

**Tests:** Add test to `TableLayout.test.tsx`: verify that the BC seat (`player-seat-wrapper` for `viewingSeat`) does not have `minWidth: 60` applied when 5+ players are present.

---

### 3. `src/components/table/CommunityCards.tsx` — preflop fix + centering fix

#### Bug A: Preflop shows 5 dark card slots

**Problem:** `Array.from({ length: 5 }, ...)` always renders 5 slots. In preflop there are 0 community cards, so all 5 appear as dark empty placeholders, cluttering the table.

**Fix:** Show 0 slots when no cards have been dealt (preflop), 5 slots otherwise:

```ts
const totalSlots = cards.length === 0 ? 0 : 5;
```

After the flop is dealt (3 cards), all 5 slots appear immediately (3 face-up + 2 empty), which signals the upcoming turn and river cards. This is the standard poker table presentation.

#### Bug B: Community cards left-aligned

**Problem:** The CommunityCards container does not fill the full width of the `center` View, causing it to appear left-aligned when the center area is wider than the cards.

**Fix:** Add `alignSelf: 'stretch'` to the CommunityCards container style so it fills the available center width, then `justifyContent: 'center'` centers the cards within.

```ts
container: {
  flexDirection: 'row',
  gap: 6,
  justifyContent: 'center',
  alignItems: 'center',
  alignSelf: 'stretch',  // new
},
```

**Tests:** Update/add to `CommunityCards.test.tsx`:
- Verify 0 card slots rendered when `community: []` (preflop)
- Verify 5 card slots rendered when `community` has 3 cards (flop)

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `src/components/table/PlayerSeat.tsx` | `minWidth: 52 → 60` |
| Modify | `tests/ui/components/PlayerSeat.test.tsx` | Update `minWidth` expectation |
| Modify | `app/game.tsx` | `compact && name !== 'BC'` |
| Modify | `tests/ui/components/TableLayout.test.tsx` | Add BC-not-compact test |
| Modify | `src/components/table/CommunityCards.tsx` | `totalSlots` logic + `alignSelf: 'stretch'` |
| Modify | `tests/ui/components/CommunityCards.test.tsx` | Preflop 0-slot test |

---

## Out of Scope

- TL slot assignment: intentionally empty, no change
- ActionButtons: already appropriate for mobile, no change
- `tableSlots.ts` logic: no change needed
