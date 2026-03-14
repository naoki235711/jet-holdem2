# Integration Tests Design Spec

**Date:** 2026-03-15
**Branch:** feature/matsuda/implement-data-persistence
**Scope:** Project-wide integration test gap analysis and implementation plan

## Overview

Identify and fill integration test gaps across all layers of the Jet Holdem project. The existing test suite has strong unit test coverage and 5 UI integration suites, but cross-layer boundaries remain untested.

## Approach

Hybrid strategy (Approach C):
- New `tests/integration/` directory for cross-layer Node-environment tests
- Existing `tests/ui/integration/` for React-dependent integration tests
- Extend existing test files for small gaps

### jest.config.js Change

Add `'<rootDir>/tests/integration'` to the engine project `roots` array.

## Test Files

### #1 Persistence Lifecycle (`tests/integration/persistenceLifecycle.integration.test.ts`)

**Purpose:** Verify `LocalGameService` + `subscribePersistence` + `InMemoryGameRepository` work together through real game progression (not mocked phase emissions).

**Difference from `usePersistence.test.ts`:** Existing tests use a mock service and manually emit phases. These tests use a real `LocalGameService` + `GameLoop` so that actual phase transitions trigger persistence.

| ID   | Test Case                                          | Assertion                                                                 |
|------|----------------------------------------------------|---------------------------------------------------------------------------|
| PL-1 | roundEnd saves player chips                        | Real game → all check → showdown → roundEnd → `repo.getPlayerChips()` matches player chips |
| PL-2 | Saved chips restore in next game                   | After PL-1, load chips via `repo.getPlayerChips()` → `startGame(..., savedChips)` → initial chips match saved values |
| PL-3 | Fold-win saves chips correctly                     | 2 players fold → roundEnd → winner chip increase reflected in repository  |
| PL-4 | gameOver saves game record                         | Multiple rounds → gameOver → `repo.getGameHistory()` returns 1 record with correct structure |
| PL-5 | Round count is accurate                            | 3 rounds completed → gameOver → `record.rounds === 3`                    |

**Setup:** Real `LocalGameService`, `InMemoryGameRepository`, `subscribePersistence`. Game advances via `handleAction` calls.

---

### #2 GameProvider Mode-Specific Logic (`tests/ui/integration/gameProviderModes.integration.test.tsx`)

**Purpose:** Verify `GameProvider`'s mode-dependent conditional branches (showdown auto-resolve, BLE-client phase detection, persistence hook wiring).

**Difference from `GameContext.test.tsx`:** Existing test only covers basic subscribe/state update. No mode-specific logic is tested.

| ID   | Test Case                                             | Assertion                                                                |
|------|-------------------------------------------------------|--------------------------------------------------------------------------|
| GM-1 | hotseat: doAction auto-resolves showdown              | River last action → `showdownResult` is automatically set               |
| GM-2 | debug: doAction auto-resolves showdown                | Same behavior confirmed in debug mode                                    |
| GM-3 | ble-client: doAction skips showdown auto-resolve      | River last action → `showdownResult` remains null                       |
| GM-4 | ble-client: subscribe detects showdown phase → resolveShowdown | Service subscription callback detects `phase === 'showdown'` → `showdownResult` set |
| GM-5 | repository passed → persistence activates             | `GameProvider` with `repository` → roundEnd → chips saved in repo       |
| GM-6 | repository omitted → persistence disabled             | `GameProvider` without `repository` → roundEnd → no data in repo        |
| GM-7 | debug mode maps to 'hotseat' for persistence config   | `mode='debug'` → persistence config mode is `'hotseat'` (GameContext.tsx:40) |

**Setup:**
- GM-1/2: Real `LocalGameService`, rendered via React Testing Library
- GM-3/4: Mock `GameService` interface (avoids BLE transport dependency). Focus is on `GameProvider` logic, not BLE transport layer (covered by `BleGameFlow.test.ts`)
- GM-5/6/7: `InMemoryGameRepository` passed as prop to `GameProvider`

---

### #3 BLE Lobby → Game Transition (`tests/integration/lobbyToGame.integration.test.ts`)

**Purpose:** Verify that `LobbyHost`/`LobbyClient` established connections and settings correctly propagate to `BleHostGameService`/`BleClientGameService` initialization.

**Difference from existing BLE tests:**
- `LobbyFlow.test.ts`: Only tests lobby internals (join/ready/disconnect). No game service initialization.
- `BleGameFlow.test.ts`: Constructs services directly. No lobby-origin settings.
- **This test:** Bridges the lobby→game boundary.

| ID   | Test Case                                             | Assertion                                                                |
|------|-------------------------------------------------------|--------------------------------------------------------------------------|
| LG-1 | Lobby settings propagate to game initialization       | LobbyHost `sb/bb/initialChips` → gameStart callback → `BleHostGameService` → `getState().blinds` and `players[].chips` match |
| LG-2 | Lobby participants become game players                | 3 clients join host → gameStart → player count is 4, names and seats match lobby order |
| LG-3 | Lobby → Game → first round starts                    | join → ready → gameStart → `startRound()` → all clients receive preflop state with 2 cards each |
| LG-4 | Modified lobby settings reflected in game             | `initialChips: 2000, sb: 10, bb: 20` → game uses changed values        |

**Setup:** `MockBleNetwork` + `MockBleHostTransport`/`MockBleClientTransport` (existing pattern). Execute lobby flow, then use gameStart callback output to initialize `BleHostGameService`.

---

### #4 LocalGameService Error Handling (`tests/services/LocalGameService.test.ts` — extend)

**Purpose:** Cover defensive error handling paths in `LocalGameService`. Currently only 1 error translation test exists.

| ID    | Test Case                                          | Assertion                                            |
|-------|----------------------------------------------------|------------------------------------------------------|
| **"Game not started" errors** | | |
| LE-1  | getState() before startGame                        | throws `'Game not started'`                          |
| LE-2  | getActionInfo() before startGame                   | throws `'Game not started'`                          |
| LE-3  | handleAction() before startGame                    | throws `'Game not started'`                          |
| LE-4  | resolveShowdown() before startGame                 | throws `'Game not started'`                          |
| LE-5  | prepareNextRound() before startGame                | throws `'Game not started'`                          |
| LE-6  | startRound() before startGame                      | throws `'Game not started'`                          |
| **Invalid seat** | | |
| LE-7  | getActionInfo() with non-existent seat             | throws `'Invalid seat: 5'`                           |
| **Error message translation** | | |
| LE-8  | "not your turn" pattern                            | Non-active player action → `'あなたのターンではありません'` |
| LE-9  | "Minimum raise is" pattern                         | Below-minimum raise → `'レイズ額が最低額に達していません'` |
| LE-10 | All predefined ERROR_MESSAGES translate correctly   | Each key maps to its Japanese translation            |

**Setup:** `new LocalGameService()` without `startGame()` for LE-1~6. Normal game progression for LE-7~10, triggering errors via invalid actions.

---

### #5 GameLoop + PotManager Integration (`tests/gameEngine/GameLoopPotManager.integration.test.ts`)

**Purpose:** Verify the integration between `GameLoop`'s internal `collectBetsFromRound()` → `PotManager` operations → chip distribution, through actual `handleAction` calls.

**Difference from existing tests:**
- `PotManager.test.ts`: Tests `collectBets()` / `removeFoldedPlayer()` in isolation
- `GameLoop.test.ts`: Tests phase transitions and dealer rotation, pot calculation indirect
- **This test:** Verifies chip conservation and pot distribution through the full GameLoop→PotManager pipeline

| ID   | Test Case                                             | Assertion                                                                |
|------|-------------------------------------------------------|--------------------------------------------------------------------------|
| **Fold-win pot distribution** | | |
| GP-1 | Preflop 2 fold → last player wins pot                | `foldWin.amount` equals blind total, winner chips increase correctly     |
| GP-2 | Multi-round bets collected before fold-win           | Preflop call → flop bet/call → turn fold → pot = all rounds' bets total |
| **Side pot + fold combinations** | | |
| GP-3 | Short-stack all-in then another folds                | P1(100) all-in, P2 call, P3 fold → main pot eligible excludes P3       |
| GP-4 | Multiple side pots with folds                        | P1(50) all-in, P2(100) all-in, P3(1000) call, P4 fold → correct pot structure, P4 excluded from eligible |
| **Chip conservation law** | | |
| GP-5 | Showdown: total chips unchanged                      | 3 players × 1000 → showdown → `sum(players.chips) === 3000`            |
| GP-6 | Fold-win: total chips unchanged                      | Same condition as GP-1 → `sum(players.chips) === 3000`                  |
| GP-7 | Side pot showdown: total chips unchanged             | Same condition as GP-3 → total preserved                                |

**Setup:** Direct `GameLoop` instantiation (no service layer), `handleAction` to progress game.

---

### #6 Repository Resilience (`tests/integration/repositoryResilience.integration.test.ts`)

**Purpose:** Verify that `GameRepository` errors do not crash the game. `subscribePersistence` calls repository methods fire-and-forget (no await), so Promise rejections must be handled gracefully.

**Note:** If tests reveal unhandled promise rejections, implementation changes (adding try-catch in `subscribePersistence`) are expected as part of this work.

| ID   | Test Case                                             | Assertion                                                                |
|------|-------------------------------------------------------|--------------------------------------------------------------------------|
| RR-1 | savePlayerChips throws → game continues              | roundEnd → `savePlayerChips` rejects → next `startRound()` works       |
| RR-2 | Partial failure: one player save fails               | 3 players, 1 rejects → other 2 chips saved correctly                   |
| RR-3 | saveGameRecord throws → game state intact            | gameOver → `saveGameRecord` rejects → `getState().phase === 'gameOver'` |
| RR-4 | repository=null → full game flow completes           | `subscribePersistence(service, null, config)` → start to gameOver without exceptions |
| RR-5 | Slow save does not block game progression            | `savePlayerChips` resolves after 1s delay → game proceeds to next round immediately |

**Setup:**
- `FailingRepository` extending `InMemoryGameRepository` with overridden methods
- `jest.spyOn` for selective method rejection
- Real `LocalGameService` for game progression

## Design Principles

1. **No duplication with existing tests** — each section specifies the difference from existing coverage
2. **Real objects over mocks** — mocks only for BLE transport layer and intentional error injection
3. **Implementation fixes welcome** — if tests reveal unhandled rejections (#6), the fix is in scope
4. **Chip conservation as invariant** — #5 validates that total chips are preserved across all scenarios

## File Summary

| File | Action | Test Count | Environment |
|------|--------|-----------|-------------|
| `tests/integration/persistenceLifecycle.integration.test.ts` | New | 5 | Node |
| `tests/ui/integration/gameProviderModes.integration.test.tsx` | New | 7 | React |
| `tests/integration/lobbyToGame.integration.test.ts` | New | 4 | Node |
| `tests/services/LocalGameService.test.ts` | Extend | 10 | Node |
| `tests/gameEngine/GameLoopPotManager.integration.test.ts` | New | 7 | Node |
| `tests/integration/repositoryResilience.integration.test.ts` | New | 5 | Node |
| `jest.config.js` | Modify | — | — |
| **Total** | | **38** | |
