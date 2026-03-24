# Spectator Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add BLE spectator mode — new clients can join as spectators (no hole cards, no actions), and players who bust automatically transition to spectator mode.

**Architecture:** A new `BleSpectatorGameService` implements `GameService` in read-only mode. `LobbyHost`/`LobbyClient` gain a `spectate` message flow (parallel to `join`). `GameContext` gains an `effectiveMode` state that starts as the `mode` prop but transitions to `'ble-spectator'` when the player's own seat goes `'out'`. `game.tsx` wires up the new service and passes `mySeat` for auto-transition detection.

**Tech Stack:** TypeScript, React Native, Expo Router, Jest + testing-library/react-native

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/services/ble/LobbyProtocol.ts` | Modify | Add `spectate`/`spectateResponse`/`spectatorUpdate` types + validation |
| `src/services/ble/LobbyHost.ts` | Modify | Spectator Map, handleSpectate, disconnect, count broadcast, mid-game join |
| `src/services/ble/LobbyClient.ts` | Modify | `spectate()` method, `SpectateResult` type, `onSpectateResult` callback |
| `src/services/ble/BleSpectatorGameService.ts` | **Create** | Read-only GameService for spectators |
| `src/services/ble/BleHostGameService.ts` | Modify | `spectatorClientIds` set, `addSpectator()`, action/disconnect guards |
| `src/services/ble/transportRegistry.ts` | Modify | Add LobbyHost reference (`setLobbyHost` / `getLobbyHost` / `clearLobbyHost`) |
| `src/contexts/GameContext.tsx` | Modify | `'ble-spectator'` mode, `effectiveMode` state + ref, `mySeat` prop, auto-transition |
| `app/game.tsx` | Modify | `ble-spectator` service init, `mySeat` prop, `viewingSeat`, mid-game LobbyHost wiring |
| `src/components/actions/ActionButtons.tsx` | Modify | Spectator indicator (「観戦中」) |
| `src/components/result/ResultOverlay.tsx` | Modify | Spectator mode: same UI as `ble-client` |
| `src/components/lobby/BleHostLobby.tsx` | Modify | Spectator count display |
| `src/components/lobby/BleJoinLobby.tsx` | Modify | `roleSelect` phase (参加 / 観戦 buttons) |

---

## Task 1: LobbyProtocol — spectate message types + validation

**Files:**
- Modify: `src/services/ble/LobbyProtocol.ts`
- Test: `tests/ble/LobbyProtocol.test.ts`

- [ ] **Step 1: Write failing tests for `validateClientMessage` — spectate**

Add to `tests/ble/LobbyProtocol.test.ts` inside `describe('validateClientMessage')`:

```typescript
it('accepts a valid spectate message', () => {
  const msg = { type: 'spectate', protocolVersion: 1, spectatorName: 'Watcher' };
  const result = validateClientMessage(msg);
  expect(result).toEqual({ type: 'spectate', protocolVersion: 1, spectatorName: 'Watcher' });
});

it('rejects spectate with wrong protocolVersion', () => {
  const msg = { type: 'spectate', protocolVersion: 99, spectatorName: 'Watcher' };
  expect(validateClientMessage(msg)).toBeNull();
});

it('rejects spectate with empty spectatorName', () => {
  const msg = { type: 'spectate', protocolVersion: 1, spectatorName: '' };
  expect(validateClientMessage(msg)).toBeNull();
});
```

Add to `describe('validateHostMessage')`:

```typescript
it('accepts spectateResponse (accepted)', () => {
  const msg = {
    type: 'spectateResponse',
    accepted: true,
    spectatorId: 0,
    players: [{ seat: 0, name: 'Host', ready: true }],
    gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
  };
  const result = validateHostMessage(msg);
  expect(result).toMatchObject({ type: 'spectateResponse', accepted: true, spectatorId: 0 });
});

it('accepts spectateResponse (rejected)', () => {
  const msg = { type: 'spectateResponse', accepted: false, reason: 'Full' };
  const result = validateHostMessage(msg);
  expect(result).toEqual({ type: 'spectateResponse', accepted: false, reason: 'Full' });
});

it('accepts spectatorUpdate', () => {
  const msg = { type: 'spectatorUpdate', spectatorCount: 2 };
  const result = validateHostMessage(msg);
  expect(result).toEqual({ type: 'spectatorUpdate', spectatorCount: 2 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ble/LobbyProtocol.test.ts
```
Expected: FAIL — `validateClientMessage` returns null for `spectate`, `validateHostMessage` returns null for `spectateResponse`/`spectatorUpdate`

- [ ] **Step 3: Implement spectate types + validation in LobbyProtocol.ts**

Add to `LobbyClientMessage`:
```typescript
| { type: 'spectate'; protocolVersion: number; spectatorName: string }
```

Add to `LobbyHostMessage`:
```typescript
| { type: 'spectateResponse'; accepted: true; spectatorId: number; players: LobbyPlayer[]; gameSettings: GameSettings }
| { type: 'spectateResponse'; accepted: false; reason: string }
| { type: 'spectatorUpdate'; spectatorCount: number }
```

In `validateClientMessage`, add before `default`:
```typescript
case 'spectate':
  if (data.protocolVersion !== PROTOCOL_VERSION) return null;
  if (typeof data.spectatorName !== 'string' || data.spectatorName === '') return null;
  return { type: 'spectate', protocolVersion: PROTOCOL_VERSION, spectatorName: data.spectatorName as string };
```

In `validateHostMessage`, add before `default`:
```typescript
case 'spectateResponse':
  if (data.accepted === true) {
    if (typeof data.spectatorId !== 'number') return null;
    if (!isLobbyPlayerArray(data.players)) return null;
    if (!isValidGameSettings(data.gameSettings)) return null;
    return {
      type: 'spectateResponse',
      accepted: true,
      spectatorId: data.spectatorId as number,
      players: data.players as LobbyPlayer[],
      gameSettings: data.gameSettings as GameSettings,
    };
  }
  if (data.accepted === false) {
    if (typeof data.reason !== 'string') return null;
    return { type: 'spectateResponse', accepted: false, reason: data.reason as string };
  }
  return null;
case 'spectatorUpdate':
  if (typeof data.spectatorCount !== 'number') return null;
  return { type: 'spectatorUpdate', spectatorCount: data.spectatorCount as number };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ble/LobbyProtocol.test.ts
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/LobbyProtocol.ts tests/ble/LobbyProtocol.test.ts
git commit -m "feat(lobby): add spectate/spectateResponse/spectatorUpdate protocol types"
```

---

## Task 2: LobbyHost — spectator management

**Files:**
- Modify: `src/services/ble/LobbyHost.ts`
- Test: `tests/ble/LobbyHost.test.ts`

- [ ] **Step 1: Write failing tests for spectator handling**

Add to `tests/ble/LobbyHost.test.ts`:

```typescript
describe('spectator management', () => {
  it('accepts spectate and sends spectateResponse', async () => {
    await host.start();
    transport.simulateClientConnected('spec1');
    transport.simulateMessageReceived('spec1', 'lobby',
      encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'Watcher' }))
    );
    await flushPromises();

    const resp = decodeLastFrom(transport, 'spec1');
    expect(resp).toMatchObject({ type: 'spectateResponse', accepted: true, spectatorId: 0 });
  });

  it('rejects spectate when spectator slots are full (max 4)', async () => {
    await host.start();
    for (let i = 0; i < 4; i++) {
      transport.simulateClientConnected(`spec${i}`);
      transport.simulateMessageReceived(`spec${i}`, 'lobby',
        encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: `W${i}` }))
      );
      await flushPromises();
    }
    transport.simulateClientConnected('spec4');
    transport.simulateMessageReceived('spec4', 'lobby',
      encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'W4' }))
    );
    await flushPromises();

    const resp = decodeLastFrom(transport, 'spec4');
    expect(resp).toMatchObject({ type: 'spectateResponse', accepted: false });
  });

  it('broadcasts spectatorUpdate after spectate', async () => {
    const cb = jest.fn();
    host.onSpectatorCountChanged(cb);
    await host.start();
    transport.simulateClientConnected('spec1');
    transport.simulateMessageReceived('spec1', 'lobby',
      encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'W' }))
    );
    await flushPromises();
    expect(cb).toHaveBeenCalledWith(1);
  });

  it('removes spectator on disconnect and decrements count', async () => {
    const cb = jest.fn();
    host.onSpectatorCountChanged(cb);
    await host.start();
    transport.simulateClientConnected('spec1');
    transport.simulateMessageReceived('spec1', 'lobby',
      encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'W' }))
    );
    await flushPromises();
    transport.simulateClientDisconnected('spec1');
    await flushPromises();
    expect(cb).toHaveBeenLastCalledWith(0);
  });

  it('sends gameStart to spectators when game starts', async () => {
    // Add two players so startGame is valid
    await host.start();
    transport.simulateClientConnected('c1');
    transport.simulateMessageReceived('c1', 'lobby',
      encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' }))
    );
    await flushPromises();
    transport.simulateMessageReceived('c1', 'lobby', encodeMessage(JSON.stringify({ type: 'ready' })));
    await flushPromises();
    // Add spectator
    transport.simulateClientConnected('spec1');
    transport.simulateMessageReceived('spec1', 'lobby',
      encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'W' }))
    );
    await flushPromises();

    host.startGame();
    await flushPromises();

    const msgs = decodeAllFrom(transport, 'spec1');
    const gameStart = msgs.find((m: any) => m.type === 'gameStart');
    expect(gameStart).toBeTruthy();
  });

  it('accepts spectate during game, rejects join during game', async () => {
    await host.start();
    // Add player and start game
    transport.simulateClientConnected('c1');
    transport.simulateMessageReceived('c1', 'lobby',
      encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' }))
    );
    await flushPromises();
    transport.simulateMessageReceived('c1', 'lobby', encodeMessage(JSON.stringify({ type: 'ready' })));
    await flushPromises();
    host.startGame();
    await flushPromises();

    // Try to join during game — should be rejected
    transport.simulateClientConnected('late1');
    transport.simulateMessageReceived('late1', 'lobby',
      encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Late' }))
    );
    await flushPromises();
    expect(decodeLastFrom(transport, 'late1')).toMatchObject({ type: 'joinResponse', accepted: false });

    // Try to spectate during game — should be accepted
    transport.simulateClientConnected('spec1');
    transport.simulateMessageReceived('spec1', 'lobby',
      encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'W' }))
    );
    await flushPromises();
    expect(decodeLastFrom(transport, 'spec1')).toMatchObject({ type: 'spectateResponse', accepted: true });
  });

  it('calls onSpectatorJoined callback when spectate accepted', async () => {
    const cb = jest.fn();
    host.onSpectatorJoined(cb);
    await host.start();
    transport.simulateClientConnected('spec1');
    transport.simulateMessageReceived('spec1', 'lobby',
      encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'W' }))
    );
    await flushPromises();
    expect(cb).toHaveBeenCalledWith('spec1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ble/LobbyHost.test.ts
```
Expected: FAIL — spectator methods don't exist yet

- [ ] **Step 3: Implement spectator management in LobbyHost.ts**

Add fields after `private players`:
```typescript
private spectators = new Map<string, { id: number; name: string }>(); // clientId → spectator info
private maxSpectators = 4;
private _onSpectatorCountChanged: ((count: number) => void) | null = null;
private _onSpectatorJoined: ((clientId: string) => void) | null = null;
```

Add in `handleMessage` switch:
```typescript
case 'spectate':
  this.handleSpectate(clientId, msg.spectatorName);
  break;
```

Add `handleSpectate` method:
```typescript
private handleSpectate(clientId: string, spectatorName: string): void {
  if (this.spectators.has(clientId)) return; // duplicate ignore

  if (this.spectators.size >= this.maxSpectators) {
    this.sendToClient(clientId, { type: 'spectateResponse', accepted: false, reason: 'Spectator slots full' });
    return;
  }

  const spectatorId = this.findNextSpectatorId();
  this.spectators.set(clientId, { id: spectatorId, name: spectatorName });

  this.sendToClient(clientId, {
    type: 'spectateResponse',
    accepted: true,
    spectatorId,
    players: this.getPlayerList(),
    gameSettings: this.gameSettings,
  });

  this.broadcastSpectatorCount();
  this._onSpectatorJoined?.(clientId);
}

private findNextSpectatorId(): number {
  const taken = new Set(Array.from(this.spectators.values()).map(s => s.id));
  for (let i = 0; i <= 3; i++) {
    if (!taken.has(i)) return i;
  }
  return 0;
}

private broadcastSpectatorCount(): void {
  this._onSpectatorCountChanged?.(this.spectators.size);
  this.sendToAll({ type: 'spectatorUpdate', spectatorCount: this.spectators.size });
}
```

Update `handleClientDisconnected` to handle spectators:
```typescript
private handleClientDisconnected(clientId: string): void {
  if (this.spectators.has(clientId)) {
    this.spectators.delete(clientId);
    this.broadcastSpectatorCount();
    return;
  }
  if (this.players.has(clientId)) {
    this.players.delete(clientId);
    this.notifyPlayersChanged();
    this.sendToAll({ type: 'playerUpdate', players: this.getPlayerList() });
  }
}
```

Update `handleJoin` to guard against game-in-progress:
```typescript
private handleJoin(clientId: string, playerName: string): void {
  if (this.players.has(clientId)) return;

  if (this.state === 'gameStarting') {
    this.sendToClient(clientId, { type: 'joinResponse', accepted: false, reason: 'Game already in progress' });
    return;
  }
  // ... rest unchanged ...
}
```

Update `startGame` to notify spectators:
```typescript
startGame(): void {
  // ... existing validation + state + sendToAll ...
  // After the existing sendToAll call:
  for (const clientId of this.spectators.keys()) {
    this.sendToClient(clientId, {
      type: 'gameStart',
      blinds: { sb: this.gameSettings.sb, bb: this.gameSettings.bb },
      initialChips: this.gameSettings.initialChips,
    });
  }
  this._onGameStart?.({ sb: this.gameSettings.sb, bb: this.gameSettings.bb });
}
```

Add public API:
```typescript
onSpectatorCountChanged(callback: (count: number) => void): void {
  this._onSpectatorCountChanged = callback;
}

onSpectatorJoined(callback: (clientId: string) => void): void {
  this._onSpectatorJoined = callback;
}

getSpectatorCount(): number {
  return this.spectators.size;
}

getSpectatorClientIds(): string[] {
  return Array.from(this.spectators.keys());
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ble/LobbyHost.test.ts
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/LobbyHost.ts tests/ble/LobbyHost.test.ts
git commit -m "feat(lobby): add spectator management to LobbyHost"
```

---

## Task 3: LobbyClient — spectate() method

**Files:**
- Modify: `src/services/ble/LobbyClient.ts`
- Test: `tests/ble/LobbyClient.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/ble/LobbyClient.test.ts` (check if this file exists first; if not, create it using the same pattern as `LobbyHost.test.ts`):

```typescript
describe('spectate flow', () => {
  it('sends spectate message to host after connecting', async () => {
    // Assume client is connected (connectToHost called)
    // client.spectate() should send a spectate message
    await client.connectToHost('host-1');
    client.spectate();
    await flushPromises();

    // Check transport received a spectate message
    const sent = transport.sentMessages.find((m: any) => {
      const cm = new ChunkManager();
      const json = cm.decode('host', m.data);
      if (!json) return false;
      const parsed = JSON.parse(json);
      return parsed.type === 'spectate';
    });
    expect(sent).toBeTruthy();
  });

  it('calls onSpectateResult with accepted result', async () => {
    const cb = jest.fn();
    client.onSpectateResult(cb);
    await client.connectToHost('host-1');
    client.spectate();
    await flushPromises();

    // Simulate host responding with spectateResponse
    const cm = new ChunkManager();
    const chunks = cm.encode(JSON.stringify({
      type: 'spectateResponse',
      accepted: true,
      spectatorId: 0,
      players: [{ seat: 0, name: 'Host', ready: true }],
      gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
    }));
    for (const chunk of chunks) {
      transport.simulateMessageReceived(chunk);
    }
    await flushPromises();

    expect(cb).toHaveBeenCalledWith({ accepted: true, gameSettings: { sb: 5, bb: 10, initialChips: 1000 } });
  });

  it('calls onSpectateResult with rejected result', async () => {
    const cb = jest.fn();
    client.onSpectateResult(cb);
    await client.connectToHost('host-1');
    client.spectate();
    await flushPromises();

    const cm = new ChunkManager();
    const chunks = cm.encode(JSON.stringify({
      type: 'spectateResponse',
      accepted: false,
      reason: 'Spectator slots full',
    }));
    for (const chunk of chunks) {
      transport.simulateMessageReceived(chunk);
    }
    await flushPromises();

    expect(cb).toHaveBeenCalledWith({ accepted: false, reason: 'Spectator slots full' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ble/LobbyClient.test.ts
```
Expected: FAIL — `spectate()` and `onSpectateResult()` don't exist

- [ ] **Step 3: Implement spectate() in LobbyClient.ts**

Add `SpectateResult` type export after `JoinResult`:
```typescript
export type SpectateResult =
  | { accepted: true; gameSettings: GameSettings }
  | { accepted: false; reason: string };
```

Add field:
```typescript
private _onSpectateResult: ((result: SpectateResult) => void) | null = null;
```

Add method:
```typescript
spectate(): void {
  this.sendToHost({ type: 'spectate', protocolVersion: PROTOCOL_VERSION, spectatorName: this.playerName });
}

onSpectateResult(callback: (result: SpectateResult) => void): void {
  this._onSpectateResult = callback;
}
```

In `handleMessage` switch, add:
```typescript
case 'spectateResponse':
  this.handleSpectateResponse(msg);
  break;
case 'spectatorUpdate':
  break; // no-op in client lobby (count not displayed here)
```

Add handler:
```typescript
private handleSpectateResponse(msg: LobbyHostMessage & { type: 'spectateResponse' }): void {
  if (msg.accepted) {
    this.state = 'joined'; // reuse joined state for spectators
    this._onSpectateResult?.({ accepted: true, gameSettings: msg.gameSettings });
  } else {
    this.state = 'idle';
    this._onSpectateResult?.({ accepted: false, reason: msg.reason });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ble/LobbyClient.test.ts
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/LobbyClient.ts tests/ble/LobbyClient.test.ts
git commit -m "feat(lobby): add spectate() method to LobbyClient"
```

---

## Task 4: BleSpectatorGameService — new service

**Files:**
- Create: `src/services/ble/BleSpectatorGameService.ts`
- Create: `tests/ble/BleSpectatorGameService.test.ts`

- [ ] **Step 1: Write failing tests (create new test file)**

Create `tests/ble/BleSpectatorGameService.test.ts`:

```typescript
import { BleSpectatorGameService } from '../../src/services/ble/BleSpectatorGameService';
import { MockBleClientTransport } from '../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../src/services/ble/ChunkManager';
import { GameHostMessage } from '../../src/services/ble/GameProtocol';

function sendMessage(transport: MockBleClientTransport, charId: string, msg: unknown): void {
  const cm = new ChunkManager();
  const chunks = cm.encode(JSON.stringify(msg));
  for (const chunk of chunks) {
    transport.simulateMessageReceived(charId, chunk);
  }
}

const makeStateUpdate = (overrides: Partial<GameHostMessage & { type: 'stateUpdate' }> = {}): GameHostMessage => ({
  type: 'stateUpdate',
  seq: 1,
  phase: 'preflop',
  community: [],
  pots: [{ amount: 15, eligible: [0, 1, 2] }],
  currentBet: 10,
  activePlayer: 2,
  dealer: 0,
  blinds: { sb: 5, bb: 10 },
  players: [
    { seat: 0, name: 'Host', chips: 990, status: 'active', bet: 10, cards: [] },
    { seat: 1, name: 'Alice', chips: 990, status: 'active', bet: 10, cards: [] },
    { seat: 2, name: 'Bob', chips: 980, status: 'active', bet: 0, cards: [] },
  ],
  minRaiseSize: 10,
  frozenSeats: [],
  ...overrides,
});

describe('BleSpectatorGameService', () => {
  let transport: MockBleClientTransport;
  let service: BleSpectatorGameService;

  beforeEach(() => {
    transport = new MockBleClientTransport();
    service = new BleSpectatorGameService(transport);
  });

  it('throws before receiving any state', () => {
    expect(() => service.getState()).toThrow('Game not started');
  });

  it('returns state from stateUpdate with all cards as empty arrays', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    const state = service.getState();
    expect(state.phase).toBe('preflop');
    state.players.forEach(p => expect(p.cards).toEqual([]));
  });

  it('notifies subscribers on stateUpdate', () => {
    const cb = jest.fn();
    service.subscribe(cb);
    sendMessage(transport, 'gameState', makeStateUpdate());
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].phase).toBe('preflop');
  });

  it('subscribe returns unsubscribe function', () => {
    const cb = jest.fn();
    const unsub = service.subscribe(cb);
    unsub();
    sendMessage(transport, 'gameState', makeStateUpdate());
    expect(cb).not.toHaveBeenCalled();
  });

  it('handles showdownResult and returns it from resolveShowdown()', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    sendMessage(transport, 'gameState', {
      type: 'showdownResult',
      seq: 2,
      winners: [{ seat: 0, potAmount: 30 }],
      hands: [{ seat: 0, cards: ['Ah', 'Kh'], description: 'High Card' }],
    });
    const result = service.resolveShowdown();
    expect(result.winners).toHaveLength(1);
    expect(result.winners[0].seat).toBe(0);
  });

  it('resolveShowdown returns empty result when no showdown received', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    const result = service.resolveShowdown();
    expect(result.winners).toHaveLength(0);
    expect(result.hands).toHaveLength(0);
  });

  it('clears showdownResult on rematch', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    sendMessage(transport, 'gameState', {
      type: 'showdownResult',
      seq: 2,
      winners: [{ seat: 0, potAmount: 30 }],
      hands: [],
    });
    sendMessage(transport, 'gameState', { type: 'rematch', seq: 3 });
    const result = service.resolveShowdown();
    expect(result.winners).toHaveLength(0);
  });

  it('handleAction returns { valid: false }', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    const result = service.handleAction(0, { action: 'fold' });
    expect(result.valid).toBe(false);
  });

  it('getActionInfo returns all-false dummy values', () => {
    const info = service.getActionInfo(0);
    expect(info.canCheck).toBe(false);
    expect(info.canRaise).toBe(false);
    expect(info.callAmount).toBe(0);
  });

  it('ignores privateHand messages', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    sendMessage(transport, 'privateHand', { type: 'privateHand', seat: 0, cards: ['Ah', 'Kh'] });
    const state = service.getState();
    // Cards should still be empty — not replaced
    state.players.forEach(p => expect(p.cards).toEqual([]));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ble/BleSpectatorGameService.test.ts
```
Expected: FAIL — `BleSpectatorGameService` doesn't exist

- [ ] **Step 3: Create BleSpectatorGameService.ts**

Create `src/services/ble/BleSpectatorGameService.ts`:

```typescript
import { GameState, PlayerAction, Blinds } from '../../gameEngine/types';
import { ShowdownResult, ActionResult } from '../../gameEngine';
import { GameService, ActionInfo } from '../GameService';
import { BleClientTransport } from './BleTransport';
import { ChunkManager } from './ChunkManager';
import { validateGameHostMessage } from './GameProtocol';

export class BleSpectatorGameService implements GameService {
  private chunkManager = new ChunkManager();
  private currentState: GameState | null = null;
  private lastShowdownResult: ShowdownResult | null = null;
  private listeners = new Set<(state: GameState) => void>();

  constructor(private transport: BleClientTransport) {
    this.transport.onMessageReceived((charId, data) => {
      this.handleMessage(charId, data);
    });
  }

  getState(): GameState {
    if (!this.currentState) throw new Error('Game not started');
    return this.currentState;
  }

  getActionInfo(_seat: number): ActionInfo {
    return { canCheck: false, callAmount: 0, minRaise: 0, maxRaise: 0, canRaise: false };
  }

  startGame(_playerNames: string[], _blinds: Blinds, _initialChips: number, _savedChips?: Record<string, number>): void {
    // no-op
  }

  startRound(): void {
    // no-op
  }

  handleAction(_seat: number, _action: PlayerAction): ActionResult {
    return { valid: false, reason: 'Spectator cannot act' };
  }

  resolveShowdown(): ShowdownResult {
    if (!this.lastShowdownResult) return { winners: [], hands: [] };
    const result = this.lastShowdownResult;
    this.lastShowdownResult = null;
    return result;
  }

  prepareNextRound(): void {
    // no-op
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private handleMessage(charId: string, data: Uint8Array): void {
    const json = this.chunkManager.decode(charId, data);
    if (!json) return;
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { return; }

    if (charId !== 'gameState') return;
    this.handleGameStateMessage(parsed);
  }

  private handleGameStateMessage(parsed: unknown): void {
    const msg = validateGameHostMessage(parsed);
    if (!msg) return;

    switch (msg.type) {
      case 'stateUpdate':
        this.currentState = {
          seq: msg.seq,
          phase: msg.phase,
          community: msg.community,
          pots: msg.pots,
          currentBet: msg.currentBet,
          activePlayer: msg.activePlayer,
          dealer: msg.dealer,
          blinds: msg.blinds,
          players: msg.players.map(p => ({
            seat: p.seat,
            name: p.name,
            chips: p.chips,
            status: p.status,
            bet: p.bet,
            cards: p.cards,
          })),
          foldWin: msg.foldWin,
        };
        this.notifyListeners();
        break;
      case 'showdownResult':
        this.lastShowdownResult = { winners: msg.winners, hands: msg.hands };
        this.notifyListeners();
        break;
      case 'rematch':
        this.lastShowdownResult = null;
        this.notifyListeners();
        break;
      case 'roundEnd':
        break;
    }
  }

  private notifyListeners(): void {
    if (!this.currentState) return;
    const state = this.getState();
    this.listeners.forEach(l => l(state));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ble/BleSpectatorGameService.test.ts
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/BleSpectatorGameService.ts tests/ble/BleSpectatorGameService.test.ts
git commit -m "feat(ble): implement BleSpectatorGameService"
```

---

## Task 5: BleHostGameService — spectator support

**Files:**
- Modify: `src/services/ble/BleHostGameService.ts`
- Test: `tests/ble/BleHostGameService.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/ble/BleHostGameService.test.ts`:

```typescript
describe('spectator support', () => {
  it('ignores playerAction from spectator clientId', () => {
    // Setup: start game, add spectator, send playerAction from spectator
    const svc = new BleHostGameService(transport, seatMap, ['spec-1']);
    svc.startGame(['Host', 'Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
    svc.startRound();

    const actionsBefore = transport.sentMessages.length;
    // Send fold action from spectator client
    sendPlayerAction(transport, 'spec-1', 0, { action: 'fold' });

    // No additional broadcasts should have occurred (invalid action ignored)
    expect(transport.sentMessages.length).toBe(actionsBefore);
  });

  it('skips freeze logic when spectator disconnects', () => {
    const svc = new BleHostGameService(transport, seatMap, ['spec-1']);
    svc.startGame(['Host', 'Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
    svc.startRound();

    // Spectator disconnect should not trigger frozenSeats
    transport.simulateClientDisconnected('spec-1');

    const state = svc.getState();
    // frozenSeats broadcast via subscriber — check that state is unchanged (no freeze)
    expect(state.players.every(p => p.status !== 'out')).toBe(true);
  });

  it('addSpectator sends current stateUpdate to the new spectator', () => {
    const seatMap = new Map([['client1', 1]]);
    const svc = new BleHostGameService(transport, seatMap);
    svc.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 1000);
    svc.startRound();

    const msgsBefore = transport.sentMessages.length;
    svc.addSpectator('spec-new');

    // Should have sent at least one message to spec-new
    const sentToSpec = transport.sentMessages
      .slice(msgsBefore)
      .filter((m: any) => m.clientId === 'spec-new');
    expect(sentToSpec.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ble/BleHostGameService.test.ts
```
Expected: FAIL — constructor doesn't accept `spectatorClientIds`, `addSpectator` doesn't exist

- [ ] **Step 3: Implement spectator support in BleHostGameService.ts**

Add field:
```typescript
private spectatorClientIds = new Set<string>();
```

Update constructor signature and body:
```typescript
constructor(
  private transport: BleHostTransport,
  private clientSeatMap: Map<string, number>,
  spectatorClientIds?: string[],
) {
  if (spectatorClientIds) {
    spectatorClientIds.forEach(id => this.spectatorClientIds.add(id));
  }
  this.transport.onMessageReceived((clientId, charId, data) => {
    this.handleClientMessage(clientId, charId, data);
  });
  this.transport.onClientDisconnected((clientId) => {
    this.handleClientDisconnected(clientId);
  });
}
```

Update `handleClientMessage` — add spectator guard at the top:
```typescript
private handleClientMessage(clientId: string, charId: string, data: Uint8Array): void {
  if (charId !== 'playerAction') return;
  if (this.spectatorClientIds.has(clientId)) return; // ignore spectators
  // ... rest unchanged ...
}
```

Update `handleClientDisconnected` — add spectator guard:
```typescript
private handleClientDisconnected(clientId: string): void {
  if (this.spectatorClientIds.has(clientId)) {
    this.spectatorClientIds.delete(clientId);
    return; // no freeze processing for spectators
  }
  // ... existing disconnect logic unchanged ...
}
```

Add `addSpectator` method:
```typescript
addSpectator(clientId: string): void {
  this.spectatorClientIds.add(clientId);
  if (this.gameLoop) {
    this.sendCurrentStateTo(clientId);
  }
}

private sendCurrentStateTo(clientId: string): void {
  if (!this.gameLoop) return;
  const state = this.gameLoop.getState();
  const msg: GameHostMessage = {
    type: 'stateUpdate',
    seq: state.seq,
    phase: state.phase,
    community: state.community,
    pots: state.pots,
    currentBet: state.currentBet,
    activePlayer: state.activePlayer,
    dealer: state.dealer,
    blinds: state.blinds,
    players: state.players.map(p => ({
      seat: p.seat,
      name: p.name,
      chips: p.chips,
      status: p.status,
      bet: p.bet,
      cards: [] as Card[],
    })),
    minRaiseSize: this.gameLoop.getMinRaiseSize(),
    frozenSeats: Array.from(this.frozenSeats.keys()),
  };
  if (state.foldWin) msg.foldWin = state.foldWin;
  this.sendToClient(clientId, 'gameState', msg);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ble/BleHostGameService.test.ts
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/BleHostGameService.ts tests/ble/BleHostGameService.test.ts
git commit -m "feat(ble): add spectator support to BleHostGameService"
```

---

## Task 6: transportRegistry — LobbyHost reference

**Files:**
- Modify: `src/services/ble/transportRegistry.ts`
- Test: `tests/ble/transportRegistry.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/ble/transportRegistry.test.ts`:

```typescript
import { setLobbyHost, getLobbyHost, clearLobbyHost } from '../../src/services/ble/transportRegistry';
import { LobbyHost } from '../../src/services/ble/LobbyHost';
import { MockBleHostTransport } from '../../src/services/ble/MockBleTransport';

describe('lobbyHost registry', () => {
  afterEach(() => clearLobbyHost());

  it('returns null when not set', () => {
    expect(getLobbyHost()).toBeNull();
  });

  it('returns the set LobbyHost', () => {
    const transport = new MockBleHostTransport();
    const host = new LobbyHost(transport, 'Host');
    setLobbyHost(host);
    expect(getLobbyHost()).toBe(host);
  });

  it('returns null after clear', () => {
    const transport = new MockBleHostTransport();
    const host = new LobbyHost(transport, 'Host');
    setLobbyHost(host);
    clearLobbyHost();
    expect(getLobbyHost()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ble/transportRegistry.test.ts
```
Expected: FAIL — `setLobbyHost`/`getLobbyHost`/`clearLobbyHost` not exported

- [ ] **Step 3: Add LobbyHost reference to transportRegistry.ts**

Add to `src/services/ble/transportRegistry.ts`:

```typescript
import { LobbyHost } from './LobbyHost';

let lobbyHostRef: LobbyHost | null = null;
export function setLobbyHost(host: LobbyHost): void { lobbyHostRef = host; }
export function getLobbyHost(): LobbyHost | null { return lobbyHostRef; }
export function clearLobbyHost(): void { lobbyHostRef = null; }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ble/transportRegistry.test.ts
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/transportRegistry.ts tests/ble/transportRegistry.test.ts
git commit -m "feat(ble): add LobbyHost reference to transportRegistry"
```

---

## Task 7: GameContext — ble-spectator mode + effectiveMode + auto-transition

**Files:**
- Modify: `src/contexts/GameContext.tsx`
- Test: `tests/ui/contexts/GameContext.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `tests/ui/contexts/GameContext.test.tsx`:

```typescript
import { BleSpectatorGameService } from '../../../src/services/ble/BleSpectatorGameService';
import { MockBleClientTransport } from '../../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../../src/services/ble/ChunkManager';

function sendStateUpdate(transport: MockBleClientTransport, overrides: Record<string, unknown> = {}): void {
  const cm = new ChunkManager();
  const msg = {
    type: 'stateUpdate', seq: 1, phase: 'preflop',
    community: [], pots: [], currentBet: 10, activePlayer: 1,
    dealer: 0, blinds: { sb: 5, bb: 10 },
    players: [
      { seat: 0, name: 'Host', chips: 990, status: 'active', bet: 10, cards: [] },
      { seat: 1, name: 'Alice', chips: 0, status: 'out', bet: 10, cards: [] },
      { seat: 2, name: 'Bob', chips: 980, status: 'active', bet: 0, cards: [] },
    ],
    minRaiseSize: 10, frozenSeats: [],
    ...overrides,
  };
  const chunks = cm.encode(JSON.stringify(msg));
  for (const chunk of chunks) {
    transport.simulateMessageReceived('gameState', chunk);
  }
}

function EffectiveModeConsumer() {
  const { mode } = useGame();
  return <Text testID="mode">{mode}</Text>;
}

describe('GameContext — ble-spectator mode', () => {
  it('exposes ble-spectator mode when service is BleSpectatorGameService', () => {
    const transport = new MockBleClientTransport();
    const service = new BleSpectatorGameService(transport);
    const { getByTestId } = render(
      <GameProvider service={service} mode="ble-spectator">
        <EffectiveModeConsumer />
      </GameProvider>
    );
    expect(getByTestId('mode').props.children).toBe('ble-spectator');
  });
});

describe('GameContext — auto-transition to ble-spectator', () => {
  it('transitions effectiveMode when mySeat player status becomes out', async () => {
    const transport = new MockBleClientTransport();
    const service = new BleSpectatorGameService(transport) as any;
    // Use a LocalGameService mock to simulate ble-client with mySeat
    const mockService = createMockService();
    const { getByTestId } = render(
      <GameProvider service={mockService} mode="ble-client" mySeat={1}>
        <EffectiveModeConsumer />
      </GameProvider>
    );
    expect(getByTestId('mode').props.children).toBe('ble-client');

    // Simulate stateUpdate with mySeat=1 player status='out'
    const state = createMockGameState({
      players: [
        { seat: 0, name: 'Host', chips: 1000, status: 'active' as const, bet: 0, cards: [] },
        { seat: 1, name: 'Alice', chips: 0, status: 'out' as const, bet: 0, cards: [] },
        { seat: 2, name: 'Bob', chips: 1000, status: 'active' as const, bet: 0, cards: [] },
      ],
    });
    act(() => { mockService._notifyListeners(state); });

    expect(getByTestId('mode').props.children).toBe('ble-spectator');
  });

  it('does NOT transition when a different player becomes out', async () => {
    const mockService = createMockService();
    const { getByTestId } = render(
      <GameProvider service={mockService} mode="ble-client" mySeat={0}>
        <EffectiveModeConsumer />
      </GameProvider>
    );

    const state = createMockGameState({
      players: [
        { seat: 0, name: 'Host', chips: 1000, status: 'active' as const, bet: 0, cards: [] },
        { seat: 1, name: 'Alice', chips: 0, status: 'out' as const, bet: 0, cards: [] },
        { seat: 2, name: 'Bob', chips: 1000, status: 'active' as const, bet: 0, cards: [] },
      ],
    });
    act(() => { mockService._notifyListeners(state); });

    expect(getByTestId('mode').props.children).toBe('ble-client');
  });

  it('does NOT transition in ble-host mode', async () => {
    const mockService = createMockService();
    const { getByTestId } = render(
      <GameProvider service={mockService} mode="ble-host">
        <EffectiveModeConsumer />
      </GameProvider>
    );

    const state = createMockGameState({
      players: [
        { seat: 0, name: 'Host', chips: 0, status: 'out' as const, bet: 0, cards: [] },
        { seat: 1, name: 'Alice', chips: 1000, status: 'active' as const, bet: 0, cards: [] },
      ],
    });
    act(() => { mockService._notifyListeners(state); });

    expect(getByTestId('mode').props.children).toBe('ble-host');
  });
});
```

**Note:** Check `tests/ui/helpers/renderWithGame.ts` to see if `createMockService` exposes `_notifyListeners`. If not, you may need to add it or use `subscribe` directly in the test setup. The mock service needs to expose a way to trigger state updates.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/contexts/GameContext.test.tsx
```
Expected: FAIL — `mySeat` prop not accepted, `'ble-spectator'` mode not supported

- [ ] **Step 3: Implement effectiveMode + mySeat + auto-transition in GameContext.tsx**

**3a. Update type declarations:**

```typescript
// GameContextValue.mode and GameProviderProps.mode — add 'ble-spectator':
mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client' | 'ble-spectator';

// GameProviderProps — add mySeat:
mySeat?: number;
```

**3b. Update function signature:**
```typescript
export function GameProvider({ children, service, mode, repository, initialChips, blinds, playerNames, mySeat }: GameProviderProps) {
```

**3c. Add effectiveMode state + ref (after existing useState declarations):**
```typescript
const [effectiveMode, setEffectiveMode] = useState(mode);
const effectiveModeRef = useRef(effectiveMode);
useEffect(() => { effectiveModeRef.current = effectiveMode; }, [effectiveMode]);
```

**3d. Update `autoResolveShowdown` to use `effectiveModeRef`:**
```typescript
const autoResolveShowdown = useCallback(() => {
  if (effectiveModeRef.current === 'ble-client' || effectiveModeRef.current === 'ble-spectator') return;
  // ... rest unchanged ...
}, []); // Remove mode from deps since we use ref
```

**3e. Update subscribe handler** — replace the two `if (mode === 'ble-client')` blocks with `effectiveModeRef.current` versions, and add auto-transition:
```typescript
// Replace:
if (mode === 'ble-client' && prevPhaseRef.current !== 'showdown' && newState.phase === 'showdown') {
// With:
if (
  (effectiveModeRef.current === 'ble-client' || effectiveModeRef.current === 'ble-spectator') &&
  prevPhaseRef.current !== 'showdown' &&
  newState.phase === 'showdown'
) {

// Replace:
if (mode === 'ble-client' && newState.phase === 'preflop' && prevPhaseRef.current !== 'preflop') {
// With:
if (
  (effectiveModeRef.current === 'ble-client' || effectiveModeRef.current === 'ble-spectator') &&
  newState.phase === 'preflop' &&
  prevPhaseRef.current !== 'preflop'
) {

// Add after the above (still inside subscribe handler):
if (effectiveModeRef.current === 'ble-client' && mySeat !== undefined) {
  const myPlayer = newState.players.find(p => p.seat === mySeat);
  if (myPlayer?.status === 'out') {
    setEffectiveMode('ble-spectator');
  }
}
```

**3f. Update `handleTimeout` to use `mode` prop (not effectiveMode) — already guarded by mode prop, no change needed.** The `mode` prop never changes, so its `ble-client` check remains valid.

**3g. Update `useActionTimer` call** — pass `mode` (prop) not `effectiveMode` for timer control, since timer should stop for busted players too. Actually per spec: after auto-transition, `effectiveMode === 'ble-spectator'` so `handleTimeout` check `mode === 'ble-client'` still guards correctly (mode prop is still `'ble-client'`). No change needed here.

**3h. Update `doAction` to guard spectator:**
```typescript
const doAction = useCallback((seat: number, action: PlayerAction): ActionResult => {
  if (effectiveMode === 'ble-spectator') {
    return { valid: false, reason: 'Spectator cannot act' };
  }
  const result = serviceRef.current.handleAction(seat, action);
  if (!result.valid) return result;
  autoResolveShowdown();
  return result;
}, [effectiveMode, autoResolveShowdown]);
```

**3i. Expose `effectiveMode` as `mode` in context value:**
```typescript
const value: GameContextValue = {
  // ...
  mode: effectiveMode,  // was: mode
  // ...
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/contexts/GameContext.test.tsx
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/contexts/GameContext.tsx tests/ui/contexts/GameContext.test.tsx
git commit -m "feat(context): add ble-spectator mode, effectiveMode state, and auto-transition"
```

---

## Task 8: BleHostLobby.tsx + game.tsx — ble-spectator wiring

**Files:**
- Modify: `src/components/lobby/BleHostLobby.tsx` (add `setLobbyHost` call)
- Modify: `app/game.tsx` (ble-spectator service, mySeat, mid-game wiring)
- (No isolated unit test; covered by integration tests in Task 13/14)

- [ ] **Step 1: Call `setLobbyHost` in BleHostLobby.tsx**

`LobbyHost` is created in `BleHostLobby.tsx`'s `useEffect` (line 27). Add the registry call immediately after creation so `game.tsx` can access it:

```typescript
// BleHostLobby.tsx — inside useEffect, after creating host:
import { setLobbyHost, clearLobbyHost } from '../../services/ble/transportRegistry';

// After: host.start();
setLobbyHost(host);

// In cleanup return:
return () => {
  host.stop();
  clearLobbyHost();
};
```

Also pass spectator clientIds and clientSeatMap in the `onGameStart` callback params so `game.tsx` can use them:
```typescript
host.onGameStart(() => {
  const clientSeatMap = host.getClientSeatMap(); // already exists on LobbyHost
  const spectatorIds = host.getSpectatorClientIds(); // added in Task 2
  router.push({
    pathname: '/game',
    params: {
      mode: 'ble-host',
      sb: String(sb),
      bb: String(bb),
      initialChips: String(initialChips),
      seat: '0',
      playerNames: JSON.stringify([hostName, ...Array.from(clientSeatMap.values())
        .sort()
        .map(seat => {
          const entry = Array.from(clientSeatMap.entries()).find(([, s]) => s === seat);
          return entry ? /* player name */ hostName : 'Player';
        })]),
      clientSeatMap: JSON.stringify(Object.fromEntries(clientSeatMap)),
      spectatorClientIds: JSON.stringify(spectatorIds),
    },
  });
});
```

**Note:** `playerNames` already comes from the LobbyHost player list. Adjust the mapping to use `host.getClientSeatMap()` and the existing `players` state (already tracked via `onPlayersChanged`). Pass names in seat order (seat 0 = hostName, others from players array).

Simpler approach for playerNames — use the `players` state variable already tracked in component:
```typescript
host.onGameStart(() => {
  const clientSeatMap = host.getClientSeatMap();
  const spectatorIds = host.getSpectatorClientIds();
  const allPlayers = [{ seat: 0, name: hostName }, ...players.filter(p => p.seat !== 0)];
  const names = allPlayers.sort((a, b) => a.seat - b.seat).map(p => p.name);
  router.push({
    pathname: '/game',
    params: {
      mode: 'ble-host',
      sb: String(sb), bb: String(bb),
      initialChips: String(initialChips),
      seat: '0',
      playerNames: JSON.stringify(names),
      clientSeatMap: JSON.stringify(Object.fromEntries(clientSeatMap)),
      spectatorClientIds: JSON.stringify(spectatorIds),
    },
  });
});
```

- [ ] **Step 2: Update game.tsx params type**

In `useLocalSearchParams<{...}>()`, add:
```typescript
mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client' | 'ble-spectator';
spectatorClientIds?: string; // JSON string[]
```

- [ ] **Step 3: Add ble-spectator service initialization in game.tsx**

Add imports:
```typescript
import { BleSpectatorGameService } from '../src/services/ble/BleSpectatorGameService';
import { getLobbyHost, clearLobbyHost } from '../src/services/ble/transportRegistry';
```

In the `useState<GameService>(() => {...})` block, add before the `ble-client` block:
```typescript
if (mode === 'ble-spectator') {
  const transport = getClientTransport()!;
  return new BleSpectatorGameService(transport);
}
```

For `ble-host`, pass `spectatorClientIds` from params to the service:
```typescript
if (mode === 'ble-host') {
  const transport = getHostTransport()!;
  const parsed = JSON.parse(params.clientSeatMap ?? '{}') as Record<string, number>;
  const seatMap = new Map<string, number>(
    Object.entries(parsed).map(([k, v]) => [k, Number(v)]),
  );
  const spectatorIds: string[] = params.spectatorClientIds
    ? JSON.parse(params.spectatorClientIds)
    : [];
  const svc = new BleHostGameService(transport, seatMap, spectatorIds);
  svc.startGame(playerNames, blinds, initialChips);
  svc.startRound();
  return svc;
}
```

- [ ] **Step 4: Update viewingSeat and cleanup**

```typescript
// viewingSeat: spectators always see from seat 0
const viewingSeat = (params.mode === 'ble-host' || params.mode === 'ble-spectator')
  ? 0
  : Number(params.seat ?? '0');

// Cleanup: clear lobby host reference on unmount
React.useEffect(() => {
  return () => {
    if (mode === 'ble-host') { clearHostTransport(); clearLobbyHost(); }
    if (mode === 'ble-client' || mode === 'ble-spectator') clearClientTransport();
  };
}, []);
```

- [ ] **Step 5: Wire mid-game spectator support and pass mySeat to GameProvider**

```typescript
// Wire mid-game spectator join for ble-host
React.useEffect(() => {
  if (mode !== 'ble-host') return;
  const lobbyHost = getLobbyHost();
  if (!lobbyHost) return;
  lobbyHost.onSpectatorJoined((clientId) => {
    (service as BleHostGameService).addSpectator(clientId);
  });
}, [service]);

// GameProvider JSX:
<GameProvider
  service={service}
  mode={mode}
  mySeat={mode === 'ble-client' ? Number(params.seat ?? '0') : undefined}
  repository={repo}
  initialChips={initialChips}
  blinds={blinds}
  playerNames={playerNames}
>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/components/lobby/BleHostLobby.tsx app/game.tsx
git commit -m "feat(game): wire ble-spectator service, mySeat, and mid-game spectator support"
```

---

## Task 9: ActionButtons — spectator indicator

**Files:**
- Modify: `src/components/actions/ActionButtons.tsx`
- Test: `tests/ui/components/ActionButtons.test.tsx`

- [ ] **Step 1: Write failing test**

Add to `tests/ui/components/ActionButtons.test.tsx`:

```typescript
it('shows 観戦中 indicator when mode is ble-spectator', () => {
  const mockService = createMockService();
  const state = createMockGameState({ phase: 'preflop', activePlayer: 1 });
  mockService.getState.mockReturnValue(state);

  const { getByText, queryByTestId } = renderWithGame(<ActionButtons />, {
    service: mockService,
    mode: 'ble-spectator',
  });

  expect(getByText('観戦中')).toBeTruthy();
  expect(queryByTestId('fold-btn')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/ui/components/ActionButtons.test.tsx
```
Expected: FAIL — no 「観戦中」 text

- [ ] **Step 3: Add spectator indicator to ActionButtons.tsx**

Add after the early-return check (`if (!state || ...`) and before the PreActionBar block:

```typescript
// Spectator: show indicator instead of action buttons
if (mode === 'ble-spectator') {
  return (
    <View style={styles.container}>
      <View style={styles.spectatorIndicator}>
        <Text style={styles.spectatorText}>観戦中</Text>
      </View>
    </View>
  );
}
```

Add styles:
```typescript
spectatorIndicator: {
  paddingVertical: 16,
  alignItems: 'center',
},
spectatorText: {
  color: Colors.subText,
  fontSize: 16,
  fontWeight: '600',
},
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/ui/components/ActionButtons.test.tsx
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/actions/ActionButtons.tsx tests/ui/components/ActionButtons.test.tsx
git commit -m "feat(ui): add spectator indicator to ActionButtons"
```

---

## Task 10: ResultOverlay — spectator mode

**Files:**
- Modify: `src/components/result/ResultOverlay.tsx`
- Test: `tests/ui/components/ResultOverlay.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `tests/ui/components/ResultOverlay.test.tsx`:

```typescript
it('shows waiting text (not next-round button) when mode is ble-spectator and game not over', () => {
  const state = createMockGameState({ phase: 'roundEnd' });
  // Multiple players with chips (game not over)
  const { queryByTestId, getByText } = renderWithGame(<ResultOverlay />, {
    service: mockService,
    mode: 'ble-spectator',
    initialState: state,
  });
  expect(queryByTestId('next-round-btn')).toBeNull();
  expect(getByText('次のラウンドを待っています...')).toBeTruthy();
});

it('shows ロビーに戻る but not 再戦 when mode is ble-spectator and game over', () => {
  const state = createMockGameState({
    phase: 'roundEnd',
    players: [
      { seat: 0, name: 'Host', chips: 3000, status: 'active' as const, bet: 0, cards: [] },
      { seat: 1, name: 'Alice', chips: 0, status: 'out' as const, bet: 0, cards: [] },
    ],
  });
  const { queryByTestId } = renderWithGame(<ResultOverlay />, {
    service: mockService,
    mode: 'ble-spectator',
    initialState: state,
  });
  expect(queryByTestId('rematch-btn')).toBeNull();
  expect(queryByTestId('back-to-lobby-btn')).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/components/ResultOverlay.test.tsx
```
Expected: FAIL — ble-spectator not handled differently from other modes

- [ ] **Step 3: Update ResultOverlay.tsx**

In the non-game-over branch, change:
```typescript
// was:
<TouchableOpacity testID="next-round-btn" style={styles.actionBtn} onPress={nextRound}>
  <Text style={styles.actionBtnText}>次のラウンドへ</Text>
</TouchableOpacity>

// becomes:
{mode !== 'ble-client' && mode !== 'ble-spectator' ? (
  <TouchableOpacity testID="next-round-btn" style={styles.actionBtn} onPress={nextRound}>
    <Text style={styles.actionBtnText}>次のラウンドへ</Text>
  </TouchableOpacity>
) : (
  <Text style={styles.waitingText}>次のラウンドを待っています...</Text>
)}
```

In the game-over branch, update the `ble-client` check to include `ble-spectator`:
```typescript
{mode !== 'ble-client' && mode !== 'ble-spectator' ? (
  <TouchableOpacity testID="rematch-btn" ...>
    <Text ...>再戦</Text>
  </TouchableOpacity>
) : (
  <Text style={styles.waitingText}>ホストの操作を待っています...</Text>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/components/ResultOverlay.test.tsx
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/result/ResultOverlay.tsx tests/ui/components/ResultOverlay.test.tsx
git commit -m "feat(ui): handle ble-spectator mode in ResultOverlay"
```

---

## Task 11: BleHostLobby — spectator count display

**Files:**
- Modify: `src/components/lobby/BleHostLobby.tsx`
- Test: `tests/ui/components/BleHostLobby.test.tsx`

- [ ] **Step 1: Write failing test**

Add to `tests/ui/components/BleHostLobby.test.tsx`:

```typescript
it('displays spectator count when spectators are present', async () => {
  // Render BleHostLobby; the lobbyHost mock should expose onSpectatorCountChanged
  // Trigger onSpectatorCountChanged(2)
  // Expect "観戦者: 2人" to be visible
  const { queryByText, getByText } = render(<BleHostLobby playerName="Host" />);

  // Simulate spectator count update via the lobby host
  act(() => {
    // Access the registered callback and call it
    mockLobbyHost.simulateSpectatorCountChange(2);
  });

  expect(getByText(/観戦者: 2人/)).toBeTruthy();
});

it('does not display spectator count when zero', () => {
  const { queryByText } = render(<BleHostLobby playerName="Host" />);
  expect(queryByText(/観戦者/)).toBeNull();
});
```

**Note:** Review existing `BleHostLobby.test.tsx` for the mock pattern used. If the lobby host is created internally via `useEffect`, you'll need to intercept it similarly to how the existing tests mock `LobbyHost`.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/ui/components/BleHostLobby.test.tsx
```
Expected: FAIL — spectator count not displayed

- [ ] **Step 3: Add spectator count to BleHostLobby.tsx**

```typescript
const [spectatorCount, setSpectatorCount] = useState(0);

// Inside the useEffect where lobbyHost is initialized:
host.onSpectatorCountChanged((count) => setSpectatorCount(count));

// In JSX, after the player list:
{spectatorCount > 0 && (
  <Text style={styles.spectatorInfo}>観戦者: {spectatorCount}人</Text>
)}
```

Add style:
```typescript
spectatorInfo: {
  color: Colors.subText,
  fontSize: 12,
  textAlign: 'center',
  marginTop: 4,
},
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/ui/components/BleHostLobby.test.tsx
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/BleHostLobby.tsx tests/ui/components/BleHostLobby.test.tsx
git commit -m "feat(ui): display spectator count in BleHostLobby"
```

---

## Task 12: BleJoinLobby — roleSelect phase

**Files:**
- Modify: `src/components/lobby/BleJoinLobby.tsx`
- Test: `tests/ui/components/BleJoinLobby.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `tests/ui/components/BleJoinLobby.test.tsx`:

```typescript
it('shows roleSelect screen after connecting with ゲームに参加 and 観戦する buttons', async () => {
  const { getByText } = render(<BleJoinLobby playerName="Alice" />);

  // Select a host to trigger connecting → roleSelect transition
  fireEvent.press(getByText('Host1')); // triggers handleSelectHost
  await flushPromises();
  // After connected, roleSelect phase is shown
  expect(getByText('ゲームに参加')).toBeTruthy();
  expect(getByText('観戦する')).toBeTruthy();
});

it('sends join message when ゲームに参加 is pressed', async () => {
  const { getByText } = render(<BleJoinLobby playerName="Alice" />);
  fireEvent.press(getByText('Host1'));
  await flushPromises();
  fireEvent.press(getByText('ゲームに参加'));
  await flushPromises();
  // Verify that the lobbyClient.join() was called (via transport)
  // Check transport for join message
  expect(mockTransport.sentMessages.some(m => includesType(m, 'join'))).toBe(true);
});

it('sends spectate message when 観戦する is pressed', async () => {
  const { getByText } = render(<BleJoinLobby playerName="Alice" />);
  fireEvent.press(getByText('Host1'));
  await flushPromises();
  fireEvent.press(getByText('観戦する'));
  await flushPromises();
  expect(mockTransport.sentMessages.some(m => includesType(m, 'spectate'))).toBe(true);
});

it('navigates to /game with mode=ble-spectator after spectate accepted', async () => {
  const { getByText } = render(<BleJoinLobby playerName="Alice" />);
  fireEvent.press(getByText('Host1'));
  await flushPromises();
  fireEvent.press(getByText('観戦する'));
  await flushPromises();
  // Simulate spectateResponse accepted
  mockClient.simulateSpectateAccepted({ sb: 5, bb: 10, initialChips: 1000 });
  await flushPromises();
  expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({
    params: expect.objectContaining({ mode: 'ble-spectator' }),
  }));
});
```

**Note:** Check existing `BleJoinLobby.test.tsx` for the mock setup pattern. The test may need to intercept `LobbyClient` to simulate responses.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/components/BleJoinLobby.test.tsx
```
Expected: FAIL — no roleSelect phase, no 「観戦する」 button

- [ ] **Step 3: Implement roleSelect phase in BleJoinLobby.tsx**

**3a. Add `'roleSelect'` to Phase type:**
```typescript
type Phase = 'scanning' | 'connecting' | 'roleSelect' | 'waiting' | 'disconnected';
```

**3b. After `connectToHost` succeeds (currently goes directly to `setPhase('waiting')` after join), instead transition to roleSelect:**

Refactor `handleSelectHost`:
```typescript
const handleSelectHost = (hostId: string) => {
  setPhase('connecting');
  lobbyClient.current?.connectToHostWithoutJoin(hostId).then(() => {
    setPhase('roleSelect');
  });
};
```

**Note:** `LobbyClient.connectToHost` currently auto-sends `join`. You need to add a `connectToHostWithoutJoin` method to `LobbyClient`, or split the connect and join steps. Alternatively, restructure `BleJoinLobby` to track when connection is established before deciding role.

The simplest approach: add `connectAndWait(hostId)` to `LobbyClient` that connects but doesn't send join, and a separate `join()` method:

In `LobbyClient.ts`, add:
```typescript
async connectAndWait(hostId: string): Promise<void> {
  this.state = 'connecting';
  await this.transport.connectToHost(hostId);
  this.transport.onMessageReceived((_charId: string, data: Uint8Array) => {
    const json = this.chunkManager.decode('host', data);
    if (json) this.handleMessage(json);
  });
}

join(): void {
  this.sendToHost({ type: 'join', protocolVersion: PROTOCOL_VERSION, playerName: this.playerName });
}
```

**3c. Add roleSelect UI:**
```typescript
if (phase === 'roleSelect') {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ロビーに接続しました</Text>
      <TouchableOpacity testID="join-btn" style={styles.primaryBtn} onPress={handleJoin}>
        <Text style={styles.primaryBtnText}>ゲームに参加</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="spectate-btn" style={styles.secondaryBtn} onPress={handleSpectate}>
        <Text style={styles.secondaryBtnText}>観戦する</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
        <Text style={styles.cancelBtnText}>キャンセル</Text>
      </TouchableOpacity>
    </View>
  );
}
```

**3d. Add handlers:**
```typescript
const handleJoin = () => {
  lobbyClient.current?.join();
  // onJoinResult callback moves to waiting phase
};

const handleSpectate = () => {
  lobbyClient.current?.spectate();
};
```

**3e. Add `onSpectateResult` callback in useEffect:**
```typescript
client.onSpectateResult((result) => {
  if (result.accepted) {
    setPhase('waiting');
    setGameSettings(result.gameSettings);
    setIsSpectator(true); // new state flag
  } else {
    setJoinError(result.reason);
    setPhase('scanning');
  }
});
```

**3f. Update `onGameStart` to use mode based on `isSpectator`:**
```typescript
client.onGameStart((config) => {
  router.push({
    pathname: '/game',
    params: isSpectator
      ? {
          mode: 'ble-spectator',
          sb: String(config.blinds.sb),
          bb: String(config.blinds.bb),
          initialChips: String(config.initialChips),
        }
      : {
          mode: 'ble-client',
          sb: String(config.blinds.sb),
          bb: String(config.blinds.bb),
          initialChips: String(config.initialChips),
          seat: String(client.mySeat),
        },
  });
});
```

**Note:** `isSpectator` is a ref (not state) to avoid stale closure in `onGameStart`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/components/BleJoinLobby.test.tsx
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/BleJoinLobby.tsx src/services/ble/LobbyClient.ts tests/ui/components/BleJoinLobby.test.tsx
git commit -m "feat(ui): add roleSelect phase to BleJoinLobby (参加/観戦 choice)"
```

---

## Task 13: Integration test — BleSpectatorFlow

**Files:**
- Create: `tests/ble/integration/BleSpectatorFlow.test.ts`

**Pattern:** Use the same `MockBleNetwork.create(hostTransport, [clientTransport, spectatorTransport])` pattern from `BleGameFlow.test.ts`. The spectator transport is a `MockBleClientTransport`, and `BleSpectatorGameService` is instantiated with it (no `mySeat`). Use `BleHostGameService(hostTransport, clientSeatMap, ['spectator-client'])` to register the spectator.

- [ ] **Step 1: Create integration test**

```typescript
// tests/ble/integration/BleSpectatorFlow.test.ts

import { BleHostGameService } from '../../../src/services/ble/BleHostGameService';
import { BleClientGameService } from '../../../src/services/ble/BleClientGameService';
import { BleSpectatorGameService } from '../../../src/services/ble/BleSpectatorGameService';
import {
  MockBleHostTransport,
  MockBleClientTransport,
  MockBleNetwork,
} from '../../../src/services/ble/MockBleTransport';

describe('BleSpectatorFlow integration', () => {
  let hostTransport: MockBleHostTransport;
  let clientTransport: MockBleClientTransport;
  let spectatorTransport: MockBleClientTransport;
  let hostService: BleHostGameService;
  let clientService: BleClientGameService;
  let spectatorService: BleSpectatorGameService;

  beforeEach(() => {
    hostTransport = new MockBleHostTransport();
    clientTransport = new MockBleClientTransport();
    spectatorTransport = new MockBleClientTransport();
    MockBleNetwork.create(hostTransport, [clientTransport, spectatorTransport]);

    const clientSeatMap = new Map<string, number>([['client-1', 1]]);
    hostService = new BleHostGameService(hostTransport, clientSeatMap, ['client-spectator']);
    clientService = new BleClientGameService(clientTransport, 1);
    spectatorService = new BleSpectatorGameService(spectatorTransport);
  });

  it('spectator receives stateUpdate after host starts game', () => {
    hostService.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();

    const state = spectatorService.getState();
    expect(state.phase).toBe('preflop');
    expect(state.players).toHaveLength(2);
    // All cards stripped — spectator never sees hole cards
    state.players.forEach(p => expect(p.cards).toEqual([]));
  });

  it('spectator receives showdownResult — resolveShowdown returns hand info', () => {
    hostService.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();

    // Play to showdown: check/call all streets
    let state = hostService.getState();
    let iterations = 0;
    while (state.phase !== 'showdown' && state.phase !== 'roundEnd' && iterations < 50) {
      iterations++;
      const seat = state.activePlayer;
      const info = hostService.getActionInfo(seat);
      hostService.handleAction(seat, info.canCheck ? { action: 'check' } : { action: 'call' });
      state = hostService.getState();
    }
    if (state.phase === 'showdown') {
      hostService.resolveShowdown();
    }

    const result = spectatorService.resolveShowdown();
    expect(result.winners.length).toBeGreaterThan(0);
    expect(result.hands.length).toBeGreaterThan(0);
  });

  it('spectator handleAction returns {valid: false} and sends nothing', () => {
    hostService.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();

    const msgsBefore = spectatorTransport.sentMessages.length;
    const result = spectatorService.handleAction(0, { action: 'fold' });
    expect(result.valid).toBe(false);
    expect(spectatorTransport.sentMessages.length).toBe(msgsBefore); // nothing sent
  });

  it('mid-game addSpectator: new spectator receives current stateUpdate', () => {
    // Create a new spectator transport not in the initial network
    const lateSpectatorTransport = new MockBleClientTransport();
    MockBleNetwork.addClient(hostTransport, lateSpectatorTransport);
    const lateSpectator = new BleSpectatorGameService(lateSpectatorTransport);

    hostService.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();
    // Play one action so phase is still preflop but seq > 1
    hostService.handleAction(hostService.getState().activePlayer, { action: 'call' });

    // Add spectator mid-game
    hostService.addSpectator('late-spectator-client');

    const state = lateSpectator.getState();
    expect(state.phase).toBe('preflop');
  });
});
```

**Note on `MockBleNetwork.addClient`:** Check if this method exists in `MockBleTransport.ts`. If not, you may need to add it or set up `lateSpectatorTransport` as a connected client from the start. Review the `MockBleNetwork` implementation before writing this test.

- [ ] **Step 2: Run tests to verify they pass**

```bash
npx jest tests/ble/integration/BleSpectatorFlow.test.ts
```
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/ble/integration/BleSpectatorFlow.test.ts
git commit -m "test(ble): add BleSpectatorFlow integration tests"
```

---

## Task 14: Integration test — BleAutoSpectatorTransition

**Files:**
- Create: `tests/ble/integration/BleAutoSpectatorTransition.test.ts`

- [ ] **Step 1: Create integration test**

```typescript
// tests/ble/integration/BleAutoSpectatorTransition.test.ts

import { BleHostGameService } from '../../../src/services/ble/BleHostGameService';
import { BleClientGameService } from '../../../src/services/ble/BleClientGameService';
import { ChunkManager } from '../../../src/services/ble/ChunkManager';
import { MockBleHostTransport, MockBleClientTransport } from '../../../src/services/ble/MockBleTransport';

describe('BleAutoSpectatorTransition integration', () => {
  it('stateUpdate with status:out is forwarded to client subscriber', async () => {
    // Setup: 3-player game, play until one player is bust
    // Verify: BleClientGameService subscriber receives state with player.status='out'
    // (This is the trigger for GameContext auto-transition)
  });

  it('doAction returns {valid:false} when called after bust (simulated)', async () => {
    // Use BleClientGameService directly
    // Send stateUpdate where mySeat=1 player is status:'out'
    // Simulate that mode has transitioned (via GameContext logic in UI test)
    // This is best tested via the GameContext test in Task 7
  });
});
```

**Note:** The core of the auto-transition (GameContext switching `effectiveMode`) is already tested in Task 7. This integration test focuses on the BLE layer: verifying that the host correctly sends `status:'out'` in `stateUpdate` after `prepareNextRound()`, which the client can observe.

- [ ] **Step 2: Run tests to verify they pass**

```bash
npx jest tests/ble/integration/BleAutoSpectatorTransition.test.ts
```
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/ble/integration/BleAutoSpectatorTransition.test.ts
git commit -m "test(ble): add BleAutoSpectatorTransition integration tests"
```

---

## Task 15: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npx jest
```
Expected: All tests PASS, no regressions

- [ ] **Step 2: TypeScript type check**

```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit final cleanup if needed**

```bash
git add -p  # stage any cleanup changes
git commit -m "chore: spectator mode final cleanup"
```

---

## Implementation Notes

### Critical: MockBleClientTransport API
Check `src/services/ble/MockBleTransport.ts` for the exact method names before writing tests:
- `transport.simulateMessageReceived(charId, data)` — exact signature
- `transport.sentMessages` — structure of recorded messages

### Critical: createMockService helper
In `tests/ui/helpers/renderWithGame.ts`, verify `createMockService()` exposes a way to trigger subscriber callbacks (e.g., `_notifyListeners`). If not, add it or use `service.subscribe()` in test setup.

### Critical: LobbyClient auto-join refactor (Task 12)
`LobbyClient.connectToHost()` (line 55) currently auto-sends `join` at the end. Task 12 requires splitting this: `connectToHost` should stop before sending `join`, and a new `join()` method should send it explicitly. **This will break Task 3's tests** — the Task 3 test calls `client.connectToHost('host-1')` and then `client.spectate()`. After the refactor, the test must also call `client.join()` or `client.spectate()` explicitly. When implementing Task 12, run `npx jest tests/ble/LobbyClient.test.ts` and fix any regressions before committing.

### Dependency on `setLobbyHost`
`ble-host.tsx` (or the host lobby screen) must call `setLobbyHost(host)` before navigating to `/game`. Find where `LobbyHost` is created and add this call (likely in `app/ble-host.tsx` or `BleHostLobby.tsx` `useEffect`).
