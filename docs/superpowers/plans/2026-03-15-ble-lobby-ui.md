# BLE Lobby UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UI layer for BLE lobby (mode selector, host/join setup forms, waiting screens) on top of Phase 1 lobby logic, with protocol extensions for game settings.

**Architecture:** Extend LobbyProtocol with `gameSettings` and `initialChips` fields. Refactor LobbyClient callbacks to discriminated unions. Add 3-tab mode selector to existing LobbyView. BLE async flows (host waiting, scan/connect/wait) get dedicated route screens. All new UI components tested with RNTL + mocked LobbyHost/LobbyClient.

**Tech Stack:** TypeScript, React Native, Expo Router, Jest (engine + ui projects), React Native Testing Library

**Spec:** `docs/superpowers/specs/2026-03-14-ble-lobby-ui-design.md`

---

## Chunk 1: Protocol & Service Layer Extensions

### Task 1: LobbyProtocol Type Extension

**Files:**
- Modify: `src/services/ble/LobbyProtocol.ts`
- Modify: `tests/ble/LobbyProtocol.test.ts`

- [ ] **Step 1: Write failing tests for extended protocol types**

Add these test cases to `tests/ble/LobbyProtocol.test.ts`:

```typescript
// Add to the existing 'validateHostMessage' describe block:

it('validates joinResponse with gameSettings', () => {
  const msg = validateHostMessage({
    type: 'joinResponse',
    accepted: true,
    seat: 1,
    players: [{ seat: 0, name: 'Host', ready: true }],
    gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
  });
  expect(msg).toEqual({
    type: 'joinResponse',
    accepted: true,
    seat: 1,
    players: [{ seat: 0, name: 'Host', ready: true }],
    gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
  });
});

it('rejects joinResponse (accepted) without gameSettings', () => {
  const msg = validateHostMessage({
    type: 'joinResponse',
    accepted: true,
    seat: 1,
    players: [{ seat: 0, name: 'Host', ready: true }],
  });
  expect(msg).toBeNull();
});

it('rejects joinResponse with invalid gameSettings', () => {
  const msg = validateHostMessage({
    type: 'joinResponse',
    accepted: true,
    seat: 1,
    players: [{ seat: 0, name: 'Host', ready: true }],
    gameSettings: { sb: 5, bb: 10 }, // missing initialChips
  });
  expect(msg).toBeNull();
});

it('validates gameStart with initialChips', () => {
  const msg = validateHostMessage({
    type: 'gameStart',
    blinds: { sb: 5, bb: 10 },
    initialChips: 1000,
  });
  expect(msg).toEqual({
    type: 'gameStart',
    blinds: { sb: 5, bb: 10 },
    initialChips: 1000,
  });
});

it('rejects gameStart without initialChips', () => {
  const msg = validateHostMessage({
    type: 'gameStart',
    blinds: { sb: 5, bb: 10 },
  });
  expect(msg).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects engine -- tests/ble/LobbyProtocol.test.ts --no-coverage`
Expected: 5 new tests FAIL (existing tests still pass)

- [ ] **Step 3: Update existing joinResponse test to include gameSettings**

The existing test for accepted joinResponse now needs `gameSettings`. Find and update it:

```typescript
// Update existing test that validates accepted joinResponse:
// Add gameSettings to both input and expected output
it('validates accepted joinResponse', () => {
  const msg = validateHostMessage({
    type: 'joinResponse',
    accepted: true,
    seat: 1,
    players: [{ seat: 0, name: 'Host', ready: true }],
    gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
  });
  expect(msg).not.toBeNull();
  expect(msg!.type).toBe('joinResponse');
});
```

- [ ] **Step 4: Implement protocol type changes**

In `src/services/ble/LobbyProtocol.ts`:

1. Add `GameSettings` type after `LobbyPlayer`:

```typescript
export type GameSettings = {
  sb: number;
  bb: number;
  initialChips: number;
};
```

2. Update `LobbyHostMessage` union — add `gameSettings` to accepted joinResponse, add `initialChips` to gameStart:

```typescript
export type LobbyHostMessage =
  | { type: 'joinResponse'; accepted: true; seat: number; players: LobbyPlayer[]; gameSettings: GameSettings }
  | { type: 'joinResponse'; accepted: false; reason: string }
  | { type: 'playerUpdate'; players: LobbyPlayer[] }
  | { type: 'gameStart'; blinds: { sb: number; bb: number }; initialChips: number }
  | { type: 'lobbyClosed'; reason: string };
```

3. Add `isValidGameSettings` helper after `isValidBlinds`:

```typescript
function isValidGameSettings(value: unknown): value is GameSettings {
  return (
    isObject(value) &&
    typeof value.sb === 'number' &&
    typeof value.bb === 'number' &&
    typeof value.initialChips === 'number'
  );
}
```

4. Update `validateHostMessage` — joinResponse accepted case:

```typescript
case 'joinResponse':
  if (data.accepted === true) {
    if (typeof data.seat !== 'number') return null;
    if (!isLobbyPlayerArray(data.players)) return null;
    if (!isValidGameSettings(data.gameSettings)) return null;
    return {
      type: 'joinResponse',
      accepted: true,
      seat: data.seat,
      players: data.players,
      gameSettings: data.gameSettings,
    };
  }
  // ... rest unchanged
```

5. Update `validateHostMessage` — gameStart case:

```typescript
case 'gameStart':
  if (!isValidBlinds(data.blinds)) return null;
  if (typeof data.initialChips !== 'number') return null;
  return {
    type: 'gameStart',
    blinds: data.blinds as { sb: number; bb: number },
    initialChips: data.initialChips as number,
  };
```

- [ ] **Step 5: Run all protocol tests**

Run: `npx jest --selectProjects engine -- tests/ble/LobbyProtocol.test.ts --no-coverage`
Expected: ALL tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/ble/LobbyProtocol.ts tests/ble/LobbyProtocol.test.ts
git commit -m "feat(ble): extend LobbyProtocol with gameSettings and initialChips"
```

---

### Task 2: LobbyHost gameSettings Extension

**Files:**
- Modify: `src/services/ble/LobbyHost.ts`
- Modify: `tests/ble/LobbyHost.test.ts`

- [ ] **Step 1: Update existing tests for new constructor signature**

In `tests/ble/LobbyHost.test.ts`, update `beforeEach` to pass `gameSettings`:

```typescript
const DEFAULT_GAME_SETTINGS = { sb: 5, bb: 10, initialChips: 1000 };

beforeEach(() => {
  transport = new MockBleHostTransport();
  host = new LobbyHost(transport, 'HostPlayer', DEFAULT_GAME_SETTINGS);
});
```

- [ ] **Step 2: Write new tests for gameSettings in joinResponse and gameStart**

Add to `tests/ble/LobbyHost.test.ts`:

```typescript
it('includes gameSettings in joinResponse', async () => {
  await host.start();
  transport.simulateClientConnected('client-1');
  const joinMsg = JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' });
  transport.simulateMessageReceived('client-1', 'lobby', encodeMessage(joinMsg));

  // Find the joinResponse message sent to client-1
  const joinResponseChunk = transport.sentMessages.find(
    (m) => m.clientId === 'client-1',
  );
  expect(joinResponseChunk).toBeDefined();
  const decoded = JSON.parse(new ChunkManager().decode('any', joinResponseChunk!.data)!);
  expect(decoded.gameSettings).toEqual({ sb: 5, bb: 10, initialChips: 1000 });
});

it('includes initialChips in gameStart message', async () => {
  await host.start();
  transport.simulateClientConnected('client-1');
  transport.simulateMessageReceived(
    'client-1', 'lobby',
    encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
  );
  transport.simulateMessageReceived(
    'client-1', 'lobby',
    encodeMessage(JSON.stringify({ type: 'ready' })),
  );

  transport.sentMessages.length = 0; // Clear previous messages
  host.startGame();

  // Decode the gameStart broadcast
  const broadcastMsg = transport.sentMessages.find((m) => m.clientId === '__all__');
  expect(broadcastMsg).toBeDefined();
  const decoded = JSON.parse(new ChunkManager().decode('any', broadcastMsg!.data)!);
  expect(decoded).toEqual({
    type: 'gameStart',
    blinds: { sb: 5, bb: 10 },
    initialChips: 1000,
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest --selectProjects engine -- tests/ble/LobbyHost.test.ts --no-coverage`
Expected: New tests FAIL, some existing tests may fail due to constructor change

- [ ] **Step 4: Implement LobbyHost changes**

In `src/services/ble/LobbyHost.ts`:

1. Import `GameSettings`:

```typescript
import {
  LobbyPlayer,
  LobbyHostMessage,
  GameSettings,
  validateClientMessage,
} from './LobbyProtocol';
```

2. Update constructor to accept `gameSettings`:

```typescript
constructor(
  private transport: BleHostTransport,
  private hostName: string,
  private gameSettings: GameSettings = { sb: 5, bb: 10, initialChips: 1000 },
) {}
```

3. Update `handleJoin` — add `gameSettings` to joinResponse:

```typescript
this.sendToClient(clientId, {
  type: 'joinResponse',
  accepted: true,
  seat,
  players: this.getPlayerList(),
  gameSettings: this.gameSettings,
});
```

4. Update `startGame` — remove parameter, use `this.gameSettings`:

```typescript
startGame(): void {
  const playerList = this.getPlayerList();
  const nonHostPlayers = playerList.filter((p) => p.seat !== 0);

  if (playerList.length < 2) {
    this._onError?.('Cannot start: need at least 2 players');
    return;
  }
  if (!nonHostPlayers.every((p) => p.ready)) {
    this._onError?.('Cannot start: not all players are ready');
    return;
  }

  this.state = 'gameStarting';
  const blinds = { sb: this.gameSettings.sb, bb: this.gameSettings.bb };
  this.sendToAll({
    type: 'gameStart',
    blinds,
    initialChips: this.gameSettings.initialChips,
  });
  this._onGameStart?.(blinds);
}
```

- [ ] **Step 5: Update existing tests that call startGame with blinds parameter**

Find all `host.startGame(...)` calls in the test file and update to `host.startGame()` (no args). The blinds are now derived from `gameSettings` passed to constructor.

- [ ] **Step 6: Run all LobbyHost tests**

Run: `npx jest --selectProjects engine -- tests/ble/LobbyHost.test.ts --no-coverage`
Expected: ALL tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/ble/LobbyHost.ts tests/ble/LobbyHost.test.ts
git commit -m "feat(ble): add gameSettings to LobbyHost constructor and protocol messages"
```

---

### Task 3: LobbyClient Callback Refactoring

**Files:**
- Modify: `src/services/ble/LobbyClient.ts`
- Modify: `tests/ble/LobbyClient.test.ts`

- [ ] **Step 1: Update existing onJoinResult tests to discriminated union**

In `tests/ble/LobbyClient.test.ts`, update the joinResponse tests:

```typescript
it('calls onJoinResult with accepted result including gameSettings', () => {
  const joinCb = jest.fn();
  client.onJoinResult(joinCb);

  const response = JSON.stringify({
    type: 'joinResponse',
    accepted: true,
    seat: 2,
    players: [
      { seat: 0, name: 'Host', ready: true },
      { seat: 2, name: 'Alice', ready: false },
    ],
    gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
  });
  transport.simulateMessageReceived('lobby', encodeMessage(response));

  expect(joinCb).toHaveBeenCalledWith({
    accepted: true,
    gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
  });
});

it('calls onJoinResult with rejected result', () => {
  const joinCb = jest.fn();
  client.onJoinResult(joinCb);

  const response = JSON.stringify({
    type: 'joinResponse',
    accepted: false,
    reason: 'Room is full',
  });
  transport.simulateMessageReceived('lobby', encodeMessage(response));

  expect(joinCb).toHaveBeenCalledWith({
    accepted: false,
    reason: 'Room is full',
  });
});
```

- [ ] **Step 2: Update existing onGameStart test to include initialChips**

```typescript
it('fires onGameStart callback with config including initialChips', () => {
  const gameStartCb = jest.fn();
  client.onGameStart(gameStartCb);

  transport.simulateMessageReceived(
    'lobby',
    encodeMessage(JSON.stringify({
      type: 'gameStart',
      blinds: { sb: 5, bb: 10 },
      initialChips: 1000,
    })),
  );

  expect(gameStartCb).toHaveBeenCalledWith({
    blinds: { sb: 5, bb: 10 },
    initialChips: 1000,
  });
});
```

- [ ] **Step 3: Add test for public mySeat getter**

```typescript
describe('mySeat getter', () => {
  it('returns null before joining', () => {
    expect(client.mySeat).toBeNull();
  });

  it('returns seat number after accepted join', async () => {
    await client.connectToHost('host-1');
    transport.simulateMessageReceived(
      'lobby',
      encodeMessage(JSON.stringify({
        type: 'joinResponse',
        accepted: true,
        seat: 2,
        players: [
          { seat: 0, name: 'Host', ready: true },
          { seat: 2, name: 'Alice', ready: false },
        ],
        gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
      })),
    );
    expect(client.mySeat).toBe(2);
  });
});
```

- [ ] **Step 4: Update ALL beforeEach blocks that simulate joinResponse/gameStart**

After Task 1's protocol changes, `validateHostMessage` rejects `joinResponse` without `gameSettings` and `gameStart` without `initialChips`. Every `beforeEach` in `tests/ble/LobbyClient.test.ts` that simulates an accepted `joinResponse` must be updated. Find all occurrences of `type: 'joinResponse', accepted: true` and add `gameSettings`:

```typescript
// In ALL beforeEach blocks that send an accepted joinResponse (playerUpdate, setReady, gameStart, lobbyClosed, disconnect describe blocks):
// Replace this pattern:
transport.simulateMessageReceived(
  'lobby',
  encodeMessage(JSON.stringify({
    type: 'joinResponse', accepted: true, seat: 1,
    players: [{ seat: 0, name: 'Host', ready: true }, { seat: 1, name: 'Alice', ready: false }],
  })),
);

// With:
transport.simulateMessageReceived(
  'lobby',
  encodeMessage(JSON.stringify({
    type: 'joinResponse', accepted: true, seat: 1,
    players: [{ seat: 0, name: 'Host', ready: true }, { seat: 1, name: 'Alice', ready: false }],
    gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
  })),
);
```

Also update the `gameStart handling` test body to include `initialChips`:

```typescript
// In the 'fires onGameStart callback' test:
transport.simulateMessageReceived(
  'lobby',
  encodeMessage(JSON.stringify({ type: 'gameStart', blinds: { sb: 5, bb: 10 }, initialChips: 1000 })),
);
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx jest --selectProjects engine -- tests/ble/LobbyClient.test.ts --no-coverage`
Expected: Updated tests FAIL (callback signature mismatch)

- [ ] **Step 6: Implement LobbyClient changes**

In `src/services/ble/LobbyClient.ts`:

1. Import `GameSettings`:

```typescript
import {
  LobbyPlayer,
  LobbyClientMessage,
  LobbyHostMessage,
  GameSettings,
  validateHostMessage,
  PROTOCOL_VERSION,
} from './LobbyProtocol';
```

2. Define `JoinResult` type and update callback types:

```typescript
export type JoinResult =
  | { accepted: true; gameSettings: GameSettings }
  | { accepted: false; reason: string };

export type GameStartConfig = {
  blinds: { sb: number; bb: number };
  initialChips: number;
};
```

3. Rename `mySeat` field to `_mySeat` and add public getter:

```typescript
private _mySeat: number | null = null;

get mySeat(): number | null {
  return this._mySeat;
}
```

4. Update callback field types:

```typescript
private _onJoinResult: ((result: JoinResult) => void) | null = null;
private _onGameStart: ((config: GameStartConfig) => void) | null = null;
```

5. Update `handleJoinResponse`:

```typescript
private handleJoinResponse(msg: LobbyHostMessage & { type: 'joinResponse' }): void {
  if (msg.accepted) {
    this.state = 'joined';
    this._mySeat = msg.seat;
    this.players = msg.players;
    this._onJoinResult?.({ accepted: true, gameSettings: msg.gameSettings });
  } else {
    this.state = 'idle';
    this._onJoinResult?.({ accepted: false, reason: msg.reason });
  }
}
```

6. Update gameStart handling in `handleMessage`:

```typescript
case 'gameStart':
  this.state = 'gameStarting';
  this._onGameStart?.({ blinds: msg.blinds, initialChips: msg.initialChips });
  break;
```

7. Update callback registration methods:

```typescript
onJoinResult(callback: (result: JoinResult) => void): void {
  this._onJoinResult = callback;
}

onGameStart(callback: (config: GameStartConfig) => void): void {
  this._onGameStart = callback;
}
```

8. Update `disconnect` to use `_mySeat`:

```typescript
async disconnect(): Promise<void> {
  await this.transport.disconnect();
  this.state = 'idle';
  this._mySeat = null;
  this.players = [];
  this.chunkManager.clear();
}
```

- [ ] **Step 7: Run all LobbyClient tests**

Run: `npx jest --selectProjects engine -- tests/ble/LobbyClient.test.ts --no-coverage`
Expected: ALL tests PASS

- [ ] **Step 8: Run all engine tests to check nothing is broken**

Run: `npx jest --selectProjects engine --no-coverage`
Expected: ALL tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/services/ble/LobbyClient.ts tests/ble/LobbyClient.test.ts
git commit -m "feat(ble): refactor LobbyClient callbacks to discriminated unions, add mySeat getter"
```

---

## Chunk 2: UI Foundation Components

### Task 4: GameContext Mode Type Extension

**Files:**
- Modify: `src/contexts/GameContext.tsx`

- [ ] **Step 1: Extend mode type in GameContextValue and GameProviderProps**

In `src/contexts/GameContext.tsx`, update the `mode` type in both interfaces:

```typescript
// In GameContextValue:
mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';

// In GameProviderProps:
mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx jest --selectProjects ui -- tests/ui/contexts/GameContext.test.tsx --no-coverage`
Expected: ALL tests PASS (no behavioral change, only type widening)

- [ ] **Step 3: Commit**

```bash
git add src/contexts/GameContext.tsx
git commit -m "feat: extend GameContext mode type with ble-host and ble-client"
```

---

### Task 5: PlayerSlot Component

**Files:**
- Create: `src/components/lobby/PlayerSlot.tsx`
- Create: `tests/ui/components/PlayerSlot.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/ui/components/PlayerSlot.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PlayerSlot } from '../../../src/components/lobby/PlayerSlot';

describe('PlayerSlot', () => {
  it('renders ready player with checkmark', () => {
    render(
      <PlayerSlot
        seatNumber={0}
        player={{ seat: 0, name: 'HostPlayer', ready: true }}
      />,
    );
    expect(screen.getByText('HostPlayer')).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();
  });

  it('renders not-ready player with circle', () => {
    render(
      <PlayerSlot
        seatNumber={1}
        player={{ seat: 1, name: 'Alice', ready: false }}
      />,
    );
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('○')).toBeTruthy();
  });

  it('renders empty seat', () => {
    render(<PlayerSlot seatNumber={2} />);
    expect(screen.getByText('(空席)')).toBeTruthy();
  });

  it('renders "(あなた)" suffix when isMe is true', () => {
    render(
      <PlayerSlot
        seatNumber={0}
        player={{ seat: 0, name: 'Me', ready: true }}
        isMe
      />,
    );
    expect(screen.getByText(/Me/)).toBeTruthy();
    expect(screen.getByText(/あなた/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ui -- tests/ui/components/PlayerSlot.test.tsx --no-coverage`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement PlayerSlot**

Create `src/components/lobby/PlayerSlot.tsx`:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';
import { LobbyPlayer } from '../../services/ble/LobbyProtocol';

type PlayerSlotProps = {
  seatNumber: number;
  player?: LobbyPlayer;
  isMe?: boolean;
};

export function PlayerSlot({ seatNumber, player, isMe }: PlayerSlotProps) {
  if (!player) {
    return (
      <View style={styles.slot}>
        <Text style={styles.seatLabel}>Seat {seatNumber}</Text>
        <Text style={styles.emptyText}>(空席)</Text>
      </View>
    );
  }

  const readyIcon = player.ready ? '✓' : '○';

  return (
    <View style={[styles.slot, player.ready && styles.readySlot]}>
      <Text style={styles.seatLabel}>Seat {seatNumber}</Text>
      <Text style={styles.nameText}>
        {player.name}
        {isMe && ' (あなた)'}
      </Text>
      <Text style={[styles.readyIcon, player.ready && styles.readyIconActive]}>
        {readyIcon}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#374151',
    borderRadius: 8,
    marginBottom: 6,
    gap: 8,
  },
  readySlot: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.active,
  },
  seatLabel: {
    color: Colors.subText,
    fontSize: 12,
    width: 48,
  },
  nameText: {
    color: Colors.text,
    fontSize: 16,
    flex: 1,
  },
  emptyText: {
    color: Colors.subText,
    fontSize: 16,
    flex: 1,
    fontStyle: 'italic',
  },
  readyIcon: {
    color: Colors.subText,
    fontSize: 18,
  },
  readyIconActive: {
    color: Colors.active,
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ui -- tests/ui/components/PlayerSlot.test.tsx --no-coverage`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/PlayerSlot.tsx tests/ui/components/PlayerSlot.test.tsx
git commit -m "feat(ui): add PlayerSlot component for BLE lobby seat display"
```

---

### Task 6: HostList Component

**Files:**
- Create: `src/components/lobby/HostList.tsx`
- Create: `tests/ui/components/HostList.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/ui/components/HostList.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { HostList } from '../../../src/components/lobby/HostList';

describe('HostList', () => {
  const hosts = [
    { id: 'host-1', name: 'Room A' },
    { id: 'host-2', name: 'Room B' },
  ];

  it('renders all discovered hosts', () => {
    render(<HostList hosts={hosts} onSelect={jest.fn()} />);
    expect(screen.getByText('Room A')).toBeTruthy();
    expect(screen.getByText('Room B')).toBeTruthy();
  });

  it('calls onSelect with hostId when tapped', () => {
    const onSelect = jest.fn();
    render(<HostList hosts={hosts} onSelect={onSelect} />);
    fireEvent.press(screen.getByText('Room A'));
    expect(onSelect).toHaveBeenCalledWith('host-1');
  });

  it('renders empty state when no hosts', () => {
    render(<HostList hosts={[]} onSelect={jest.fn()} />);
    expect(screen.getByText('ホストを探しています...')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ui -- tests/ui/components/HostList.test.tsx --no-coverage`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement HostList**

Create `src/components/lobby/HostList.tsx`:

```tsx
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from '../../theme/colors';

type HostListProps = {
  hosts: { id: string; name: string }[];
  onSelect: (hostId: string) => void;
};

export function HostList({ hosts, onSelect }: HostListProps) {
  if (hosts.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator color={Colors.active} />
        <Text style={styles.emptyText}>ホストを探しています...</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={hosts}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          testID={`host-${item.id}`}
          style={styles.hostItem}
          onPress={() => onSelect(item.id)}
        >
          <Text style={styles.hostName}>{item.name}</Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyText: {
    color: Colors.subText,
    fontSize: 14,
  },
  hostItem: {
    backgroundColor: '#374151',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  hostName: {
    color: Colors.text,
    fontSize: 16,
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ui -- tests/ui/components/HostList.test.tsx --no-coverage`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/HostList.tsx tests/ui/components/HostList.test.tsx
git commit -m "feat(ui): add HostList component for BLE host discovery"
```

---

### Task 7: LobbyModeSelector Component

**Files:**
- Create: `src/components/lobby/LobbyModeSelector.tsx`
- Create: `tests/ui/components/LobbyModeSelector.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/ui/components/LobbyModeSelector.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { LobbyModeSelector } from '../../../src/components/lobby/LobbyModeSelector';

describe('LobbyModeSelector', () => {
  it('renders all three tabs', () => {
    render(<LobbyModeSelector selected="local" onSelect={jest.fn()} />);
    expect(screen.getByText('ローカル')).toBeTruthy();
    expect(screen.getByText('ホスト作成')).toBeTruthy();
    expect(screen.getByText('ゲーム参加')).toBeTruthy();
  });

  it('calls onSelect with "host" when ホスト作成 is pressed', () => {
    const onSelect = jest.fn();
    render(<LobbyModeSelector selected="local" onSelect={onSelect} />);
    fireEvent.press(screen.getByText('ホスト作成'));
    expect(onSelect).toHaveBeenCalledWith('host');
  });

  it('calls onSelect with "join" when ゲーム参加 is pressed', () => {
    const onSelect = jest.fn();
    render(<LobbyModeSelector selected="local" onSelect={onSelect} />);
    fireEvent.press(screen.getByText('ゲーム参加'));
    expect(onSelect).toHaveBeenCalledWith('join');
  });

  it('calls onSelect with "local" when ローカル is pressed', () => {
    const onSelect = jest.fn();
    render(<LobbyModeSelector selected="host" onSelect={onSelect} />);
    fireEvent.press(screen.getByText('ローカル'));
    expect(onSelect).toHaveBeenCalledWith('local');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ui -- tests/ui/components/LobbyModeSelector.test.tsx --no-coverage`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement LobbyModeSelector**

Create `src/components/lobby/LobbyModeSelector.tsx`:

```tsx
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

export type LobbyMode = 'local' | 'host' | 'join';

type LobbyModeSelectorProps = {
  selected: LobbyMode;
  onSelect: (mode: LobbyMode) => void;
};

const TABS: { mode: LobbyMode; label: string }[] = [
  { mode: 'local', label: 'ローカル' },
  { mode: 'host', label: 'ホスト作成' },
  { mode: 'join', label: 'ゲーム参加' },
];

export function LobbyModeSelector({ selected, onSelect }: LobbyModeSelectorProps) {
  return (
    <View style={styles.container}>
      {TABS.map(({ mode, label }) => (
        <TouchableOpacity
          key={mode}
          testID={`lobby-tab-${mode}`}
          style={[styles.tab, selected === mode && styles.tabActive]}
          onPress={() => onSelect(mode)}
        >
          <Text style={[styles.tabText, selected === mode && styles.tabTextActive]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.subText,
    alignItems: 'center',
  },
  tabActive: {
    borderColor: Colors.active,
    backgroundColor: 'rgba(6,182,212,0.15)',
  },
  tabText: {
    color: Colors.subText,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.active,
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ui -- tests/ui/components/LobbyModeSelector.test.tsx --no-coverage`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/LobbyModeSelector.tsx tests/ui/components/LobbyModeSelector.test.tsx
git commit -m "feat(ui): add LobbyModeSelector 3-tab component"
```

---

## Chunk 3: Forms & LobbyView Integration

### Task 8: HostSetupForm Component

**Files:**
- Create: `src/components/lobby/HostSetupForm.tsx`
- Create: `tests/ui/components/HostSetupForm.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/ui/components/HostSetupForm.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { HostSetupForm } from '../../../src/components/lobby/HostSetupForm';

describe('HostSetupForm', () => {
  it('renders host name input, blinds inputs, and chips input', () => {
    render(<HostSetupForm onSubmit={jest.fn()} />);
    expect(screen.getByPlaceholderText('ホスト名')).toBeTruthy();
    expect(screen.getByTestId('host-sb-input')).toBeTruthy();
    expect(screen.getByTestId('host-bb-input')).toBeTruthy();
    expect(screen.getByTestId('host-chips-input')).toBeTruthy();
  });

  it('disables submit button when host name is empty', () => {
    render(<HostSetupForm onSubmit={jest.fn()} />);
    const btn = screen.getByTestId('host-create-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('enables submit button when host name is filled', () => {
    render(<HostSetupForm onSubmit={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText('ホスト名'), 'MyRoom');
    const btn = screen.getByTestId('host-create-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeFalsy();
  });

  it('calls onSubmit with form values when button pressed', () => {
    const onSubmit = jest.fn();
    render(<HostSetupForm onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByPlaceholderText('ホスト名'), 'MyRoom');
    fireEvent.press(screen.getByTestId('host-create-btn'));
    expect(onSubmit).toHaveBeenCalledWith({
      hostName: 'MyRoom',
      sb: '5',
      bb: '10',
      initialChips: '1000',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ui -- tests/ui/components/HostSetupForm.test.tsx --no-coverage`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement HostSetupForm**

Create `src/components/lobby/HostSetupForm.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

type HostSetupFormProps = {
  onSubmit: (settings: {
    hostName: string;
    sb: string;
    bb: string;
    initialChips: string;
  }) => void;
};

export function HostSetupForm({ onSubmit }: HostSetupFormProps) {
  const [hostName, setHostName] = useState('');
  const [sb, setSb] = useState('5');
  const [bb, setBb] = useState('10');
  const [initialChips, setInitialChips] = useState('1000');

  const isValid = hostName.trim() !== '';

  return (
    <View>
      <Text style={styles.label}>ホスト名</Text>
      <TextInput
        style={styles.input}
        placeholder="ホスト名"
        placeholderTextColor={Colors.subText}
        value={hostName}
        onChangeText={setHostName}
      />

      <View style={styles.blindsRow}>
        <View style={styles.blindInput}>
          <Text style={styles.label}>SB</Text>
          <TextInput
            testID="host-sb-input"
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
            testID="host-bb-input"
            style={styles.input}
            value={bb}
            onChangeText={setBb}
            keyboardType="numeric"
            placeholderTextColor={Colors.subText}
          />
        </View>
      </View>

      <Text style={styles.label}>初期チップ</Text>
      <TextInput
        testID="host-chips-input"
        style={styles.input}
        value={initialChips}
        onChangeText={setInitialChips}
        keyboardType="numeric"
        placeholderTextColor={Colors.subText}
      />

      <TouchableOpacity
        testID="host-create-btn"
        style={[styles.submitBtn, !isValid && styles.submitBtnDisabled]}
        onPress={() => onSubmit({ hostName: hostName.trim(), sb, bb, initialChips })}
        disabled={!isValid}
      >
        <Text style={styles.submitBtnText}>ロビーを作成</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
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
  blindsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  blindInput: {
    flex: 1,
  },
  submitBtn: {
    backgroundColor: Colors.pot,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ui -- tests/ui/components/HostSetupForm.test.tsx --no-coverage`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/HostSetupForm.tsx tests/ui/components/HostSetupForm.test.tsx
git commit -m "feat(ui): add HostSetupForm for BLE host creation"
```

---

### Task 9: JoinSetupForm Component

**Files:**
- Create: `src/components/lobby/JoinSetupForm.tsx`
- Create: `tests/ui/components/JoinSetupForm.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/ui/components/JoinSetupForm.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { JoinSetupForm } from '../../../src/components/lobby/JoinSetupForm';

describe('JoinSetupForm', () => {
  it('renders player name input', () => {
    render(<JoinSetupForm onSubmit={jest.fn()} />);
    expect(screen.getByPlaceholderText('プレイヤー名')).toBeTruthy();
  });

  it('disables submit button when name is empty', () => {
    render(<JoinSetupForm onSubmit={jest.fn()} />);
    const btn = screen.getByTestId('join-scan-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('enables submit button when name is filled', () => {
    render(<JoinSetupForm onSubmit={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText('プレイヤー名'), 'Alice');
    const btn = screen.getByTestId('join-scan-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeFalsy();
  });

  it('calls onSubmit with player name when button pressed', () => {
    const onSubmit = jest.fn();
    render(<JoinSetupForm onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByPlaceholderText('プレイヤー名'), 'Alice');
    fireEvent.press(screen.getByTestId('join-scan-btn'));
    expect(onSubmit).toHaveBeenCalledWith('Alice');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ui -- tests/ui/components/JoinSetupForm.test.tsx --no-coverage`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement JoinSetupForm**

Create `src/components/lobby/JoinSetupForm.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

type JoinSetupFormProps = {
  onSubmit: (playerName: string) => void;
};

export function JoinSetupForm({ onSubmit }: JoinSetupFormProps) {
  const [playerName, setPlayerName] = useState('');

  const isValid = playerName.trim() !== '';

  return (
    <View>
      <Text style={styles.label}>プレイヤー名</Text>
      <TextInput
        style={styles.input}
        placeholder="プレイヤー名"
        placeholderTextColor={Colors.subText}
        value={playerName}
        onChangeText={setPlayerName}
      />

      <TouchableOpacity
        testID="join-scan-btn"
        style={[styles.submitBtn, !isValid && styles.submitBtnDisabled]}
        onPress={() => onSubmit(playerName.trim())}
        disabled={!isValid}
      >
        <Text style={styles.submitBtnText}>スキャン開始</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
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
  submitBtn: {
    backgroundColor: Colors.pot,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ui -- tests/ui/components/JoinSetupForm.test.tsx --no-coverage`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/JoinSetupForm.tsx tests/ui/components/JoinSetupForm.test.tsx
git commit -m "feat(ui): add JoinSetupForm for BLE game joining"
```

---

### Task 10: LobbyView Modification

**Files:**
- Modify: `src/components/lobby/LobbyView.tsx`
- Modify: `tests/ui/components/LobbyView.test.tsx`

- [ ] **Step 1: Write new tests for mode tabs in LobbyView**

Add the following tests **inside the existing `describe('LobbyView', ...)` block** in `tests/ui/components/LobbyView.test.tsx` (this ensures the `beforeEach(() => { mockPush.mockClear(); })` runs before each new test):

```tsx
it('renders lobby mode tabs (ローカル, ホスト作成, ゲーム参加)', () => {
  render(<LobbyView />);
  expect(screen.getByText('ローカル')).toBeTruthy();
  expect(screen.getByText('ホスト作成')).toBeTruthy();
  expect(screen.getByText('ゲーム参加')).toBeTruthy();
});

it('shows host setup form when ホスト作成 tab is selected', () => {
  render(<LobbyView />);
  fireEvent.press(screen.getByText('ホスト作成'));
  expect(screen.getByPlaceholderText('ホスト名')).toBeTruthy();
});

it('shows join setup form when ゲーム参加 tab is selected', () => {
  render(<LobbyView />);
  fireEvent.press(screen.getByText('ゲーム参加'));
  expect(screen.getByPlaceholderText('プレイヤー名')).toBeTruthy();
});

it('shows local mode content by default', () => {
  render(<LobbyView />);
  expect(screen.getByText('ゲーム開始')).toBeTruthy();
});

it('navigates to ble-host when host form is submitted', () => {
  render(<LobbyView />);
  fireEvent.press(screen.getByText('ホスト作成'));
  fireEvent.changeText(screen.getByPlaceholderText('ホスト名'), 'MyRoom');
  fireEvent.press(screen.getByTestId('host-create-btn'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/ble-host',
    params: { hostName: 'MyRoom', sb: '5', bb: '10', initialChips: '1000' },
  });
});

it('navigates to ble-join when join form is submitted', () => {
  render(<LobbyView />);
  fireEvent.press(screen.getByText('ゲーム参加'));
  fireEvent.changeText(screen.getByPlaceholderText('プレイヤー名'), 'Alice');
  fireEvent.press(screen.getByTestId('join-scan-btn'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/ble-join',
    params: { playerName: 'Alice' },
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail (existing still pass)**

Run: `npx jest --selectProjects ui -- tests/ui/components/LobbyView.test.tsx --no-coverage`
Expected: New tests FAIL, existing tests still PASS

- [ ] **Step 3: Modify LobbyView to integrate mode tabs**

In `src/components/lobby/LobbyView.tsx`:

1. Add imports:

```typescript
import { LobbyModeSelector, LobbyMode } from './LobbyModeSelector';
import { HostSetupForm } from './HostSetupForm';
import { JoinSetupForm } from './JoinSetupForm';
```

2. Add `lobbyMode` state at the top of the component:

```typescript
const [lobbyMode, setLobbyMode] = useState<LobbyMode>('local');
```

3. Add `handleHostSubmit` and `handleJoinSubmit` handlers:

```typescript
const handleHostSubmit = (settings: { hostName: string; sb: string; bb: string; initialChips: string }) => {
  router.push({
    pathname: '/ble-host',
    params: settings,
  });
};

const handleJoinSubmit = (playerName: string) => {
  router.push({
    pathname: '/ble-join',
    params: { playerName },
  });
};
```

4. In the JSX, restructure the `ScrollView` body. Keep the title and `ScrollView` wrapper unchanged. Insert `LobbyModeSelector` right after the title `<Text>`. Wrap **all existing content below the title** (from `<Text style={styles.label}>プレイヤー数</Text>` through the start button `TouchableOpacity`, i.e. lines 44-128 of the current file) inside `{lobbyMode === 'local' && (<>...</>)}`. Then add the BLE form conditionals after:

```tsx
<ScrollView contentContainerStyle={styles.container}>
  <Text style={styles.title}>Jet Holdem</Text>

  <LobbyModeSelector selected={lobbyMode} onSelect={setLobbyMode} />

  {lobbyMode === 'local' && (
    <>
      <Text style={styles.label}>プレイヤー数</Text>
      <View style={styles.countRow}>
        {PLAYER_COUNTS.map(n => (
          <TouchableOpacity
            key={n}
            testID={`count-btn-${n}`}
            style={[styles.countBtn, playerCount === n && styles.countBtnActive]}
            onPress={() => setPlayerCount(n)}
          >
            <Text style={[styles.countText, playerCount === n && styles.countTextActive]}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
          <TextInput style={styles.input} value={sb} onChangeText={setSb} keyboardType="numeric" placeholderTextColor={Colors.subText} />
        </View>
        <View style={styles.blindInput}>
          <Text style={styles.label}>BB</Text>
          <TextInput style={styles.input} value={bb} onChangeText={setBb} keyboardType="numeric" placeholderTextColor={Colors.subText} />
        </View>
      </View>

      <Text style={styles.label}>モード</Text>
      <View style={styles.modeRow}>
        <TouchableOpacity testID="mode-btn-hotseat" style={[styles.modeBtn, mode === 'hotseat' && styles.modeBtnActive]} onPress={() => setMode('hotseat')}>
          <Text style={[styles.modeText, mode === 'hotseat' && styles.modeTextActive]}>ホットシート</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="mode-btn-debug" style={[styles.modeBtn, mode === 'debug' && styles.modeBtnActive]} onPress={() => setMode('debug')}>
          <Text style={[styles.modeText, mode === 'debug' && styles.modeTextActive]}>デバッグ</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity testID="start-btn" style={styles.startBtn} onPress={handleStart}>
        <Text style={styles.startBtnText}>ゲーム開始</Text>
      </TouchableOpacity>
    </>
  )}

  {lobbyMode === 'host' && (
    <HostSetupForm onSubmit={handleHostSubmit} />
  )}

  {lobbyMode === 'join' && (
    <JoinSetupForm onSubmit={handleJoinSubmit} />
  )}
</ScrollView>
```

- [ ] **Step 4: Run all LobbyView tests**

Run: `npx jest --selectProjects ui -- tests/ui/components/LobbyView.test.tsx --no-coverage`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/LobbyView.tsx tests/ui/components/LobbyView.test.tsx
git commit -m "feat(ui): add 3-tab mode selector and BLE setup forms to LobbyView"
```

---

## Chunk 4: BLE Lobby Screens & Routes

### Task 11: BleHostLobby Component

**Files:**
- Create: `src/components/lobby/BleHostLobby.tsx`
- Create: `tests/ui/components/BleHostLobby.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/ui/components/BleHostLobby.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { BleHostLobby } from '../../../src/components/lobby/BleHostLobby';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const mockHost = {
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  startGame: jest.fn(),
  onPlayersChanged: jest.fn(),
  onGameStart: jest.fn(),
  onError: jest.fn(),
};

jest.mock('../../../src/services/ble/LobbyHost', () => ({
  LobbyHost: jest.fn().mockImplementation(() => mockHost),
}));

jest.mock('../../../src/services/ble/MockBleTransport', () => ({
  MockBleHostTransport: jest.fn(),
}));

describe('BleHostLobby', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const defaultProps = { hostName: 'TestHost', sb: 5, bb: 10, initialChips: 1000 };

  it('calls LobbyHost.start on mount', () => {
    render(<BleHostLobby {...defaultProps} />);
    expect(mockHost.start).toHaveBeenCalled();
  });

  it('displays game settings', () => {
    render(<BleHostLobby {...defaultProps} />);
    expect(screen.getByText(/SB.*5/)).toBeTruthy();
    expect(screen.getByText(/BB.*10/)).toBeTruthy();
    expect(screen.getByText(/1000/)).toBeTruthy();
  });

  it('renders player slots when onPlayersChanged fires', async () => {
    render(<BleHostLobby {...defaultProps} />);
    const onPlayersChanged = mockHost.onPlayersChanged.mock.calls[0][0];

    await act(async () => {
      onPlayersChanged([
        { seat: 0, name: 'TestHost', ready: true },
        { seat: 1, name: 'Alice', ready: false },
      ]);
    });

    expect(screen.getByText('TestHost')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('calls startGame when ゲーム開始 button is pressed', async () => {
    render(<BleHostLobby {...defaultProps} />);
    const onPlayersChanged = mockHost.onPlayersChanged.mock.calls[0][0];

    await act(async () => {
      onPlayersChanged([
        { seat: 0, name: 'TestHost', ready: true },
        { seat: 1, name: 'Alice', ready: true },
      ]);
    });

    fireEvent.press(screen.getByTestId('host-start-game-btn'));
    expect(mockHost.startGame).toHaveBeenCalled();
  });

  it('navigates to game when onGameStart fires', async () => {
    render(<BleHostLobby {...defaultProps} />);
    const onGameStart = mockHost.onGameStart.mock.calls[0][0];

    await act(async () => {
      onGameStart({ sb: 5, bb: 10 });
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/game',
      params: { mode: 'ble-host', sb: '5', bb: '10', initialChips: '1000', seat: '0' },
    });
  });

  it('displays error message when onError fires', async () => {
    render(<BleHostLobby {...defaultProps} />);
    const onError = mockHost.onError.mock.calls[0][0];

    await act(async () => {
      onError('Cannot start: need at least 2 players');
    });

    expect(screen.getByText('Cannot start: need at least 2 players')).toBeTruthy();
  });

  it('calls stop and navigates back when ロビーを閉じる is pressed', async () => {
    render(<BleHostLobby {...defaultProps} />);
    fireEvent.press(screen.getByTestId('host-close-btn'));
    expect(mockHost.stop).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ui -- tests/ui/components/BleHostLobby.test.tsx --no-coverage`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement BleHostLobby**

Create `src/components/lobby/BleHostLobby.tsx`:

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../theme/colors';
import { LobbyPlayer } from '../../services/ble/LobbyProtocol';
import { LobbyHost } from '../../services/ble/LobbyHost';
import { MockBleHostTransport } from '../../services/ble/MockBleTransport';
import { PlayerSlot } from './PlayerSlot';

type BleHostLobbyProps = {
  hostName: string;
  sb: number;
  bb: number;
  initialChips: number;
};

const MAX_SEATS = 4;

export function BleHostLobby({ hostName, sb, bb, initialChips }: BleHostLobbyProps) {
  const router = useRouter();
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lobbyHost = useRef<LobbyHost | null>(null);

  useEffect(() => {
    const transport = new MockBleHostTransport();
    const host = new LobbyHost(transport, hostName, { sb, bb, initialChips });

    host.onPlayersChanged((p) => setPlayers(p));
    host.onGameStart(() => {
      router.push({
        pathname: '/game',
        params: {
          mode: 'ble-host',
          sb: String(sb),
          bb: String(bb),
          initialChips: String(initialChips),
          seat: '0',
        },
      });
    });
    host.onError((msg) => setError(msg));
    host.start();

    lobbyHost.current = host;
    return () => {
      host.stop();
    };
  }, []);

  const handleStartGame = () => {
    setError(null);
    lobbyHost.current?.startGame();
  };

  const handleClose = () => {
    lobbyHost.current?.stop();
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ロビー: {hostName}</Text>
      <Text style={styles.settings}>SB/BB: {sb}/{bb}  チップ: {initialChips}</Text>

      <View style={styles.playerList}>
        {Array.from({ length: MAX_SEATS }, (_, i) => {
          const player = players.find((p) => p.seat === i);
          return (
            <PlayerSlot
              key={i}
              seatNumber={i}
              player={player}
              isMe={i === 0}
            />
          );
        })}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          testID="host-start-game-btn"
          style={styles.startBtn}
          onPress={handleStartGame}
        >
          <Text style={styles.startBtnText}>ゲーム開始</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="host-close-btn"
          style={styles.closeBtn}
          onPress={handleClose}
        >
          <Text style={styles.closeBtnText}>ロビーを閉じる</Text>
        </TouchableOpacity>
      </View>
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
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 48,
  },
  settings: {
    color: Colors.subText,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  playerList: {
    marginBottom: 16,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  buttonRow: {
    gap: 12,
    marginTop: 16,
  },
  startBtn: {
    backgroundColor: Colors.pot,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startBtnText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeBtn: {
    borderWidth: 2,
    borderColor: Colors.subText,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: Colors.subText,
    fontSize: 16,
    fontWeight: '600',
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ui -- tests/ui/components/BleHostLobby.test.tsx --no-coverage`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/BleHostLobby.tsx tests/ui/components/BleHostLobby.test.tsx
git commit -m "feat(ui): add BleHostLobby waiting room component"
```

---

### Task 12: BleJoinLobby Component

**Files:**
- Create: `src/components/lobby/BleJoinLobby.tsx`
- Create: `tests/ui/components/BleJoinLobby.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/ui/components/BleJoinLobby.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { BleJoinLobby } from '../../../src/components/lobby/BleJoinLobby';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const mockClient = {
  startScanning: jest.fn().mockResolvedValue(undefined),
  connectToHost: jest.fn().mockResolvedValue(undefined),
  setReady: jest.fn(),
  disconnect: jest.fn().mockResolvedValue(undefined),
  onHostDiscovered: jest.fn(),
  onJoinResult: jest.fn(),
  onPlayersChanged: jest.fn(),
  onGameStart: jest.fn(),
  onDisconnected: jest.fn(),
  onError: jest.fn(),
  mySeat: 1,
};

jest.mock('../../../src/services/ble/LobbyClient', () => ({
  LobbyClient: jest.fn().mockImplementation(() => mockClient),
}));

jest.mock('../../../src/services/ble/MockBleTransport', () => ({
  MockBleClientTransport: jest.fn(),
}));

describe('BleJoinLobby', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.mySeat = 1;
  });

  it('starts scanning on mount', () => {
    render(<BleJoinLobby playerName="Alice" />);
    expect(mockClient.startScanning).toHaveBeenCalled();
  });

  it('shows scanning state initially', () => {
    render(<BleJoinLobby playerName="Alice" />);
    expect(screen.getByText('ホストを探しています...')).toBeTruthy();
  });

  it('displays discovered hosts', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onHostDiscovered = mockClient.onHostDiscovered.mock.calls[0][0];

    await act(async () => {
      onHostDiscovered('host-1', 'Room A');
    });

    expect(screen.getByText('Room A')).toBeTruthy();
  });

  it('connects to host when selected', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onHostDiscovered = mockClient.onHostDiscovered.mock.calls[0][0];

    await act(async () => {
      onHostDiscovered('host-1', 'Room A');
    });

    fireEvent.press(screen.getByText('Room A'));
    expect(mockClient.connectToHost).toHaveBeenCalledWith('host-1');
  });

  it('shows waiting state after successful join', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onJoinResult = mockClient.onJoinResult.mock.calls[0][0];

    await act(async () => {
      onJoinResult({
        accepted: true,
        gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
      });
    });

    expect(screen.getByText(/SB.*5/)).toBeTruthy();
    expect(screen.getByText(/BB.*10/)).toBeTruthy();
  });

  it('shows error and returns to scanning on join rejection', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onJoinResult = mockClient.onJoinResult.mock.calls[0][0];

    await act(async () => {
      onJoinResult({ accepted: false, reason: 'Room is full' });
    });

    expect(screen.getByText('Room is full')).toBeTruthy();
  });

  it('renders player slots when onPlayersChanged fires', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onJoinResult = mockClient.onJoinResult.mock.calls[0][0];
    const onPlayersChanged = mockClient.onPlayersChanged.mock.calls[0][0];

    await act(async () => {
      onJoinResult({
        accepted: true,
        gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
      });
    });

    await act(async () => {
      onPlayersChanged([
        { seat: 0, name: 'Host', ready: true },
        { seat: 1, name: 'Alice', ready: false },
      ]);
    });

    expect(screen.getByText('Host')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('calls setReady when Ready button is pressed', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onJoinResult = mockClient.onJoinResult.mock.calls[0][0];

    await act(async () => {
      onJoinResult({
        accepted: true,
        gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
      });
    });

    fireEvent.press(screen.getByTestId('join-ready-btn'));
    expect(mockClient.setReady).toHaveBeenCalled();
  });

  it('navigates to game when onGameStart fires', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onGameStart = mockClient.onGameStart.mock.calls[0][0];

    await act(async () => {
      onGameStart({ blinds: { sb: 5, bb: 10 }, initialChips: 1000 });
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/game',
      params: { mode: 'ble-client', sb: '5', bb: '10', initialChips: '1000', seat: '1' },
    });
  });

  it('shows disconnected state when host disconnects', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onDisconnected = mockClient.onDisconnected.mock.calls[0][0];

    await act(async () => {
      onDisconnected();
    });

    expect(screen.getByText('ホストが切断しました')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects ui -- tests/ui/components/BleJoinLobby.test.tsx --no-coverage`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement BleJoinLobby**

Create `src/components/lobby/BleJoinLobby.tsx`:

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../theme/colors';
import { LobbyPlayer, GameSettings } from '../../services/ble/LobbyProtocol';
import { LobbyClient } from '../../services/ble/LobbyClient';
import { MockBleClientTransport } from '../../services/ble/MockBleTransport';
import { PlayerSlot } from './PlayerSlot';
import { HostList } from './HostList';

type BleJoinLobbyProps = {
  playerName: string;
};

type Phase = 'scanning' | 'connecting' | 'waiting' | 'disconnected';

const MAX_SEATS = 4;

export function BleJoinLobby({ playerName }: BleJoinLobbyProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [hosts, setHosts] = useState<Map<string, string>>(new Map());
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [gameSettings, setGameSettings] = useState<GameSettings | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const lobbyClient = useRef<LobbyClient | null>(null);

  useEffect(() => {
    const transport = new MockBleClientTransport();
    const client = new LobbyClient(transport, playerName);

    client.onHostDiscovered((id, name) => {
      setHosts((prev) => new Map(prev).set(id, name));
    });

    client.onJoinResult((result) => {
      if (result.accepted) {
        setPhase('waiting');
        setGameSettings(result.gameSettings);
        setJoinError(null);
      } else {
        setJoinError(result.reason);
        setPhase('scanning');
      }
    });

    client.onPlayersChanged((p) => setPlayers(p));

    client.onGameStart((config) => {
      router.push({
        pathname: '/game',
        params: {
          mode: 'ble-client',
          sb: String(config.blinds.sb),
          bb: String(config.blinds.bb),
          initialChips: String(config.initialChips),
          seat: String(client.mySeat),
        },
      });
    });

    client.onDisconnected(() => setPhase('disconnected'));

    client.startScanning();
    lobbyClient.current = client;

    return () => {
      client.disconnect();
    };
  }, []);

  const handleSelectHost = (hostId: string) => {
    setPhase('connecting');
    lobbyClient.current?.connectToHost(hostId);
  };

  const handleReady = () => {
    lobbyClient.current?.setReady();
  };

  const handleBack = () => {
    lobbyClient.current?.disconnect();
    router.back();
  };

  if (phase === 'disconnected') {
    return (
      <View style={styles.container}>
        <Text style={styles.disconnectedText}>ホストが切断しました</Text>
        <TouchableOpacity
          testID="join-back-btn"
          style={styles.backBtn}
          onPress={handleBack}
        >
          <Text style={styles.backBtnText}>ロビーに戻る</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'scanning' || phase === 'connecting') {
    const hostList = Array.from(hosts.entries()).map(([id, name]) => ({ id, name }));
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>ゲームに参加</Text>

        {phase === 'connecting' && (
          <View style={styles.connectingRow}>
            <ActivityIndicator color={Colors.active} />
            <Text style={styles.connectingText}>接続中...</Text>
          </View>
        )}

        {joinError && <Text style={styles.errorText}>{joinError}</Text>}

        <HostList hosts={hostList} onSelect={handleSelectHost} />

        <TouchableOpacity
          testID="join-cancel-btn"
          style={styles.backBtn}
          onPress={handleBack}
        >
          <Text style={styles.backBtnText}>キャンセル</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // phase === 'waiting'
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ロビー待機中</Text>
      {gameSettings && (
        <Text style={styles.settings}>
          SB/BB: {gameSettings.sb}/{gameSettings.bb}  チップ: {gameSettings.initialChips}
        </Text>
      )}

      <View style={styles.playerList}>
        {Array.from({ length: MAX_SEATS }, (_, i) => {
          const player = players.find((p) => p.seat === i);
          return (
            <PlayerSlot
              key={i}
              seatNumber={i}
              player={player}
              isMe={player?.seat === lobbyClient.current?.mySeat}
            />
          );
        })}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          testID="join-ready-btn"
          style={styles.readyBtn}
          onPress={handleReady}
        >
          <Text style={styles.readyBtnText}>Ready</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="join-leave-btn"
          style={styles.backBtn}
          onPress={handleBack}
        >
          <Text style={styles.backBtnText}>退出</Text>
        </TouchableOpacity>
      </View>
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
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 48,
  },
  settings: {
    color: Colors.subText,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  connectingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  connectingText: {
    color: Colors.subText,
    fontSize: 14,
  },
  playerList: {
    marginBottom: 16,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  disconnectedText: {
    color: Colors.text,
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
    marginBottom: 24,
  },
  buttonRow: {
    gap: 12,
    marginTop: 16,
  },
  readyBtn: {
    backgroundColor: Colors.active,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  readyBtnText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  backBtn: {
    borderWidth: 2,
    borderColor: Colors.subText,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  backBtnText: {
    color: Colors.subText,
    fontSize: 16,
    fontWeight: '600',
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects ui -- tests/ui/components/BleJoinLobby.test.tsx --no-coverage`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/lobby/BleJoinLobby.tsx tests/ui/components/BleJoinLobby.test.tsx
git commit -m "feat(ui): add BleJoinLobby scan/connect/wait component"
```

---

### Task 13: Route Files & Layout Update

**Files:**
- Create: `app/ble-host.tsx`
- Create: `app/ble-join.tsx`
- Modify: `app/_layout.tsx`
- Modify: `app/game.tsx`

- [ ] **Step 1: Create ble-host route**

Create `app/ble-host.tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { BleHostLobby } from '../src/components/lobby/BleHostLobby';

export default function BleHostScreen() {
  const params = useLocalSearchParams<{
    hostName: string;
    sb: string;
    bb: string;
    initialChips: string;
  }>();

  return (
    <BleHostLobby
      hostName={params.hostName ?? 'Host'}
      sb={Number(params.sb ?? '5')}
      bb={Number(params.bb ?? '10')}
      initialChips={Number(params.initialChips ?? '1000')}
    />
  );
}
```

- [ ] **Step 2: Create ble-join route**

Create `app/ble-join.tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { BleJoinLobby } from '../src/components/lobby/BleJoinLobby';

export default function BleJoinScreen() {
  const params = useLocalSearchParams<{ playerName: string }>();

  return <BleJoinLobby playerName={params.playerName ?? 'Player'} />;
}
```

- [ ] **Step 3: Update _layout.tsx to register new routes**

In `app/_layout.tsx`, add the new screens to the Stack:

```tsx
<Stack
  screenOptions={{
    headerShown: false,
    contentStyle: { backgroundColor: Colors.background },
  }}
>
  <Stack.Screen name="index" />
  <Stack.Screen name="game" />
  <Stack.Screen name="ble-host" />
  <Stack.Screen name="ble-join" />
</Stack>
```

- [ ] **Step 4: Update game.tsx to accept BLE mode params**

In `app/game.tsx`, update the params type and add early return for BLE modes:

```tsx
export default function GameScreen() {
  const params = useLocalSearchParams<{
    playerNames?: string;
    initialChips: string;
    sb: string;
    bb: string;
    mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
    seat?: string;
  }>();

  const mode = params.mode ?? 'debug';

  // BLE game modes — placeholder until Doc 3 (BleGameService)
  if (mode === 'ble-host' || mode === 'ble-client') {
    return (
      <View style={styles.screen}>
        <Text style={styles.blePlaceholder}>BLEゲームモード（準備中）</Text>
      </View>
    );
  }
```

Also add `blePlaceholder` to the existing `StyleSheet.create` at the bottom of `game.tsx`:

```typescript
blePlaceholder: { color: Colors.text, textAlign: 'center', marginTop: 100, fontSize: 18 },

  const playerNames = JSON.parse(params.playerNames ?? '["P0","P1","P2"]');
  // ... rest of existing code unchanged
```

- [ ] **Step 5: Run all tests to verify nothing is broken**

Run: `npx jest --no-coverage`
Expected: ALL tests PASS across both engine and ui projects

- [ ] **Step 6: Commit**

```bash
git add app/ble-host.tsx app/ble-join.tsx app/_layout.tsx app/game.tsx
git commit -m "feat: add BLE lobby routes and update layout/game for BLE mode params"
```
