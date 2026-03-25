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

`BC` is always the viewing player's own seat. Remaining players are assigned counter-clockwise starting from `BL`, using the ordered slot list:

```ts
const SLOT_ORDER: SlotName[] = ['BC', 'BL', 'LB', 'LT', 'TC', 'TR', 'RT', 'RB', 'BR'];
```

Slot usage by player count:

| Count | Slots used |
|-------|-----------|
| 2 | BC, TC |
| 3 | BC, BL, TR |
| 4 | BC, BL, TC, TR |
| 5 | BC, BL, LB, TC, TR |
| 6 | BC, BL, LB, LT, TC, TR |
| 7 | BC, BL, LB, LT, TC, TR, RT |
| 8 | BC, BL, LB, LT, TC, TR, RT, RB |
| 9 | BC, BL, LB, LT, TC, TR, RT, RB, BR |

Implementation: take the first `playerCount` entries from `SLOT_ORDER`, assign `allSeats[(myIdx + offset) % playerCount]` to each slot.

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

Each slot renders `<PlayerSeat seat={slots.XX} compact={compact} />` if the slot is defined.

The middle row side areas change from a single `sideSlot` (width 80) to a column of up to 2 seats.

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

`PlayingCard` already accepts a `size` prop, so no changes needed there.

---

## Lobby Changes

### `src/components/lobby/LobbyView.tsx`

- `PLAYER_COUNTS`: `[2, 3, 4]` → `[2, 3, 4, 5, 6, 7, 8, 9]`
- `DEFAULT_NAMES`: extend to 9 entries
- Player count selector: change from `flexDirection: 'row'` to a 2-row grid (4 buttons per row) to avoid overflow on small screens

### `src/services/ble/LobbyHost.ts`

- `MAX_PLAYERS = 4` → `MAX_PLAYERS = 9`

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

## Error Handling

- `getTableSlots` must be resilient to `myIdx === -1` (spectator/observer): return `{}` or place all players in top row.
- No changes to game engine logic — seat numbers remain arbitrary integers; only the UI layer changes.

---

## Testing

- Unit tests for `getTableSlots`: verify correct slot assignment for all player counts (2–9), including edge cases (myIdx at various positions).
- Snapshot or render tests for `TableLayout` at 2, 4, 6, 9 players.
- Existing `PlayerSeat` tests pass without modification (compact prop is optional).
- Lobby UI: verify `count-btn-5` through `count-btn-9` are rendered and selectable.
- BLE: verify `MAX_PLAYERS` enforcement allows up to 9 connections.
