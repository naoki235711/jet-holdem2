# Jet Holdem - UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete UI for Jet Holdem's local mode (no BLE) — lobby, game table, action controls, result display — with hot-seat and debug modes, all powered by the existing game engine via a GameService abstraction layer.

**Architecture:** GameService interface abstracts the game engine, allowing future BLE swap without UI changes. LocalGameService wraps GameLoop directly. React Context distributes state to components. Expo Router handles navigation between Lobby and Game screens. Components are small, focused files organized by feature.

**Tech Stack:** React Native 0.83, Expo SDK 55, Expo Router, TypeScript, Jest + React Native Testing Library

**Spec:** `docs/superpowers/specs/2026-03-14-ui-design.md`

---

## File Structure

```
jet-holdem2/
├── jest.config.js                    # Updated: projects config for engine + UI tests
├── package.json                      # Updated: expo-router, RNTL, slider deps
├── babel.config.js                   # New: required by expo-router
├── app.json                          # Updated: scheme for expo-router
├── app/
│   ├── _layout.tsx                   # Root layout (SafeAreaProvider + Stack)
│   ├── index.tsx                     # LobbyScreen
│   └── game.tsx                      # GameScreen
├── src/
│   ├── gameEngine/
│   │   ├── BettingRound.ts           # Modified: add public minRaise getter
│   │   └── GameLoop.ts              # Modified: add getMinRaiseSize() method
│   ├── services/
│   │   ├── GameService.ts           # GameService + ActionInfo interfaces
│   │   └── LocalGameService.ts      # GameLoop wrapper implementation
│   ├── contexts/
│   │   └── GameContext.tsx           # GameProvider + GameContextValue
│   ├── hooks/
│   │   └── useGame.ts               # Convenience hook for GameContext
│   ├── theme/
│   │   └── colors.ts                # Color constants
│   ├── components/
│   │   ├── common/
│   │   │   ├── PlayingCard.tsx       # Single card (face-up/face-down)
│   │   │   ├── ChipAmount.tsx        # Chip display with formatting
│   │   │   └── PassDeviceScreen.tsx  # Hot-seat interstitial
│   │   ├── table/
│   │   │   ├── PlayerSeat.tsx        # Player info + cards + bet
│   │   │   ├── CommunityCards.tsx    # 5 community card slots
│   │   │   └── PotDisplay.tsx        # Pot total + BB display
│   │   ├── actions/
│   │   │   ├── ActionButtons.tsx     # Fold/Check/Call/Raise buttons
│   │   │   └── RaiseSlider.tsx       # Raise amount slider
│   │   ├── lobby/
│   │   │   └── LobbyView.tsx         # Lobby form content
│   │   └── result/
│   │       └── ResultOverlay.tsx     # Round result modal
├── tests/
│   ├── gameEngine/                   # Existing (unchanged)
│   ├── services/
│   │   └── LocalGameService.test.ts  # Service logic tests
│   └── ui/
│       ├── helpers/
│       │   └── renderWithGame.tsx    # Test utility: render with GameContext
│       ├── components/
│       │   ├── PlayingCard.test.tsx
│       │   ├── ChipAmount.test.tsx
│       │   ├── PlayerSeat.test.tsx
│       │   ├── CommunityCards.test.tsx
│       │   ├── PotDisplay.test.tsx
│       │   ├── ActionButtons.test.tsx
│       │   ├── RaiseSlider.test.tsx
│       │   ├── ResultOverlay.test.tsx
│       │   ├── LobbyView.test.tsx
│       │   └── PassDeviceScreen.test.tsx
│       └── contexts/
│           └── GameContext.test.tsx
```

---

## Chunk 1: Foundation

Dependencies, game engine changes, theme, GameService, GameContext, Expo Router setup.

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`
- Create: `babel.config.js`
- Modify: `app.json`

- [ ] **Step 1: Install Expo Router and peer dependencies**

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants
```

- [ ] **Step 2: Install testing libraries**

```bash
npx expo install -- --save-dev jest-expo @testing-library/react-native @testing-library/jest-native
```

- [ ] **Step 3: Install slider component**

```bash
npx expo install @react-native-community/slider
```

- [ ] **Step 4: Create babel.config.js**

```javascript
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
```

- [ ] **Step 5: Update app.json for Expo Router**

Add `"scheme"` to the `expo` object in `app.json`:

```json
{
  "expo": {
    "scheme": "jet-holdem",
    ...existing config...
  }
}
```

- [ ] **Step 6: Update package.json entry point**

Change the `"main"` field (add if missing):

```json
{
  "main": "expo-router/entry",
  ...
}
```

- [ ] **Step 7: Update jest.config.js for both engine and UI tests**

Replace the entire file:

```javascript
// jest.config.js
module.exports = {
  projects: [
    {
      displayName: 'engine',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/gameEngine', '<rootDir>/tests/services'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
      transform: {
        '^.+\\.tsx?$': 'ts-jest',
      },
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      roots: ['<rootDir>/tests/ui'],
      setupFiles: ['@testing-library/react-native/extend-expect'],
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*)',
      ],
    },
  ],
};
```

- [ ] **Step 8: Verify existing engine tests still pass**

Run: `npx jest --selectProjects engine`
Expected: All existing game engine tests pass.

- [ ] **Step 9: Remove old App.tsx and index.ts**

Delete `App.tsx` and `index.ts` (replaced by Expo Router entry point and `app/` directory).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json babel.config.js app.json jest.config.js
git rm App.tsx index.ts
git commit -m "chore: add expo-router, testing libs, slider; update jest config"
```

---

### Task 2: Game Engine Changes — BettingRound minRaise Getter

**Files:**
- Modify: `src/gameEngine/BettingRound.ts`
- Modify: `tests/gameEngine/BettingRound.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/gameEngine/BettingRound.test.ts`:

```typescript
describe('minRaise getter', () => {
  it('returns BB as initial minRaise for preflop', () => {
    const players = createPlayers(3, 1000);
    const round = BettingRound.createPreflop(players, 0, { sb: 5, bb: 10 });
    expect(round.minRaise).toBe(10);
  });

  it('updates minRaise after a raise', () => {
    const players = createPlayers(3, 1000);
    const round = BettingRound.createPreflop(players, 0, { sb: 5, bb: 10 });
    // First to act (seat after BB) raises to 30 (increment of 20)
    const seat = round.activePlayerSeat;
    round.handleAction(seat, { action: 'raise', amount: 30 });
    expect(round.minRaise).toBe(20);
  });
});
```

Note: `createPlayers` is a helper that may already exist in the test file. If not, define it:

```typescript
function createPlayers(count: number, chips: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    seat: i, name: `P${i}`, chips, status: 'active' as const, bet: 0, cards: [],
  }));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects engine -- BettingRound.test.ts -t "minRaise getter"`
Expected: FAIL — `round.minRaise is not a function` or property doesn't exist.

- [ ] **Step 3: Add the public getter to BettingRound**

In `src/gameEngine/BettingRound.ts`, add after the `isComplete` getter (line ~89):

```typescript
  get minRaise(): number {
    return this.minRaiseSize;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --selectProjects engine -- BettingRound.test.ts -t "minRaise getter"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/gameEngine/BettingRound.ts tests/gameEngine/BettingRound.test.ts
git commit -m "feat(engine): expose minRaise public getter on BettingRound"
```

---

### Task 3: Game Engine Changes — GameLoop getMinRaiseSize

**Files:**
- Modify: `src/gameEngine/GameLoop.ts`
- Modify: `src/gameEngine/index.ts`
- Modify: `tests/gameEngine/GameLoop.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/gameEngine/GameLoop.test.ts`:

```typescript
describe('getMinRaiseSize', () => {
  it('returns BB when no betting round active', () => {
    const players = createPlayers(3, 1000);
    const loop = new GameLoop(players, { sb: 5, bb: 10 });
    expect(loop.getMinRaiseSize()).toBe(10);
  });

  it('returns BB during preflop before any raise', () => {
    const players = createPlayers(3, 1000);
    const loop = new GameLoop(players, { sb: 5, bb: 10 });
    loop.startRound();
    expect(loop.getMinRaiseSize()).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects engine -- GameLoop.test.ts -t "getMinRaiseSize"`
Expected: FAIL — `loop.getMinRaiseSize is not a function`

- [ ] **Step 3: Add getMinRaiseSize method to GameLoop**

In `src/gameEngine/GameLoop.ts`, add after the `getPrivateHand` method:

```typescript
  /** Returns the current minimum raise increment. Falls back to BB when no active round or when postflop round has 0 (initial state). */
  getMinRaiseSize(): number {
    const size = this.bettingRound?.minRaise ?? 0;
    return size > 0 ? size : this._blinds.bb;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --selectProjects engine -- GameLoop.test.ts -t "getMinRaiseSize"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/gameEngine/GameLoop.ts tests/gameEngine/GameLoop.test.ts
git commit -m "feat(engine): add getMinRaiseSize to GameLoop for UI integration"
```

---

### Task 4: Create Theme Colors

**Files:**
- Create: `src/theme/colors.ts`

- [ ] **Step 1: Create the colors file**

```typescript
// src/theme/colors.ts

export const Colors = {
  background: '#1A1A2E',
  table: '#16213E',
  text: '#FFFFFF',
  active: '#06B6D4',
  pot: '#10B981',
  subText: '#9CA3AF',
  fold: '#3B82F6',
  call: '#EF4444',
  raise: '#B91C1C',
  overlay: 'rgba(0,0,0,0.7)',
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/theme/colors.ts
git commit -m "feat(ui): add color theme constants"
```

---

### Task 5: GameService Interface

**Files:**
- Create: `src/services/GameService.ts`

- [ ] **Step 1: Create the interface file**

```typescript
// src/services/GameService.ts

import { GameState, PlayerAction, Blinds } from '../gameEngine';
import { ActionResult, ShowdownResult } from '../gameEngine';

export interface ActionInfo {
  canCheck: boolean;
  callAmount: number;     // 0 if can check
  minRaise: number;       // Raise TO value (total bet)
  maxRaise: number;       // = player.chips + player.bet
  canRaise: boolean;      // Has enough chips for minRaise
}

export interface GameService {
  getState(): GameState;
  getActionInfo(seat: number): ActionInfo;

  startGame(playerNames: string[], blinds: Blinds, initialChips: number): void;
  startRound(): void;
  handleAction(seat: number, action: PlayerAction): ActionResult;
  resolveShowdown(): ShowdownResult;
  prepareNextRound(): void;

  subscribe(listener: (state: GameState) => void): () => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/GameService.ts
git commit -m "feat(ui): add GameService and ActionInfo interfaces"
```

---

### Task 6: LocalGameService Implementation

**Files:**
- Create: `src/services/LocalGameService.ts`
- Create: `tests/services/LocalGameService.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/services/LocalGameService.test.ts

import { LocalGameService } from '../../src/services/LocalGameService';
import { GameState, PlayerAction } from '../../src/gameEngine';

describe('LocalGameService', () => {
  let service: LocalGameService;

  beforeEach(() => {
    service = new LocalGameService();
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
  });

  describe('startGame', () => {
    it('creates players with correct names and chips', () => {
      const state = service.getState();
      expect(state.players).toHaveLength(3);
      expect(state.players[0].name).toBe('Alice');
      expect(state.players[0].chips).toBe(1000);
      expect(state.players[1].name).toBe('Bob');
      expect(state.players[2].name).toBe('Charlie');
    });

    it('sets phase to waiting after startGame', () => {
      const state = service.getState();
      expect(state.phase).toBe('waiting');
    });
  });

  describe('startRound', () => {
    it('transitions to preflop and deals cards', () => {
      service.startRound();
      const state = service.getState();
      expect(state.phase).toBe('preflop');
      for (const p of state.players) {
        expect(p.cards).toHaveLength(2);
      }
    });
  });

  describe('subscribe', () => {
    it('notifies listener on state changes', () => {
      const listener = jest.fn();
      service.subscribe(listener);
      service.startRound();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].phase).toBe('preflop');
    });

    it('returns unsubscribe function', () => {
      const listener = jest.fn();
      const unsub = service.subscribe(listener);
      unsub();
      service.startRound();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getActionInfo', () => {
    it('returns correct info for player who can check', () => {
      service.startRound();
      const state = service.getState();
      // BB can check if no one raised (but preflop BB acts last, so this depends on game state)
      // Let's test after all calls: advance to flop where first player can check
      // Skip preflop by having everyone call
      const activeSeat = state.activePlayer;
      service.handleAction(activeSeat, { action: 'call' }); // UTG calls
      const state2 = service.getState();
      const nextSeat = state2.activePlayer;
      service.handleAction(nextSeat, { action: 'call' }); // SB calls
      const state3 = service.getState();
      const bbSeat = state3.activePlayer;
      service.handleAction(bbSeat, { action: 'check' }); // BB checks

      // Now we should be on flop
      const flopState = service.getState();
      expect(flopState.phase).toBe('flop');
      const flopActive = flopState.activePlayer;
      const info = service.getActionInfo(flopActive);
      expect(info.canCheck).toBe(true);
      expect(info.callAmount).toBe(0);
      expect(info.minRaise).toBe(10); // BB is min raise
      expect(info.canRaise).toBe(true);
    });

    it('returns correct callAmount when there is a bet', () => {
      service.startRound();
      const state = service.getState();
      // UTG raises to 30
      service.handleAction(state.activePlayer, { action: 'raise', amount: 30 });
      const state2 = service.getState();
      const info = service.getActionInfo(state2.activePlayer);
      expect(info.canCheck).toBe(false);
      expect(info.callAmount).toBe(25); // 30 - 5 (SB already posted)
      expect(info.minRaise).toBe(50); // 30 + (30-10) = 50
    });
  });

  describe('handleAction with error translation', () => {
    it('translates engine error to user-friendly message', () => {
      service.startRound();
      const state = service.getState();
      // Try to act from wrong seat
      const wrongSeat = (state.activePlayer + 1) % 3;
      const result = service.handleAction(wrongSeat, { action: 'fold' });
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
      // Should NOT contain raw engine message like "Seat X: not your turn"
      expect(result.reason).not.toMatch(/^Seat \d/);
    });
  });

  describe('full round lifecycle', () => {
    it('handles fold → roundEnd correctly', () => {
      service.startRound();
      const state = service.getState();
      // Everyone folds except one
      service.handleAction(state.activePlayer, { action: 'fold' });
      const state2 = service.getState();
      service.handleAction(state2.activePlayer, { action: 'fold' });
      // Two folds = one player left → roundEnd
      const finalState = service.getState();
      expect(finalState.phase).toBe('roundEnd');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects engine -- LocalGameService.test.ts`
Expected: FAIL — cannot find module `LocalGameService`

- [ ] **Step 3: Implement LocalGameService**

```typescript
// src/services/LocalGameService.ts

import { GameState, PlayerAction, Blinds, Player, PlayerStatus, GameLoop } from '../gameEngine';
import { ActionResult, ShowdownResult } from '../gameEngine';
import { GameService, ActionInfo } from './GameService';

const ERROR_MESSAGES: Record<string, string> = {
  'No active betting round': 'ベッティングラウンドが開始されていません',
  'Cannot check — must call, raise, or fold': 'チェックできません。コール、レイズ、またはフォールドしてください',
  'Nothing to call — use check': 'コールする必要はありません。チェックしてください',
  'Not enough chips — use all-in': 'チップが不足しています。オールインしてください',
  'Unknown action': '不明なアクションです',
};

function translateError(reason: string): string {
  // Direct match
  if (ERROR_MESSAGES[reason]) return ERROR_MESSAGES[reason];
  // Pattern matches
  if (reason.startsWith('Seat ') && reason.includes('not your turn')) {
    return 'あなたのターンではありません';
  }
  if (reason.startsWith('Minimum raise is')) {
    return 'レイズ額が最低額に達していません';
  }
  return reason;
}

export class LocalGameService implements GameService {
  private gameLoop: GameLoop | null = null;
  private listeners = new Set<(state: GameState) => void>();

  getState(): GameState {
    if (!this.gameLoop) throw new Error('Game not started');
    return this.gameLoop.getState();
  }

  getActionInfo(seat: number): ActionInfo {
    const state = this.getState();
    const player = state.players.find(p => p.seat === seat)!;
    const minRaiseIncrement = this.gameLoop!.getMinRaiseSize();
    const minRaiseTo = state.currentBet + minRaiseIncrement;
    const maxRaiseTo = player.chips + player.bet;

    return {
      canCheck: state.currentBet <= player.bet,
      callAmount: Math.min(state.currentBet - player.bet, player.chips),
      minRaise: minRaiseTo,
      maxRaise: maxRaiseTo,
      canRaise: maxRaiseTo >= minRaiseTo,
    };
  }

  startGame(playerNames: string[], blinds: Blinds, initialChips: number): void {
    const players: Player[] = playerNames.map((name, i) => ({
      seat: i,
      name,
      chips: initialChips,
      status: 'active' as PlayerStatus,
      bet: 0,
      cards: [],
    }));
    this.gameLoop = new GameLoop(players, blinds);
    this.notify();
  }

  startRound(): void {
    this.gameLoop!.startRound();
    this.notify();
  }

  handleAction(seat: number, action: PlayerAction): ActionResult {
    const result = this.gameLoop!.handleAction(seat, action);
    if (!result.valid && result.reason) {
      return { valid: false, reason: translateError(result.reason) };
    }
    this.notify();
    return result;
  }

  resolveShowdown(): ShowdownResult {
    const result = this.gameLoop!.resolveShowdown();
    this.notify();
    return result;
  }

  prepareNextRound(): void {
    this.gameLoop!.prepareNextRound();
    this.notify();
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    if (!this.gameLoop) return;
    const state = this.gameLoop.getState();
    this.listeners.forEach(l => l(state));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects engine -- LocalGameService.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/LocalGameService.ts tests/services/LocalGameService.test.ts
git commit -m "feat(ui): implement LocalGameService wrapping GameLoop"
```

---

### Task 7: Expo Router Setup

**Files:**
- Create: `app/_layout.tsx`
- Create: `app/index.tsx` (placeholder)
- Create: `app/game.tsx` (placeholder)

- [ ] **Step 1: Create root layout**

```tsx
// app/_layout.tsx

import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../src/theme/colors';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="game" />
      </Stack>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 2: Create placeholder lobby screen**

```tsx
// app/index.tsx

import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../src/theme/colors';

export default function LobbyScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Jet Holdem</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  title: { color: Colors.text, fontSize: 32, fontWeight: 'bold' },
});
```

- [ ] **Step 3: Create placeholder game screen**

```tsx
// app/game.tsx

import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../src/theme/colors';

export default function GameScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Game Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  text: { color: Colors.text, fontSize: 24 },
});
```

- [ ] **Step 4: Verify the app starts**

Run: `npx expo start` and confirm no crash errors in the terminal.
Press `w` for web or check on device/emulator that "Jet Holdem" text appears.

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx app/index.tsx app/game.tsx
git commit -m "feat(ui): add Expo Router layout with lobby and game screen placeholders"
```

---

### Task 8: GameContext and useGame Hook

**Files:**
- Create: `src/contexts/GameContext.tsx`
- Create: `src/hooks/useGame.ts`
- Create: `tests/ui/helpers/renderWithGame.tsx`
- Create: `tests/ui/contexts/GameContext.test.tsx`

- [ ] **Step 1: Create GameContext**

```tsx
// src/contexts/GameContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { GameState, PlayerAction } from '../gameEngine';
import { ShowdownResult } from '../gameEngine';
import { GameService, ActionInfo } from '../services/GameService';
import { ActionResult } from '../gameEngine';

export interface GameContextValue {
  state: GameState | null;
  mode: 'hotseat' | 'debug';
  viewingSeat: number;
  service: GameService;
  showdownResult: ShowdownResult | null;
  doAction: (seat: number, action: PlayerAction) => ActionResult;
  getActionInfo: (seat: number) => ActionInfo;
  nextRound: () => void;
  setViewingSeat: (seat: number) => void;
}

export const GameContext = createContext<GameContextValue | null>(null);

interface GameProviderProps {
  children: React.ReactNode;
  service: GameService;
  mode: 'hotseat' | 'debug';
}

export function GameProvider({ children, service, mode }: GameProviderProps) {
  const [state, setState] = useState<GameState | null>(null);
  const [viewingSeat, setViewingSeat] = useState(0);
  const [showdownResult, setShowdownResult] = useState<ShowdownResult | null>(null);
  const serviceRef = useRef(service);
  serviceRef.current = service;

  useEffect(() => {
    const unsub = service.subscribe((newState) => {
      setState(newState);
    });
    return unsub;
  }, [service]);

  // Auto-update viewingSeat in hotseat mode
  useEffect(() => {
    if (mode === 'hotseat' && state && state.activePlayer >= 0) {
      setViewingSeat(state.activePlayer);
    }
  }, [mode, state?.activePlayer]);

  const doAction = useCallback((seat: number, action: PlayerAction): ActionResult => {
    const result = serviceRef.current.handleAction(seat, action);
    if (!result.valid) return result;

    // Auto-resolve showdown
    const currentState = serviceRef.current.getState();
    if (currentState.phase === 'showdown') {
      const sdResult = serviceRef.current.resolveShowdown();
      setShowdownResult(sdResult);
    }
    return result;
  }, []);

  const getActionInfo = useCallback((seat: number): ActionInfo => {
    return serviceRef.current.getActionInfo(seat);
  }, []);

  const nextRound = useCallback(() => {
    serviceRef.current.prepareNextRound();
    const nextState = serviceRef.current.getState();
    if (nextState.phase !== 'gameOver') {
      serviceRef.current.startRound();
    }
    setShowdownResult(null);
  }, []);

  const value: GameContextValue = {
    state,
    mode,
    viewingSeat,
    service,
    showdownResult,
    doAction,
    getActionInfo,
    nextRound,
    setViewingSeat,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
```

- [ ] **Step 2: Create useGame hook**

```typescript
// src/hooks/useGame.ts

import { useContext } from 'react';
import { GameContext, GameContextValue } from '../contexts/GameContext';

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return ctx;
}
```

- [ ] **Step 3: Create test helper**

```tsx
// tests/ui/helpers/renderWithGame.tsx

import React from 'react';
import { render } from '@testing-library/react-native';
import { GameContext, GameContextValue } from '../../../src/contexts/GameContext';
import { GameState, PlayerAction, Blinds } from '../../../src/gameEngine';
import { ActionResult, ShowdownResult } from '../../../src/gameEngine';
import { GameService, ActionInfo } from '../../../src/services/GameService';

export function createMockService(overrides: Partial<GameService> = {}): GameService {
  return {
    getState: jest.fn(() => createMockGameState()),
    getActionInfo: jest.fn(() => ({
      canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
    })),
    startGame: jest.fn(),
    startRound: jest.fn(),
    handleAction: jest.fn(() => ({ valid: true })),
    resolveShowdown: jest.fn(() => ({ winners: [], hands: [] })),
    prepareNextRound: jest.fn(),
    subscribe: jest.fn(() => () => {}),
    ...overrides,
  };
}

export function createMockGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    seq: 1,
    phase: 'preflop',
    community: [],
    pots: [{ amount: 15, eligible: [0, 1, 2] }],
    currentBet: 10,
    activePlayer: 0,
    dealer: 0,
    blinds: { sb: 5, bb: 10 },
    players: [
      { seat: 0, name: 'Alice', chips: 990, status: 'active', bet: 0, cards: ['Ah', 'Kh'] },
      { seat: 1, name: 'Bob', chips: 995, status: 'active', bet: 5, cards: ['Td', 'Jd'] },
      { seat: 2, name: 'Charlie', chips: 990, status: 'active', bet: 10, cards: ['7s', '8s'] },
    ],
    ...overrides,
  };
}

export function renderWithGame(
  ui: React.ReactElement,
  contextOverrides: Partial<GameContextValue> = {},
) {
  const defaultValue: GameContextValue = {
    state: createMockGameState(),
    mode: 'debug',
    viewingSeat: 0,
    service: createMockService(),
    showdownResult: null,
    doAction: jest.fn(() => ({ valid: true })),
    getActionInfo: jest.fn(() => ({
      canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
    })),
    nextRound: jest.fn(),
    setViewingSeat: jest.fn(),
    ...contextOverrides,
  };

  return {
    ...render(
      <GameContext.Provider value={defaultValue}>{ui}</GameContext.Provider>,
    ),
    contextValue: defaultValue,
  };
}
```

- [ ] **Step 4: Write GameContext test**

```tsx
// tests/ui/contexts/GameContext.test.tsx

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GameProvider } from '../../../src/contexts/GameContext';
import { useGame } from '../../../src/hooks/useGame';
import { LocalGameService } from '../../../src/services/LocalGameService';

function TestConsumer() {
  const { state, mode, viewingSeat } = useGame();
  return (
    <>
      <Text testID="phase">{state?.phase ?? 'null'}</Text>
      <Text testID="mode">{mode}</Text>
      <Text testID="seat">{String(viewingSeat)}</Text>
    </>
  );
}

describe('GameContext', () => {
  it('provides state from service subscription', () => {
    const service = new LocalGameService();
    service.startGame(['A', 'B', 'C'], { sb: 5, bb: 10 }, 1000);

    const { getByTestId } = render(
      <GameProvider service={service} mode="debug">
        <TestConsumer />
      </GameProvider>,
    );

    expect(getByTestId('phase').props.children).toBe('waiting');
    expect(getByTestId('mode').props.children).toBe('debug');
  });

  it('updates state when service notifies', () => {
    const service = new LocalGameService();
    service.startGame(['A', 'B', 'C'], { sb: 5, bb: 10 }, 1000);

    const { getByTestId } = render(
      <GameProvider service={service} mode="debug">
        <TestConsumer />
      </GameProvider>,
    );

    act(() => { service.startRound(); });
    expect(getByTestId('phase').props.children).toBe('preflop');
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx jest --selectProjects ui -- GameContext.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/contexts/GameContext.tsx src/hooks/useGame.ts tests/ui/helpers/renderWithGame.tsx tests/ui/contexts/GameContext.test.tsx
git commit -m "feat(ui): add GameContext, useGame hook, and test utilities"
```

---

## Chunk 2: GameScreen Components

Common components (PlayingCard, ChipAmount), table components (PlayerSeat, CommunityCards, PotDisplay, DealerButton), and the GameScreen layout.

### Task 9: PlayingCard Component

**Files:**
- Create: `src/components/common/PlayingCard.tsx`
- Create: `tests/ui/components/PlayingCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui/components/PlayingCard.test.tsx

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PlayingCard } from '../../../src/components/common/PlayingCard';

describe('PlayingCard', () => {
  it('renders rank and suit for face-up card', () => {
    render(<PlayingCard card="Ah" faceUp />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('♥')).toBeTruthy();
  });

  it('renders red color for hearts', () => {
    render(<PlayingCard card="Ah" faceUp />);
    const suit = screen.getByText('♥');
    expect(suit.props.style).toEqual(expect.objectContaining({ color: '#EF4444' }));
  });

  it('renders red color for diamonds', () => {
    render(<PlayingCard card="Td" faceUp />);
    expect(screen.getByText('♦')).toBeTruthy();
  });

  it('renders white color for spades', () => {
    render(<PlayingCard card="Ks" faceUp />);
    const suit = screen.getByText('♠');
    expect(suit.props.style).toEqual(expect.objectContaining({ color: '#FFFFFF' }));
  });

  it('does not show rank/suit when face-down', () => {
    render(<PlayingCard card="Ah" faceUp={false} />);
    expect(screen.queryByText('A')).toBeNull();
    expect(screen.queryByText('♥')).toBeNull();
  });

  it('renders with community size when specified', () => {
    const { getByTestId } = render(<PlayingCard card="Ah" faceUp size="community" />);
    // Just verify it renders without error
    expect(getByTestId('playing-card')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects ui -- PlayingCard.test.tsx`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement PlayingCard**

```tsx
// src/components/common/PlayingCard.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card, Rank, Suit } from '../../gameEngine';

const SUIT_SYMBOLS: Record<Suit, string> = { h: '♥', d: '♦', s: '♠', c: '♣' };
const SUIT_COLORS: Record<Suit, string> = { h: '#EF4444', d: '#EF4444', s: '#FFFFFF', c: '#FFFFFF' };

const SIZES = {
  hand: { width: 25, height: 35, fontSize: 10 },
  community: { width: 45, height: 65, fontSize: 18 },
};

interface PlayingCardProps {
  card: Card;
  faceUp: boolean;
  size?: 'hand' | 'community';
}

export function PlayingCard({ card, faceUp, size = 'hand' }: PlayingCardProps) {
  const dims = SIZES[size];
  const rank = card[0] as Rank;
  const suit = card[1] as Suit;

  return (
    <View
      testID="playing-card"
      style={[styles.card, { width: dims.width, height: dims.height }, !faceUp && styles.faceDown]}
    >
      {faceUp ? (
        <>
          <Text style={[styles.rank, { fontSize: dims.fontSize, color: SUIT_COLORS[suit] }]}>
            {rank}
          </Text>
          <Text style={{ fontSize: dims.fontSize, color: SUIT_COLORS[suit] }}>
            {SUIT_SYMBOLS[suit]}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceDown: {
    backgroundColor: '#1F2937',
  },
  rank: {
    fontWeight: 'bold',
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ui -- PlayingCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/common/PlayingCard.tsx tests/ui/components/PlayingCard.test.tsx
git commit -m "feat(ui): add PlayingCard component"
```

---

### Task 10: ChipAmount Component

**Files:**
- Create: `src/components/common/ChipAmount.tsx`
- Create: `tests/ui/components/ChipAmount.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui/components/ChipAmount.test.tsx

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ChipAmount } from '../../../src/components/common/ChipAmount';

describe('ChipAmount', () => {
  it('renders amount as string', () => {
    render(<ChipAmount amount={1500} />);
    expect(screen.getByText('1,500')).toBeTruthy();
  });

  it('renders 0 correctly', () => {
    render(<ChipAmount amount={0} />);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('applies custom color', () => {
    const { getByText } = render(<ChipAmount amount={100} color="#10B981" />);
    const text = getByText('100');
    expect(text.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ color: '#10B981' }),
    ]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects ui -- ChipAmount.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement ChipAmount**

```tsx
// src/components/common/ChipAmount.tsx

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface ChipAmountProps {
  amount: number;
  color?: string;
  fontSize?: number;
}

export function ChipAmount({ amount, color = Colors.text, fontSize = 14 }: ChipAmountProps) {
  const formatted = amount.toLocaleString('en-US');
  return <Text style={[styles.text, { color, fontSize }]}>{formatted}</Text>;
}

const styles = StyleSheet.create({
  text: { fontWeight: 'bold' },
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx jest --selectProjects ui -- ChipAmount.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/common/ChipAmount.tsx tests/ui/components/ChipAmount.test.tsx
git commit -m "feat(ui): add ChipAmount component"
```

---

### Task 11: PlayerSeat Component

**Files:**
- Create: `src/components/table/PlayerSeat.tsx`
- Create: `tests/ui/components/PlayerSeat.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui/components/PlayerSeat.test.tsx

import React from 'react';
import { screen } from '@testing-library/react-native';
import { PlayerSeat } from '../../../src/components/table/PlayerSeat';
import { renderWithGame, createMockGameState } from '../helpers/renderWithGame';

describe('PlayerSeat', () => {
  it('renders player name and chips', () => {
    renderWithGame(<PlayerSeat seat={0} />, {
      state: createMockGameState(),
    });
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('990')).toBeTruthy();
  });

  it('shows face-up cards for viewing seat in debug mode', () => {
    renderWithGame(<PlayerSeat seat={0} />, {
      state: createMockGameState(),
      mode: 'debug',
      viewingSeat: 0,
    });
    // In debug mode, all cards are face-up
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('♥')).toBeTruthy();
  });

  it('shows face-down cards for non-viewing seat in hotseat mode', () => {
    renderWithGame(<PlayerSeat seat={1} />, {
      state: createMockGameState(),
      mode: 'hotseat',
      viewingSeat: 0,
    });
    // Seat 1's cards should be face-down (not the viewing seat)
    expect(screen.queryByText('T')).toBeNull(); // Bob has Td
  });

  it('applies folded style for folded player', () => {
    const state = createMockGameState({
      players: [
        { seat: 0, name: 'Alice', chips: 990, status: 'folded', bet: 0, cards: ['Ah', 'Kh'] },
        { seat: 1, name: 'Bob', chips: 995, status: 'active', bet: 5, cards: ['Td', 'Jd'] },
        { seat: 2, name: 'Charlie', chips: 990, status: 'active', bet: 10, cards: ['7s', '8s'] },
      ],
    });
    const { getByTestId } = renderWithGame(<PlayerSeat seat={0} />, { state });
    expect(getByTestId('player-seat-0').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0.5 })]),
    );
  });

  it('shows active highlight for active player', () => {
    const { getByTestId } = renderWithGame(<PlayerSeat seat={0} />, {
      state: createMockGameState({ activePlayer: 0 }),
    });
    expect(getByTestId('player-seat-0').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderColor: '#06B6D4' })]),
    );
  });

  it('shows dealer badge', () => {
    renderWithGame(<PlayerSeat seat={0} />, {
      state: createMockGameState({ dealer: 0 }),
    });
    expect(screen.getByText('D')).toBeTruthy();
  });

  it('shows bet amount when player has bet', () => {
    renderWithGame(<PlayerSeat seat={2} />, {
      state: createMockGameState(),
    });
    expect(screen.getByText('10')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects ui -- PlayerSeat.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement PlayerSeat**

```tsx
// src/components/table/PlayerSeat.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { PlayingCard } from '../common/PlayingCard';
import { ChipAmount } from '../common/ChipAmount';
import { Colors } from '../../theme/colors';

interface PlayerSeatProps {
  seat: number;
}

export function PlayerSeat({ seat }: PlayerSeatProps) {
  const { state, mode, viewingSeat } = useGame();
  if (!state) return null;

  const player = state.players.find(p => p.seat === seat);
  if (!player) return null;

  const isActive = state.activePlayer === seat;
  const isFolded = player.status === 'folded';
  const isDealer = state.dealer === seat;
  const showCards = mode === 'debug' || seat === viewingSeat;

  return (
    <View
      testID={`player-seat-${seat}`}
      style={[
        styles.container,
        isActive && styles.active,
        isFolded && styles.folded,
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.name}>{player.name}</Text>
        {isDealer && <Text style={styles.dealer}>D</Text>}
      </View>

      <View style={styles.cards}>
        {player.cards.map((card, i) => (
          <PlayingCard key={i} card={card} faceUp={showCards} size="hand" />
        ))}
      </View>

      <ChipAmount amount={player.chips} color={Colors.text} fontSize={12} />

      {player.bet > 0 && (
        <ChipAmount amount={player.bet} color={Colors.pot} fontSize={11} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.05)',
    minWidth: 70,
  },
  active: {
    borderColor: Colors.active,
  },
  folded: {
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  name: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  dealer: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: '#78350F',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  cards: {
    flexDirection: 'row',
    gap: 2,
    marginVertical: 4,
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ui -- PlayerSeat.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/table/PlayerSeat.tsx tests/ui/components/PlayerSeat.test.tsx
git commit -m "feat(ui): add PlayerSeat component with active/folded/dealer states"
```

---

### Task 12: CommunityCards Component

**Files:**
- Create: `src/components/table/CommunityCards.tsx`
- Create: `tests/ui/components/CommunityCards.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui/components/CommunityCards.test.tsx

import React from 'react';
import { screen } from '@testing-library/react-native';
import { CommunityCards } from '../../../src/components/table/CommunityCards';
import { renderWithGame, createMockGameState } from '../helpers/renderWithGame';
import { Card } from '../../../src/gameEngine';

describe('CommunityCards', () => {
  it('renders 5 card slots', () => {
    const { getAllByTestId } = renderWithGame(<CommunityCards />, {
      state: createMockGameState({ community: [] }),
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
    expect(emptySlots).toHaveLength(2); // 5 - 3 dealt
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects ui -- CommunityCards.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement CommunityCards**

```tsx
// src/components/table/CommunityCards.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { PlayingCard } from '../common/PlayingCard';

export function CommunityCards() {
  const { state } = useGame();
  const cards = state?.community ?? [];

  return (
    <View style={styles.container}>
      {Array.from({ length: 5 }, (_, i) => (
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

- [ ] **Step 4: Run tests, verify pass**

Run: `npx jest --selectProjects ui -- CommunityCards.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/table/CommunityCards.tsx tests/ui/components/CommunityCards.test.tsx
git commit -m "feat(ui): add CommunityCards component"
```

---

### Task 13: PotDisplay Component

**Files:**
- Create: `src/components/table/PotDisplay.tsx`
- Create: `tests/ui/components/PotDisplay.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui/components/PotDisplay.test.tsx

import React from 'react';
import { screen } from '@testing-library/react-native';
import { PotDisplay } from '../../../src/components/table/PotDisplay';
import { renderWithGame, createMockGameState } from '../helpers/renderWithGame';

describe('PotDisplay', () => {
  it('renders total pot amount', () => {
    renderWithGame(<PotDisplay />, {
      state: createMockGameState({ pots: [{ amount: 300, eligible: [0, 1, 2] }] }),
    });
    expect(screen.getByText('300')).toBeTruthy();
  });

  it('sums multiple pots', () => {
    renderWithGame(<PotDisplay />, {
      state: createMockGameState({
        pots: [
          { amount: 300, eligible: [0, 1, 2] },
          { amount: 100, eligible: [0, 1] },
        ],
      }),
    });
    expect(screen.getByText('400')).toBeTruthy();
  });

  it('shows BB equivalent', () => {
    renderWithGame(<PotDisplay />, {
      state: createMockGameState({
        pots: [{ amount: 100, eligible: [0, 1, 2] }],
        blinds: { sb: 5, bb: 10 },
      }),
    });
    expect(screen.getByText('10 BB')).toBeTruthy();
  });

  it('renders nothing when no pots', () => {
    const { queryByTestId } = renderWithGame(<PotDisplay />, {
      state: createMockGameState({ pots: [] }),
    });
    expect(queryByTestId('pot-display')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects ui -- PotDisplay.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement PotDisplay**

```tsx
// src/components/table/PotDisplay.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { Colors } from '../../theme/colors';

export function PotDisplay() {
  const { state } = useGame();
  if (!state || state.pots.length === 0) return null;

  const total = state.pots.reduce((sum, p) => sum + p.amount, 0);
  if (total === 0) return null;

  const bbCount = Math.floor(total / state.blinds.bb);

  return (
    <View testID="pot-display" style={styles.container}>
      <Text style={styles.amount}>{total.toLocaleString('en-US')}</Text>
      <Text style={styles.bb}>{bbCount} BB</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  amount: { color: Colors.text, fontSize: 18, fontWeight: 'bold' },
  bb: { color: Colors.subText, fontSize: 12 },
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx jest --selectProjects ui -- PotDisplay.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/table/PotDisplay.tsx tests/ui/components/PotDisplay.test.tsx
git commit -m "feat(ui): add PotDisplay component with BB equivalent"
```

---

### Task 14: GameScreen Table Layout

Note: The dealer badge is inlined in PlayerSeat (Task 11). No separate DealerButton component needed.

**Files:**
- Modify: `app/game.tsx`

- [ ] **Step 1: Implement the GameScreen layout**

Replace `app/game.tsx`:

```tsx
// app/game.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { GameProvider } from '../src/contexts/GameContext';
import { LocalGameService } from '../src/services/LocalGameService';
import { useGame } from '../src/hooks/useGame';
import { PlayerSeat } from '../src/components/table/PlayerSeat';
import { CommunityCards } from '../src/components/table/CommunityCards';
import { PotDisplay } from '../src/components/table/PotDisplay';
import { Colors } from '../src/theme/colors';

function TableLayout() {
  const { state, viewingSeat } = useGame();
  if (!state) return null;

  // Fixed seat positions: use total players (not filtered by status) so layout is stable
  const playerCount = state.players.length;
  const allSeats = state.players.map(p => p.seat);

  // Map seats to screen positions relative to viewingSeat
  // bottom=self, left=+1, top=+2, right=+3
  const myIdx = allSeats.indexOf(viewingSeat);
  const seatAt = (offset: number) => {
    if (myIdx === -1) return -1;
    return allSeats[(myIdx + offset) % playerCount];
  };

  const bottomSeat = seatAt(0);
  const leftSeat = playerCount >= 3 ? seatAt(1) : -1;
  const topSeat = playerCount >= 2 ? seatAt(playerCount === 2 ? 1 : 2) : -1;
  const rightSeat = playerCount >= 4 ? seatAt(3) : -1;

  return (
    <View style={styles.table}>
      {/* Top area: opponent across */}
      <View style={styles.topRow}>
        {topSeat >= 0 && <PlayerSeat seat={topSeat} />}
      </View>

      {/* Middle area: left, center (community + pot), right */}
      <View style={styles.middleRow}>
        <View style={styles.sideSlot}>
          {leftSeat >= 0 && <PlayerSeat seat={leftSeat} />}
        </View>
        <View style={styles.center}>
          <PotDisplay />
          <CommunityCards />
        </View>
        <View style={styles.sideSlot}>
          {rightSeat >= 0 && <PlayerSeat seat={rightSeat} />}
        </View>
      </View>

      {/* Bottom area: self */}
      <View style={styles.bottomRow}>
        {bottomSeat >= 0 && <PlayerSeat seat={bottomSeat} />}
      </View>
    </View>
  );
}

export default function GameScreen() {
  const params = useLocalSearchParams<{
    playerNames: string;
    initialChips: string;
    sb: string;
    bb: string;
    mode: 'hotseat' | 'debug';
  }>();

  const playerNames = JSON.parse(params.playerNames ?? '["P0","P1","P2"]');
  const initialChips = Number(params.initialChips ?? '1000');
  const blinds = { sb: Number(params.sb ?? '5'), bb: Number(params.bb ?? '10') };
  const mode = params.mode ?? 'debug';

  const [service] = React.useState(() => {
    const svc = new LocalGameService();
    svc.startGame(playerNames, blinds, initialChips);
    svc.startRound();
    return svc;
  });

  return (
    <GameProvider service={service} mode={mode}>
      <View style={styles.screen}>
        <TableLayout />
        {/* Action buttons will be added in Chunk 3 */}
      </View>
    </GameProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  table: {
    flex: 1,
    backgroundColor: Colors.table,
    borderRadius: 100,
    margin: 8,
    padding: 12,
    justifyContent: 'space-between',
  },
  topRow: {
    alignItems: 'center',
    paddingTop: 8,
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideSlot: {
    width: 80,
    alignItems: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  bottomRow: {
    alignItems: 'center',
    paddingBottom: 8,
  },
});
```

- [ ] **Step 2: Verify app renders**

Run: `npx expo start` and navigate to the game screen. Confirm the table layout renders with player seats, community cards area, and pot display.

- [ ] **Step 3: Commit**

```bash
git add app/game.tsx
git commit -m "feat(ui): implement GameScreen table layout with seat rotation"
```

---

## Chunk 3: Action Buttons

RaiseSlider, ActionButtons, integration with GameScreen.

### Task 15: RaiseSlider Component

**Files:**
- Create: `src/components/actions/RaiseSlider.tsx`
- Create: `tests/ui/components/RaiseSlider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui/components/RaiseSlider.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { RaiseSlider } from '../../../src/components/actions/RaiseSlider';

describe('RaiseSlider', () => {
  const defaultProps = {
    minRaise: 20,
    maxRaise: 1000,
    bbSize: 10,
    value: 20,
    onValueChange: jest.fn(),
  };

  it('renders slider', () => {
    const { getByTestId } = render(<RaiseSlider {...defaultProps} />);
    expect(getByTestId('raise-slider')).toBeTruthy();
  });

  it('displays current value', () => {
    render(<RaiseSlider {...defaultProps} value={50} />);
    expect(screen.getByText('50')).toBeTruthy();
  });

  it('shows ALL IN label when value equals maxRaise', () => {
    render(<RaiseSlider {...defaultProps} value={1000} />);
    expect(screen.getByText('ALL IN')).toBeTruthy();
  });

  it('calls onValueChange when slider moves', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <RaiseSlider {...defaultProps} onValueChange={onChange} />,
    );
    fireEvent(getByTestId('raise-slider'), 'valueChange', 50);
    expect(onChange).toHaveBeenCalledWith(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects ui -- RaiseSlider.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement RaiseSlider**

```tsx
// src/components/actions/RaiseSlider.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { Colors } from '../../theme/colors';

interface RaiseSliderProps {
  minRaise: number;
  maxRaise: number;
  bbSize: number;
  value: number;
  onValueChange: (value: number) => void;
}

export function RaiseSlider({ minRaise, maxRaise, bbSize, value, onValueChange }: RaiseSliderProps) {
  const isAllIn = value >= maxRaise;
  const step = bbSize > 0 ? bbSize : 1;

  return (
    <View style={styles.container}>
      <Slider
        testID="raise-slider"
        style={styles.slider}
        minimumValue={minRaise}
        maximumValue={maxRaise}
        step={step}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={Colors.active}
        maximumTrackTintColor={Colors.subText}
        thumbTintColor={Colors.active}
      />
      <View style={styles.labelRow}>
        <Text style={styles.value}>{isAllIn ? 'ALL IN' : value.toLocaleString('en-US')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', paddingHorizontal: 16 },
  slider: { width: '100%', height: 30 },
  labelRow: { alignItems: 'center' },
  value: { color: Colors.text, fontSize: 14, fontWeight: 'bold' },
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx jest --selectProjects ui -- RaiseSlider.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/actions/RaiseSlider.tsx tests/ui/components/RaiseSlider.test.tsx
git commit -m "feat(ui): add RaiseSlider component"
```

---

### Task 16: ActionButtons Component

**Files:**
- Create: `src/components/actions/ActionButtons.tsx`
- Create: `tests/ui/components/ActionButtons.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui/components/ActionButtons.test.tsx

import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { ActionButtons } from '../../../src/components/actions/ActionButtons';
import { renderWithGame, createMockGameState } from '../helpers/renderWithGame';

describe('ActionButtons', () => {
  it('shows FOLD, CHECK, RAISE when no bet to call', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0, currentBet: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    expect(screen.getByText('FOLD')).toBeTruthy();
    expect(screen.getByText('CHECK')).toBeTruthy();
    expect(screen.getByText(/RAISE/)).toBeTruthy();
  });

  it('shows FOLD, CALL, RAISE when there is a bet', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0, currentBet: 20 }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: false, callAmount: 20, minRaise: 40, maxRaise: 1000, canRaise: true,
      })),
    });
    expect(screen.getByText('FOLD')).toBeTruthy();
    expect(screen.getByText(/CALL 20/)).toBeTruthy();
    expect(screen.getByText(/RAISE/)).toBeTruthy();
  });

  it('shows ALL IN when cannot raise but can call', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: false, callAmount: 100, minRaise: 200, maxRaise: 150, canRaise: false,
      })),
    });
    expect(screen.getByText(/ALL IN/)).toBeTruthy();
  });

  it('disables all buttons when not active player turn', () => {
    const { getByTestId } = renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 1 }),
      viewingSeat: 0,
      mode: 'debug',
    });
    expect(getByTestId('fold-btn').props.accessibilityState?.disabled).toBe(true);
  });

  it('calls doAction with fold when FOLD pressed', () => {
    const doAction = jest.fn(() => ({ valid: true }));
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      doAction,
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    fireEvent.press(screen.getByText('FOLD'));
    expect(doAction).toHaveBeenCalledWith(0, { action: 'fold' });
  });

  it('calls doAction with raise TO amount', () => {
    const doAction = jest.fn(() => ({ valid: true }));
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      doAction,
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    fireEvent.press(screen.getByText(/RAISE/));
    // Should call with raise TO the slider's current value (defaults to minRaise)
    expect(doAction).toHaveBeenCalledWith(0, { action: 'raise', amount: 20 });
  });

  it('shows error message when action is invalid', () => {
    const doAction = jest.fn(() => ({ valid: false, reason: 'テスト用エラー' }));
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      doAction,
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    fireEvent.press(screen.getByText('FOLD'));
    expect(screen.getByText('テスト用エラー')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects ui -- ActionButtons.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement ActionButtons**

```tsx
// src/components/actions/ActionButtons.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { RaiseSlider } from './RaiseSlider';
import { Colors } from '../../theme/colors';

export function ActionButtons() {
  const { state, mode, viewingSeat, doAction, getActionInfo } = useGame();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [raiseValue, setRaiseValue] = useState(0);

  // Determine which seat can act from this view
  const actingSeat = mode === 'debug' ? state?.activePlayer ?? -1 : viewingSeat;
  const isMyTurn = state?.activePlayer === actingSeat && state?.activePlayer >= 0;

  const info = useMemo(() => {
    if (!state || !isMyTurn) return null;
    return getActionInfo(actingSeat);
  }, [state, isMyTurn, actingSeat, getActionInfo]);

  // Reset raise slider when action info changes
  useEffect(() => {
    if (info) setRaiseValue(info.minRaise);
  }, [info?.minRaise]);

  // Auto-clear error after 3 seconds
  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  const handleAction = (action: 'fold' | 'check' | 'call' | 'raise' | 'allIn', amount?: number) => {
    const result = doAction(actingSeat, { action, amount });
    if (!result.valid && result.reason) {
      setErrorMsg(result.reason);
    }
  };

  if (!state) return null;

  const disabled = !isMyTurn;
  const showAllIn = info && !info.canRaise && info.callAmount > 0;

  return (
    <View style={styles.container}>
      {/* Raise slider (only when can raise and is my turn) */}
      {info?.canRaise && isMyTurn && (
        <RaiseSlider
          minRaise={info.minRaise}
          maxRaise={info.maxRaise}
          bbSize={state.blinds.bb}
          value={raiseValue}
          onValueChange={setRaiseValue}
        />
      )}

      {/* Button row */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          testID="fold-btn"
          style={[styles.button, styles.foldBtn, disabled && styles.disabled]}
          onPress={() => handleAction('fold')}
          disabled={disabled}
        >
          <Text style={styles.buttonText}>FOLD</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="call-btn"
          style={[styles.button, styles.callBtn, disabled && styles.disabled]}
          onPress={() => info?.canCheck
            ? handleAction('check')
            : handleAction('call')
          }
          disabled={disabled}
        >
          <Text style={styles.buttonText}>
            {info?.canCheck ? 'CHECK' : `CALL ${info?.callAmount ?? 0}`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="raise-btn"
          style={[styles.button, styles.raiseBtn, disabled && styles.disabled]}
          onPress={() => {
            if (showAllIn) {
              handleAction('allIn');
            } else if (info && raiseValue >= info.maxRaise) {
              handleAction('allIn');
            } else {
              handleAction('raise', raiseValue);
            }
          }}
          disabled={disabled || (!info?.canRaise && !showAllIn)}
        >
          <Text style={styles.buttonText}>
            {showAllIn
              ? `ALL IN ${info?.maxRaise ?? 0}`
              : raiseValue >= (info?.maxRaise ?? 0)
                ? `ALL IN ${info?.maxRaise ?? 0}`
                : `RAISE ${raiseValue}`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error message */}
      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    backgroundColor: Colors.background,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  foldBtn: { backgroundColor: Colors.fold },
  callBtn: { backgroundColor: Colors.call },
  raiseBtn: { backgroundColor: Colors.raise },
  disabled: { opacity: 0.4 },
  buttonText: { color: Colors.text, fontWeight: 'bold', fontSize: 14 },
  error: { color: '#EF4444', fontSize: 12, textAlign: 'center', marginTop: 4 },
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx jest --selectProjects ui -- ActionButtons.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/actions/ActionButtons.tsx tests/ui/components/ActionButtons.test.tsx
git commit -m "feat(ui): add ActionButtons with fold/check/call/raise and error display"
```

---

### Task 17: Integrate ActionButtons into GameScreen

**Files:**
- Modify: `app/game.tsx`

- [ ] **Step 1: Add ActionButtons import and usage**

In `app/game.tsx`, add the import:

```typescript
import { ActionButtons } from '../src/components/actions/ActionButtons';
```

In the `GameScreen` component's JSX, replace the comment `{/* Action buttons will be added in Chunk 3 */}` with:

```tsx
<ActionButtons />
```

- [ ] **Step 2: Verify visually**

Run: `npx expo start`, navigate to game screen. Confirm action buttons appear below the table.

- [ ] **Step 3: Commit**

```bash
git add app/game.tsx
git commit -m "feat(ui): integrate ActionButtons into GameScreen"
```

---

## Chunk 4: ResultOverlay

Round result modal with winner display, hand descriptions, and pot distribution.

### Task 18: ResultOverlay Component

**Files:**
- Create: `src/components/result/ResultOverlay.tsx`
- Create: `tests/ui/components/ResultOverlay.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui/components/ResultOverlay.test.tsx

import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { ResultOverlay } from '../../../src/components/result/ResultOverlay';
import { renderWithGame, createMockGameState } from '../helpers/renderWithGame';
import { ShowdownResult } from '../../../src/gameEngine';

const mockShowdownResult: ShowdownResult = {
  winners: [{ seat: 1, hand: 'Full House, Kings over Sevens', potAmount: 300 }],
  hands: [
    { seat: 0, cards: ['Ah', 'Kh'], description: 'One Pair, Aces' },
    { seat: 1, cards: ['Ks', 'Kd'], description: 'Full House, Kings over Sevens' },
    { seat: 2, cards: ['7s', '8c'], description: '' }, // folded, no description
  ],
};

describe('ResultOverlay', () => {
  it('does not render when no showdown result', () => {
    const { queryByTestId } = renderWithGame(<ResultOverlay />, {
      state: createMockGameState({ phase: 'preflop' }),
      showdownResult: null,
    });
    expect(queryByTestId('result-overlay')).toBeNull();
  });

  it('renders when phase is roundEnd and showdownResult exists', () => {
    const { getByTestId } = renderWithGame(<ResultOverlay />, {
      state: createMockGameState({ phase: 'roundEnd' }),
      showdownResult: mockShowdownResult,
    });
    expect(getByTestId('result-overlay')).toBeTruthy();
  });

  it('renders when phase is roundEnd with no showdownResult (fold win)', () => {
    const { getByTestId } = renderWithGame(<ResultOverlay />, {
      state: createMockGameState({
        phase: 'roundEnd',
        players: [
          { seat: 0, name: 'Alice', chips: 1015, status: 'active', bet: 0, cards: ['Ah', 'Kh'] },
          { seat: 1, name: 'Bob', chips: 995, status: 'folded', bet: 0, cards: ['Td', 'Jd'] },
          { seat: 2, name: 'Charlie', chips: 990, status: 'folded', bet: 0, cards: ['7s', '8s'] },
        ],
      }),
      showdownResult: null,
    });
    expect(getByTestId('result-overlay')).toBeTruthy();
  });

  it('displays winner name and hand', () => {
    renderWithGame(<ResultOverlay />, {
      state: createMockGameState({ phase: 'roundEnd' }),
      showdownResult: mockShowdownResult,
    });
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Full House, Kings over Sevens')).toBeTruthy();
  });

  it('shows folded players as (folded)', () => {
    const state = createMockGameState({
      phase: 'roundEnd',
      players: [
        { seat: 0, name: 'Alice', chips: 990, status: 'active', bet: 0, cards: ['Ah', 'Kh'] },
        { seat: 1, name: 'Bob', chips: 1295, status: 'active', bet: 0, cards: ['Ks', 'Kd'] },
        { seat: 2, name: 'Charlie', chips: 990, status: 'folded', bet: 0, cards: ['7s', '8c'] },
      ],
    });
    renderWithGame(<ResultOverlay />, { state, showdownResult: mockShowdownResult });
    expect(screen.getByText('(folded)')).toBeTruthy();
  });

  it('calls nextRound when button pressed', () => {
    const nextRound = jest.fn();
    renderWithGame(<ResultOverlay />, {
      state: createMockGameState({ phase: 'roundEnd' }),
      showdownResult: mockShowdownResult,
      nextRound,
    });
    fireEvent.press(screen.getByText('次のラウンドへ'));
    expect(nextRound).toHaveBeenCalled();
  });

  it('shows lobby button on gameOver (only one player has chips)', () => {
    const gameOverState = createMockGameState({
      phase: 'roundEnd',
      players: [
        { seat: 0, name: 'Alice', chips: 0, status: 'out', bet: 0, cards: ['Ah', 'Kh'] },
        { seat: 1, name: 'Bob', chips: 3000, status: 'active', bet: 0, cards: ['Ks', 'Kd'] },
        { seat: 2, name: 'Charlie', chips: 0, status: 'out', bet: 0, cards: ['7s', '8c'] },
      ],
    });
    renderWithGame(<ResultOverlay />, {
      state: gameOverState,
      showdownResult: mockShowdownResult,
    });
    expect(screen.getByText('ロビーに戻る')).toBeTruthy();
    expect(screen.queryByText('次のラウンドへ')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects ui -- ResultOverlay.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement ResultOverlay**

```tsx
// src/components/result/ResultOverlay.tsx

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useGame } from '../../hooks/useGame';
import { PlayingCard } from '../common/PlayingCard';
import { Colors } from '../../theme/colors';

export function ResultOverlay() {
  const { state, showdownResult, nextRound } = useGame();
  const router = useRouter();

  if (!state) return null;

  // Show overlay only during roundEnd
  const isRoundEnd = state.phase === 'roundEnd';
  if (!isRoundEnd) return null;

  // Detect fold-win: last non-folded/out player wins
  const activePlayers = state.players.filter(p => p.status !== 'folded' && p.status !== 'out');
  const isFoldWin = !showdownResult && activePlayers.length === 1;
  const foldWinner = isFoldWin ? activePlayers[0] : null;

  // Detect game over: check if only one player has chips
  const playersWithChips = state.players.filter(p => p.chips > 0);
  const isGameOver = playersWithChips.length <= 1;

  const winnerSeats = new Set(showdownResult?.winners.map(w => w.seat) ?? []);
  if (foldWinner) winnerSeats.add(foldWinner.seat);

  return (
    <Modal transparent animationType="fade" testID="result-overlay">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Winner announcement */}
          {foldWinner ? (
            <Text style={styles.winnerName}>{foldWinner.name} wins!</Text>
          ) : showdownResult ? (
            <>
              {showdownResult.winners.map((w, i) => {
                const player = state.players.find(p => p.seat === w.seat);
                return (
                  <View key={i} style={styles.winnerBlock}>
                    <Text style={styles.winnerName}>{player?.name}</Text>
                    <Text style={styles.handDesc}>{w.hand}</Text>
                    <Text style={styles.potWon}>{w.potAmount.toLocaleString('en-US')} chips</Text>
                  </View>
                );
              })}
            </>
          ) : null}

          {/* All hands (showdown only) */}
          {showdownResult && (
            <View style={styles.handsSection}>
              {state.players
                .filter(p => p.status !== 'out')
                .map(p => {
                  const hand = showdownResult.hands.find(h => h.seat === p.seat);
                  const isFolded = p.status === 'folded';
                  const isWinner = winnerSeats.has(p.seat);

                  return (
                    <View
                      key={p.seat}
                      style={[styles.handRow, isWinner && styles.winnerRow]}
                    >
                      <Text style={[styles.playerName, isFolded && styles.foldedText]}>
                        {p.name}
                      </Text>
                      <View style={styles.handCards}>
                        {isFolded ? (
                          <Text style={styles.foldedText}>(folded)</Text>
                        ) : (
                          p.cards.map((card, i) => (
                            <PlayingCard key={i} card={card} faceUp size="hand" />
                          ))
                        )}
                      </View>
                      {hand && !isFolded && (
                        <Text style={styles.handDescSmall}>{hand.description}</Text>
                      )}
                      {isWinner && <Text style={styles.starBadge}>★</Text>}
                    </View>
                  );
                })}
            </View>
          )}

          {/* Side pots detail (only when multiple pots) */}
          {showdownResult && state.pots.length > 1 && (
            <View style={styles.potSection}>
              {showdownResult.winners.map((w, i) => (
                <Text key={i} style={styles.potLine}>
                  Pot: {w.potAmount} → {state.players.find(p => p.seat === w.seat)?.name}
                </Text>
              ))}
            </View>
          )}

          {/* Action button */}
          {isGameOver ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.replace('/')}
            >
              <Text style={styles.actionBtnText}>ロビーに戻る</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.actionBtn} onPress={nextRound}>
              <Text style={styles.actionBtnText}>次のラウンドへ</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
  },
  winnerBlock: { alignItems: 'center', marginBottom: 12 },
  winnerName: { color: Colors.text, fontSize: 20, fontWeight: 'bold' },
  handDesc: { color: Colors.subText, fontSize: 14, marginTop: 2 },
  potWon: { color: Colors.pot, fontSize: 14, marginTop: 2 },
  handsSection: { width: '100%', marginVertical: 12, gap: 6 },
  handRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  winnerRow: { borderWidth: 1, borderColor: Colors.active },
  playerName: { color: Colors.text, fontSize: 13, width: 60 },
  handCards: { flexDirection: 'row', gap: 2 },
  handDescSmall: { color: Colors.subText, fontSize: 11, flex: 1 },
  starBadge: { color: Colors.active, fontSize: 14 },
  foldedText: { color: Colors.subText, fontStyle: 'italic' },
  potSection: { marginVertical: 8 },
  potLine: { color: Colors.subText, fontSize: 12 },
  actionBtn: {
    backgroundColor: Colors.pot,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginTop: 12,
  },
  actionBtnText: { color: Colors.text, fontWeight: 'bold', fontSize: 16 },
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx jest --selectProjects ui -- ResultOverlay.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/result/ResultOverlay.tsx tests/ui/components/ResultOverlay.test.tsx
git commit -m "feat(ui): add ResultOverlay with winner display, hands, and pot distribution"
```

---

### Task 19: Integrate ResultOverlay into GameScreen

**Files:**
- Modify: `app/game.tsx`

- [ ] **Step 1: Add ResultOverlay to GameScreen**

In `app/game.tsx`, add the import:

```typescript
import { ResultOverlay } from '../src/components/result/ResultOverlay';
```

Add `<ResultOverlay />` inside the `GameProvider`, after `<ActionButtons />`:

```tsx
<GameProvider service={service} mode={mode}>
  <View style={styles.screen}>
    <TableLayout />
    <ActionButtons />
    <ResultOverlay />
  </View>
</GameProvider>
```

- [ ] **Step 2: Verify visually**

Run: `npx expo start`. Play through a round to reach roundEnd. Confirm the modal appears with winner info and "次のラウンドへ" button.

- [ ] **Step 3: Commit**

```bash
git add app/game.tsx
git commit -m "feat(ui): integrate ResultOverlay into GameScreen"
```

---

## Chunk 5: LobbyScreen

Game configuration form, player name input, mode selection, and navigation to GameScreen.

### Task 20: LobbyView Component

**Files:**
- Create: `src/components/lobby/LobbyView.tsx`
- Create: `tests/ui/components/LobbyView.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui/components/LobbyView.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { LobbyView } from '../../../src/components/lobby/LobbyView';

// Mock expo-router with stable reference
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('LobbyView', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });
  it('renders title', () => {
    render(<LobbyView />);
    expect(screen.getByText('Jet Holdem')).toBeTruthy();
  });

  it('renders player count selection (2, 3, 4)', () => {
    render(<LobbyView />);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('shows correct number of name inputs for selected player count', () => {
    render(<LobbyView />);
    // Default is 3 players
    const inputs = screen.getAllByPlaceholderText(/Player/);
    expect(inputs).toHaveLength(3);
  });

  it('updates player count when tapping a number', () => {
    render(<LobbyView />);
    fireEvent.press(screen.getByText('4'));
    const inputs = screen.getAllByPlaceholderText(/Player/);
    expect(inputs).toHaveLength(4);
  });

  it('shows mode selection (hotseat and debug)', () => {
    render(<LobbyView />);
    expect(screen.getByText('ホットシート')).toBeTruthy();
    expect(screen.getByText('デバッグ')).toBeTruthy();
  });

  it('renders start button', () => {
    render(<LobbyView />);
    expect(screen.getByText('ゲーム開始')).toBeTruthy();
  });

  it('navigates to game screen on start', () => {
    render(<LobbyView />);
    fireEvent.press(screen.getByText('ゲーム開始'));
    expect(mockPush).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects ui -- LobbyView.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement LobbyView**

```tsx
// src/components/lobby/LobbyView.tsx

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../theme/colors';

const PLAYER_COUNTS = [2, 3, 4];
const DEFAULT_NAMES = ['Player 0', 'Player 1', 'Player 2', 'Player 3'];

export function LobbyView() {
  const router = useRouter();
  const [playerCount, setPlayerCount] = useState(3);
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [initialChips, setInitialChips] = useState('1000');
  const [sb, setSb] = useState('5');
  const [bb, setBb] = useState('10');
  const [mode, setMode] = useState<'hotseat' | 'debug'>('hotseat');

  const updateName = (index: number, name: string) => {
    const next = [...names];
    next[index] = name;
    setNames(next);
  };

  const handleStart = () => {
    const playerNames = names.slice(0, playerCount).map((n, i) => n || `Player ${i}`);
    router.push({
      pathname: '/game',
      params: {
        playerNames: JSON.stringify(playerNames),
        initialChips,
        sb,
        bb,
        mode,
      },
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Jet Holdem</Text>

      {/* Player count */}
      <Text style={styles.label}>プレイヤー数</Text>
      <View style={styles.countRow}>
        {PLAYER_COUNTS.map(n => (
          <TouchableOpacity
            key={n}
            style={[styles.countBtn, playerCount === n && styles.countBtnActive]}
            onPress={() => setPlayerCount(n)}
          >
            <Text style={[styles.countText, playerCount === n && styles.countTextActive]}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Player names */}
      <Text style={styles.label}>プレイヤー名</Text>
      {Array.from({ length: playerCount }, (_, i) => (
        <TextInput
          key={i}
          style={styles.input}
          placeholder={`Player ${i}`}
          placeholderTextColor={Colors.subText}
          value={names[i]}
          onChangeText={(text) => updateName(i, text)}
        />
      ))}

      {/* Game settings */}
      <Text style={styles.label}>初期チップ</Text>
      <TextInput
        style={styles.input}
        value={initialChips}
        onChangeText={setInitialChips}
        keyboardType="numeric"
        placeholderTextColor={Colors.subText}
      />

      <View style={styles.blindsRow}>
        <View style={styles.blindInput}>
          <Text style={styles.label}>SB</Text>
          <TextInput
            style={styles.input}
            value={sb}
            onChangeText={setSb}
            keyboardType="numeric"
            placeholderTextColor={Colors.subText}
          />
        </View>
        <View style={styles.blindInput}>
          <Text style={styles.label}>BB</Text>
          <TextInput
            style={styles.input}
            value={bb}
            onChangeText={setBb}
            keyboardType="numeric"
            placeholderTextColor={Colors.subText}
          />
        </View>
      </View>

      {/* Mode selection */}
      <Text style={styles.label}>モード</Text>
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'hotseat' && styles.modeBtnActive]}
          onPress={() => setMode('hotseat')}
        >
          <Text style={[styles.modeText, mode === 'hotseat' && styles.modeTextActive]}>
            ホットシート
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'debug' && styles.modeBtnActive]}
          onPress={() => setMode('debug')}
        >
          <Text style={[styles.modeText, mode === 'debug' && styles.modeTextActive]}>
            デバッグ
          </Text>
        </TouchableOpacity>
      </View>

      {/* Start button */}
      <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
        <Text style={styles.startBtnText}>ゲーム開始</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: Colors.background,
  },
  title: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 32,
    marginTop: 48,
  },
  label: {
    color: Colors.subText,
    fontSize: 14,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#374151',
    color: Colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  countRow: { flexDirection: 'row', gap: 12 },
  countBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.subText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBtnActive: { borderColor: Colors.active, backgroundColor: 'rgba(6,182,212,0.15)' },
  countText: { color: Colors.subText, fontSize: 18, fontWeight: 'bold' },
  countTextActive: { color: Colors.active },
  blindsRow: { flexDirection: 'row', gap: 12 },
  blindInput: { flex: 1 },
  modeRow: { flexDirection: 'row', gap: 12 },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.subText,
    alignItems: 'center',
  },
  modeBtnActive: { borderColor: Colors.active, backgroundColor: 'rgba(6,182,212,0.15)' },
  modeText: { color: Colors.subText, fontWeight: '600' },
  modeTextActive: { color: Colors.active },
  startBtn: {
    backgroundColor: Colors.pot,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  startBtnText: { color: Colors.text, fontSize: 18, fontWeight: 'bold' },
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx jest --selectProjects ui -- LobbyView.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/LobbyView.tsx tests/ui/components/LobbyView.test.tsx
git commit -m "feat(ui): add LobbyView with player config, game settings, and mode selection"
```

---

### Task 21: Update LobbyScreen to Use LobbyView

**Files:**
- Modify: `app/index.tsx`

- [ ] **Step 1: Replace placeholder with LobbyView**

```tsx
// app/index.tsx

import { LobbyView } from '../src/components/lobby/LobbyView';

export default function LobbyScreen() {
  return <LobbyView />;
}
```

- [ ] **Step 2: Verify visually**

Run: `npx expo start`. Confirm the lobby screen shows player count buttons, name inputs, blinds config, mode selection, and start button. Tap "ゲーム開始" and confirm navigation to the game screen.

- [ ] **Step 3: Commit**

```bash
git add app/index.tsx
git commit -m "feat(ui): connect LobbyView to LobbyScreen"
```

---

## Chunk 6: Debug / Hotseat Modes

PassDeviceScreen interstitial, hotseat mode turn switching, and debug mode enhancements.

### Task 22: PassDeviceScreen Component

**Files:**
- Create: `src/components/common/PassDeviceScreen.tsx`
- Create: `tests/ui/components/PassDeviceScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui/components/PassDeviceScreen.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PassDeviceScreen } from '../../../src/components/common/PassDeviceScreen';

describe('PassDeviceScreen', () => {
  it('displays the player name to pass to', () => {
    render(<PassDeviceScreen playerName="Bob" onDismiss={jest.fn()} />);
    expect(screen.getByText(/Bob/)).toBeTruthy();
    expect(screen.getByText(/渡してください/)).toBeTruthy();
  });

  it('calls onDismiss when tapped', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(<PassDeviceScreen playerName="Bob" onDismiss={onDismiss} />);
    fireEvent.press(getByTestId('pass-device-screen'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --selectProjects ui -- PassDeviceScreen.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement PassDeviceScreen**

```tsx
// src/components/common/PassDeviceScreen.tsx

import React from 'react';
import { View, Text, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface PassDeviceScreenProps {
  playerName: string;
  onDismiss: () => void;
}

export function PassDeviceScreen({ playerName, onDismiss }: PassDeviceScreenProps) {
  return (
    <TouchableWithoutFeedback onPress={onDismiss} testID="pass-device-screen">
      <View style={styles.container}>
        <Text style={styles.message}>端末を {playerName} に渡してください</Text>
        <Text style={styles.hint}>タップして続行</Text>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  message: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  hint: {
    color: Colors.subText,
    fontSize: 14,
    marginTop: 16,
  },
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx jest --selectProjects ui -- PassDeviceScreen.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/common/PassDeviceScreen.tsx tests/ui/components/PassDeviceScreen.test.tsx
git commit -m "feat(ui): add PassDeviceScreen interstitial for hotseat mode"
```

---

### Task 23: Hotseat Mode Turn Switching

**Files:**
- Modify: `app/game.tsx`

The hotseat mode logic needs to:
1. Track whether to show the PassDeviceScreen
2. Show it when the active player changes (different from previous)
3. Dismiss on tap, then show the next player's view

- [ ] **Step 1: Add hotseat logic to GameScreen**

In `app/game.tsx`, modify the component inside `GameProvider` to handle the interstitial. Wrap `TableLayout` and `ActionButtons` in a new `GameView` internal component:

```tsx
// Add to the imports at top of app/game.tsx:
import { PassDeviceScreen } from '../src/components/common/PassDeviceScreen';

// Replace the inner content of GameProvider with:
function GameView() {
  const { state, mode, viewingSeat } = useGame();
  const [showPassScreen, setShowPassScreen] = useState(false);
  const [nextPlayerName, setNextPlayerName] = useState('');
  const prevActiveRef = React.useRef<number>(-1);

  useEffect(() => {
    if (!state || mode !== 'hotseat') return;

    const currentActive = state.activePlayer;
    const prevActive = prevActiveRef.current;

    // Show interstitial when active player changes (and it's not first render or roundEnd/showdown)
    if (
      prevActive >= 0 &&
      currentActive >= 0 &&
      currentActive !== prevActive &&
      state.phase !== 'roundEnd' &&
      state.phase !== 'showdown'
    ) {
      const player = state.players.find(p => p.seat === currentActive);
      if (player) {
        setNextPlayerName(player.name);
        setShowPassScreen(true);
      }
    }
    prevActiveRef.current = currentActive;
  }, [state?.activePlayer, state?.phase, mode]);

  if (showPassScreen) {
    return (
      <PassDeviceScreen
        playerName={nextPlayerName}
        onDismiss={() => setShowPassScreen(false)}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <TableLayout />
      <ActionButtons />
      <ResultOverlay />
    </View>
  );
}
```

Update the `GameScreen` default export to use `GameView`:

```tsx
export default function GameScreen() {
  // ... existing params parsing and service creation ...

  return (
    <GameProvider service={service} mode={mode}>
      <GameView />
    </GameProvider>
  );
}
```

- [ ] **Step 2: Verify visually**

Run: `npx expo start`. Start a game in hotseat mode. After acting with one player, confirm the "端末を [Name] に渡してください" screen appears. Tap to dismiss and confirm the view switches to the next player's perspective.

- [ ] **Step 3: Commit**

```bash
git add app/game.tsx
git commit -m "feat(ui): add hotseat turn switching with PassDeviceScreen interstitial"
```

---

### Task 24: Debug Mode Enhancements

**Files:**
- Modify: `app/game.tsx`

Debug mode needs:
- All hands face-up (already handled by PlayerSeat via `mode === 'debug'`)
- Fixed viewingSeat at 0 (already handled by GameContext: hotseat auto-updates, debug doesn't)
- All seats' action buttons active (already handled by ActionButtons: debug uses activePlayer)
- Debug info bar at top showing phase, pot breakdown, statuses

- [ ] **Step 1: Add debug info bar to GameView**

In `app/game.tsx`, add a `DebugInfoBar` component:

```tsx
function DebugInfoBar() {
  const { state, mode } = useGame();
  if (mode !== 'debug' || !state) return null;

  const potBreakdown = state.pots.map((p, i) =>
    `Pot${i}: ${p.amount} [${p.eligible.join(',')}]`
  ).join(' | ');

  const statuses = state.players.map(p =>
    `${p.name}: ${p.status} (${p.chips})`
  ).join(' | ');

  return (
    <View style={debugStyles.bar}>
      <Text style={debugStyles.text}>Phase: {state.phase} | Dealer: {state.dealer} | Bet: {state.currentBet}</Text>
      <Text style={debugStyles.text}>{potBreakdown}</Text>
      <Text style={debugStyles.text}>{statuses}</Text>
    </View>
  );
}

const debugStyles = StyleSheet.create({
  bar: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 4,
    paddingHorizontal: 8,
  },
  text: {
    color: Colors.subText,
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
```

In `GameView`, add `<DebugInfoBar />` at the top:

```tsx
return (
  <View style={styles.screen}>
    <DebugInfoBar />
    <TableLayout />
    <ActionButtons />
    <ResultOverlay />
  </View>
);
```

- [ ] **Step 2: Verify visually**

Run: `npx expo start`. Start a game in debug mode. Confirm:
- Debug info bar shows at top with phase, pots, statuses
- All player cards are face-up
- Can act from any active seat

- [ ] **Step 3: Commit**

```bash
git add app/game.tsx
git commit -m "feat(ui): add debug mode info bar with phase, pots, and player statuses"
```

---

### Task 25: Run All Tests

**Files:** None (verification only)

- [ ] **Step 1: Run all engine tests**

Run: `npx jest --selectProjects engine`
Expected: All PASS

- [ ] **Step 2: Run all UI tests**

Run: `npx jest --selectProjects ui`
Expected: All PASS

- [ ] **Step 3: Run all tests together**

Run: `npx jest`
Expected: All PASS

- [ ] **Step 4: Final commit**

If any test fixes were needed, stage only the changed files and commit:

```bash
git add <specific files that were fixed>
git commit -m "test: fix any remaining test issues for UI implementation"
```
