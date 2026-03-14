# Data Persistence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement persistence layer for player chips, game history, and settings using GameRepository pattern with InMemory and AsyncStorage backends, integrated via a usePersistence hook in GameContext.

**Architecture:** Repository pattern with `GameRepository` interface, two implementations (InMemory for tests, AsyncStorage for production). A `usePersistence` React hook monitors GameService state transitions and auto-saves on round/game end. Settings and chip loading happen at the lobby/home screen level before game start.

**Tech Stack:** TypeScript, React Native, AsyncStorage (`@react-native-async-storage/async-storage`), Jest (ts-jest for engine tests)

---

## File Structure

```
New files:
  src/services/persistence/types.ts                  — GameRecord, GameSettings type definitions
  src/services/persistence/GameRepository.ts         — GameRepository interface
  src/services/persistence/InMemoryGameRepository.ts — In-memory implementation (tests + Phase 1)
  src/services/persistence/AsyncStorageGameRepository.ts — AsyncStorage implementation
  src/services/persistence/index.ts                  — Barrel exports + repository singleton
  src/hooks/usePersistence.ts                        — Hook that auto-saves on phase transitions
  tests/persistence/InMemoryGameRepository.test.ts   — InMemory repository tests
  tests/persistence/AsyncStorageGameRepository.test.ts — AsyncStorage repository tests
  tests/persistence/usePersistence.test.ts           — usePersistence hook tests

Modified files:
  src/services/GameService.ts        — Add optional savedChips param to startGame
  src/services/LocalGameService.ts   — Implement savedChips in startGame
  src/contexts/GameContext.tsx        — Add repository/initialChips/blinds props, call usePersistence
  app/game.tsx                       — Inject repository, pass playerChips, pass config to GameProvider
  src/components/lobby/LobbyView.tsx — Settings restore/save, chip loading before game start
  jest.config.js                     — Add tests/persistence to engine project roots
  package.json                       — Add @react-native-async-storage/async-storage
```

---

## Chunk 1: Persistence Types, Repository Interface, InMemoryGameRepository

### Task 1: Install AsyncStorage dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

Run: `npx expo install @react-native-async-storage/async-storage`
Expected: Package added to package.json dependencies

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @react-native-async-storage/async-storage dependency"
```

---

### Task 2: Add tests/persistence to Jest config

**Files:**
- Modify: `jest.config.js`

- [ ] **Step 1: Update jest config to include persistence test root**

In `jest.config.js`, add `'<rootDir>/tests/persistence'` to the `engine` project's `roots` array:

```js
// jest.config.js — engine project
{
  displayName: 'engine',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/gameEngine', '<rootDir>/tests/services', '<rootDir>/tests/ble', '<rootDir>/tests/persistence'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
},
```

- [ ] **Step 2: Commit**

```bash
git add jest.config.js
git commit -m "chore: add tests/persistence to jest engine project roots"
```

---

### Task 3: Data type definitions

**Files:**
- Create: `src/services/persistence/types.ts`
- Test: (pure types — no runtime behavior to test)

- [ ] **Step 1: Create types.ts**

```typescript
// src/services/persistence/types.ts

export type GameRecord = {
  date: string;            // ISO 8601 (also serves as unique ID)
  mode: 'hotseat' | 'ble-host' | 'ble-client';
  rounds: number;
  blinds: { sb: number; bb: number };
  initialChips: number;
  results: {
    name: string;
    chipChange: number;    // finalChips - initialChips
    finalChips: number;
  }[];
};

export type GameSettings = {
  initialChips: number;
  sb: number;
  bb: number;
  playerNames: string[];   // Hotseat only; BLE mode ignores this
};
```

- [ ] **Step 2: Commit**

```bash
git add src/services/persistence/types.ts
git commit -m "feat(persistence): add GameRecord and GameSettings type definitions"
```

---

### Task 4: GameRepository interface

**Files:**
- Create: `src/services/persistence/GameRepository.ts`

- [ ] **Step 1: Create the interface**

```typescript
// src/services/persistence/GameRepository.ts

import { GameRecord, GameSettings } from './types';

export interface GameRepository {
  // Player chips (name-based save/load)
  getPlayerChips(playerName: string): Promise<number | null>;
  savePlayerChips(playerName: string, chips: number): Promise<void>;

  // Game history (chronological: oldest first)
  saveGameRecord(record: GameRecord): Promise<void>;
  getGameHistory(): Promise<GameRecord[]>;

  // Settings
  getSettings(): Promise<GameSettings | null>;
  saveSettings(settings: GameSettings): Promise<void>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/persistence/GameRepository.ts
git commit -m "feat(persistence): add GameRepository interface"
```

---

### Task 5: InMemoryGameRepository — tests first

**Files:**
- Create: `tests/persistence/InMemoryGameRepository.test.ts`
- Create: `src/services/persistence/InMemoryGameRepository.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/persistence/InMemoryGameRepository.test.ts

import { InMemoryGameRepository } from '../../src/services/persistence/InMemoryGameRepository';
import { GameRecord, GameSettings } from '../../src/services/persistence/types';

describe('InMemoryGameRepository', () => {
  let repo: InMemoryGameRepository;

  beforeEach(() => {
    repo = new InMemoryGameRepository();
  });

  describe('getPlayerChips / savePlayerChips', () => {
    it('returns null for unknown player', async () => {
      expect(await repo.getPlayerChips('Alice')).toBeNull();
    });

    it('returns saved chips', async () => {
      await repo.savePlayerChips('Alice', 1500);
      expect(await repo.getPlayerChips('Alice')).toBe(1500);
    });

    it('overwrites previous chips', async () => {
      await repo.savePlayerChips('Alice', 1500);
      await repo.savePlayerChips('Alice', 800);
      expect(await repo.getPlayerChips('Alice')).toBe(800);
    });

    it('stores chips independently per player', async () => {
      await repo.savePlayerChips('Alice', 1500);
      await repo.savePlayerChips('Bob', 500);
      expect(await repo.getPlayerChips('Alice')).toBe(1500);
      expect(await repo.getPlayerChips('Bob')).toBe(500);
    });
  });

  describe('saveGameRecord / getGameHistory', () => {
    const record: GameRecord = {
      date: '2026-03-15T10:00:00.000Z',
      mode: 'hotseat',
      rounds: 5,
      blinds: { sb: 5, bb: 10 },
      initialChips: 1000,
      results: [
        { name: 'Alice', chipChange: 200, finalChips: 1200 },
        { name: 'Bob', chipChange: -200, finalChips: 800 },
      ],
    };

    it('returns empty array initially', async () => {
      expect(await repo.getGameHistory()).toEqual([]);
    });

    it('stores and retrieves a game record', async () => {
      await repo.saveGameRecord(record);
      const history = await repo.getGameHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(record);
    });

    it('returns records in insertion order', async () => {
      const record2: GameRecord = { ...record, date: '2026-03-15T11:00:00.000Z', rounds: 3 };
      await repo.saveGameRecord(record);
      await repo.saveGameRecord(record2);
      const history = await repo.getGameHistory();
      expect(history).toHaveLength(2);
      expect(history[0].date).toBe('2026-03-15T10:00:00.000Z');
      expect(history[1].date).toBe('2026-03-15T11:00:00.000Z');
    });

    it('returns a copy (not a reference to internal array)', async () => {
      await repo.saveGameRecord(record);
      const history1 = await repo.getGameHistory();
      history1.push(record);
      const history2 = await repo.getGameHistory();
      expect(history2).toHaveLength(1);
    });
  });

  describe('getSettings / saveSettings', () => {
    const settings: GameSettings = {
      initialChips: 1000,
      sb: 5,
      bb: 10,
      playerNames: ['Alice', 'Bob', 'Charlie'],
    };

    it('returns null initially', async () => {
      expect(await repo.getSettings()).toBeNull();
    });

    it('stores and retrieves settings', async () => {
      await repo.saveSettings(settings);
      expect(await repo.getSettings()).toEqual(settings);
    });

    it('overwrites previous settings', async () => {
      await repo.saveSettings(settings);
      const updated = { ...settings, sb: 10, bb: 20 };
      await repo.saveSettings(updated);
      expect(await repo.getSettings()).toEqual(updated);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/persistence/InMemoryGameRepository.test.ts --no-coverage`
Expected: FAIL — Cannot find module `InMemoryGameRepository`

- [ ] **Step 3: Implement InMemoryGameRepository**

```typescript
// src/services/persistence/InMemoryGameRepository.ts

import { GameRecord, GameSettings } from './types';
import { GameRepository } from './GameRepository';

export class InMemoryGameRepository implements GameRepository {
  private chips = new Map<string, number>();
  private history: GameRecord[] = [];
  private settings: GameSettings | null = null;

  async getPlayerChips(playerName: string): Promise<number | null> {
    return this.chips.get(playerName) ?? null;
  }

  async savePlayerChips(playerName: string, chips: number): Promise<void> {
    this.chips.set(playerName, chips);
  }

  async saveGameRecord(record: GameRecord): Promise<void> {
    this.history.push(record);
  }

  async getGameHistory(): Promise<GameRecord[]> {
    return [...this.history];
  }

  async getSettings(): Promise<GameSettings | null> {
    return this.settings;
  }

  async saveSettings(settings: GameSettings): Promise<void> {
    this.settings = settings;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/persistence/InMemoryGameRepository.test.ts --no-coverage`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tests/persistence/InMemoryGameRepository.test.ts src/services/persistence/InMemoryGameRepository.ts
git commit -m "feat(persistence): add InMemoryGameRepository with tests"
```

---

## Chunk 2: AsyncStorageGameRepository, usePersistence Hook

### Task 6: AsyncStorageGameRepository — tests first

**Files:**
- Create: `tests/persistence/AsyncStorageGameRepository.test.ts`
- Create: `src/services/persistence/AsyncStorageGameRepository.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/persistence/AsyncStorageGameRepository.test.ts

let store: Map<string, string>;

jest.mock('@react-native-async-storage/async-storage', () => {
  store = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: jest.fn((key: string, val: string) => {
      store.set(key, val);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

import { AsyncStorageGameRepository } from '../../src/services/persistence/AsyncStorageGameRepository';
import { GameRecord, GameSettings } from '../../src/services/persistence/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('AsyncStorageGameRepository', () => {
  let repo: AsyncStorageGameRepository;

  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
    repo = new AsyncStorageGameRepository();
  });

  describe('getPlayerChips / savePlayerChips', () => {
    it('returns null for unknown player', async () => {
      expect(await repo.getPlayerChips('Alice')).toBeNull();
    });

    it('saves and retrieves chips', async () => {
      await repo.savePlayerChips('Alice', 1500);
      expect(await repo.getPlayerChips('Alice')).toBe(1500);
    });

    it('uses correct storage key with prefix', async () => {
      await repo.savePlayerChips('Alice', 1500);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@jetholdem:chips:Alice', '1500');
    });

    it('overwrites previous chips', async () => {
      await repo.savePlayerChips('Alice', 1500);
      await repo.savePlayerChips('Alice', 800);
      expect(await repo.getPlayerChips('Alice')).toBe(800);
    });
  });

  describe('saveGameRecord / getGameHistory', () => {
    const record: GameRecord = {
      date: '2026-03-15T10:00:00.000Z',
      mode: 'hotseat',
      rounds: 5,
      blinds: { sb: 5, bb: 10 },
      initialChips: 1000,
      results: [
        { name: 'Alice', chipChange: 200, finalChips: 1200 },
        { name: 'Bob', chipChange: -200, finalChips: 800 },
      ],
    };

    it('returns empty array initially', async () => {
      expect(await repo.getGameHistory()).toEqual([]);
    });

    it('stores and retrieves a game record', async () => {
      await repo.saveGameRecord(record);
      const history = await repo.getGameHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(record);
    });

    it('uses correct storage key', async () => {
      await repo.saveGameRecord(record);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@jetholdem:history',
        expect.any(String),
      );
    });

    it('limits history to 50 records', async () => {
      // Pre-fill with 50 records
      const existing = Array.from({ length: 50 }, (_, i) => ({
        ...record,
        date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      }));
      store.set('@jetholdem:history', JSON.stringify(existing));

      // Add one more
      const newRecord = { ...record, date: '2026-03-15T12:00:00.000Z' };
      await repo.saveGameRecord(newRecord);

      const history = await repo.getGameHistory();
      expect(history).toHaveLength(50);
      // Oldest record should be dropped, newest should be last
      expect(history[0].date).toBe('2026-01-02T00:00:00.000Z');
      expect(history[49].date).toBe('2026-03-15T12:00:00.000Z');
    });

    it('returns empty array on corrupted JSON', async () => {
      store.set('@jetholdem:history', 'not-json');
      expect(await repo.getGameHistory()).toEqual([]);
    });
  });

  describe('getSettings / saveSettings', () => {
    const settings: GameSettings = {
      initialChips: 1000,
      sb: 5,
      bb: 10,
      playerNames: ['Alice', 'Bob'],
    };

    it('returns null initially', async () => {
      expect(await repo.getSettings()).toBeNull();
    });

    it('stores and retrieves settings', async () => {
      await repo.saveSettings(settings);
      expect(await repo.getSettings()).toEqual(settings);
    });

    it('uses correct storage key', async () => {
      await repo.saveSettings(settings);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@jetholdem:settings',
        JSON.stringify(settings),
      );
    });

    it('returns null on corrupted JSON', async () => {
      store.set('@jetholdem:settings', 'not-json');
      expect(await repo.getSettings()).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/persistence/AsyncStorageGameRepository.test.ts --no-coverage`
Expected: FAIL — Cannot find module `AsyncStorageGameRepository`

- [ ] **Step 3: Implement AsyncStorageGameRepository**

```typescript
// src/services/persistence/AsyncStorageGameRepository.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameRecord, GameSettings } from './types';
import { GameRepository } from './GameRepository';

const KEYS = {
  playerChips: (name: string) => `@jetholdem:chips:${name}`,
  history: '@jetholdem:history',
  settings: '@jetholdem:settings',
};

export class AsyncStorageGameRepository implements GameRepository {
  async getPlayerChips(playerName: string): Promise<number | null> {
    const val = await AsyncStorage.getItem(KEYS.playerChips(playerName));
    return val !== null ? Number(val) : null;
  }

  async savePlayerChips(playerName: string, chips: number): Promise<void> {
    await AsyncStorage.setItem(KEYS.playerChips(playerName), String(chips));
  }

  async saveGameRecord(record: GameRecord): Promise<void> {
    const existing = await this.getGameHistory();
    existing.push(record);
    const trimmed = existing.slice(-50);
    await AsyncStorage.setItem(KEYS.history, JSON.stringify(trimmed));
  }

  async getGameHistory(): Promise<GameRecord[]> {
    try {
      const val = await AsyncStorage.getItem(KEYS.history);
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  }

  async getSettings(): Promise<GameSettings | null> {
    try {
      const val = await AsyncStorage.getItem(KEYS.settings);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  }

  async saveSettings(settings: GameSettings): Promise<void> {
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/persistence/AsyncStorageGameRepository.test.ts --no-coverage`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tests/persistence/AsyncStorageGameRepository.test.ts src/services/persistence/AsyncStorageGameRepository.ts
git commit -m "feat(persistence): add AsyncStorageGameRepository with tests"
```

---

### Task 7: Barrel exports and repository singleton

**Files:**
- Create: `src/services/persistence/index.ts`

- [ ] **Step 1: Create barrel exports**

```typescript
// src/services/persistence/index.ts

export type { GameRecord, GameSettings } from './types';
export type { GameRepository } from './GameRepository';
export { InMemoryGameRepository } from './InMemoryGameRepository';
export { AsyncStorageGameRepository } from './AsyncStorageGameRepository';

import { AsyncStorageGameRepository } from './AsyncStorageGameRepository';
export const repository = new AsyncStorageGameRepository();
```

- [ ] **Step 2: Commit**

```bash
git add src/services/persistence/index.ts
git commit -m "feat(persistence): add barrel exports and repository singleton"
```

---

### Task 8: usePersistence hook — tests first

**Files:**
- Create: `tests/persistence/usePersistence.test.ts`
- Create: `src/hooks/usePersistence.ts`

The hook monitors GameService state transitions via `subscribe()`. It saves player chips on `roundEnd` transitions and saves a GameRecord on `gameOver` transitions.

Testing approach: Use a mock GameService (just needs `subscribe`) and InMemoryGameRepository. Manually trigger state transitions by calling the subscribed listener.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/persistence/usePersistence.test.ts

import { subscribePersistence, PersistenceConfig } from '../../src/hooks/usePersistence';
import { InMemoryGameRepository } from '../../src/services/persistence/InMemoryGameRepository';
import { GameRepository } from '../../src/services/persistence/GameRepository';
import { GameState, Phase, Player, PlayerStatus, Blinds } from '../../src/gameEngine';

// Minimal mock GameService — only subscribe() is needed by usePersistence
function createMockService() {
  let listener: ((state: GameState) => void) | null = null;
  return {
    subscribe: jest.fn((fn: (state: GameState) => void) => {
      listener = fn;
      return () => { listener = null; };
    }),
    emit(state: GameState) {
      listener?.(state);
    },
    // Stubs to satisfy GameService interface
    getState: jest.fn(),
    getActionInfo: jest.fn(),
    startGame: jest.fn(),
    startRound: jest.fn(),
    handleAction: jest.fn(),
    resolveShowdown: jest.fn(),
    prepareNextRound: jest.fn(),
  };
}

function makeState(phase: Phase, players?: Partial<Player>[]): GameState {
  const defaultPlayers: Player[] = [
    { seat: 0, name: 'Alice', chips: 1000, status: 'active' as PlayerStatus, bet: 0, cards: [] },
    { seat: 1, name: 'Bob', chips: 1000, status: 'active' as PlayerStatus, bet: 0, cards: [] },
  ];
  const mergedPlayers = players
    ? defaultPlayers.map((p, i) => ({ ...p, ...players[i] }))
    : defaultPlayers;

  return {
    seq: 1,
    phase,
    community: [],
    pots: [{ amount: 0, eligible: [0, 1] }],
    currentBet: 0,
    activePlayer: 0,
    dealer: 0,
    blinds: { sb: 5, bb: 10 },
    players: mergedPlayers,
  };
}

describe('usePersistence (unit — no React)', () => {
  let repo: InMemoryGameRepository;
  let mockService: ReturnType<typeof createMockService>;
  let config: PersistenceConfig;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    repo = new InMemoryGameRepository();
    mockService = createMockService();
    config = {
      mode: 'hotseat',
      initialChips: 1000,
      blinds: { sb: 5, bb: 10 },
    };
  });

  afterEach(() => {
    cleanup?.();
  });

  // usePersistence is a React hook, but its core logic is in the subscribe callback.
  // We test the subscribe-based logic by calling subscribePersistence directly.
  // The actual hook is a thin wrapper that calls subscribePersistence in useEffect.

  it('saves player chips on roundEnd transition', async () => {
    cleanup = subscribePersistence(mockService, repo, config);

    // First emit preflop (sets prevPhase)
    mockService.emit(makeState('preflop'));
    // Then roundEnd with updated chips
    mockService.emit(makeState('roundEnd', [{ chips: 1200 }, { chips: 800 }]));

    // Wait for fire-and-forget promises
    await new Promise(r => setTimeout(r, 10));

    expect(await repo.getPlayerChips('Alice')).toBe(1200);
    expect(await repo.getPlayerChips('Bob')).toBe(800);
  });

  it('does not save on duplicate roundEnd (same phase twice)', async () => {
    cleanup = subscribePersistence(mockService, repo, config);

    mockService.emit(makeState('preflop'));
    mockService.emit(makeState('roundEnd', [{ chips: 1200 }, { chips: 800 }]));
    // Second roundEnd should be ignored
    mockService.emit(makeState('roundEnd', [{ chips: 9999 }, { chips: 9999 }]));

    await new Promise(r => setTimeout(r, 10));

    expect(await repo.getPlayerChips('Alice')).toBe(1200);
  });

  it('saves game record on gameOver transition', async () => {
    cleanup = subscribePersistence(mockService, repo, config);

    // Simulate two rounds then gameOver
    mockService.emit(makeState('preflop'));
    mockService.emit(makeState('roundEnd', [{ chips: 1200 }, { chips: 800 }]));
    mockService.emit(makeState('preflop'));
    mockService.emit(makeState('roundEnd', [{ chips: 1500 }, { chips: 500 }]));
    mockService.emit(makeState('gameOver', [{ chips: 1500 }, { chips: 500 }]));

    await new Promise(r => setTimeout(r, 10));

    const history = await repo.getGameHistory();
    expect(history).toHaveLength(1);
    expect(history[0].mode).toBe('hotseat');
    expect(history[0].rounds).toBe(2);
    expect(history[0].blinds).toEqual({ sb: 5, bb: 10 });
    expect(history[0].initialChips).toBe(1000);
    expect(history[0].results).toEqual([
      { name: 'Alice', chipChange: 500, finalChips: 1500 },
      { name: 'Bob', chipChange: -500, finalChips: 500 },
    ]);
  });

  it('does nothing when repository is null', async () => {
    cleanup = subscribePersistence(mockService, null, config);

    mockService.emit(makeState('preflop'));
    mockService.emit(makeState('roundEnd', [{ chips: 1200 }, { chips: 800 }]));

    await new Promise(r => setTimeout(r, 10));

    // subscribe should not have been called
    expect(mockService.subscribe).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/persistence/usePersistence.test.ts --no-coverage`
Expected: FAIL — Cannot find module `usePersistence`

- [ ] **Step 3: Implement usePersistence**

```typescript
// src/hooks/usePersistence.ts

import { useEffect, useRef } from 'react';
import { GameState, Phase } from '../gameEngine';
import { GameService } from '../services/GameService';
import { GameRepository } from '../services/persistence/GameRepository';
import { GameRecord } from '../services/persistence/types';

export type PersistenceConfig = {
  mode: 'hotseat' | 'ble-host' | 'ble-client';
  initialChips: number;
  blinds: { sb: number; bb: number };
};

/**
 * Core persistence logic extracted for testability without React.
 * Subscribes to a GameService and saves data to the repository on phase transitions.
 * Returns an unsubscribe function.
 */
export function subscribePersistence(
  service: GameService,
  repository: GameRepository | null,
  config: PersistenceConfig,
): () => void {
  if (!repository) return () => {};

  let prevPhase: Phase | null = null;
  let roundCount = 0;

  const unsub = service.subscribe((state: GameState) => {
    const currentPhase = state.phase;

    // Round end: save all player chips
    if (currentPhase === 'roundEnd' && prevPhase !== 'roundEnd') {
      roundCount++;
      for (const player of state.players) {
        repository.savePlayerChips(player.name, player.chips);
      }
    }

    // Game over: save game record
    if (currentPhase === 'gameOver' && prevPhase !== 'gameOver') {
      const record: GameRecord = {
        date: new Date().toISOString(),
        mode: config.mode,
        rounds: roundCount,
        blinds: config.blinds,
        initialChips: config.initialChips,
        results: state.players.map(p => ({
          name: p.name,
          chipChange: p.chips - config.initialChips,
          finalChips: p.chips,
        })),
      };
      repository.saveGameRecord(record);
    }

    prevPhase = currentPhase;
  });

  return unsub;
}

/**
 * React hook wrapper around subscribePersistence.
 * Call unconditionally (React Rules of Hooks). Pass repository=null to disable.
 */
export function usePersistence(
  service: GameService,
  repository: GameRepository | null,
  config: PersistenceConfig,
): void {
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    return subscribePersistence(service, repository, configRef.current);
  }, [service, repository]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/persistence/usePersistence.test.ts --no-coverage`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tests/persistence/usePersistence.test.ts src/hooks/usePersistence.ts
git commit -m "feat(persistence): add usePersistence hook with subscribePersistence core logic"
```

---

## Chunk 3: GameService/GameContext Integration, Game Screen, Lobby

### Task 9: Extend GameService.startGame with savedChips — tests first

**Files:**
- Modify: `src/services/GameService.ts:18`
- Modify: `src/services/LocalGameService.ts:52-61`
- Modify: `tests/services/LocalGameService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add new tests to the existing `tests/services/LocalGameService.test.ts` file, inside the existing `describe('startGame', ...)` block:

```typescript
// Add inside describe('startGame', ...) in tests/services/LocalGameService.test.ts

it('uses savedChips for known players when provided', () => {
  const svc = new LocalGameService();
  svc.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000, {
    Alice: 1500,
    Bob: 800,
  });
  const state = svc.getState();
  expect(state.players[0].chips).toBe(1500); // Alice: saved
  expect(state.players[1].chips).toBe(800);  // Bob: saved
  expect(state.players[2].chips).toBe(1000); // Charlie: fallback to initialChips
});

it('falls back to initialChips when savedChips is undefined', () => {
  const svc = new LocalGameService();
  svc.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
  const state = svc.getState();
  expect(state.players[0].chips).toBe(1000);
  expect(state.players[1].chips).toBe(1000);
});
```

- [ ] **Step 2: Run tests to verify the new tests fail**

Run: `npx jest tests/services/LocalGameService.test.ts -t "savedChips" --no-coverage`
Expected: FAIL — `startGame` doesn't accept 4th argument (TypeScript error or wrong behavior)

- [ ] **Step 3: Update GameService interface**

In `src/services/GameService.ts`, change line 18:

```typescript
// Before:
startGame(playerNames: string[], blinds: Blinds, initialChips: number): void;

// After:
startGame(playerNames: string[], blinds: Blinds, initialChips: number, savedChips?: Record<string, number>): void;
```

- [ ] **Step 4: Update LocalGameService.startGame**

In `src/services/LocalGameService.ts`, replace the `startGame` method (lines 52-63):

```typescript
startGame(playerNames: string[], blinds: Blinds, initialChips: number, savedChips?: Record<string, number>): void {
  const players: Player[] = playerNames.map((name, i) => ({
    seat: i,
    name,
    chips: savedChips?.[name] ?? initialChips,
    status: 'active' as PlayerStatus,
    bet: 0,
    cards: [],
  }));
  this.gameLoop = new GameLoop(players, blinds);
  this.notify();
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/services/LocalGameService.test.ts --no-coverage`
Expected: All tests PASS (both new and existing)

- [ ] **Step 6: Commit**

```bash
git add src/services/GameService.ts src/services/LocalGameService.ts tests/services/LocalGameService.test.ts
git commit -m "feat(persistence): add optional savedChips param to GameService.startGame"
```

---

### Task 10: Integrate usePersistence into GameContext

**Files:**
- Modify: `src/contexts/GameContext.tsx`

- [ ] **Step 1: Add imports and update GameProviderProps**

Add imports at the top of `src/contexts/GameContext.tsx`:

```typescript
import { GameRepository } from '../services/persistence/GameRepository';
import { usePersistence, PersistenceConfig } from '../hooks/usePersistence';
```

Update `GameProviderProps` interface:

```typescript
// Before:
interface GameProviderProps {
  children: React.ReactNode;
  service: GameService;
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
}

// After:
interface GameProviderProps {
  children: React.ReactNode;
  service: GameService;
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
  repository?: GameRepository;
  initialChips?: number;
  blinds?: { sb: number; bb: number };
}
```

- [ ] **Step 2: Add usePersistence call in GameProvider**

In the `GameProvider` function, add the hook call after `serviceRef.current = service;` and before the first `useEffect`:

```typescript
export function GameProvider({ children, service, mode, repository, initialChips, blinds }: GameProviderProps) {
  // ... existing state declarations ...
  const serviceRef = useRef(service);
  serviceRef.current = service;

  // Persistence hook (always called unconditionally; repository=null disables)
  const persistMode = mode === 'debug' ? 'hotseat' : mode;
  usePersistence(
    service,
    repository ?? null,
    {
      mode: persistMode as PersistenceConfig['mode'],
      initialChips: initialChips ?? 0,
      blinds: blinds ?? { sb: 0, bb: 0 },
    },
  );

  // ... rest of existing code ...
```

- [ ] **Step 3: Run all tests to verify nothing breaks**

Run: `npx jest --no-coverage`
Expected: All existing tests PASS (GameProvider's new props are optional, so no breaking changes)

- [ ] **Step 4: Commit**

```bash
git add src/contexts/GameContext.tsx
git commit -m "feat(persistence): integrate usePersistence hook into GameProvider"
```

---

### Task 11: Inject repository into game.tsx

**Files:**
- Modify: `app/game.tsx`

- [ ] **Step 1: Add repository import and pass to GameProvider**

Add import at top of `app/game.tsx`:

```typescript
import { repository } from '../src/services/persistence';
```

Update the `GameScreen` component's return statement to pass repository and config. Replace the existing `<GameProvider>` usage:

```typescript
// Before:
return (
  <GameProvider service={service} mode={mode}>
    <GameView />
  </GameProvider>
);

// After:
const repo = mode === 'debug' ? undefined : repository;

return (
  <GameProvider
    service={service}
    mode={mode}
    repository={repo}
    initialChips={initialChips}
    blinds={blinds}
  >
    <GameView />
  </GameProvider>
);
```

Also update the route params type to include `playerChips`:

```typescript
const params = useLocalSearchParams<{
  playerNames?: string;
  initialChips: string;
  sb: string;
  bb: string;
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
  seat?: string;
  clientSeatMap?: string;
  playerChips?: string;  // NEW — JSON Record<string, number>
}>();
```

Update the local service creation (hotseat/debug) to use playerChips when available:

```typescript
// Local modes (hotseat / debug)
const playerNames: string[] = JSON.parse(params.playerNames ?? '["P0","P1","P2"]');
const playerChipsMap: Record<string, number> | undefined = params.playerChips
  ? JSON.parse(params.playerChips)
  : undefined;
const svc = new LocalGameService();
svc.startGame(playerNames, blinds, initialChips, playerChipsMap);
svc.startRound();
return svc;
```

- [ ] **Step 2: Run all tests to verify nothing breaks**

Run: `npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add app/game.tsx
git commit -m "feat(persistence): inject repository and playerChips into game screen"
```

---

### Task 12: Settings persistence and chip loading in LobbyView

**Files:**
- Modify: `src/components/lobby/LobbyView.tsx`

- [ ] **Step 1: Add repository import and settings restore on mount**

Add import at top of `src/components/lobby/LobbyView.tsx`:

```typescript
import { repository } from '../../services/persistence';
```

Add a `useEffect` inside `LobbyView` to restore settings on mount (after existing state declarations):

```typescript
import React, { useState, useEffect } from 'react';
// ... existing imports ...

export function LobbyView() {
  const router = useRouter();
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>('local');
  const [playerCount, setPlayerCount] = useState(3);
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [initialChips, setInitialChips] = useState('1000');
  const [sb, setSb] = useState('5');
  const [bb, setBb] = useState('10');
  const [mode, setMode] = useState<'hotseat' | 'debug'>('hotseat');

  // Restore saved settings on mount
  useEffect(() => {
    repository.getSettings().then(saved => {
      if (saved) {
        setInitialChips(String(saved.initialChips));
        setSb(String(saved.sb));
        setBb(String(saved.bb));
        if (saved.playerNames.length > 0) {
          setNames(prev => {
            const next = [...prev];
            saved.playerNames.forEach((name, i) => { next[i] = name; });
            return next;
          });
          setPlayerCount(saved.playerNames.length);
        }
      }
    });
  }, []);
```

- [ ] **Step 2: Update handleStart to save settings and load chips**

Replace the existing `handleStart` function:

```typescript
const handleStart = async () => {
  const playerNames = names.slice(0, playerCount).map((n, i) => n || `Player ${i}`);

  // Save current settings
  repository.saveSettings({
    initialChips: Number(initialChips),
    sb: Number(sb),
    bb: Number(bb),
    playerNames,
  });

  // Load saved chips for each player
  const chipsByPlayer: Record<string, number> = {};
  for (const name of playerNames) {
    const saved = await repository.getPlayerChips(name);
    if (saved !== null) {
      chipsByPlayer[name] = saved;
    }
  }
  const hasChips = Object.keys(chipsByPlayer).length > 0;

  router.push({
    pathname: '/game',
    params: {
      playerNames: JSON.stringify(playerNames),
      initialChips,
      sb,
      bb,
      mode,
      ...(hasChips ? { playerChips: JSON.stringify(chipsByPlayer) } : {}),
    },
  });
};
```

- [ ] **Step 3: Run all tests to verify nothing breaks**

Run: `npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/lobby/LobbyView.tsx
git commit -m "feat(persistence): add settings restore/save and chip loading in LobbyView"
```

---

### Task 13: Final verification — run all tests

- [ ] **Step 1: Run the full test suite**

Run: `npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 2: Run TypeScript type checking**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Final commit if any formatting/lint fixes needed**

Only if needed:
```bash
git add -u
git commit -m "chore: fix lint/formatting issues from persistence implementation"
```
