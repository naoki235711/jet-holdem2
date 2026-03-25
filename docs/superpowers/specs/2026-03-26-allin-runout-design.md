# All-In Runout Showdown Design

**Date:** 2026-03-26
**Status:** Approved

## Problem

When all players go all-in (or one goes all-in and others call/fold), `advancePhase()` in `GameLoop` recursively skips flop→turn→river→showdown in a single synchronous call. The UI never renders intermediate states, resulting in an anticlimactic instant jump to the result screen.

## Goals

- Reveal remaining community cards one at a time with 1.5-second intervals
- Reveal all non-folded players' hole cards face-up when all-in runout begins
- Wait 2.5 seconds after the river before transitioning to showdown (drama)
- Show community cards in the result overlay so players can review the board

## Solution: New All-In Runout Phases

### New Phase Values

Add to `Phase` type in `src/gameEngine/types.ts`:

```ts
export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river'
  | 'allInFlop' | 'allInTurn' | 'allInRiver'
  | 'showdown' | 'roundEnd' | 'gameOver';
```

**Semantics:**
- `flop / turn / river` — betting is active on this street
- `allInFlop / allInTurn / allInRiver` — all players are all-in; community cards have been dealt for this street; waiting for UI timer before advancing

### `cardsRevealed` Flag on Player

Add optional field to `Player`:

```ts
export interface Player {
  // ...existing fields...
  cardsRevealed?: boolean; // true when hole cards are shown face-up to all
}
```

Set to `true` for all non-folded, non-out players when entering any `allIn*` phase.

### Phase Transition Table

| Current phase | All-in detected? | Next phase | Cards dealt |
|---|---|---|---|
| preflop | yes | allInFlop | flop (3 cards) |
| flop | yes | allInTurn | turn (1 card) |
| turn | yes | allInRiver | river (1 card) |
| river | — | showdown | — |
| allInFlop | (via advanceRunout) | allInTurn | turn (1 card) |
| allInTurn | (via advanceRunout) | allInRiver | river (1 card) |
| allInRiver | (via advanceRunout) | showdown | — |

"All-in detected" = after collecting bets from a betting round, `activePlayers.length <= 1` (at most one player can still act).

### `advanceRunout()` in `GameLoop`

```ts
advanceRunout(): void
```

- Called by the service layer (timer-driven from UI)
- Transitions: allInFlop → allInTurn (deal turn), allInTurn → allInRiver (deal river), allInRiver → showdown
- Throws if called in a non-allIn* phase

## Service Layer

### `GameService` Interface Change

Add:

```ts
advanceRunout(): void;
```

### Implementations

| Service | Behavior |
|---|---|
| `LocalGameService` | Calls `gameLoop.advanceRunout()` |
| `BleHostGameService` | Calls engine + broadcasts updated state to all clients |
| `BleClientGameService` | No-op (host drives runout; client observes state) |

## UI Timer (`GameContext.tsx`)

Watch `state.phase` for `allIn*` phases and fire timers:

| Phase entered | Delay | Action |
|---|---|---|
| allInFlop | 1500ms | `service.advanceRunout()` |
| allInTurn | 1500ms | `service.advanceRunout()` |
| allInRiver | 2500ms | `service.advanceRunout()` |

Timer fires once per phase entry (guarded by `useEffect` with `state.phase` dependency). BLE clients also fire the timer but `advanceRunout()` is a no-op, so no harm.

## UI Display Changes

### `PlayerSeat` — Hole Card Reveal

When `player.cardsRevealed === true`, render that player's hole cards face-up regardless of whether they are the local player. Existing logic already handles face-up rendering; the condition just needs to check `cardsRevealed`.

### `ResultOverlay` — Community Cards

When `showdownResult` is present, add a row of 5 community cards at the top of the modal (above the hands list):

```
┌─────────────────────────────┐
│  [Ah][Kd][Qc][Js][Th]       │  ← community cards
│  ─────────────────────────  │
│  Alice  [As][Ks]  Royal...  │
│  Bob    [2h][7d]  High Card │
│  Carol  (folded)            │
│                             │
│  Alice wins! ★              │
│      [次のラウンドへ]        │
└─────────────────────────────┘
```

Cards rendered using the existing `<PlayingCard>` component (`faceUp size="hand"`).

## Files Changed

| File | Change |
|---|---|
| `src/gameEngine/types.ts` | Add `allInFlop`, `allInTurn`, `allInRiver` to `Phase`; add `cardsRevealed?` to `Player` |
| `src/gameEngine/GameLoop.ts` | Update `advancePhase()` to enter allIn* phases; add `advanceRunout()` |
| `src/services/GameService.ts` | Add `advanceRunout()` to interface |
| `src/services/LocalGameService.ts` | Implement `advanceRunout()` |
| `src/services/ble/BleHostGameService.ts` | Implement `advanceRunout()` with broadcast |
| `src/services/ble/BleClientGameService.ts` | Implement `advanceRunout()` as no-op |
| `src/contexts/GameContext.tsx` | Add timer logic for allIn* phases |
| `src/components/table/PlayerSeat.tsx` | Show face-up when `cardsRevealed` |
| `src/components/result/ResultOverlay.tsx` | Add community cards row |

## Out of Scope

- Sound effects or card-flip animations (covered by a separate animation/sound plan)
- Configurable timer speed
