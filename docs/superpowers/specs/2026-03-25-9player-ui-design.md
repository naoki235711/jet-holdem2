# 9-Player UI Design

**Date:** 2026-03-25
**Scope:** Extend the poker table UI from 4-player maximum to 9-player maximum, covering both local (hotseat/debug) and BLE multiplayer modes.

---

## Overview

Currently the `TableLayout` component hard-codes 4 seat slots (top, left, right, bottom). The lobby UI only offers player counts of 2–4, and the BLE lobby host caps at `MAX_PLAYERS = 4`. This spec extends all three layers to support up to 9 players.

---

## Architecture

### New file: `src/components/table/tableSlots.ts`

Pure function that maps players → named slot positions.

```ts
export type SlotName = 'TL' | 'TC' | 'TR' | 'LT' | 'LB' | 'RT' | 'RB' | 'BL' | 'BC' | 'BR';
export type SlotMap = Partial<Record<SlotName, number>>; // SlotName → seat number

export function getTableSlots(allSeats: number[], myIdx: number): SlotMap
```

**Slot layout:**
```
[TL] [TC] [TR]
[LT]         [RT]
[LB]         [RB]
[BL] [BC] [BR]
```

`BC` is always the viewing player's own seat. Remaining players are assigned using a per-count lookup table (see below). The viewing player is always at seat index `myIdx` in `allSeats`; remaining players are distributed counter-clockwise from `BL`.

**Slot assignment per player count:**

```ts
const SLOTS_BY_COUNT: Record<number, SlotName[]> = {
  2: ['BC', 'TC'],
  3: ['BC', 'BL', 'TR'],
  4: ['BC', 'BL', 'TC', 'TR'],
  5: ['BC', 'BL', 'LT', 'TC', 'TR'],
  6: ['BC', 'BL', 'LT', 'TC', 'TR', 'RB'],
  7: ['BC', 'BL', 'LT', 'TC', 'TR', 'RT', 'BR'],
  8: ['BC', 'BL', 'LB', 'LT', 'TC', 'TR', 'RT', 'BR'],
  9: ['BC', 'BL', 'LB', 'LT', 'TC', 'TR', 'RT', 'RB', 'BR'],
};
```

Implementation: index into `SLOTS_BY_COUNT[playerCount]`, assign `allSeats[(myIdx + i) % playerCount]` to the i-th slot entry.

**Rationale for per-count table instead of a simple array prefix:**
- 2-player heads-up: opponent naturally faces the viewer at `TC` (not `BL`)
- 3-player: spread evenly across the table (`BL` and `TR`) for visual balance
- A single prefix of a 9-slot array would place 2-player opponent at `BL` (side-by-side), which is unintuitive

**Slot traversal direction:** The 9-player order `BL → LB → LT → TC → TR → RT → RB → BR` goes **clockwise** around the table visually (left side, then top, then right side). The player at offset +1 from the viewer (next to act) is placed at `BL` (viewer's left), which matches poker convention.

**Spectator / `myIdx === -1` fallback:**
When the viewer is a spectator (`myIdx === -1`), use the dealer's seat as the anchor: compute `allSeats.indexOf(0)` (i.e., find which array position holds the seat number `0`) and use that as `myIdx`. If seat 0 is not present in `allSeats`, fall back to index 0. This gives spectators a consistent dealer's-eye view without special-casing the slot logic.

---

## Component Changes

### `app/game.tsx` — `TableLayout`

Replace the current 4-slot hard-coded logic with slot-map rendering:

```tsx
const slots = getTableSlots(allSeats, myIdx);
const compact = allSeats.length >= 5;

// Render:
// topRow:    [TL] [TC] [TR]
// middleRow: [LT][LB] center [RT][RB]
// bottomRow: [BL] [BC] [BR]
```

Each slot renders `<PlayerSeat seat={slots.XX} compact={compact} />` if the slot is defined. The middle-row side areas change from a single `sideSlot` (`width: 80`) to a `View` column (`minWidth: 56`, no fixed width) that can contain up to 2 seats (`LT`/`LB` on the left, `RT`/`RB` on the right). Using `minWidth: 56` (≥ compact seat `minWidth: 52`) instead of a fixed width allows the center area to expand when side seats are empty.

### `src/components/common/PlayingCard.tsx`

Add a `"small"` size entry to the `SIZES` object and update the `size` prop union type:

```ts
const SIZES = {
  hand:      { width: 25, height: 35, fontSize: 10 },
  small:     { width: 18, height: 26, fontSize: 8  },  // new
  community: { width: 45, height: 65, fontSize: 18 },
};

size?: 'hand' | 'small' | 'community';  // updated
```

This is a backward-compatible addition; existing callers that omit `size` still get `"hand"` (the default).

### `src/components/table/PlayerSeat.tsx`

Add `compact?: boolean` prop. When `true`:

| Property | Normal (≤4p) | Compact (≥5p) |
|----------|-------------|---------------|
| `minWidth` | 70 | 52 |
| name `fontSize` | 12 | 10 |
| card `size` prop | `"hand"` | `"small"` |
| chip `fontSize` | 12 | 10 |
| padding | 6 | 4 |
| BOT badge | shown | hidden |

`compact` is an optional prop; existing callers without it retain normal appearance.

---

## Lobby Changes

### `src/components/lobby/LobbyView.tsx`

- `PLAYER_COUNTS`: `[2, 3, 4]` → `[2, 3, 4, 5, 6, 7, 8, 9]`
- `DEFAULT_NAMES`: extend from 4 to 9 entries
- Player count selector: change from `flexDirection: 'row'` (overflows at 8 buttons) to a 2-row grid (4 buttons per row) to avoid overflow on small screens
- Bot count guard at line 229 (`Math.min(9 - playerCount, c + 1)`) already uses 9 as the ceiling — **no change needed**

### `src/components/lobby/BleHostLobby.tsx`

- `MAX_SEATS = 4` → `MAX_SEATS = 9`
- The `Array.from({ length: MAX_SEATS }, ...)` loop that renders `PlayerSlot` rows will automatically display up to 9 seats

### `src/components/lobby/BleJoinLobby.tsx`

- `MAX_SEATS = 4` → `MAX_SEATS = 9`
- Same change as `BleHostLobby.tsx`; controls the `PlayerSlot` list on the client-side waiting screen

### `src/services/ble/LobbyHost.ts`

- `MAX_PLAYERS = 4` → `MAX_PLAYERS = 9`
- `findNextSeat()` loop ceiling: `for (let s = 1; s <= 3; s++)` → `for (let s = 1; s <= 8; s++)`
  (Without this change, seats 4–8 are never allocated even after `MAX_PLAYERS` is raised)

### `src/gameEngine/types.ts`

- Update comment on `Player.seat`: `// 0-3` → `// 0-8`

---

## Data Flow

```
TableLayout
  ↓ getTableSlots(allSeats, myIdx)
  ↓ SlotMap { TL?: seat, TC?: seat, ... BC: seat, ... }
  ↓ <PlayerSeat seat={n} compact={playerCount >= 5} />
```

---

## Testing

- Unit tests for `getTableSlots`: verify correct slot assignment for all player counts (2–9), including various `myIdx` values and the `myIdx === -1` spectator fallback
- Render tests for `TableLayout` at 2, 4, 6, 9 players to catch layout regressions
- `PlayingCard` unit test: verify `"small"` size renders without error
- Existing `PlayerSeat` tests pass unchanged (`compact` prop is optional with no default side effects)
- Lobby UI: verify `count-btn-5` through `count-btn-9` are rendered and selectable
- BLE: verify `MAX_PLAYERS = 9` allows up to 9 connections and `findNextSeat` returns seats 1–8 correctly
