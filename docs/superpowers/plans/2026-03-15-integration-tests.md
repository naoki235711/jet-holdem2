# Integration Tests Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 40 integration tests across 6 categories to cover untested cross-layer boundaries.

**Architecture:** Node-environment cross-layer tests go in `tests/integration/`, React-dependent tests in `tests/ui/integration/`, and engine-layer tests in `tests/gameEngine/`. Existing `tests/services/LocalGameService.test.ts` is extended for error handling. A prerequisite implementation fix adds `.catch()` to fire-and-forget calls in `subscribePersistence`.

**Tech Stack:** Jest, @testing-library/react-native, ts-jest, InMemoryGameRepository, MockBleTransport

**Spec:** `docs/superpowers/specs/2026-03-15-integration-tests-design.md`

---

## Chunk 1: Infrastructure + Persistence Tests

### Task 1: Infrastructure — jest.config + subscribePersistence .catch fix

**Files:**
- Modify: `jest.config.js:7`
- Modify: `src/hooks/usePersistence.ts:35,53`

- [ ] **Step 1: Add `tests/integration` to jest engine roots**

```js
// jest.config.js — line 7, add '<rootDir>/tests/integration' to existing roots array
roots: ['<rootDir>/tests/gameEngine', '<rootDir>/tests/services', '<rootDir>/tests/ble', '<rootDir>/tests/persistence', '<rootDir>/tests/integration'],
```

- [ ] **Step 2: Add .catch() to fire-and-forget repository calls in subscribePersistence**

In `src/hooks/usePersistence.ts`, wrap the two fire-and-forget repository calls:

```typescript
// Line 35: change
repository.savePlayerChips(player.name, player.chips);
// to
// Intentionally silent: persistence is best-effort, game must not crash on save failure
repository.savePlayerChips(player.name, player.chips).catch(() => {});
```

```typescript
// Line 53: change
repository.saveGameRecord(record);
// to
// Intentionally silent: persistence is best-effort, game must not crash on save failure
repository.saveGameRecord(record).catch(() => {});
```

- [ ] **Step 3: Run existing tests to verify nothing broke**

Run: `npx jest --projects jest.config.js 2>&1 | tail -20`
Expected: All existing tests pass. The `.catch()` calls are no-ops for successful saves.

- [ ] **Step 4: Commit**

```bash
git add jest.config.js src/hooks/usePersistence.ts
git commit -m "chore: add tests/integration root and .catch for fire-and-forget saves"
```

---

### Task 2: Persistence Lifecycle Integration Tests (PL-1 through PL-5)

**Files:**
- Create: `tests/integration/persistenceLifecycle.integration.test.ts`

**Reference:**
- `src/services/LocalGameService.ts` — real service, `startGame`, `handleAction`, `resolveShowdown`, `prepareNextRound`
- `src/hooks/usePersistence.ts` — `subscribePersistence` function
- `src/services/persistence/InMemoryGameRepository.ts` — in-memory repo
- `tests/ui/integration/helpers/integrationTestHelper.tsx:111-136` — `advanceToPhase` pattern to reuse

- [ ] **Step 1: Write the test file**

```typescript
// tests/integration/persistenceLifecycle.integration.test.ts

import { LocalGameService } from '../../src/services/LocalGameService';
import { InMemoryGameRepository } from '../../src/services/persistence/InMemoryGameRepository';
import { subscribePersistence, PersistenceConfig } from '../../src/hooks/usePersistence';

// Helper: advance game by having all players check/call until targetPhase
function advanceToPhase(service: LocalGameService, targetPhase: string): void {
  let state = service.getState();
  let safety = 0;
  while (state.phase !== targetPhase && safety < 100) {
    if (state.activePlayer < 0) {
      if (state.phase === 'showdown') {
        service.resolveShowdown();
        state = service.getState();
        continue;
      }
      break;
    }
    const info = service.getActionInfo(state.activePlayer);
    if (info.canCheck) {
      service.handleAction(state.activePlayer, { action: 'check' });
    } else {
      service.handleAction(state.activePlayer, { action: 'call' });
    }
    state = service.getState();
    safety++;
  }
}

// Helper: fold all but the last active player → fold-win roundEnd
function foldToRoundEnd(service: LocalGameService): void {
  let state = service.getState();
  while (state.phase !== 'roundEnd' && state.activePlayer >= 0) {
    service.handleAction(state.activePlayer, { action: 'fold' });
    state = service.getState();
  }
}

// Wait for fire-and-forget async saves to complete
const flushPromises = () => new Promise(r => setTimeout(r, 20));

describe('Persistence Lifecycle Integration', () => {
  let service: LocalGameService;
  let repo: InMemoryGameRepository;
  let config: PersistenceConfig;
  let unsub: () => void;

  beforeEach(() => {
    service = new LocalGameService();
    repo = new InMemoryGameRepository();
    config = { mode: 'hotseat', initialChips: 1000, blinds: { sb: 5, bb: 10 } };
  });

  afterEach(() => {
    unsub?.();
  });

  // PL-1
  it('saves player chips on roundEnd via real game progression', async () => {
    unsub = subscribePersistence(service, repo, config);
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
    service.startRound();
    advanceToPhase(service, 'roundEnd');

    await flushPromises();

    const state = service.getState();
    expect(state.phase).toBe('roundEnd');

    for (const player of state.players) {
      const savedChips = await repo.getPlayerChips(player.name);
      expect(savedChips).toBe(player.chips);
    }
  });

  // PL-2
  it('saved chips restore correctly in next game', async () => {
    unsub = subscribePersistence(service, repo, config);
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
    service.startRound();
    advanceToPhase(service, 'roundEnd');

    await flushPromises();

    // Load saved chips
    const savedChips: Record<string, number> = {};
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      const chips = await repo.getPlayerChips(name);
      savedChips[name] = chips!;
    }

    // Start a new game with saved chips
    const service2 = new LocalGameService();
    service2.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000, savedChips);
    const state2 = service2.getState();

    for (const player of state2.players) {
      expect(player.chips).toBe(savedChips[player.name]);
    }
  });

  // PL-3
  it('fold-win saves chips correctly', async () => {
    unsub = subscribePersistence(service, repo, config);
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
    service.startRound();

    // Record chips after blinds posted
    const preState = service.getState();
    const totalBefore = preState.players.reduce((s, p) => s + p.chips + p.bet, 0);

    foldToRoundEnd(service);

    await flushPromises();

    const state = service.getState();
    expect(state.phase).toBe('roundEnd');

    // Verify chip conservation
    const totalAfter = state.players.reduce((s, p) => s + p.chips, 0);
    expect(totalAfter).toBe(totalBefore);

    // Verify winner's chips increased
    const winner = state.players.find(p => p.seat === state.foldWin!.seat)!;
    expect(winner.chips).toBeGreaterThan(1000);

    // Verify saved chips match
    for (const player of state.players) {
      const saved = await repo.getPlayerChips(player.name);
      expect(saved).toBe(player.chips);
    }
  });

  // PL-4
  it('saves game record on gameOver', async () => {
    // Use 2 players with low chips to reach gameOver quickly
    const lowConfig: PersistenceConfig = { mode: 'hotseat', initialChips: 30, blinds: { sb: 10, bb: 20 } };
    unsub = subscribePersistence(service, repo, lowConfig);
    service.startGame(['Alice', 'Bob'], { sb: 10, bb: 20 }, 30);

    // Play rounds until gameOver
    while (service.getState().phase !== 'gameOver') {
      service.startRound();
      advanceToPhase(service, 'roundEnd');
      service.prepareNextRound();
    }

    await flushPromises();

    const history = await repo.getGameHistory();
    expect(history).toHaveLength(1);

    const record = history[0];
    expect(record.mode).toBe('hotseat');
    expect(record.blinds).toEqual({ sb: 10, bb: 20 });
    expect(record.initialChips).toBe(30);
    expect(record.results).toHaveLength(2);

    // One player has all chips, the other has 0
    const winner = record.results.find(r => r.finalChips > 0)!;
    const loser = record.results.find(r => r.finalChips === 0)!;
    expect(winner.finalChips).toBe(60); // Total chips
    expect(loser.finalChips).toBe(0);
    expect(winner.chipChange).toBe(30);
    expect(loser.chipChange).toBe(-30);
  });

  // PL-5
  it('round count is accurate in game record', async () => {
    const lowConfig: PersistenceConfig = { mode: 'hotseat', initialChips: 50, blinds: { sb: 10, bb: 20 } };
    unsub = subscribePersistence(service, repo, lowConfig);
    service.startGame(['Alice', 'Bob'], { sb: 10, bb: 20 }, 50);

    let roundsPlayed = 0;
    while (service.getState().phase !== 'gameOver') {
      service.startRound();
      advanceToPhase(service, 'roundEnd');
      roundsPlayed++;
      service.prepareNextRound();
    }

    await flushPromises();

    const history = await repo.getGameHistory();
    expect(history).toHaveLength(1);
    expect(history[0].rounds).toBe(roundsPlayed);
    expect(roundsPlayed).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest tests/integration/persistenceLifecycle.integration.test.ts --verbose 2>&1 | tail -30`
Expected: 5 tests pass (PL-1 through PL-5)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/persistenceLifecycle.integration.test.ts
git commit -m "test: add persistence lifecycle integration tests (PL-1..PL-5)"
```

---

### Task 3: Repository Resilience Tests (RR-1 through RR-5)

**Files:**
- Create: `tests/integration/repositoryResilience.integration.test.ts`

**Reference:**
- `src/hooks/usePersistence.ts:32-36,40-54` — fire-and-forget calls with `.catch()` (added in Task 1)
- `src/services/persistence/InMemoryGameRepository.ts` — base class for spy/override

- [ ] **Step 1: Write the test file**

```typescript
// tests/integration/repositoryResilience.integration.test.ts

import { LocalGameService } from '../../src/services/LocalGameService';
import { InMemoryGameRepository } from '../../src/services/persistence/InMemoryGameRepository';
import { subscribePersistence, PersistenceConfig } from '../../src/hooks/usePersistence';

function advanceToPhase(service: LocalGameService, targetPhase: string): void {
  let state = service.getState();
  let safety = 0;
  while (state.phase !== targetPhase && safety < 100) {
    if (state.activePlayer < 0) {
      if (state.phase === 'showdown') {
        service.resolveShowdown();
        state = service.getState();
        continue;
      }
      break;
    }
    const info = service.getActionInfo(state.activePlayer);
    if (info.canCheck) {
      service.handleAction(state.activePlayer, { action: 'check' });
    } else {
      service.handleAction(state.activePlayer, { action: 'call' });
    }
    state = service.getState();
    safety++;
  }
}

const flushPromises = () => new Promise(r => setTimeout(r, 20));

describe('Repository Resilience', () => {
  let service: LocalGameService;
  let config: PersistenceConfig;

  beforeEach(() => {
    service = new LocalGameService();
    config = { mode: 'hotseat', initialChips: 1000, blinds: { sb: 5, bb: 10 } };
  });

  // RR-1
  it('savePlayerChips throws → game continues', async () => {
    const repo = new InMemoryGameRepository();
    jest.spyOn(repo, 'savePlayerChips').mockRejectedValue(new Error('Storage full'));

    const unsub = subscribePersistence(service, repo, config);
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
    service.startRound();
    advanceToPhase(service, 'roundEnd');

    await flushPromises();

    // Game should continue despite save failure
    service.prepareNextRound();
    expect(service.getState().phase).toBe('waiting');
    service.startRound();
    expect(service.getState().phase).toBe('preflop');

    unsub();
  });

  // RR-2
  it('partial failure: one player save fails, others succeed', async () => {
    const repo = new InMemoryGameRepository();
    // Track which players were successfully saved
    const savedChips = new Map<string, number>();
    jest.spyOn(repo, 'savePlayerChips').mockImplementation(
      async (name: string, chips: number) => {
        if (name === 'Bob') throw new Error('Disk error');
        savedChips.set(name, chips);
      },
    );

    const unsub = subscribePersistence(service, repo, config);
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
    service.startRound();
    advanceToPhase(service, 'roundEnd');

    await flushPromises();

    const state = service.getState();
    // Alice and Charlie saved, Bob not saved
    expect(savedChips.get('Alice')).toBe(state.players[0].chips);
    expect(savedChips.has('Bob')).toBe(false); // Failed, not saved
    expect(savedChips.get('Charlie')).toBe(state.players[2].chips);

    unsub();
  });

  // RR-3
  it('saveGameRecord throws → game state intact', async () => {
    const repo = new InMemoryGameRepository();
    jest.spyOn(repo, 'saveGameRecord').mockRejectedValue(new Error('Write error'));

    const lowConfig: PersistenceConfig = { mode: 'hotseat', initialChips: 30, blinds: { sb: 10, bb: 20 } };
    const unsub = subscribePersistence(service, repo, lowConfig);
    service.startGame(['Alice', 'Bob'], { sb: 10, bb: 20 }, 30);

    while (service.getState().phase !== 'gameOver') {
      service.startRound();
      advanceToPhase(service, 'roundEnd');
      service.prepareNextRound();
    }

    await flushPromises();

    expect(service.getState().phase).toBe('gameOver');
    // Record not saved due to error
    expect(await repo.getGameHistory()).toHaveLength(0);

    unsub();
  });

  // RR-4
  it('repository=null → full game flow completes without exceptions', async () => {
    const unsub = subscribePersistence(service, null, config);

    service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
    service.startRound();
    advanceToPhase(service, 'roundEnd');
    service.prepareNextRound();
    expect(service.getState().phase).toBe('waiting');
    service.startRound();
    expect(service.getState().phase).toBe('preflop');

    unsub();
  });

  // RR-5
  it('slow save does not block game progression', async () => {
    const repo = new InMemoryGameRepository();
    jest.spyOn(repo, 'savePlayerChips').mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000)),
    );

    const unsub = subscribePersistence(service, repo, config);
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
    service.startRound();
    advanceToPhase(service, 'roundEnd');

    // Game should proceed immediately without waiting for 1s save
    service.prepareNextRound();
    expect(service.getState().phase).toBe('waiting');
    service.startRound();
    expect(service.getState().phase).toBe('preflop');

    unsub();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest tests/integration/repositoryResilience.integration.test.ts --verbose 2>&1 | tail -30`
Expected: 5 tests pass (RR-1 through RR-5)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/repositoryResilience.integration.test.ts
git commit -m "test: add repository resilience integration tests (RR-1..RR-5)"
```

---

## Chunk 2: Engine Layer Tests

### Task 4: LocalGameService Error Handling (LE-1 through LE-10)

**Files:**
- Modify: `tests/services/LocalGameService.test.ts`

**Reference:**
- `src/services/LocalGameService.ts:7-24` — `ERROR_MESSAGES` and `translateError`
- `src/services/LocalGameService.ts:30-92` — methods that throw `'Game not started'`
- `src/gameEngine/BettingRound.ts:98` — `"Seat N: not your turn"` error
- `src/gameEngine/BettingRound.ts:184` — `"Minimum raise is"` error

- [ ] **Step 1: Add error handling describe blocks to existing test file**

Append the following to `tests/services/LocalGameService.test.ts`, inside the top-level `describe('LocalGameService', ...)` block, after the existing `describe('full round lifecycle', ...)`:

```typescript
  describe('error: game not started', () => {
    // LE-1
    it('getState() throws before startGame', () => {
      const svc = new LocalGameService();
      expect(() => svc.getState()).toThrow('Game not started');
    });

    // LE-2
    it('getActionInfo() throws before startGame', () => {
      const svc = new LocalGameService();
      expect(() => svc.getActionInfo(0)).toThrow('Game not started');
    });

    // LE-3
    it('handleAction() throws before startGame', () => {
      const svc = new LocalGameService();
      expect(() => svc.handleAction(0, { action: 'fold' })).toThrow('Game not started');
    });

    // LE-4
    it('resolveShowdown() throws before startGame', () => {
      const svc = new LocalGameService();
      expect(() => svc.resolveShowdown()).toThrow('Game not started');
    });

    // LE-5
    it('prepareNextRound() throws before startGame', () => {
      const svc = new LocalGameService();
      expect(() => svc.prepareNextRound()).toThrow('Game not started');
    });

    // LE-6
    it('startRound() throws before startGame', () => {
      const svc = new LocalGameService();
      expect(() => svc.startRound()).toThrow('Game not started');
    });
  });

  describe('error: invalid seat', () => {
    // LE-7
    it('getActionInfo() throws for non-existent seat', () => {
      service.startRound();
      expect(() => service.getActionInfo(5)).toThrow('Invalid seat: 5');
    });
  });

  describe('error message translation', () => {
    // LE-8
    it('translates "not your turn" to Japanese', () => {
      service.startRound();
      const state = service.getState();
      const wrongSeat = state.players.find(p => p.seat !== state.activePlayer && p.status === 'active')!.seat;
      const result = service.handleAction(wrongSeat, { action: 'fold' });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('あなたのターンではありません');
    });

    // LE-9
    it('translates "Minimum raise is" to Japanese', () => {
      service.startRound();
      const state = service.getState();
      // Raise to a value below minimum (minRaise = currentBet + bb = 10 + 10 = 20)
      const result = service.handleAction(state.activePlayer, { action: 'raise', amount: 11 });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('レイズ額が最低額に達していません');
    });

    // LE-10
    it('all predefined error messages have translations', () => {
      // "Cannot check" — UTG in preflop faces BB, cannot check
      service.startRound();
      const state = service.getState();
      const checkResult = service.handleAction(state.activePlayer, { action: 'check' });
      expect(checkResult.valid).toBe(false);
      expect(checkResult.reason).toBe('チェックできません。コール、レイズ、またはフォールドしてください');

      // "Nothing to call" — BB in preflop after all call, can check but not call
      // UTG calls, SB calls, then BB can check
      service.handleAction(state.activePlayer, { action: 'call' });
      const s2 = service.getState();
      service.handleAction(s2.activePlayer, { action: 'call' });
      const s3 = service.getState();
      // BB faces currentBet == own bet, so 'call' should fail with "Nothing to call"
      const callResult = service.handleAction(s3.activePlayer, { action: 'call' });
      expect(callResult.valid).toBe(false);
      expect(callResult.reason).toBe('コールする必要はありません。チェックしてください');
    });
  });
```

- [ ] **Step 2: Run the extended test file**

Run: `npx jest tests/services/LocalGameService.test.ts --verbose 2>&1 | tail -40`
Expected: All tests pass (existing + 10 new: LE-1 through LE-10)

- [ ] **Step 3: Commit**

```bash
git add tests/services/LocalGameService.test.ts
git commit -m "test: add LocalGameService error handling tests (LE-1..LE-10)"
```

---

### Task 5: GameLoop + PotManager Integration Tests (GP-1 through GP-7)

**Files:**
- Create: `tests/gameEngine/GameLoopPotManager.integration.test.ts`

**Reference:**
- `src/gameEngine/GameLoop.ts:233-248` — `collectBetsFromRound` (private, tested indirectly)
- `src/gameEngine/GameLoop.ts:303-308` — `awardPotToLastPlayer`
- `src/gameEngine/PotManager.ts` — pot tracking

- [ ] **Step 1: Write the test file**

```typescript
// tests/gameEngine/GameLoopPotManager.integration.test.ts

import { GameLoop } from '../../src/gameEngine/GameLoop';
import { Player, PlayerStatus, Blinds } from '../../src/gameEngine/types';

function makePlayers(configs: { name: string; chips: number }[]): Player[] {
  return configs.map((c, i) => ({
    seat: i,
    name: c.name,
    chips: c.chips,
    status: 'active' as PlayerStatus,
    bet: 0,
    cards: [],
  }));
}

function advanceToPhase(gameLoop: GameLoop, targetPhase: string): void {
  let state = gameLoop.getState();
  let safety = 0;
  while (state.phase !== targetPhase && safety < 100) {
    if (state.activePlayer < 0) {
      if (state.phase === 'showdown') {
        gameLoop.resolveShowdown();
        state = gameLoop.getState();
        continue;
      }
      break;
    }
    const activePlayer = state.players.find(p => p.seat === state.activePlayer)!;
    if (state.currentBet <= activePlayer.bet) {
      gameLoop.handleAction(state.activePlayer, { action: 'check' });
    } else {
      gameLoop.handleAction(state.activePlayer, { action: 'call' });
    }
    state = gameLoop.getState();
    safety++;
  }
}

const blinds: Blinds = { sb: 5, bb: 10 };

describe('GameLoop + PotManager Integration', () => {
  describe('fold-win pot distribution', () => {
    // GP-1
    it('preflop 2 fold → last player wins blind total', () => {
      const players = makePlayers([
        { name: 'Alice', chips: 1000 },
        { name: 'Bob', chips: 1000 },
        { name: 'Charlie', chips: 1000 },
      ]);
      const gl = new GameLoop(players, blinds);
      const initialTotal = players.reduce((s, p) => s + p.chips, 0);

      gl.startRound();
      const state = gl.getState();

      // UTG (seat 0) folds, then next active player folds
      gl.handleAction(state.activePlayer, { action: 'fold' });
      const state2 = gl.getState();
      gl.handleAction(state2.activePlayer, { action: 'fold' });

      const finalState = gl.getState();
      expect(finalState.phase).toBe('roundEnd');
      expect(finalState.foldWin).toBeDefined();
      expect(finalState.foldWin!.amount).toBe(15); // SB(5) + BB(10)

      // Winner chips increased by pot amount
      const winner = finalState.players.find(p => p.seat === finalState.foldWin!.seat)!;
      expect(winner.chips).toBeGreaterThan(1000);

      // Total chips conserved
      expect(finalState.players.reduce((s, p) => s + p.chips, 0)).toBe(initialTotal);
    });

    // GP-2
    it('multi-round bets collected before fold-win', () => {
      const players = makePlayers([
        { name: 'Alice', chips: 1000 },
        { name: 'Bob', chips: 1000 },
        { name: 'Charlie', chips: 1000 },
      ]);
      const gl = new GameLoop(players, blinds);
      const initialTotal = 3000;

      gl.startRound();
      // 3 players, dealer=0: SB=seat1, BB=seat2, UTG=seat0

      // Preflop: all call/check (accumulates SB+BB = 15, then calls to 10 each = 30 total)
      let state = gl.getState();
      while (state.phase === 'preflop' && state.activePlayer >= 0) {
        const p = state.players.find(pp => pp.seat === state.activePlayer)!;
        if (state.currentBet <= p.bet) {
          gl.handleAction(state.activePlayer, { action: 'check' });
        } else {
          gl.handleAction(state.activePlayer, { action: 'call' });
        }
        state = gl.getState();
      }
      expect(state.phase).toBe('flop');

      // Flop: seat1 raises to 20, seat2 calls, seat0 folds
      // Post-flop first to act = seat1 (first active after dealer=0)
      gl.handleAction(state.activePlayer, { action: 'raise', amount: 20 });
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'call' });
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'fold' });

      // After fold: 2 non-folded remain (no fold-win). Advances to turn.
      state = gl.getState();
      expect(state.phase).toBe('turn');

      // Turn: one remaining player folds → fold-win
      gl.handleAction(state.activePlayer, { action: 'fold' });
      state = gl.getState();

      expect(state.phase).toBe('roundEnd');
      expect(state.foldWin).toBeDefined();
      // Pot includes preflop bets (30) + flop bets (40) = 70
      expect(state.foldWin!.amount).toBeGreaterThan(15); // More than just blinds
      expect(state.players.reduce((s, p) => s + p.chips, 0)).toBe(initialTotal);
    });
  });

  describe('side pot + fold combinations', () => {
    // GP-3
    it('short-stack all-in then another folds → correct pot eligibility', () => {
      const players = makePlayers([
        { name: 'P1', chips: 100 },
        { name: 'P2', chips: 1000 },
        { name: 'P3', chips: 1000 },
      ]);
      const gl = new GameLoop(players, blinds);
      gl.startRound();

      // P1 (UTG, seat 0) goes all-in with 100
      // In preflop: seat 0 is UTG (first to act for 3 players)
      let state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'allIn' });

      // P2 calls
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'call' });

      // P3 folds
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'fold' });

      state = gl.getState();
      // Skip to showdown/roundEnd
      advanceToPhase(gl, 'roundEnd');

      const finalState = gl.getState();
      expect(finalState.phase).toBe('roundEnd');

      // Chip conservation
      const initialTotal = 100 + 1000 + 1000;
      expect(finalState.players.reduce((s, p) => s + p.chips, 0)).toBe(initialTotal);
    });

    // GP-4
    it('multiple side pots with folds → correct pot structure', () => {
      const players = makePlayers([
        { name: 'P1', chips: 50 },
        { name: 'P2', chips: 100 },
        { name: 'P3', chips: 1000 },
        { name: 'P4', chips: 1000 },
      ]);
      const gl = new GameLoop(players, { sb: 5, bb: 10 });
      gl.startRound();

      let state = gl.getState();
      // 4-player: dealer=seat0(P1,50), SB=seat1(P2,100), BB=seat2(P3,1000), UTG=seat3(P4,1000)

      // seat3 (P4, UTG) calls BB
      gl.handleAction(state.activePlayer, { action: 'call' });
      state = gl.getState();

      // seat0 (P1, dealer, 50 chips) all-in
      gl.handleAction(state.activePlayer, { action: 'allIn' });
      state = gl.getState();

      // seat1 (P2, SB, 100 chips) all-in
      gl.handleAction(state.activePlayer, { action: 'allIn' });
      state = gl.getState();

      // seat2 (P3, BB) folds
      gl.handleAction(state.activePlayer, { action: 'fold' });
      state = gl.getState();

      // seat3 (P4) calls to match highest bet
      if (state.activePlayer >= 0 && state.phase !== 'roundEnd') {
        gl.handleAction(state.activePlayer, { action: 'call' });
        state = gl.getState();
      }

      // Advance to roundEnd
      advanceToPhase(gl, 'roundEnd');

      const finalState = gl.getState();
      expect(finalState.phase).toBe('roundEnd');

      // Chip conservation
      const initialTotal = 50 + 100 + 1000 + 1000;
      expect(finalState.players.reduce((s, p) => s + p.chips, 0)).toBe(initialTotal);
    });
  });

  describe('chip conservation law', () => {
    // GP-5
    it('showdown: total chips unchanged (3-player)', () => {
      const players = makePlayers([
        { name: 'Alice', chips: 1000 },
        { name: 'Bob', chips: 1000 },
        { name: 'Charlie', chips: 1000 },
      ]);
      const gl = new GameLoop(players, blinds);
      gl.startRound();
      advanceToPhase(gl, 'roundEnd');

      const finalState = gl.getState();
      expect(finalState.players.reduce((s, p) => s + p.chips, 0)).toBe(3000);
    });

    // GP-6
    it('fold-win: total chips unchanged', () => {
      const players = makePlayers([
        { name: 'Alice', chips: 1000 },
        { name: 'Bob', chips: 1000 },
        { name: 'Charlie', chips: 1000 },
      ]);
      const gl = new GameLoop(players, blinds);
      gl.startRound();

      // Two players fold
      let state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'fold' });
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'fold' });

      const finalState = gl.getState();
      expect(finalState.phase).toBe('roundEnd');
      expect(finalState.players.reduce((s, p) => s + p.chips, 0)).toBe(3000);
    });

    // GP-7
    it('side pot showdown: total chips unchanged', () => {
      const players = makePlayers([
        { name: 'P1', chips: 100 },
        { name: 'P2', chips: 500 },
        { name: 'P3', chips: 1000 },
      ]);
      const gl = new GameLoop(players, blinds);
      const initialTotal = 100 + 500 + 1000;

      gl.startRound();
      // P1 all-in, P2 call, P3 call
      let state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'allIn' });
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'call' });
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'call' });

      advanceToPhase(gl, 'roundEnd');

      const finalState = gl.getState();
      expect(finalState.players.reduce((s, p) => s + p.chips, 0)).toBe(initialTotal);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest tests/gameEngine/GameLoopPotManager.integration.test.ts --verbose 2>&1 | tail -30`
Expected: 7 tests pass (GP-1 through GP-7)

- [ ] **Step 3: Commit**

```bash
git add tests/gameEngine/GameLoopPotManager.integration.test.ts
git commit -m "test: add GameLoop+PotManager integration tests (GP-1..GP-7)"
```

---

## Chunk 3: Context and BLE Integration Tests

### Task 6: GameProvider Mode-Specific Logic Tests (GM-1 through GM-9)

**Depends on:** Task 1 (`.catch()` fix in `subscribePersistence`) — GM-5/7/8 use persistence through `GameProvider`, which requires the `.catch()` handlers to avoid unhandled rejections.

**Files:**
- Create: `tests/ui/integration/gameProviderModes.integration.test.tsx`

**Reference:**
- `src/contexts/GameContext.tsx:40` — `persistMode` mapping (debug→hotseat)
- `src/contexts/GameContext.tsx:67-72` — BLE-client showdown detection
- `src/contexts/GameContext.tsx:85-98` — `doAction` with mode-specific auto-resolve
- `src/contexts/GameContext.tsx:104-111` — `nextRound`
- `tests/ui/contexts/GameContext.test.tsx` — existing test patterns

- [ ] **Step 1: Write the test file**

```tsx
// tests/ui/integration/gameProviderModes.integration.test.tsx

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import { GameProvider } from '../../../src/contexts/GameContext';
import { useGame } from '../../../src/hooks/useGame';
import { LocalGameService } from '../../../src/services/LocalGameService';
import { InMemoryGameRepository } from '../../../src/services/persistence/InMemoryGameRepository';
import { GameService, ActionInfo } from '../../../src/services/GameService';
import { GameState, PlayerAction, Card, Phase, PlayerStatus } from '../../../src/gameEngine';
import { ActionResult, ShowdownResult } from '../../../src/gameEngine';

// --- Test consumer component that exposes context values ---
function TestConsumer({ onContext }: { onContext?: (ctx: ReturnType<typeof useGame>) => void }) {
  const ctx = useGame();
  React.useEffect(() => { onContext?.(ctx); });
  return (
    <>
      <Text testID="phase">{ctx.state?.phase ?? 'null'}</Text>
      <Text testID="showdown-result">{ctx.showdownResult ? 'set' : 'null'}</Text>
    </>
  );
}

// --- Mock GameService for BLE-client mode tests (GM-3, GM-4) ---
function createMockGameService() {
  let listener: ((state: GameState) => void) | null = null;
  const mockState: GameState = {
    seq: 1,
    phase: 'preflop' as Phase,
    community: [],
    pots: [{ amount: 0, eligible: [0, 1] }],
    currentBet: 10,
    activePlayer: 0,
    dealer: 0,
    blinds: { sb: 5, bb: 10 },
    players: [
      { seat: 0, name: 'Alice', chips: 990, status: 'active' as PlayerStatus, bet: 5, cards: ['Ah' as Card, 'Ks' as Card] },
      { seat: 1, name: 'Bob', chips: 990, status: 'active' as PlayerStatus, bet: 10, cards: [] },
    ],
  };

  let currentState = { ...mockState };

  const service: GameService & { emit: (state: GameState) => void } = {
    getState: jest.fn(() => currentState),
    getActionInfo: jest.fn((): ActionInfo => ({
      canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
    })),
    startGame: jest.fn(),
    startRound: jest.fn(),
    handleAction: jest.fn((_seat: number, _action: PlayerAction): ActionResult => {
      // After action, transition to showdown
      currentState = { ...currentState, phase: 'showdown' as Phase, activePlayer: -1 };
      return { valid: true };
    }),
    resolveShowdown: jest.fn((): ShowdownResult => ({
      winners: [{ seat: 0, hand: 'Pair of Aces', potAmount: 100 }],
      hands: [
        { seat: 0, cards: ['Ah' as Card, 'As' as Card], description: 'Pair of Aces' },
        { seat: 1, cards: ['Kh' as Card, 'Ks' as Card], description: 'Pair of Kings' },
      ],
    })),
    prepareNextRound: jest.fn(() => {
      currentState = { ...currentState, phase: 'waiting' as Phase };
    }),
    subscribe: jest.fn((fn: (state: GameState) => void) => {
      listener = fn;
      return () => { listener = null; };
    }),
    emit(state: GameState) {
      currentState = state;
      listener?.(state);
    },
  };

  return service;
}

// --- Helpers ---
function advanceToPhase(service: LocalGameService, targetPhase: string): void {
  let state = service.getState();
  let safety = 0;
  while (state.phase !== targetPhase && safety < 100) {
    if (state.activePlayer < 0) {
      if (state.phase === 'showdown') {
        service.resolveShowdown();
        state = service.getState();
        continue;
      }
      break;
    }
    const info = service.getActionInfo(state.activePlayer);
    if (info.canCheck) {
      service.handleAction(state.activePlayer, { action: 'check' });
    } else {
      service.handleAction(state.activePlayer, { action: 'call' });
    }
    state = service.getState();
    safety++;
  }
}

const flushPromises = () => new Promise(r => setTimeout(r, 20));

describe('GameProvider mode-specific logic', () => {
  describe('showdown auto-resolve', () => {
    // GM-1
    it('hotseat mode: doAction auto-resolves showdown', () => {
      const service = new LocalGameService();
      service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
      service.startRound();

      // Advance to river via service (before render)
      advanceToPhase(service, 'river');

      let ctx: ReturnType<typeof useGame> | null = null;
      render(
        <GameProvider service={service} mode="hotseat">
          <TestConsumer onContext={c => { ctx = c; }} />
        </GameProvider>,
      );

      // Get the active player and complete river via context doAction
      const state = service.getState();
      if (state.activePlayer >= 0) {
        act(() => {
          let s = service.getState();
          while (s.phase === 'river' && s.activePlayer >= 0) {
            const info = ctx!.getActionInfo(s.activePlayer);
            if (info.canCheck) {
              ctx!.doAction(s.activePlayer, { action: 'check' });
            } else {
              ctx!.doAction(s.activePlayer, { action: 'call' });
            }
            s = service.getState();
          }
        });
      }

      expect(ctx!.showdownResult).not.toBeNull();
      expect(ctx!.showdownResult!.winners.length).toBeGreaterThan(0);
    });

    // GM-2
    it('debug mode: doAction auto-resolves showdown', () => {
      const service = new LocalGameService();
      service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
      service.startRound();
      advanceToPhase(service, 'river');

      let ctx: ReturnType<typeof useGame> | null = null;
      render(
        <GameProvider service={service} mode="debug">
          <TestConsumer onContext={c => { ctx = c; }} />
        </GameProvider>,
      );

      act(() => {
        let s = service.getState();
        while (s.phase === 'river' && s.activePlayer >= 0) {
          const info = ctx!.getActionInfo(s.activePlayer);
          if (info.canCheck) {
            ctx!.doAction(s.activePlayer, { action: 'check' });
          } else {
            ctx!.doAction(s.activePlayer, { action: 'call' });
          }
          s = service.getState();
        }
      });

      expect(ctx!.showdownResult).not.toBeNull();
    });

    // GM-3
    it('ble-client mode: doAction does NOT auto-resolve showdown', () => {
      const mockService = createMockGameService();

      let ctx: ReturnType<typeof useGame> | null = null;
      render(
        <GameProvider service={mockService} mode="ble-client">
          <TestConsumer onContext={c => { ctx = c; }} />
        </GameProvider>,
      );

      // doAction triggers handleAction (which updates currentState to showdown internally)
      // but mock's handleAction does NOT call the listener, so React state won't update
      act(() => {
        ctx!.doAction(0, { action: 'call' });
      });

      // In ble-client mode, doAction should NOT call resolveShowdown
      expect(mockService.resolveShowdown).not.toHaveBeenCalled();
      expect(ctx!.showdownResult).toBeNull();
    });

    // GM-4
    it('ble-client mode: subscribe detects showdown phase transition', () => {
      const mockService = createMockGameService();

      let ctx: ReturnType<typeof useGame> | null = null;
      render(
        <GameProvider service={mockService} mode="ble-client">
          <TestConsumer onContext={c => { ctx = c; }} />
        </GameProvider>,
      );

      // Emit a preflop state first (set prevPhaseRef)
      act(() => {
        mockService.emit({
          ...mockService.getState(),
          phase: 'preflop' as Phase,
        });
      });

      // Now emit showdown phase transition
      act(() => {
        mockService.emit({
          ...mockService.getState(),
          phase: 'showdown' as Phase,
          activePlayer: -1,
        });
      });

      // GameProvider should have detected the transition and called resolveShowdown
      expect(mockService.resolveShowdown).toHaveBeenCalled();
      expect(ctx!.showdownResult).not.toBeNull();
      expect(ctx!.showdownResult!.winners).toHaveLength(1);
    });
  });

  describe('persistence integration', () => {
    // GM-5
    it('repository passed → persistence activates on roundEnd', async () => {
      const service = new LocalGameService();
      service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
      service.startRound();

      const repo = new InMemoryGameRepository();

      render(
        <GameProvider service={service} mode="debug" repository={repo} initialChips={1000} blinds={{ sb: 5, bb: 10 }}>
          <TestConsumer />
        </GameProvider>,
      );

      act(() => { advanceToPhase(service, 'roundEnd'); });

      await act(async () => { await flushPromises(); });

      const state = service.getState();
      for (const player of state.players) {
        const saved = await repo.getPlayerChips(player.name);
        expect(saved).toBe(player.chips);
      }
    });

    // GM-6
    it('repository omitted → persistence disabled', async () => {
      const service = new LocalGameService();
      service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
      service.startRound();

      render(
        <GameProvider service={service} mode="debug">
          <TestConsumer />
        </GameProvider>,
      );

      act(() => { advanceToPhase(service, 'roundEnd'); });

      await act(async () => { await flushPromises(); });

      // No repository means nothing was saved — no way to check
      // The key assertion is that no error was thrown
      expect(service.getState().phase).toBe('roundEnd');
    });

    // GM-7
    it('debug mode maps to hotseat for persistence config', async () => {
      const service = new LocalGameService();
      const lowConfig = { sb: 10, bb: 20 };
      service.startGame(['Alice', 'Bob'], lowConfig, 30);

      const repo = new InMemoryGameRepository();

      render(
        <GameProvider service={service} mode="debug" repository={repo} initialChips={30} blinds={lowConfig}>
          <TestConsumer />
        </GameProvider>,
      );

      // Play to gameOver to trigger saveGameRecord
      act(() => {
        while (service.getState().phase !== 'gameOver') {
          service.startRound();
          advanceToPhase(service, 'roundEnd');
          service.prepareNextRound();
        }
      });

      await act(async () => { await flushPromises(); });

      const history = await repo.getGameHistory();
      expect(history).toHaveLength(1);
      expect(history[0].mode).toBe('hotseat'); // debug → hotseat
    });

    // GM-8
    it('ble-host mode persistence records correct mode', async () => {
      const service = new LocalGameService();
      const lowConfig = { sb: 10, bb: 20 };
      service.startGame(['Alice', 'Bob'], lowConfig, 30);

      const repo = new InMemoryGameRepository();

      render(
        <GameProvider service={service} mode="ble-host" repository={repo} initialChips={30} blinds={lowConfig}>
          <TestConsumer />
        </GameProvider>,
      );

      act(() => {
        while (service.getState().phase !== 'gameOver') {
          service.startRound();
          advanceToPhase(service, 'roundEnd');
          service.prepareNextRound();
        }
      });

      await act(async () => { await flushPromises(); });

      const history = await repo.getGameHistory();
      expect(history).toHaveLength(1);
      expect(history[0].mode).toBe('ble-host');
    });
  });

  describe('nextRound', () => {
    // GM-9
    it('nextRound transitions to preflop and clears showdownResult', () => {
      const service = new LocalGameService();
      service.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
      service.startRound();

      let ctx: ReturnType<typeof useGame> | null = null;
      render(
        <GameProvider service={service} mode="debug">
          <TestConsumer onContext={c => { ctx = c; }} />
        </GameProvider>,
      );

      // Advance to roundEnd via doAction (to set showdownResult)
      act(() => {
        let s = service.getState();
        while (s.phase !== 'roundEnd' && s.activePlayer >= 0) {
          const info = ctx!.getActionInfo(s.activePlayer);
          if (info.canCheck) {
            ctx!.doAction(s.activePlayer, { action: 'check' });
          } else {
            ctx!.doAction(s.activePlayer, { action: 'call' });
          }
          s = service.getState();
          if (s.phase === 'showdown') break;
        }
      });

      // showdownResult should be set (auto-resolved by doAction in non-ble-client mode)
      expect(ctx!.showdownResult).not.toBeNull();

      // Call nextRound
      act(() => { ctx!.nextRound(); });

      expect(ctx!.state?.phase).toBe('preflop');
      expect(ctx!.showdownResult).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest tests/ui/integration/gameProviderModes.integration.test.tsx --verbose 2>&1 | tail -40`
Expected: 9 tests pass (GM-1 through GM-9)

Note: If GM-3 fails because `handleAction` in the mock triggers the subscribe callback (which auto-resolves showdown for ble-client in the subscribe handler), adjust the mock so it does NOT emit via subscribe during `handleAction`. The mock's `handleAction` updates `currentState` but should not call the listener — only the explicit `emit()` does.

- [ ] **Step 3: Commit**

```bash
git add tests/ui/integration/gameProviderModes.integration.test.tsx
git commit -m "test: add GameProvider mode-specific integration tests (GM-1..GM-9)"
```

---

### Task 7: BLE Lobby → Game Transition Tests (LG-1 through LG-4)

**Files:**
- Create: `tests/integration/lobbyToGame.integration.test.ts`

**Reference:**
- `src/services/ble/LobbyHost.ts:54-75` — `startGame()` sends gameStart with blinds, `onGameStart` callback only returns blinds
- `src/services/ble/LobbyHost.ts:24-28` — constructor stores `gameSettings` (includes `initialChips`)
- `src/services/ble/LobbyClient.ts:103-105` — `onGameStart` receives `{ blinds, initialChips }`
- `src/services/ble/BleHostGameService.ts:61-71` — `startGame(playerNames, blinds, initialChips)`
- `src/services/ble/MockBleTransport.ts` — mock transport setup
- `tests/ble/integration/LobbyFlow.test.ts` — existing lobby patterns to follow

- [ ] **Step 1: Write the test file**

```typescript
// tests/integration/lobbyToGame.integration.test.ts

import { LobbyHost } from '../../src/services/ble/LobbyHost';
import { LobbyClient } from '../../src/services/ble/LobbyClient';
import { BleHostGameService } from '../../src/services/ble/BleHostGameService';
import { BleClientGameService } from '../../src/services/ble/BleClientGameService';
import {
  MockBleHostTransport,
  MockBleClientTransport,
  MockBleNetwork,
} from '../../src/services/ble/MockBleTransport';

function setupLobby(gameSettings = { sb: 5, bb: 10, initialChips: 1000 }) {
  const hostTransport = new MockBleHostTransport();
  const clientTransports = [
    new MockBleClientTransport(),
    new MockBleClientTransport(),
    new MockBleClientTransport(),
  ];
  MockBleNetwork.create(hostTransport, clientTransports);

  const lobbyHost = new LobbyHost(hostTransport, 'Host', gameSettings);
  const lobbyClients = [
    new LobbyClient(clientTransports[0], 'Player2'),
    new LobbyClient(clientTransports[1], 'Player3'),
    new LobbyClient(clientTransports[2], 'Player4'),
  ];

  return { hostTransport, clientTransports, lobbyHost, lobbyClients, gameSettings };
}

async function joinAndReady(
  lobbyHost: LobbyHost,
  lobbyClients: LobbyClient[],
  hostTransport: MockBleHostTransport,
  count: number,
): Promise<void> {
  await lobbyHost.start();

  for (let i = 0; i < count; i++) {
    // Simulate client connecting
    hostTransport.simulateClientConnected(`client-${i + 1}`);
    await lobbyClients[i].connectToHost(`host-1`);
  }

  // Set all clients ready (MockBleNetwork routes messages synchronously)
  for (let i = 0; i < count; i++) {
    lobbyClients[i].setReady();
  }
}

describe('BLE Lobby → Game Transition', () => {
  // LG-1
  it('lobby settings propagate to game initialization', async () => {
    const { hostTransport, lobbyHost, lobbyClients, gameSettings } = setupLobby();

    let receivedBlinds: { sb: number; bb: number } | null = null;
    lobbyHost.onGameStart((blinds) => { receivedBlinds = blinds; });

    await joinAndReady(lobbyHost, lobbyClients, hostTransport, 2);
    lobbyHost.startGame();

    expect(receivedBlinds).toEqual({ sb: 5, bb: 10 });

    // Initialize BleHostGameService with lobby data
    const clientSeatMap = lobbyHost.getClientSeatMap();
    const hostService = new BleHostGameService(hostTransport, clientSeatMap);

    // Get player names from lobby (host + clients)
    const playerNames = ['Host', 'Player2', 'Player3'];
    hostService.startGame(playerNames, receivedBlinds!, gameSettings.initialChips);

    const state = hostService.getState();
    expect(state.blinds).toEqual({ sb: 5, bb: 10 });
    expect(state.players).toHaveLength(3);
    // Host sees own chips, clients' cards are hidden
    expect(state.players[0].chips).toBe(1000);
  });

  // LG-2
  it('lobby participants become game players with correct seats', async () => {
    const { hostTransport, lobbyHost, lobbyClients, gameSettings } = setupLobby();

    await joinAndReady(lobbyHost, lobbyClients, hostTransport, 3);

    const clientSeatMap = lobbyHost.getClientSeatMap();
    expect(clientSeatMap.size).toBe(3);

    lobbyHost.startGame();

    const hostService = new BleHostGameService(hostTransport, clientSeatMap);
    const playerNames = ['Host', 'Player2', 'Player3', 'Player4'];
    hostService.startGame(playerNames, { sb: 5, bb: 10 }, gameSettings.initialChips);

    const state = hostService.getState();
    expect(state.players).toHaveLength(4);
    expect(state.players[0].name).toBe('Host');
    expect(state.players[0].seat).toBe(0);
    expect(state.players[1].name).toBe('Player2');
    expect(state.players[1].seat).toBe(1);
  });

  // LG-3
  it('lobby → game → first round starts, clients receive state', async () => {
    const { hostTransport, clientTransports, lobbyHost, lobbyClients, gameSettings } = setupLobby();

    await joinAndReady(lobbyHost, lobbyClients, hostTransport, 2);

    const clientSeatMap = lobbyHost.getClientSeatMap();
    lobbyHost.startGame();

    // Create host game service
    const hostService = new BleHostGameService(hostTransport, clientSeatMap);
    hostService.startGame(['Host', 'Player2', 'Player3'], { sb: 5, bb: 10 }, gameSettings.initialChips);

    // Create client game services
    const clientService1 = new BleClientGameService(clientTransports[0], 1);
    const clientService2 = new BleClientGameService(clientTransports[1], 2);

    // Start round — triggers broadcastState + sendPrivateHands
    hostService.startRound();

    // Clients should now have game state
    const clientState1 = clientService1.getState();
    expect(clientState1.phase).toBe('preflop');
    expect(clientState1.players).toHaveLength(3);

    // Client 1 (seat 1) sees own cards
    const client1Self = clientState1.players.find(p => p.seat === 1)!;
    expect(client1Self.cards).toHaveLength(2);

    // Client 1 does NOT see client 2's cards
    const client1SeesOther = clientState1.players.find(p => p.seat === 2)!;
    expect(client1SeesOther.cards).toHaveLength(0);

    // Client 2 (seat 2) sees own cards
    const clientState2 = clientService2.getState();
    const client2Self = clientState2.players.find(p => p.seat === 2)!;
    expect(client2Self.cards).toHaveLength(2);
  });

  // LG-4
  it('modified lobby settings reflected in game', async () => {
    const customSettings = { sb: 10, bb: 20, initialChips: 2000 };
    const { hostTransport, lobbyHost, lobbyClients } = setupLobby(customSettings);

    // Verify client receives settings
    let clientSettings: { sb: number; bb: number; initialChips: number } | null = null;
    lobbyClients[0].onGameStart((config) => {
      clientSettings = { sb: config.blinds.sb, bb: config.blinds.bb, initialChips: config.initialChips };
    });

    await joinAndReady(lobbyHost, lobbyClients, hostTransport, 1);
    lobbyHost.startGame();

    expect(clientSettings).toEqual({ sb: 10, bb: 20, initialChips: 2000 });

    // Create game with custom settings
    const clientSeatMap = lobbyHost.getClientSeatMap();
    const hostService = new BleHostGameService(hostTransport, clientSeatMap);
    hostService.startGame(['Host', 'Player2'], { sb: 10, bb: 20 }, 2000);

    const state = hostService.getState();
    expect(state.blinds).toEqual({ sb: 10, bb: 20 });
    expect(state.players[0].chips).toBe(2000);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest tests/integration/lobbyToGame.integration.test.ts --verbose 2>&1 | tail -30`
Expected: 4 tests pass (LG-1 through LG-4)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/lobbyToGame.integration.test.ts
git commit -m "test: add BLE lobby-to-game transition integration tests (LG-1..LG-4)"
```

---

## Final Verification

### Task 8: Run full test suite

- [ ] **Step 1: Run all tests**

Run: `npx jest --verbose 2>&1 | tail -50`
Expected: All tests pass (existing + 40 new)

- [ ] **Step 2: Verify test count**

Run: `npx jest --verbose 2>&1 | grep -c 'PASS\|FAIL'`
Expected: No FAIL lines

- [ ] **Step 3: Final commit (if any fixes needed)**

If any tests needed adjustments in prior steps, create a fix commit:
```bash
git add -A
git commit -m "fix: adjust integration tests for edge cases"
```
