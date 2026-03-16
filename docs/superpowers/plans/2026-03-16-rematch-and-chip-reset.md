# Rematch Flow & Chip Reset UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "rematch" button to game-over screen and a chip-reset button to the lobby, supporting all modes (hotseat, debug, ble-host, ble-client).

**Architecture:** `GameContext` gets a `rematch()` callback that re-calls `service.startGame()` + `startRound()` with fresh chips. For BLE, `BleHostGameService` sends a `rematch` protocol message on re-start; `BleClientGameService` handles it by clearing stale state. `subscribePersistence` resets its round counter via a `sawGameOver` flag. LobbyView gets a chip-reset button using the existing `savePlayerChips()` API.

**Tech Stack:** React Native, TypeScript, Jest, React Native Testing Library, Expo Router

**Spec:** `docs/superpowers/specs/2026-03-16-rematch-and-chip-reset-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/hooks/usePersistence.ts` | Add `sawGameOver` flag to reset `roundCount` on rematch |
| Modify | `src/services/ble/GameProtocol.ts` | Add `rematch` to `GameHostMessage` union + validation |
| Modify | `src/services/ble/BleHostGameService.ts` | Send `rematch` on re-start; fix `savedChips?` signature |
| Modify | `src/services/ble/BleClientGameService.ts` | Handle `rematch`; fix `savedChips?` signature |
| Modify | `src/contexts/GameContext.tsx` | Add `rematch()`, `playerNames` prop, BLE client preflop reset |
| Modify | `app/game.tsx` | Hoist `playerNames`, pass to `GameProvider` |
| Modify | `tests/ui/helpers/renderWithGame.tsx` | Add `rematch` to default context value |
| Modify | `src/components/result/ResultOverlay.tsx` | Rematch button, BLE client waiting text |
| Modify | `src/components/lobby/LobbyView.tsx` | Chip reset button with confirmation dialog |

---

## Chunk 1: Persistence, Protocol, BLE Services

### Task 1: subscribePersistence roundCount reset

**Files:**
- Modify: `src/hooks/usePersistence.ts:25-58`
- Test: `tests/persistence/usePersistence.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/persistence/usePersistence.test.ts`:

```typescript
it('resets roundCount after gameOver → rematch (preflop)', async () => {
  const service = createMockService();
  const repo = new InMemoryGameRepository();
  const config: PersistenceConfig = { mode: 'hotseat', initialChips: 1000, blinds: { sb: 5, bb: 10 } };

  subscribePersistence(service, repo, config);

  // Game 1: 2 rounds → gameOver
  service.emit(makeState('roundEnd', [{ chips: 1100 }, { chips: 900 }]));
  service.emit(makeState('roundEnd', [{ chips: 1200 }, { chips: 800 }]));
  service.emit(makeState('gameOver', [{ chips: 2000 }, { chips: 0 }]));

  // Rematch: LocalGameService emits waiting then preflop
  service.emit(makeState('waiting'));
  service.emit(makeState('preflop'));

  // Game 2: 1 round → gameOver
  service.emit(makeState('roundEnd', [{ chips: 1100 }, { chips: 900 }]));
  service.emit(makeState('gameOver', [{ chips: 2000 }, { chips: 0 }]));

  // Flush fire-and-forget promises
  await new Promise(r => setTimeout(r, 10));

  const history = await repo.getGameHistory();
  expect(history).toHaveLength(2);
  expect(history[0].rounds).toBe(2); // Game 1
  expect(history[1].rounds).toBe(1); // Game 2 (reset, not 3)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/persistence/usePersistence.test.ts -t "resets roundCount"`
Expected: FAIL — `history[1].rounds` is `3` instead of `1`

- [ ] **Step 3: Implement the roundCount reset**

In `src/hooks/usePersistence.ts`, add `sawGameOver` flag inside `subscribePersistence`:

```typescript
// After line 26 (let roundCount = 0;), add:
let sawGameOver = false;

// Inside the subscribe callback, after the gameOver block (after line 56), add:
// Reset roundCount on rematch (new game after gameOver)
if (sawGameOver && currentPhase === 'preflop') {
  roundCount = 0;
  sawGameOver = false;
}

// Inside the gameOver block (line 41), add after the existing condition body:
// Set flag (inside the if block, after saveGameRecord call):
sawGameOver = true;
```

The full modified subscribe callback should be:

```typescript
const unsub = service.subscribe((state: GameState) => {
  const currentPhase = state.phase;

  // Round end: save all player chips
  if (currentPhase === 'roundEnd' && prevPhase !== 'roundEnd') {
    roundCount++;
    for (const player of state.players) {
      repository.savePlayerChips(player.name, player.chips).catch(() => {});
    }
  }

  // Game over: save game record
  if (currentPhase === 'gameOver' && prevPhase !== 'gameOver') {
    sawGameOver = true;
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
    repository.saveGameRecord(record).catch(() => {});
  }

  // Reset roundCount on rematch (new game after gameOver)
  if (sawGameOver && currentPhase === 'preflop') {
    roundCount = 0;
    sawGameOver = false;
  }

  prevPhase = currentPhase;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/persistence/usePersistence.test.ts -t "resets roundCount"`
Expected: PASS

- [ ] **Step 5: Run full persistence test suite**

Run: `npx jest tests/persistence/usePersistence.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePersistence.ts tests/persistence/usePersistence.test.ts
git commit -m "feat: reset persistence roundCount on rematch"
```

---

### Task 2: GameProtocol rematch message type

**Files:**
- Modify: `src/services/ble/GameProtocol.ts:20-45,176-189`
- Test: `tests/ble/GameProtocol.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ble/GameProtocol.test.ts` inside the `validateGameHostMessage` describe:

```typescript
describe('rematch', () => {
  it('accepts valid rematch message', () => {
    expect(validateGameHostMessage({ type: 'rematch', seq: 5 }))
      .toEqual({ type: 'rematch', seq: 5 });
  });

  it('rejects rematch without seq', () => {
    expect(validateGameHostMessage({ type: 'rematch' })).toBeNull();
  });

  it('rejects rematch with non-number seq', () => {
    expect(validateGameHostMessage({ type: 'rematch', seq: 'abc' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ble/GameProtocol.test.ts -t "rematch"`
Expected: FAIL — all 3 tests fail (rematch messages return `null`)

- [ ] **Step 3: Add rematch to GameHostMessage type and validation**

In `src/services/ble/GameProtocol.ts`:

Add to the `GameHostMessage` union (after the `roundEnd` variant, before the semicolon on line 45):

```typescript
  | {
      type: 'rematch';
      seq: number;
    }
```

Add to `validateGameHostMessage` switch (before the `default` case, line 187):

```typescript
    case 'rematch':
      if (typeof data.seq !== 'number') return null;
      return { type: 'rematch', seq: data.seq };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ble/GameProtocol.test.ts -t "rematch"`
Expected: PASS

- [ ] **Step 5: Run full protocol test suite**

Run: `npx jest tests/ble/GameProtocol.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/ble/GameProtocol.ts tests/ble/GameProtocol.test.ts
git commit -m "feat: add rematch message to BLE game protocol"
```

---

### Task 3: BleHostGameService rematch broadcast + signature fix

**Files:**
- Modify: `src/services/ble/BleHostGameService.ts:61-71`
- Test: `tests/ble/BleHostGameService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ble/BleHostGameService.test.ts`:

```typescript
describe('rematch', () => {
  it('does not send rematch message on first startGame', () => {
    service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
    const broadcasts = decodeBroadcasts(transport);
    const rematchMsgs = broadcasts.filter((m: any) => m.type === 'rematch');
    expect(rematchMsgs).toHaveLength(0);
  });

  it('sends rematch message on second startGame', () => {
    service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
    service.startRound();
    transport.sentMessages.length = 0; // clear

    service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
    const broadcasts = decodeBroadcasts(transport);
    const rematchMsgs = broadcasts.filter((m: any) => m.type === 'rematch');
    expect(rematchMsgs).toHaveLength(1);
    expect(rematchMsgs[0]).toEqual({ type: 'rematch', seq: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ble/BleHostGameService.test.ts -t "rematch"`
Expected: FAIL — second test finds 0 rematch messages

- [ ] **Step 3: Implement rematch broadcast and fix signature**

In `src/services/ble/BleHostGameService.ts`, replace `startGame` method (lines 61-71):

```typescript
  startGame(playerNames: string[], blinds: Blinds, initialChips: number, _savedChips?: Record<string, number>): void {
    const isRematch = this.gameLoop !== null;

    const players: Player[] = playerNames.map((name, i) => ({
      seat: i,
      name,
      chips: initialChips,
      status: 'active' as PlayerStatus,
      bet: 0,
      cards: [],
    }));
    this.gameLoop = new GameLoop(players, blinds);

    if (isRematch) {
      this.sendToAll('gameState', { type: 'rematch', seq: 0 });
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ble/BleHostGameService.test.ts -t "rematch"`
Expected: PASS

- [ ] **Step 5: Run full BleHostGameService test suite**

Run: `npx jest tests/ble/BleHostGameService.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/ble/BleHostGameService.ts tests/ble/BleHostGameService.test.ts
git commit -m "feat: BleHostGameService sends rematch on re-start, fix savedChips signature"
```

---

### Task 4: BleClientGameService rematch handler + signature fix

**Files:**
- Modify: `src/services/ble/BleClientGameService.ts:59-61,119-156`
- Test: `tests/ble/BleClientGameService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ble/BleClientGameService.test.ts`:

```typescript
describe('rematch handling', () => {
  it('clears showdownResult and myCards on rematch message', () => {
    // Set up state with showdown data
    sendMessage(transport, 'gameState', makeStateUpdate({ phase: 'roundEnd' as any }));
    sendMessage(transport, 'privateHand', { type: 'privateHand', seat: 1, cards: ['Ah', 'Kh'] });
    sendMessage(transport, 'gameState', {
      type: 'showdownResult',
      seq: 2,
      winners: [{ seat: 0, hand: 'Pair', potAmount: 100 }],
      hands: [{ seat: 0, cards: ['Qs', 'Qd'], description: 'Pair' }],
    });

    // Verify pre-condition: showdownResult exists
    const sdResult = service.resolveShowdown();
    expect(sdResult.winners).toHaveLength(1);

    // Send rematch
    sendMessage(transport, 'gameState', { type: 'rematch', seq: 0 });

    // resolveShowdown should return empty after rematch
    const sdAfter = service.resolveShowdown();
    expect(sdAfter.winners).toHaveLength(0);

    // Cards should be cleared
    sendMessage(transport, 'gameState', makeStateUpdate({ seq: 10, phase: 'preflop' }));
    const state = service.getState();
    expect(state.players.find(p => p.seat === 1)?.cards).toEqual([]);
  });

  it('notifies listeners on rematch message', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    const listener = jest.fn();
    service.subscribe(listener);
    listener.mockClear();

    sendMessage(transport, 'gameState', { type: 'rematch', seq: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ble/BleClientGameService.test.ts -t "rematch handling"`
Expected: FAIL — rematch messages are silently dropped

- [ ] **Step 3: Implement rematch handler and fix signature**

In `src/services/ble/BleClientGameService.ts`:

Fix `startGame` signature (line 59):

```typescript
  startGame(_playerNames: string[], _blinds: Blinds, _initialChips: number, _savedChips?: Record<string, number>): void {
```

Add `rematch` case to `handleGameStateMessage` switch (after the `roundEnd` case, before the closing `}`):

```typescript
      case 'rematch':
        this.lastShowdownResult = null;
        this.myCards = [];
        this.notifyListeners();
        break;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ble/BleClientGameService.test.ts -t "rematch handling"`
Expected: PASS

- [ ] **Step 5: Run full BleClientGameService test suite**

Run: `npx jest tests/ble/BleClientGameService.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/ble/BleClientGameService.ts tests/ble/BleClientGameService.test.ts
git commit -m "feat: BleClientGameService handles rematch, fix savedChips signature"
```

---

## Chunk 2: GameContext, ResultOverlay, LobbyView

### Task 5: GameContext rematch() + BLE client preflop reset

**Files:**
- Modify: `src/contexts/GameContext.tsx`
- Modify: `app/game.tsx`
- Test: `tests/ui/contexts/GameContext.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add `fireEvent` to the existing import at the top of `tests/ui/contexts/GameContext.test.tsx`:

```typescript
import { render, act, fireEvent } from '@testing-library/react-native';
```

Then add the test code:

```typescript
function RematchConsumer() {
  const { state, rematch, showdownResult } = useGame();
  return (
    <>
      <Text testID="phase">{state?.phase ?? 'null'}</Text>
      <Text testID="showdown">{showdownResult ? 'yes' : 'no'}</Text>
      <Text testID="rematch-btn" onPress={rematch}>rematch</Text>
    </>
  );
}

describe('rematch', () => {
  it('calls startGame and startRound on service', () => {
    const service = new LocalGameService();
    service.startGame(['A', 'B'], { sb: 5, bb: 10 }, 1000);
    service.startRound();

    const startGameSpy = jest.spyOn(service, 'startGame');
    const startRoundSpy = jest.spyOn(service, 'startRound');

    const { getByTestId } = render(
      <GameProvider service={service} mode="debug" playerNames={['A', 'B']} initialChips={1000} blinds={{ sb: 5, bb: 10 }}>
        <RematchConsumer />
      </GameProvider>,
    );

    act(() => {
      fireEvent.press(getByTestId('rematch-btn'));
    });

    expect(startGameSpy).toHaveBeenCalledWith(['A', 'B'], { sb: 5, bb: 10 }, 1000);
    expect(startRoundSpy).toHaveBeenCalled();
    expect(getByTestId('phase').props.children).toBe('preflop');
  });

  it('clears showdownResult', () => {
    const service = new LocalGameService();
    service.startGame(['A', 'B'], { sb: 5, bb: 10 }, 1000);
    service.startRound();

    const { getByTestId } = render(
      <GameProvider service={service} mode="debug" playerNames={['A', 'B']} initialChips={1000} blinds={{ sb: 5, bb: 10 }}>
        <RematchConsumer />
      </GameProvider>,
    );

    // showdownResult starts as null
    expect(getByTestId('showdown').props.children).toBe('no');

    act(() => {
      fireEvent.press(getByTestId('rematch-btn'));
    });

    expect(getByTestId('showdown').props.children).toBe('no');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/contexts/GameContext.test.tsx -t "rematch"`
Expected: FAIL — `rematch` does not exist on GameContextValue

- [ ] **Step 3: Implement GameContext rematch + game.tsx playerNames**

In `src/contexts/GameContext.tsx`:

Add `rematch` to interface (after `setViewingSeat` on line 18):

```typescript
  rematch: () => void;
```

Add `playerNames` to props (after `blinds` on line 29):

```typescript
  playerNames?: string[];
```

Destructure `playerNames` in GameProvider (line 32):

```typescript
export function GameProvider({ children, service, mode, repository, initialChips, blinds, playerNames }: GameProviderProps) {
```

Add refs after `serviceRef` (after line 37):

```typescript
  const playerNamesRef = useRef(playerNames);
  playerNamesRef.current = playerNames;
  const blindsRef = useRef(blinds);
  blindsRef.current = blinds;
  const initialChipsRef = useRef(initialChips);
  initialChipsRef.current = initialChips;
```

Add BLE client showdownResult clear in subscribe handler (after the existing BLE client showdown detection block, around line 73):

```typescript
      // BLE client: clear showdownResult on rematch (preflop after gameOver/roundEnd)
      if (mode === 'ble-client' && newState.phase === 'preflop' && prevPhaseRef.current !== 'preflop') {
        setShowdownResult(null);
      }
```

Add `rematch` callback (after `nextRound`, around line 111):

```typescript
  const rematch = useCallback(() => {
    const names = playerNamesRef.current;
    const bl = blindsRef.current;
    const chips = initialChipsRef.current;
    if (!names || !bl || !chips) return;
    serviceRef.current.startGame(names, bl, chips);
    serviceRef.current.startRound();
    setShowdownResult(null);
  }, []);
```

Add `rematch` to the value object (after `nextRound` in the value object):

```typescript
    rematch,
```

In `app/game.tsx`:

Hoist `playerNames` out of the `useState` initializer. Add before the `useState` block (around line 161):

```typescript
  const playerNames = React.useMemo<string[]>(() => {
    return JSON.parse(params.playerNames ?? '[]');
  }, [params.playerNames]);
```

**Note:** Default is `'[]'` (empty array), not `'["P0","P1","P2"]'`. BLE host mode passes `playerNames` via params; local modes always pass them too. The fallback empty array only serves as a type-safe default that won't inject phantom names.

Then use `playerNames` inside the `useState` initializer (replace line 169 and line 182 which parse playerNames).

Pass `playerNames` to `GameProvider` (add to props on line 205-211):

```typescript
      playerNames={playerNames}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ui/contexts/GameContext.test.tsx -t "rematch"`
Expected: PASS

- [ ] **Step 5: Run full context test suite**

Run: `npx jest tests/ui/contexts/GameContext.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/contexts/GameContext.tsx app/game.tsx tests/ui/contexts/GameContext.test.tsx
git commit -m "feat: add rematch() to GameContext, pass playerNames from game.tsx"
```

---

### Task 6: Update renderWithGame helper

**Files:**
- Modify: `tests/ui/helpers/renderWithGame.tsx:47-60`

- [ ] **Step 1: Add `rematch` to default GameContextValue**

In `tests/ui/helpers/renderWithGame.tsx`, add `rematch: jest.fn()` to the `defaultValue` object (after `nextRound: jest.fn()` on line 57):

```typescript
    rematch: jest.fn(),
```

- [ ] **Step 2: Run existing UI tests to verify nothing breaks**

Run: `npx jest --selectProjects ui`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/ui/helpers/renderWithGame.tsx
git commit -m "chore: add rematch to renderWithGame default context"
```

---

### Task 7: ResultOverlay rematch button

**Files:**
- Modify: `src/components/result/ResultOverlay.tsx`
- Test: `tests/ui/components/ResultOverlay.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/components/ResultOverlay.test.tsx`:

```typescript
describe('game over buttons', () => {
  const gameOverState = createMockGameState({
    phase: 'roundEnd',
    players: [
      { seat: 0, name: 'Alice', chips: 3000, status: 'active', bet: 0, cards: ['Ah', 'Kh'] },
      { seat: 1, name: 'Bob', chips: 0, status: 'out', bet: 0, cards: [] },
      { seat: 2, name: 'Charlie', chips: 0, status: 'out', bet: 0, cards: [] },
    ],
  });

  it('shows rematch and back-to-lobby buttons on game over (non-BLE-client)', () => {
    const { getByTestId } = renderWithGame(<ResultOverlay />, {
      state: gameOverState,
      showdownResult: mockShowdownResult,
      mode: 'debug',
    });
    expect(getByTestId('rematch-btn')).toBeTruthy();
    expect(getByTestId('back-to-lobby-btn')).toBeTruthy();
  });

  it('calls rematch when rematch button is pressed', () => {
    const rematchFn = jest.fn();
    const { getByTestId } = renderWithGame(<ResultOverlay />, {
      state: gameOverState,
      showdownResult: mockShowdownResult,
      mode: 'debug',
      rematch: rematchFn,
    });
    fireEvent.press(getByTestId('rematch-btn'));
    expect(rematchFn).toHaveBeenCalledTimes(1);
  });

  it('hides rematch button for ble-client, shows waiting text', () => {
    const { queryByTestId, getByText } = renderWithGame(<ResultOverlay />, {
      state: gameOverState,
      showdownResult: mockShowdownResult,
      mode: 'ble-client',
    });
    expect(queryByTestId('rematch-btn')).toBeNull();
    expect(getByText('ホストの操作を待っています...')).toBeTruthy();
    expect(queryByTestId('back-to-lobby-btn')).toBeTruthy();
  });

  it('shows rematch button for ble-host', () => {
    const { getByTestId } = renderWithGame(<ResultOverlay />, {
      state: gameOverState,
      showdownResult: mockShowdownResult,
      mode: 'ble-host',
    });
    expect(getByTestId('rematch-btn')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/components/ResultOverlay.test.tsx -t "game over buttons"`
Expected: FAIL — `rematch-btn` testID not found

- [ ] **Step 3: Implement ResultOverlay changes**

In `src/components/result/ResultOverlay.tsx`:

Update the `useGame()` destructuring (line 11):

```typescript
  const { state, showdownResult, nextRound, mode, rematch } = useGame();
```

Replace the `isGameOver` block (lines 96-108) with:

```typescript
          {isGameOver ? (
            <View style={styles.gameOverButtons}>
              {mode !== 'ble-client' ? (
                <TouchableOpacity
                  testID="rematch-btn"
                  style={styles.actionBtn}
                  onPress={rematch}
                >
                  <Text style={styles.actionBtnText}>再戦</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.waitingText}>ホストの操作を待っています...</Text>
              )}
              <TouchableOpacity
                testID="back-to-lobby-btn"
                style={styles.lobbyBtn}
                onPress={() => router.replace('/')}
              >
                <Text style={styles.lobbyBtnText}>ロビーに戻る</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity testID="next-round-btn" style={styles.actionBtn} onPress={nextRound}>
              <Text style={styles.actionBtnText}>次のラウンドへ</Text>
            </TouchableOpacity>
          )}
```

Add to styles:

```typescript
  gameOverButtons: { alignItems: 'center', gap: 8, marginTop: 12 },
  waitingText: { color: Colors.subText, fontSize: 14, fontStyle: 'italic', marginTop: 12 },
  lobbyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  lobbyBtnText: { color: Colors.subText, fontSize: 14 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ui/components/ResultOverlay.test.tsx -t "game over buttons"`
Expected: PASS

- [ ] **Step 5: Fix any broken existing tests**

Run: `npx jest tests/ui/components/ResultOverlay.test.tsx`

The existing test that checks for `back-to-lobby-btn` in game-over scenarios may need its state setup updated to match the new button structure. If any existing tests fail, update them to account for the new two-button layout.

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/result/ResultOverlay.tsx tests/ui/components/ResultOverlay.test.tsx
git commit -m "feat: add rematch button and BLE client waiting text to ResultOverlay"
```

---

### Task 8: LobbyView chip reset button

**Files:**
- Modify: `src/components/lobby/LobbyView.tsx:187-191`
- Test: `tests/ui/components/LobbyView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/components/LobbyView.test.tsx`:

```typescript
describe('chip reset', () => {
  it('renders chip reset button in local mode', () => {
    render(<LobbyView />);
    expect(screen.getByTestId('chip-reset-btn')).toBeTruthy();
  });

  it('calls savePlayerChips for each player on confirm', async () => {
    const { repository } = require('../../../src/services/persistence');
    repository.savePlayerChips = jest.fn().mockResolvedValue(undefined);

    render(<LobbyView />);
    fireEvent.press(screen.getByTestId('chip-reset-btn'));

    // Alert.alert is called — simulate pressing "はい" (second button)
    const { Alert } = require('react-native');
    const alertCall = Alert.alert.mock.calls[0];
    const confirmButton = alertCall[2].find((b: any) => b.text === 'はい');
    await act(async () => {
      confirmButton.onPress();
    });

    // 3 players by default
    expect(repository.savePlayerChips).toHaveBeenCalledTimes(3);
    expect(repository.savePlayerChips).toHaveBeenCalledWith('Player 0', 1000);
  });
});
```

Also update the existing persistence mock at the top of the file to include `savePlayerChips`:

```typescript
// Update the existing jest.mock('../../../src/services/persistence', ...) to add:
savePlayerChips: jest.fn().mockResolvedValue(undefined),
```

And add `Alert` mock at the top of the file (after the existing mocks):

```typescript
jest.spyOn(require('react-native').Alert, 'alert');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/components/LobbyView.test.tsx -t "chip reset"`
Expected: FAIL — `chip-reset-btn` not found

- [ ] **Step 3: Implement chip reset button**

In `src/components/lobby/LobbyView.tsx`:

Add `Alert` to imports (line 2):

```typescript
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
```

Add state for feedback (after `mode` state, around line 23):

```typescript
  const [resetFeedback, setResetFeedback] = useState(false);
```

Add handler (after `handleStart`, around line 82):

```typescript
  const handleChipReset = () => {
    Alert.alert(
      'チップリセット',
      '全プレイヤーの保存済みチップをリセットしますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'はい',
          onPress: async () => {
            const playerNames = names.slice(0, playerCount).map((n, i) => n || `Player ${i}`);
            for (const name of playerNames) {
              await repository.savePlayerChips(name, Number(initialChips));
            }
            setResetFeedback(true);
            setTimeout(() => setResetFeedback(false), 3000);
          },
        },
      ],
    );
  };
```

Add button before the start button (before line 188):

```typescript
          <TouchableOpacity testID="chip-reset-btn" style={styles.resetBtn} onPress={handleChipReset}>
            <Text style={styles.resetBtnText}>チップをリセット</Text>
          </TouchableOpacity>
          {resetFeedback && (
            <Text style={styles.resetFeedback}>リセットしました</Text>
          )}
```

Add to styles:

```typescript
  resetBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 16,
  },
  resetBtnText: { color: Colors.subText, fontSize: 14 },
  resetFeedback: { color: Colors.pot, fontSize: 12, textAlign: 'center', marginTop: 4 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ui/components/LobbyView.test.tsx -t "chip reset"`
Expected: PASS

- [ ] **Step 5: Run full LobbyView test suite**

Run: `npx jest tests/ui/components/LobbyView.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests PASS (warnings about worker exit are expected and harmless)

- [ ] **Step 7: Commit**

```bash
git add src/components/lobby/LobbyView.tsx tests/ui/components/LobbyView.test.tsx
git commit -m "feat: add chip reset button to LobbyView"
```
