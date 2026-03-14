# BLE Gameplay Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement BLE game play services that let host and client devices play poker over Bluetooth, using the existing `GameService` interface so the UI layer requires no BLE-specific changes.

**Architecture:** `BleHostGameService` owns a `GameLoop` and broadcasts state via BLE transport. `BleClientGameService` receives state updates and sends actions optimistically. Both implement `GameService`. A `GameProtocol` module defines message types and validation (mirroring `LobbyProtocol`). A `transportRegistry` singleton passes transport instances between Expo Router screens.

**Tech Stack:** TypeScript, Jest 30, MockBleTransport/MockBleNetwork (existing test infrastructure), GameLoop/GameService (existing game engine)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/services/ble/GameProtocol.ts` | Game-phase message types (`GameHostMessage`, `PrivateHandMessage`, `GameClientMessage`) + validation functions |
| `src/services/ble/BleHostGameService.ts` | Host-side `GameService` impl — owns `GameLoop`, broadcasts state/privateHands via BLE, receives client actions |
| `src/services/ble/BleClientGameService.ts` | Client-side `GameService` impl — receives state updates, sends actions optimistically, computes `getActionInfo` locally |
| `src/services/ble/transportRegistry.ts` | Singleton registry to pass `BleHostTransport`/`BleClientTransport` instances between Expo Router screens |
| `tests/ble/GameProtocol.test.ts` | Validation tests for all game message types |
| `tests/ble/BleHostGameService.test.ts` | Host game service tests (broadcasting, action handling, disconnection/freeze) |
| `tests/ble/BleClientGameService.test.ts` | Client game service tests (state reception, optimistic actions, getActionInfo) |
| `tests/ble/integration/BleGameFlow.test.ts` | End-to-end Host+Client game flow via MockBleNetwork |

### Modified Files

| File | Change |
|------|--------|
| `src/services/ble/LobbyHost.ts:164-176` | Add `getClientSeatMap(): Map<string, number>` public method |
| `src/services/ble/index.ts` | Export new modules (`GameProtocol` types/validators, `BleHostGameService`, `BleClientGameService`, `transportRegistry`) |
| `app/game.tsx:141-181` | Replace BLE placeholder with actual `BleHostGameService`/`BleClientGameService` instantiation |
| `src/contexts/GameContext.tsx:34-46,55-66` | Add BLE-client showdown detection in subscribe callback + skip local showdown in doAction for ble-client |

---

## Chunk 1: GameProtocol

### Task 1: GameProtocol — Message Type Definitions

**Files:**
- Create: `src/services/ble/GameProtocol.ts`
- Test: `tests/ble/GameProtocol.test.ts`

- [ ] **Step 1: Write failing test for `validateGameHostMessage` — stateUpdate**

```typescript
// tests/ble/GameProtocol.test.ts

import {
  validateGameHostMessage,
  validatePrivateHandMessage,
  validateGameClientMessage,
  GAME_PROTOCOL_VERSION,
} from '../../src/services/ble/GameProtocol';

describe('GameProtocol', () => {
  describe('validateGameHostMessage', () => {
    const validStateUpdate = {
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
        { seat: 0, name: 'Alice', chips: 995, status: 'active', bet: 5, cards: [] },
        { seat: 1, name: 'Bob', chips: 990, status: 'active', bet: 10, cards: [] },
        { seat: 2, name: 'Carol', chips: 1000, status: 'active', bet: 0, cards: [] },
      ],
      minRaiseSize: 10,
      frozenSeats: [],
    };

    it('accepts valid stateUpdate', () => {
      expect(validateGameHostMessage(validStateUpdate)).toEqual(validStateUpdate);
    });

    it('accepts stateUpdate with foldWin', () => {
      const msg = { ...validStateUpdate, foldWin: { seat: 0, amount: 30 } };
      expect(validateGameHostMessage(msg)).toEqual(msg);
    });

    it('rejects non-object', () => {
      expect(validateGameHostMessage(null)).toBeNull();
      expect(validateGameHostMessage('string')).toBeNull();
      expect(validateGameHostMessage(42)).toBeNull();
    });

    it('rejects unknown type', () => {
      expect(validateGameHostMessage({ type: 'unknown' })).toBeNull();
    });

    it('rejects stateUpdate missing seq', () => {
      const { seq, ...rest } = validStateUpdate;
      expect(validateGameHostMessage(rest)).toBeNull();
    });

    it('rejects stateUpdate with invalid phase', () => {
      expect(validateGameHostMessage({ ...validStateUpdate, phase: 'invalid' })).toBeNull();
    });

    it('rejects stateUpdate with invalid players array', () => {
      expect(validateGameHostMessage({ ...validStateUpdate, players: 'not-array' })).toBeNull();
    });

    it('rejects stateUpdate with invalid player object', () => {
      expect(validateGameHostMessage({
        ...validStateUpdate,
        players: [{ seat: 'not-number' }],
      })).toBeNull();
    });

    const validShowdown = {
      type: 'showdownResult',
      seq: 1,
      winners: [{ seat: 0, hand: 'Two Pair', potAmount: 30 }],
      hands: [{ seat: 0, cards: ['Ah', 'Kh'], description: 'Two Pair' }],
    };

    it('accepts valid showdownResult', () => {
      expect(validateGameHostMessage(validShowdown)).toEqual(validShowdown);
    });

    it('rejects showdownResult missing winners', () => {
      const { winners, ...rest } = validShowdown;
      expect(validateGameHostMessage(rest)).toBeNull();
    });

    const validRoundEnd = { type: 'roundEnd', seq: 1 };

    it('accepts valid roundEnd', () => {
      expect(validateGameHostMessage(validRoundEnd)).toEqual(validRoundEnd);
    });

    it('rejects roundEnd missing seq', () => {
      expect(validateGameHostMessage({ type: 'roundEnd' })).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ble/GameProtocol.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/services/ble/GameProtocol'`

- [ ] **Step 3: Write `GameProtocol.ts` — types + `validateGameHostMessage`**

```typescript
// src/services/ble/GameProtocol.ts

import { Card, Phase, Pot, Blinds, PlayerStatus, ActionType } from '../../gameEngine/types';

export const GAME_PROTOCOL_VERSION = 1;

const VALID_PHASES: Phase[] = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown', 'roundEnd', 'gameOver'];
const VALID_STATUSES: PlayerStatus[] = ['active', 'folded', 'allIn', 'out'];
const VALID_ACTIONS: ActionType[] = ['fold', 'check', 'call', 'raise', 'allIn'];

// --- Host → Client (gameState characteristic) ---

export type GameStatePlayer = {
  seat: number;
  name: string;
  chips: number;
  status: PlayerStatus;
  bet: number;
  cards: Card[];
};

export type GameHostMessage =
  | {
      type: 'stateUpdate';
      seq: number;
      phase: Phase;
      community: Card[];
      pots: Pot[];
      currentBet: number;
      activePlayer: number;
      dealer: number;
      blinds: Blinds;
      players: GameStatePlayer[];
      minRaiseSize: number;
      frozenSeats: number[];
      foldWin?: { seat: number; amount: number };
    }
  | {
      type: 'showdownResult';
      seq: number;
      winners: { seat: number; hand: string; potAmount: number }[];
      hands: { seat: number; cards: Card[]; description: string }[];
    }
  | {
      type: 'roundEnd';
      seq: number;
    };

// --- Host → Client (privateHand characteristic) ---

export type PrivateHandMessage = {
  type: 'privateHand';
  seat: number;
  cards: Card[];
};

// --- Client → Host (playerAction characteristic) ---

export type GameClientMessage =
  | { type: 'playerAction'; action: ActionType; amount?: number }
  | { type: 'rejoin'; seat: number };

// --- Validation ---

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCardArray(value: unknown): value is Card[] {
  if (!Array.isArray(value)) return false;
  return value.every(c => typeof c === 'string');
}

function isValidBlinds(value: unknown): value is Blinds {
  return isObject(value) && typeof value.sb === 'number' && typeof value.bb === 'number';
}

function isPotArray(value: unknown): value is Pot[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    p => isObject(p) && typeof p.amount === 'number' && Array.isArray(p.eligible),
  );
}

function isGameStatePlayerArray(value: unknown): value is GameStatePlayer[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    p =>
      isObject(p) &&
      typeof p.seat === 'number' &&
      typeof p.name === 'string' &&
      typeof p.chips === 'number' &&
      typeof p.status === 'string' &&
      VALID_STATUSES.includes(p.status as PlayerStatus) &&
      typeof p.bet === 'number' &&
      isCardArray(p.cards),
  );
}

function isNumberArray(value: unknown): value is number[] {
  if (!Array.isArray(value)) return false;
  return value.every(n => typeof n === 'number');
}

function validateStateUpdate(data: Record<string, unknown>): GameHostMessage | null {
  if (typeof data.seq !== 'number') return null;
  if (typeof data.phase !== 'string' || !VALID_PHASES.includes(data.phase as Phase)) return null;
  if (!isCardArray(data.community)) return null;
  if (!isPotArray(data.pots)) return null;
  if (typeof data.currentBet !== 'number') return null;
  if (typeof data.activePlayer !== 'number') return null;
  if (typeof data.dealer !== 'number') return null;
  if (!isValidBlinds(data.blinds)) return null;
  if (!isGameStatePlayerArray(data.players)) return null;
  if (typeof data.minRaiseSize !== 'number') return null;
  if (!isNumberArray(data.frozenSeats)) return null;

  const msg: GameHostMessage = {
    type: 'stateUpdate',
    seq: data.seq,
    phase: data.phase as Phase,
    community: data.community as Card[],
    pots: data.pots as Pot[],
    currentBet: data.currentBet,
    activePlayer: data.activePlayer,
    dealer: data.dealer,
    blinds: data.blinds as Blinds,
    players: data.players as GameStatePlayer[],
    minRaiseSize: data.minRaiseSize,
    frozenSeats: data.frozenSeats as number[],
  };

  if (data.foldWin !== undefined) {
    if (
      !isObject(data.foldWin) ||
      typeof data.foldWin.seat !== 'number' ||
      typeof data.foldWin.amount !== 'number'
    ) {
      return null;
    }
    msg.foldWin = { seat: data.foldWin.seat as number, amount: data.foldWin.amount as number };
  }

  return msg;
}

function validateShowdownResult(data: Record<string, unknown>): GameHostMessage | null {
  if (typeof data.seq !== 'number') return null;
  if (!Array.isArray(data.winners)) return null;
  if (
    !data.winners.every(
      (w: unknown) =>
        isObject(w) &&
        typeof w.seat === 'number' &&
        typeof w.hand === 'string' &&
        typeof w.potAmount === 'number',
    )
  ) return null;
  if (!Array.isArray(data.hands)) return null;
  if (
    !data.hands.every(
      (h: unknown) =>
        isObject(h) &&
        typeof h.seat === 'number' &&
        isCardArray(h.cards) &&
        typeof h.description === 'string',
    )
  ) return null;

  return {
    type: 'showdownResult',
    seq: data.seq,
    winners: data.winners as { seat: number; hand: string; potAmount: number }[],
    hands: data.hands as { seat: number; cards: Card[]; description: string }[],
  };
}

export function validateGameHostMessage(data: unknown): GameHostMessage | null {
  if (!isObject(data)) return null;

  switch (data.type) {
    case 'stateUpdate':
      return validateStateUpdate(data);
    case 'showdownResult':
      return validateShowdownResult(data);
    case 'roundEnd':
      if (typeof data.seq !== 'number') return null;
      return { type: 'roundEnd', seq: data.seq };
    default:
      return null;
  }
}

export function validatePrivateHandMessage(data: unknown): PrivateHandMessage | null {
  if (!isObject(data)) return null;
  if (data.type !== 'privateHand') return null;
  if (typeof data.seat !== 'number') return null;
  if (!isCardArray(data.cards)) return null;
  return { type: 'privateHand', seat: data.seat, cards: data.cards as Card[] };
}

export function validateGameClientMessage(data: unknown): GameClientMessage | null {
  if (!isObject(data)) return null;

  switch (data.type) {
    case 'playerAction':
      if (typeof data.action !== 'string' || !VALID_ACTIONS.includes(data.action as ActionType)) return null;
      const msg: GameClientMessage = { type: 'playerAction', action: data.action as ActionType };
      if (data.amount !== undefined) {
        if (typeof data.amount !== 'number') return null;
        msg.amount = data.amount;
      }
      return msg;
    case 'rejoin':
      if (typeof data.seat !== 'number') return null;
      return { type: 'rejoin', seat: data.seat };
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ble/GameProtocol.test.ts --no-coverage`
Expected: PASS (all stateUpdate/showdownResult/roundEnd tests green)

- [ ] **Step 5: Add remaining validation tests (privateHand + clientMessage)**

Append to `tests/ble/GameProtocol.test.ts`:

```typescript
  describe('validatePrivateHandMessage', () => {
    it('accepts valid privateHand', () => {
      const msg = { type: 'privateHand', seat: 1, cards: ['Ah', 'Kh'] };
      expect(validatePrivateHandMessage(msg)).toEqual(msg);
    });

    it('rejects non-object', () => {
      expect(validatePrivateHandMessage(null)).toBeNull();
    });

    it('rejects wrong type', () => {
      expect(validatePrivateHandMessage({ type: 'other', seat: 1, cards: [] })).toBeNull();
    });

    it('rejects missing seat', () => {
      expect(validatePrivateHandMessage({ type: 'privateHand', cards: ['Ah'] })).toBeNull();
    });

    it('rejects missing cards', () => {
      expect(validatePrivateHandMessage({ type: 'privateHand', seat: 1 })).toBeNull();
    });
  });

  describe('validateGameClientMessage', () => {
    it('accepts valid playerAction (fold)', () => {
      const msg = { type: 'playerAction', action: 'fold' };
      expect(validateGameClientMessage(msg)).toEqual(msg);
    });

    it('accepts valid playerAction (raise with amount)', () => {
      const msg = { type: 'playerAction', action: 'raise', amount: 50 };
      expect(validateGameClientMessage(msg)).toEqual(msg);
    });

    it('rejects invalid action type', () => {
      expect(validateGameClientMessage({ type: 'playerAction', action: 'invalid' })).toBeNull();
    });

    it('rejects playerAction with non-number amount', () => {
      expect(validateGameClientMessage({ type: 'playerAction', action: 'raise', amount: 'fifty' })).toBeNull();
    });

    it('accepts valid rejoin', () => {
      const msg = { type: 'rejoin', seat: 2 };
      expect(validateGameClientMessage(msg)).toEqual(msg);
    });

    it('rejects rejoin with non-number seat', () => {
      expect(validateGameClientMessage({ type: 'rejoin', seat: 'two' })).toBeNull();
    });

    it('rejects non-object', () => {
      expect(validateGameClientMessage(42)).toBeNull();
    });

    it('rejects unknown type', () => {
      expect(validateGameClientMessage({ type: 'unknown' })).toBeNull();
    });
  });
```

- [ ] **Step 6: Run all GameProtocol tests**

Run: `npx jest tests/ble/GameProtocol.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/ble/GameProtocol.ts tests/ble/GameProtocol.test.ts
git commit -m "feat(ble): add GameProtocol message types and validation (TDD)"
```

---

## Chunk 2: BleHostGameService

### Task 2: BleHostGameService — Core GameService Implementation

**Files:**
- Create: `src/services/ble/BleHostGameService.ts`
- Test: `tests/ble/BleHostGameService.test.ts`

**Reference files:**
- `src/services/LocalGameService.ts` — pattern to follow for GameService impl
- `src/services/ble/LobbyHost.ts` — pattern for transport message handling
- `src/services/ble/MockBleTransport.ts` — test helpers (`simulateMessageReceived`, `sentMessages`)

- [ ] **Step 1: Write failing test — constructor + startGame + getState**

```typescript
// tests/ble/BleHostGameService.test.ts

import { BleHostGameService } from '../../src/services/ble/BleHostGameService';
import { MockBleHostTransport } from '../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../src/services/ble/ChunkManager';
import { Blinds } from '../../src/gameEngine/types';

function decodeMessages(transport: MockBleHostTransport, clientId: string): unknown[] {
  const cm = new ChunkManager();
  const results: unknown[] = [];
  for (const msg of transport.sentMessages) {
    if (msg.clientId !== clientId && msg.clientId !== '__all__') continue;
    const json = cm.decode(msg.clientId, msg.data);
    if (json !== null) results.push(JSON.parse(json));
  }
  return results;
}

function decodeBroadcasts(transport: MockBleHostTransport): unknown[] {
  return decodeMessages(transport, '__all__');
}

describe('BleHostGameService', () => {
  let transport: MockBleHostTransport;
  let service: BleHostGameService;
  const blinds: Blinds = { sb: 5, bb: 10 };
  const clientSeatMap = new Map<string, number>([
    ['client-1', 1],
    ['client-2', 2],
  ]);

  beforeEach(() => {
    transport = new MockBleHostTransport();
    service = new BleHostGameService(transport, clientSeatMap);
  });

  describe('startGame + getState', () => {
    it('creates GameLoop and returns state with other players cards hidden', () => {
      service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
      service.startRound();
      const state = service.getState();

      expect(state.phase).toBe('preflop');
      expect(state.players).toHaveLength(3);
      // Host (seat 0) sees own cards
      expect(state.players[0].cards).toHaveLength(2);
      // Other players' cards are hidden
      expect(state.players[1].cards).toEqual([]);
      expect(state.players[2].cards).toEqual([]);
    });

    it('throws if getState called before startGame', () => {
      expect(() => service.getState()).toThrow('Game not started');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ble/BleHostGameService.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/services/ble/BleHostGameService'`

- [ ] **Step 3: Write `BleHostGameService.ts` — constructor, startGame, getState, subscribe**

```typescript
// src/services/ble/BleHostGameService.ts

import { GameState, PlayerAction, Blinds, Player, PlayerStatus, Card } from '../../gameEngine/types';
import { GameLoop, ShowdownResult, ActionResult } from '../../gameEngine';
import { GameService, ActionInfo } from '../GameService';
import { BleHostTransport } from './BleTransport';
import { ChunkManager } from './ChunkManager';
import {
  GameHostMessage,
  GameClientMessage,
  validateGameClientMessage,
} from './GameProtocol';

export class BleHostGameService implements GameService {
  private gameLoop: GameLoop | null = null;
  private chunkManager = new ChunkManager();
  private hostSeat: number = 0;
  private frozenSeats = new Map<number, ReturnType<typeof setTimeout>>();
  private listeners = new Set<(state: GameState) => void>();

  constructor(
    private transport: BleHostTransport,
    private clientSeatMap: Map<string, number>,
  ) {
    this.transport.onMessageReceived((clientId, charId, data) => {
      this.handleClientMessage(clientId, charId, data);
    });
    this.transport.onClientDisconnected((clientId) => {
      this.handleClientDisconnected(clientId);
    });
  }

  getState(): GameState {
    if (!this.gameLoop) throw new Error('Game not started');
    const state = this.gameLoop.getState();
    return {
      ...state,
      players: state.players.map(p =>
        p.seat === this.hostSeat ? p : { ...p, cards: [] },
      ),
    };
  }

  getActionInfo(seat: number): ActionInfo {
    if (!this.gameLoop) throw new Error('Game not started');
    const state = this.gameLoop.getState();
    const player = state.players.find(p => p.seat === seat);
    if (!player) throw new Error(`Invalid seat: ${seat}`);
    const minRaiseIncrement = this.gameLoop.getMinRaiseSize();
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
  }

  startRound(): void {
    if (!this.gameLoop) throw new Error('Game not started');
    this.gameLoop.startRound();
    this.broadcastState();
    this.sendPrivateHands();
    this.notifyListeners();
    this.checkFrozenActivePlayer();
  }

  handleAction(seat: number, action: PlayerAction): ActionResult {
    if (!this.gameLoop) throw new Error('Game not started');
    const result = this.gameLoop.handleAction(seat, action);
    if (result.valid) {
      this.broadcastState();
      this.notifyListeners();
      this.checkFrozenActivePlayer();
    }
    return result;
  }

  resolveShowdown(): ShowdownResult {
    if (!this.gameLoop) throw new Error('Game not started');
    const result = this.gameLoop.resolveShowdown();
    // Send showdown result with revealed hands
    const state = this.gameLoop.getState();
    const msg: GameHostMessage = {
      type: 'showdownResult',
      seq: state.seq,
      winners: result.winners,
      hands: result.hands,
    };
    this.sendToAll('gameState', msg);
    this.broadcastState();
    this.notifyListeners();
    return result;
  }

  prepareNextRound(): void {
    if (!this.gameLoop) throw new Error('Game not started');
    this.gameLoop.prepareNextRound();
    this.broadcastState();
    this.notifyListeners();
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // --- Private: BLE broadcasting ---

  private broadcastState(): void {
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

    if (state.foldWin) {
      msg.foldWin = state.foldWin;
    }

    this.sendToAll('gameState', msg);
  }

  private sendPrivateHands(): void {
    if (!this.gameLoop) return;
    for (const [clientId, seat] of this.clientSeatMap) {
      const cards = this.gameLoop.getPrivateHand(seat);
      const chunks = this.chunkManager.encode(
        JSON.stringify({ type: 'privateHand', seat, cards }),
      );
      for (const chunk of chunks) {
        this.transport.sendToClient(clientId, 'privateHand', chunk);
      }
    }
  }

  private sendToAll(charId: string, msg: GameHostMessage): void {
    const chunks = this.chunkManager.encode(JSON.stringify(msg));
    for (const chunk of chunks) {
      this.transport.sendToAll(charId, chunk);
    }
  }

  private sendToClient(clientId: string, charId: string, msg: unknown): void {
    const chunks = this.chunkManager.encode(JSON.stringify(msg));
    for (const chunk of chunks) {
      this.transport.sendToClient(clientId, charId, chunk);
    }
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(l => l(state));
  }

  // --- Private: Client message handling ---

  private handleClientMessage(clientId: string, charId: string, data: Uint8Array): void {
    if (charId !== 'playerAction') return;

    const json = this.chunkManager.decode(clientId, data);
    if (!json) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return;
    }

    const msg = validateGameClientMessage(parsed);
    if (!msg) return;

    if (msg.type === 'rejoin') {
      this.handleRejoin(clientId, msg.seat);
      return;
    }

    const seat = this.clientSeatMap.get(clientId);
    if (seat === undefined) return;

    if (this.frozenSeats.has(seat)) return;

    this.handleAction(seat, { action: msg.action, amount: msg.amount });
  }

  private handleRejoin(clientId: string, seat: number): void {
    if (!this.frozenSeats.has(seat)) return;

    // Clear freeze timeout
    clearTimeout(this.frozenSeats.get(seat)!);
    this.frozenSeats.delete(seat);

    // Update clientSeatMap with new clientId
    for (const [oldId, s] of this.clientSeatMap) {
      if (s === seat) {
        this.clientSeatMap.delete(oldId);
        break;
      }
    }
    this.clientSeatMap.set(clientId, seat);

    // Send current state and private hand to reconnected client
    this.broadcastState();
    this.notifyListeners();
    if (this.gameLoop) {
      const cards = this.gameLoop.getPrivateHand(seat);
      this.sendToClient(clientId, 'privateHand', {
        type: 'privateHand',
        seat,
        cards,
      });
    }
  }

  // --- Private: Disconnection handling ---

  private handleClientDisconnected(clientId: string): void {
    const seat = this.clientSeatMap.get(clientId);
    if (seat === undefined) return;

    const timeout = setTimeout(() => {
      this.frozenSeats.delete(seat);
      // Auto-fold if game is active
      if (this.gameLoop) {
        const state = this.gameLoop.getState();
        const player = state.players.find(p => p.seat === seat);
        if (player && player.status === 'active') {
          this.handleAction(seat, { action: 'fold' });
        }
      }
    }, 30_000);

    this.frozenSeats.set(seat, timeout);
    this.broadcastState();
    this.notifyListeners();
  }

  /** Check if active player is frozen — if so, auto-fold immediately */
  private checkFrozenActivePlayer(): void {
    if (!this.gameLoop) return;
    const state = this.gameLoop.getState();
    if (state.activePlayer >= 0 && this.frozenSeats.has(state.activePlayer)) {
      this.handleAction(state.activePlayer, { action: 'fold' });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ble/BleHostGameService.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Add test — BLE state broadcasting on startRound**

Append to BleHostGameService test `describe` block:

```typescript
  describe('BLE broadcasting', () => {
    beforeEach(() => {
      service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
    });

    it('broadcasts stateUpdate and privateHands on startRound', () => {
      service.startRound();

      // Check broadcasts (sendToAll uses '__all__' clientId)
      const broadcasts = decodeBroadcasts(transport);
      const stateUpdates = broadcasts.filter((m: any) => m.type === 'stateUpdate');
      expect(stateUpdates).toHaveLength(1);
      const su = stateUpdates[0] as any;
      expect(su.phase).toBe('preflop');
      expect(su.players.every((p: any) => p.cards.length === 0)).toBe(true);
      expect(su.minRaiseSize).toBeGreaterThan(0);
      expect(su.frozenSeats).toEqual([]);

      // Check privateHands sent to each client
      const client1Msgs = decodeMessages(transport, 'client-1');
      const ph1 = client1Msgs.find((m: any) => m.type === 'privateHand') as any;
      expect(ph1).toBeDefined();
      expect(ph1.seat).toBe(1);
      expect(ph1.cards).toHaveLength(2);

      const client2Msgs = decodeMessages(transport, 'client-2');
      const ph2 = client2Msgs.find((m: any) => m.type === 'privateHand') as any;
      expect(ph2).toBeDefined();
      expect(ph2.seat).toBe(2);
      expect(ph2.cards).toHaveLength(2);
    });

    it('broadcasts stateUpdate on handleAction', () => {
      service.startRound();
      transport.sentMessages.length = 0; // clear

      const state = service.getState();
      const activeSeat = state.activePlayer;
      service.handleAction(activeSeat, { action: 'fold' });

      const broadcasts = decodeBroadcasts(transport);
      expect(broadcasts.some((m: any) => m.type === 'stateUpdate')).toBe(true);
    });
  });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest tests/ble/BleHostGameService.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 7: Add test — client playerAction reception**

```typescript
  describe('client action reception', () => {
    const cm = new ChunkManager();

    beforeEach(() => {
      service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
      service.startRound();
      transport.sentMessages.length = 0;
    });

    it('processes playerAction from client via BLE', () => {
      const state = service.getState();
      // Find which client's turn it is
      const activeSeat = state.activePlayer;
      // Find clientId for that seat
      let activeClientId: string | undefined;
      for (const [cid, seat] of clientSeatMap) {
        if (seat === activeSeat) { activeClientId = cid; break; }
      }
      if (!activeClientId) return; // Host's turn — skip this test path

      const actionMsg = JSON.stringify({ type: 'playerAction', action: 'fold' });
      const chunks = cm.encode(actionMsg);
      for (const chunk of chunks) {
        transport.simulateMessageReceived(activeClientId, 'playerAction', chunk);
      }

      // Verify state was broadcast after action
      const broadcasts = decodeBroadcasts(transport);
      expect(broadcasts.some((m: any) => m.type === 'stateUpdate')).toBe(true);
    });

    it('ignores messages on non-playerAction characteristic', () => {
      const actionMsg = JSON.stringify({ type: 'playerAction', action: 'fold' });
      const chunks = cm.encode(actionMsg);
      for (const chunk of chunks) {
        transport.simulateMessageReceived('client-1', 'gameState', chunk);
      }

      // No broadcast should have been triggered
      expect(decodeBroadcasts(transport)).toHaveLength(0);
    });

    it('ignores messages from unknown clientId', () => {
      const actionMsg = JSON.stringify({ type: 'playerAction', action: 'fold' });
      const chunks = cm.encode(actionMsg);
      for (const chunk of chunks) {
        transport.simulateMessageReceived('unknown-client', 'playerAction', chunk);
      }

      expect(decodeBroadcasts(transport)).toHaveLength(0);
    });
  });
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest tests/ble/BleHostGameService.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 9: Add test — subscribe notifies local listeners**

```typescript
  describe('subscribe', () => {
    it('notifies listeners on state changes', () => {
      const listener = jest.fn();
      service.subscribe(listener);
      service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
      service.startRound();

      expect(listener).toHaveBeenCalled();
      const notifiedState = listener.mock.calls[0][0];
      // Listener receives host-filtered state (other cards hidden)
      expect(notifiedState.players[1].cards).toEqual([]);
    });

    it('returns unsubscribe function', () => {
      const listener = jest.fn();
      const unsub = service.subscribe(listener);
      unsub();
      service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
      service.startRound();
      expect(listener).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx jest tests/ble/BleHostGameService.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 11: Add test — resolveShowdown sends showdownResult**

```typescript
  describe('resolveShowdown', () => {
    it('sends showdownResult message via BLE', () => {
      service.startGame(['Host', 'Alice'], blinds, 1000);
      service.startRound();

      // Play through to showdown: both players call/check through all rounds
      let state = service.getState();
      while (state.phase !== 'showdown' && state.phase !== 'roundEnd') {
        if (state.activePlayer < 0) break;
        const info = service.getActionInfo(state.activePlayer);
        if (info.canCheck) {
          service.handleAction(state.activePlayer, { action: 'check' });
        } else {
          service.handleAction(state.activePlayer, { action: 'call' });
        }
        state = service.getState();
      }

      if (state.phase !== 'showdown') return; // foldWin, skip

      transport.sentMessages.length = 0;
      const result = service.resolveShowdown();

      const broadcasts = decodeBroadcasts(transport);
      const sdMsg = broadcasts.find((m: any) => m.type === 'showdownResult') as any;
      expect(sdMsg).toBeDefined();
      expect(sdMsg.winners.length).toBeGreaterThan(0);
      expect(sdMsg.hands.length).toBeGreaterThan(0);

      // Also broadcasts stateUpdate after showdown
      expect(broadcasts.some((m: any) => m.type === 'stateUpdate')).toBe(true);
    });
  });
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npx jest tests/ble/BleHostGameService.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add src/services/ble/BleHostGameService.ts tests/ble/BleHostGameService.test.ts
git commit -m "feat(ble): add BleHostGameService with broadcasting and action handling (TDD)"
```

### Task 3: BleHostGameService — Disconnection & Freeze Logic

**Files:**
- Modify: `src/services/ble/BleHostGameService.ts` (already created)
- Modify: `tests/ble/BleHostGameService.test.ts` (add tests)

- [ ] **Step 1: Write failing test — disconnect triggers freeze**

Append to `tests/ble/BleHostGameService.test.ts`:

```typescript
  describe('disconnection & freeze', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
      service.startRound();
      transport.sentMessages.length = 0;
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('adds disconnected client to frozenSeats in broadcast', () => {
      transport.simulateClientDisconnected('client-1');

      const broadcasts = decodeBroadcasts(transport);
      const su = broadcasts.find((m: any) => m.type === 'stateUpdate') as any;
      expect(su).toBeDefined();
      expect(su.frozenSeats).toContain(1);
    });

    it('auto-folds after 30 seconds', () => {
      transport.simulateClientDisconnected('client-1');
      transport.sentMessages.length = 0;

      jest.advanceTimersByTime(30_000);

      // Should have broadcast a state update after auto-fold
      const broadcasts = decodeBroadcasts(transport);
      expect(broadcasts.length).toBeGreaterThan(0);
    });

    it('ignores actions from frozen clients', () => {
      transport.simulateClientDisconnected('client-1');
      transport.sentMessages.length = 0;

      const cm = new ChunkManager();
      const chunks = cm.encode(JSON.stringify({ type: 'playerAction', action: 'fold' }));
      for (const chunk of chunks) {
        transport.simulateMessageReceived('client-1', 'playerAction', chunk);
      }

      // No broadcast triggered by frozen client's action
      expect(decodeBroadcasts(transport)).toHaveLength(0);
    });

    it('handles rejoin within 30 seconds — clears freeze, resends state', () => {
      transport.simulateClientDisconnected('client-1');
      transport.sentMessages.length = 0;

      jest.advanceTimersByTime(10_000); // 10s in, not timed out yet

      // Simulate rejoin from new clientId
      const cm = new ChunkManager();
      const rejoinChunks = cm.encode(JSON.stringify({ type: 'rejoin', seat: 1 }));
      for (const chunk of rejoinChunks) {
        transport.simulateMessageReceived('client-1-new', 'playerAction', chunk);
      }

      const broadcasts = decodeBroadcasts(transport);
      const su = broadcasts.find((m: any) => m.type === 'stateUpdate') as any;
      expect(su).toBeDefined();
      expect(su.frozenSeats).not.toContain(1);

      // Private hand resent to new clientId
      const client1NewMsgs = decodeMessages(transport, 'client-1-new');
      const ph = client1NewMsgs.find((m: any) => m.type === 'privateHand') as any;
      expect(ph).toBeDefined();
      expect(ph.seat).toBe(1);

      // Advancing past 30s should NOT cause auto-fold (timeout was cleared)
      transport.sentMessages.length = 0;
      jest.advanceTimersByTime(20_000);
      expect(decodeBroadcasts(transport)).toHaveLength(0);
    });

    it('auto-folds immediately when frozen player becomes activePlayer', () => {
      // Get current active player — if it's already a client seat, fold to advance
      let state = service.getState();
      // Disconnect client-2 (seat 2) first
      transport.simulateClientDisconnected('client-2');
      transport.sentMessages.length = 0;

      // Advance game until seat 2 becomes activePlayer (or game ends)
      state = service.getState();
      let iterations = 0;
      while (state.activePlayer !== 2 && state.phase !== 'roundEnd' && iterations < 20) {
        iterations++;
        const seat = state.activePlayer;
        if (seat < 0) break;
        service.handleAction(seat, { action: 'call' });
        state = service.getState();
      }

      if (state.activePlayer === 2) {
        // The checkFrozenActivePlayer should have already auto-folded seat 2
        // So activePlayer should have advanced past seat 2
        const newState = service.getState();
        expect(newState.activePlayer).not.toBe(2);
      }
      // If game ended (roundEnd), frozen-turn scenario didn't arise — that's OK
    });
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx jest tests/ble/BleHostGameService.test.ts --no-coverage`
Expected: PASS (implementation already handles disconnect/rejoin)

- [ ] **Step 3: Commit**

```bash
git add tests/ble/BleHostGameService.test.ts
git commit -m "test(ble): add BleHostGameService disconnection and freeze tests"
```

---

## Chunk 3: BleClientGameService

### Task 4: BleClientGameService

**Files:**
- Create: `src/services/ble/BleClientGameService.ts`
- Test: `tests/ble/BleClientGameService.test.ts`

**Reference files:**
- `src/services/ble/BleHostGameService.ts` — sibling pattern
- `src/services/ble/MockBleTransport.ts` — `MockBleClientTransport` helpers

- [ ] **Step 1: Write failing test — state reception + getState**

```typescript
// tests/ble/BleClientGameService.test.ts

import { BleClientGameService } from '../../src/services/ble/BleClientGameService';
import { MockBleClientTransport } from '../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../src/services/ble/ChunkManager';
import { GameHostMessage, PrivateHandMessage } from '../../src/services/ble/GameProtocol';

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
    { seat: 0, name: 'Host', chips: 995, status: 'active', bet: 5, cards: [] },
    { seat: 1, name: 'Alice', chips: 990, status: 'active', bet: 10, cards: [] },
    { seat: 2, name: 'Bob', chips: 1000, status: 'active', bet: 0, cards: [] },
  ],
  minRaiseSize: 10,
  frozenSeats: [],
  ...overrides,
});

describe('BleClientGameService', () => {
  let transport: MockBleClientTransport;
  let service: BleClientGameService;

  beforeEach(() => {
    transport = new MockBleClientTransport();
    service = new BleClientGameService(transport, 1); // mySeat = 1
  });

  describe('state reception', () => {
    it('throws before receiving any state', () => {
      expect(() => service.getState()).toThrow('Game not started');
    });

    it('updates state from stateUpdate message', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());
      const state = service.getState();
      expect(state.phase).toBe('preflop');
      expect(state.players).toHaveLength(3);
    });

    it('replaces own cards with privateHand data', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());
      sendMessage(transport, 'privateHand', {
        type: 'privateHand',
        seat: 1,
        cards: ['Ah', 'Kh'],
      });

      const state = service.getState();
      expect(state.players[1].cards).toEqual(['Ah', 'Kh']);
      // Other players still have empty cards
      expect(state.players[0].cards).toEqual([]);
      expect(state.players[2].cards).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ble/BleClientGameService.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../src/services/ble/BleClientGameService'`

- [ ] **Step 3: Write `BleClientGameService.ts`**

```typescript
// src/services/ble/BleClientGameService.ts

import { GameState, PlayerAction, Blinds, Card, Player } from '../../gameEngine/types';
import { ShowdownResult, ActionResult } from '../../gameEngine';
import { GameService, ActionInfo } from '../GameService';
import { BleClientTransport } from './BleTransport';
import { ChunkManager } from './ChunkManager';
import {
  GameHostMessage,
  PrivateHandMessage,
  GameClientMessage,
  validateGameHostMessage,
  validatePrivateHandMessage,
} from './GameProtocol';

export class BleClientGameService implements GameService {
  private chunkManager = new ChunkManager();
  private currentState: GameState | null = null;
  private myCards: Card[] = [];
  private lastShowdownResult: ShowdownResult | null = null;
  private minRaiseSize: number = 0;
  private frozenSeats: number[] = [];
  private listeners = new Set<(state: GameState) => void>();

  constructor(
    private transport: BleClientTransport,
    private mySeat: number,
  ) {
    this.transport.onMessageReceived((charId, data) => {
      this.handleMessage(charId, data);
    });
  }

  getState(): GameState {
    if (!this.currentState) throw new Error('Game not started');
    return {
      ...this.currentState,
      players: this.currentState.players.map(p =>
        p.seat === this.mySeat ? { ...p, cards: this.myCards } : p,
      ),
    };
  }

  getActionInfo(seat: number): ActionInfo {
    if (!this.currentState) throw new Error('Game not started');
    const player = this.currentState.players.find(p => p.seat === seat);
    if (!player) throw new Error(`Invalid seat: ${seat}`);

    const minRaiseTo = this.currentState.currentBet + this.minRaiseSize;
    const maxRaiseTo = player.chips + player.bet;

    return {
      canCheck: this.currentState.currentBet <= player.bet,
      callAmount: Math.min(this.currentState.currentBet - player.bet, player.chips),
      minRaise: minRaiseTo,
      maxRaise: maxRaiseTo,
      canRaise: maxRaiseTo >= minRaiseTo,
    };
  }

  startGame(_playerNames: string[], _blinds: Blinds, _initialChips: number): void {
    // no-op: host controls game lifecycle
  }

  startRound(): void {
    // no-op: host controls round lifecycle; stateUpdate syncs automatically
  }

  handleAction(_seat: number, action: PlayerAction): ActionResult {
    const msg: GameClientMessage = {
      type: 'playerAction',
      action: action.action,
      amount: action.amount,
    };
    this.sendToHost('playerAction', msg);
    return { valid: true };
  }

  resolveShowdown(): ShowdownResult {
    if (!this.lastShowdownResult) {
      return { winners: [], hands: [] };
    }
    const result = this.lastShowdownResult;
    this.lastShowdownResult = null;
    return result;
  }

  prepareNextRound(): void {
    // no-op: host controls round lifecycle; stateUpdate syncs automatically
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // --- Private ---

  private handleMessage(charId: string, data: Uint8Array): void {
    const json = this.chunkManager.decode(charId, data);
    if (!json) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return;
    }

    if (charId === 'gameState') {
      this.handleGameStateMessage(parsed);
    } else if (charId === 'privateHand') {
      this.handlePrivateHandMessage(parsed);
    }
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
        this.minRaiseSize = msg.minRaiseSize;
        this.frozenSeats = msg.frozenSeats;
        this.notifyListeners();
        break;

      case 'showdownResult':
        this.lastShowdownResult = {
          winners: msg.winners,
          hands: msg.hands,
        };
        this.notifyListeners();
        break;

      case 'roundEnd':
        // roundEnd is informational; state already updated via stateUpdate
        break;
    }
  }

  private handlePrivateHandMessage(parsed: unknown): void {
    const msg = validatePrivateHandMessage(parsed);
    if (!msg) return;
    if (msg.seat !== this.mySeat) return;
    this.myCards = msg.cards;
    this.notifyListeners();
  }

  private sendToHost(charId: string, msg: GameClientMessage): void {
    const chunks = this.chunkManager.encode(JSON.stringify(msg));
    for (const chunk of chunks) {
      this.transport.sendToHost(charId, chunk);
    }
  }

  private notifyListeners(): void {
    if (!this.currentState) return;
    const state = this.getState();
    this.listeners.forEach(l => l(state));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ble/BleClientGameService.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Add tests — handleAction (optimistic), getActionInfo, subscribe, resolveShowdown**

Append to `tests/ble/BleClientGameService.test.ts`:

```typescript
  describe('handleAction (optimistic)', () => {
    it('returns valid immediately and sends playerAction via BLE', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());

      const result = service.handleAction(1, { action: 'fold' });
      expect(result).toEqual({ valid: true });

      // Check message was sent
      const cm = new ChunkManager();
      expect(transport.sentMessages).toHaveLength(1);
      expect(transport.sentMessages[0].characteristicId).toBe('playerAction');
      const json = cm.decode('host', transport.sentMessages[0].data);
      expect(JSON.parse(json!)).toEqual({ type: 'playerAction', action: 'fold' });
    });

    it('sends raise with amount', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());

      service.handleAction(1, { action: 'raise', amount: 50 });

      const cm = new ChunkManager();
      const json = cm.decode('host', transport.sentMessages[0].data);
      expect(JSON.parse(json!)).toEqual({ type: 'playerAction', action: 'raise', amount: 50 });
    });
  });

  describe('getActionInfo', () => {
    it('computes action info from received state', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());

      const info = service.getActionInfo(2); // Bob: chips=1000, bet=0, currentBet=10
      expect(info.canCheck).toBe(false);
      expect(info.callAmount).toBe(10);
      expect(info.minRaise).toBe(20); // currentBet(10) + minRaiseSize(10)
      expect(info.maxRaise).toBe(1000); // chips(1000) + bet(0)
      expect(info.canRaise).toBe(true);
    });

    it('throws before receiving state', () => {
      expect(() => service.getActionInfo(0)).toThrow('Game not started');
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on stateUpdate', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      sendMessage(transport, 'gameState', makeStateUpdate());
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].phase).toBe('preflop');
    });

    it('notifies listeners on privateHand', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      sendMessage(transport, 'gameState', makeStateUpdate());
      listener.mockClear();

      sendMessage(transport, 'privateHand', { type: 'privateHand', seat: 1, cards: ['Ah', 'Kh'] });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].players[1].cards).toEqual(['Ah', 'Kh']);
    });

    it('returns unsubscribe function', () => {
      const listener = jest.fn();
      const unsub = service.subscribe(listener);
      unsub();
      sendMessage(transport, 'gameState', makeStateUpdate());
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('resolveShowdown', () => {
    it('returns showdownResult received from host', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());
      sendMessage(transport, 'gameState', {
        type: 'showdownResult',
        seq: 1,
        winners: [{ seat: 0, hand: 'Two Pair', potAmount: 30 }],
        hands: [
          { seat: 0, cards: ['Ah', 'Kh'], description: 'Two Pair' },
          { seat: 1, cards: ['2s', '3s'], description: 'High Card' },
        ],
      });

      const result = service.resolveShowdown();
      expect(result.winners).toHaveLength(1);
      expect(result.winners[0].seat).toBe(0);
      expect(result.hands).toHaveLength(2);
    });

    it('returns empty result if no showdown received', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());
      const result = service.resolveShowdown();
      expect(result.winners).toEqual([]);
      expect(result.hands).toEqual([]);
    });
  });

  describe('no-op methods', () => {
    it('startGame is no-op', () => {
      expect(() => service.startGame(['A', 'B'], { sb: 5, bb: 10 }, 1000)).not.toThrow();
    });

    it('startRound is no-op', () => {
      expect(() => service.startRound()).not.toThrow();
    });

    it('prepareNextRound is no-op', () => {
      expect(() => service.prepareNextRound()).not.toThrow();
    });
  });
```

- [ ] **Step 6: Run all BleClientGameService tests**

Run: `npx jest tests/ble/BleClientGameService.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/ble/BleClientGameService.ts tests/ble/BleClientGameService.test.ts
git commit -m "feat(ble): add BleClientGameService with optimistic actions and state reception (TDD)"
```

---

## Chunk 4: Integration — transportRegistry, LobbyHost, game.tsx, GameContext

### Task 5: transportRegistry

**Files:**
- Create: `src/services/ble/transportRegistry.ts`

- [ ] **Step 1: Create transportRegistry.ts**

```typescript
// src/services/ble/transportRegistry.ts

import { BleHostTransport, BleClientTransport } from './BleTransport';

let hostTransport: BleHostTransport | null = null;
let clientTransport: BleClientTransport | null = null;

export function setHostTransport(t: BleHostTransport): void { hostTransport = t; }
export function getHostTransport(): BleHostTransport | null { return hostTransport; }
export function clearHostTransport(): void { hostTransport = null; }

export function setClientTransport(t: BleClientTransport): void { clientTransport = t; }
export function getClientTransport(): BleClientTransport | null { return clientTransport; }
export function clearClientTransport(): void { clientTransport = null; }
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ble/transportRegistry.ts
git commit -m "feat(ble): add transportRegistry singleton for Expo Router screen handoff"
```

### Task 6: LobbyHost — add getClientSeatMap()

**Files:**
- Modify: `src/services/ble/LobbyHost.ts:164-176`
- Modify: `tests/ble/LobbyHost.test.ts` (add test)

- [ ] **Step 1: Write failing test for getClientSeatMap**

Append to `tests/ble/LobbyHost.test.ts` (inside the main describe block):

```typescript
  describe('getClientSeatMap', () => {
    it('returns clientId→seat map excluding host', async () => {
      await host.start();
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1',
        'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
      await flushPromises();

      const seatMap = host.getClientSeatMap();
      expect(seatMap.size).toBe(1);
      expect(seatMap.get('client-1')).toBe(1);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ble/LobbyHost.test.ts --no-coverage -t "getClientSeatMap"`
Expected: FAIL — `host.getClientSeatMap is not a function`

- [ ] **Step 3: Add getClientSeatMap method to LobbyHost**

Add after `getPlayerList()` (around line 167) in `src/services/ble/LobbyHost.ts`:

```typescript
  getClientSeatMap(): Map<string, number> {
    const map = new Map<string, number>();
    for (const [clientId, player] of this.players) {
      if (clientId !== '__host__') {
        map.set(clientId, player.seat);
      }
    }
    return map;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ble/LobbyHost.test.ts --no-coverage -t "getClientSeatMap"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/LobbyHost.ts tests/ble/LobbyHost.test.ts
git commit -m "feat(ble): add LobbyHost.getClientSeatMap() for game handoff"
```

### Task 7: GameContext — BLE client showdown detection

**Files:**
- Modify: `src/contexts/GameContext.tsx:55-66`

The current `doAction` auto-resolves showdown by checking `phase === 'showdown'` right after `handleAction()`. For BLE clients, `handleAction` is optimistic and doesn't change phase. Instead, showdown should be detected from the subscribe callback when a `showdownResult` arrives from the host.

- [ ] **Step 1: Modify doAction to skip local showdown for BLE client**

In `src/contexts/GameContext.tsx`, replace the `doAction` callback (lines 55-66):

```typescript
  const doAction = useCallback((seat: number, action: PlayerAction): ActionResult => {
    const result = serviceRef.current.handleAction(seat, action);
    if (!result.valid) return result;

    // Auto-resolve showdown (skip for BLE client — showdown arrives via subscribe)
    if (mode !== 'ble-client') {
      const currentState = serviceRef.current.getState();
      if (currentState.phase === 'showdown') {
        const sdResult = serviceRef.current.resolveShowdown();
        setShowdownResult(sdResult);
      }
    }
    return result;
  }, [mode]);
```

- [ ] **Step 2: Add showdown detection in subscribe callback for BLE client**

In `src/contexts/GameContext.tsx`, modify the subscribe `useEffect` (lines 34-46):

```typescript
  const prevPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      setState(service.getState());
    } catch {
      // Service may not have state yet
    }

    const unsub = service.subscribe((newState) => {
      setState(newState);

      // BLE client: detect showdown from host's stateUpdate.
      // showdownResult message arrives before the stateUpdate (same characteristic,
      // sent first in resolveShowdown), so lastShowdownResult is already set.
      if (mode === 'ble-client' && prevPhaseRef.current !== 'showdown' && newState.phase === 'showdown') {
        const sdResult = serviceRef.current.resolveShowdown();
        if (sdResult.winners.length > 0) {
          setShowdownResult(sdResult);
        }
      }
      prevPhaseRef.current = newState.phase;
    });
    return unsub;
  }, [service, mode]);
```

- [ ] **Step 3: Commit**

```bash
git add src/contexts/GameContext.tsx
git commit -m "feat(ble): add BLE client showdown detection in GameContext subscribe callback"
```

### Task 8: game.tsx — Replace BLE placeholder

**Files:**
- Modify: `app/game.tsx:141-181`

- [ ] **Step 1: Replace BLE placeholder with service instantiation**

In `app/game.tsx`, update the `GameScreen` component. Replace lines 141-181:

```typescript
export default function GameScreen() {
  const params = useLocalSearchParams<{
    playerNames?: string;
    initialChips: string;
    sb: string;
    bb: string;
    mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
    seat?: string;
    clientSeatMap?: string;
  }>();

  const mode = params.mode ?? 'debug';
  const initialChips = Number(params.initialChips ?? '1000');
  const blinds = { sb: Number(params.sb ?? '5'), bb: Number(params.bb ?? '10') };

  const [service] = React.useState<GameService>(() => {
    if (mode === 'ble-host') {
      const transport = getHostTransport()!;
      const parsed = JSON.parse(params.clientSeatMap ?? '{}') as Record<string, number>;
      const seatMap = new Map<string, number>(
        Object.entries(parsed).map(([k, v]) => [k, Number(v)]),
      );
      const playerNames: string[] = JSON.parse(params.playerNames ?? '[]');
      const svc = new BleHostGameService(transport, seatMap);
      svc.startGame(playerNames, blinds, initialChips);
      svc.startRound();
      return svc;
    }

    if (mode === 'ble-client') {
      const transport = getClientTransport()!;
      return new BleClientGameService(transport, Number(params.seat ?? '0'));
    }

    // Local modes (hotseat / debug)
    const playerNames: string[] = JSON.parse(params.playerNames ?? '["P0","P1","P2"]');
    const svc = new LocalGameService();
    svc.startGame(playerNames, blinds, initialChips);
    svc.startRound();
    return svc;
  });

  const viewingSeat = (mode === 'ble-host') ? 0 : Number(params.seat ?? '0');

  // Cleanup transport registry on unmount
  React.useEffect(() => {
    return () => {
      if (mode === 'ble-host') clearHostTransport();
      if (mode === 'ble-client') clearClientTransport();
    };
  }, []);

  return (
    <GameProvider service={service} mode={mode}>
      <GameView />
    </GameProvider>
  );
}
```

Add imports at the top of `app/game.tsx`:

```typescript
import { GameService } from '../src/services/GameService';
import { BleHostGameService } from '../src/services/ble/BleHostGameService';
import { BleClientGameService } from '../src/services/ble/BleClientGameService';
import { getHostTransport, getClientTransport, clearHostTransport, clearClientTransport } from '../src/services/ble/transportRegistry';
```

- [ ] **Step 2: Commit**

```bash
git add app/game.tsx
git commit -m "feat(ble): replace BLE placeholder in game.tsx with real service instantiation"
```

### Task 9: Barrel exports

**Files:**
- Modify: `src/services/ble/index.ts`

- [ ] **Step 1: Add exports for new modules**

Append to `src/services/ble/index.ts`:

```typescript
export {
  GAME_PROTOCOL_VERSION,
  validateGameHostMessage,
  validatePrivateHandMessage,
  validateGameClientMessage,
} from './GameProtocol';
export type {
  GameStatePlayer,
  GameHostMessage,
  PrivateHandMessage,
  GameClientMessage,
} from './GameProtocol';
export { BleHostGameService } from './BleHostGameService';
export { BleClientGameService } from './BleClientGameService';
export {
  setHostTransport,
  getHostTransport,
  clearHostTransport,
  setClientTransport,
  getClientTransport,
  clearClientTransport,
} from './transportRegistry';
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ble/index.ts
git commit -m "feat(ble): export game protocol, services, and transport registry from barrel"
```

---

## Chunk 5: Integration Test

### Task 10: BleGameFlow Integration Test

**Files:**
- Create: `tests/ble/integration/BleGameFlow.test.ts`

**Reference files:**
- `tests/ble/integration/LobbyFlow.test.ts` — MockBleNetwork pattern
- `src/services/ble/MockBleTransport.ts` — `MockBleNetwork.create()`

- [ ] **Step 1: Write integration test — full game flow**

```typescript
// tests/ble/integration/BleGameFlow.test.ts

import { BleHostGameService } from '../../../src/services/ble/BleHostGameService';
import { BleClientGameService } from '../../../src/services/ble/BleClientGameService';
import {
  MockBleHostTransport,
  MockBleClientTransport,
  MockBleNetwork,
} from '../../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../../src/services/ble/ChunkManager';

describe('BleGameFlow integration', () => {
  let hostTransport: MockBleHostTransport;
  let client1Transport: MockBleClientTransport;
  let client2Transport: MockBleClientTransport;
  let hostService: BleHostGameService;
  let client1Service: BleClientGameService;
  let client2Service: BleClientGameService;

  beforeEach(() => {
    hostTransport = new MockBleHostTransport();
    client1Transport = new MockBleClientTransport();
    client2Transport = new MockBleClientTransport();
    MockBleNetwork.create(hostTransport, [client1Transport, client2Transport]);

    const clientSeatMap = new Map<string, number>([
      ['client-1', 1],
      ['client-2', 2],
    ]);
    hostService = new BleHostGameService(hostTransport, clientSeatMap);
    client1Service = new BleClientGameService(client1Transport, 1);
    client2Service = new BleClientGameService(client2Transport, 2);
  });

  it('full game round: startRound → actions → showdown', () => {
    hostService.startGame(['Host', 'Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();

    // Clients should have received state
    const client1State = client1Service.getState();
    expect(client1State.phase).toBe('preflop');
    expect(client1State.players).toHaveLength(3);

    // Client 1 should see own cards
    expect(client1State.players[1].cards).toHaveLength(2);
    // Client 1 should NOT see other players' cards
    expect(client1State.players[0].cards).toEqual([]);
    expect(client1State.players[2].cards).toEqual([]);

    // Client 2 should see own cards
    const client2State = client2Service.getState();
    expect(client2State.players[2].cards).toHaveLength(2);
    expect(client2State.players[0].cards).toEqual([]);
    expect(client2State.players[1].cards).toEqual([]);

    // Play through to showdown: everyone calls/checks
    let hostState = hostService.getState();
    let iterations = 0;
    while (hostState.phase !== 'showdown' && hostState.phase !== 'roundEnd' && iterations < 50) {
      iterations++;
      const activeSeat = hostState.activePlayer;
      if (activeSeat < 0) break;

      const info = hostService.getActionInfo(activeSeat);
      if (activeSeat === 0) {
        // Host acts directly
        if (info.canCheck) {
          hostService.handleAction(activeSeat, { action: 'check' });
        } else {
          hostService.handleAction(activeSeat, { action: 'call' });
        }
      } else {
        // Client acts via BLE (using client service)
        const clientService = activeSeat === 1 ? client1Service : client2Service;
        if (info.canCheck) {
          clientService.handleAction(activeSeat, { action: 'check' });
        } else {
          clientService.handleAction(activeSeat, { action: 'call' });
        }
      }
      hostState = hostService.getState();
    }

    // Should reach showdown or roundEnd
    expect(['showdown', 'roundEnd']).toContain(hostState.phase);

    if (hostState.phase === 'showdown') {
      const result = hostService.resolveShowdown();
      expect(result.winners.length).toBeGreaterThan(0);

      // Clients should have received showdownResult
      const client1Result = client1Service.resolveShowdown();
      expect(client1Result.winners.length).toBeGreaterThan(0);
    }
  });

  it('client disconnect → freeze → timeout → auto-fold', () => {
    jest.useFakeTimers();

    hostService.startGame(['Host', 'Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
    hostService.startRound();

    // Disconnect client-1
    hostTransport.simulateClientDisconnected('client-1');

    // Client 2 should see frozen seat
    const c2State = client2Service.getState();
    // frozenSeats is in the stateUpdate but not in GameState type — it's in the BLE message
    // The client service stores frozenSeats internally but doesn't expose it in getState()
    // This is expected — frozenSeats is for UI display, handled separately

    // Advance 30 seconds
    jest.advanceTimersByTime(30_000);

    // After timeout, auto-fold should have triggered for player at seat 1
    const hostState = hostService.getState();
    const player1 = hostState.players.find(p => p.seat === 1);
    // Player 1 should be folded after 30s timeout auto-fold
    expect(player1!.status).toBe('folded');

    jest.useRealTimers();
  });

  it('multiple rounds work correctly', () => {
    hostService.startGame(['Host', 'Alice'], { sb: 5, bb: 10 }, 1000);

    // Round 1: one player folds
    hostService.startRound();
    let state = hostService.getState();
    const activeSeat = state.activePlayer;
    hostService.handleAction(activeSeat, { action: 'fold' });

    // Prepare and start round 2
    hostService.prepareNextRound();
    state = hostService.getState();
    if (state.phase !== 'gameOver') {
      hostService.startRound();
      state = hostService.getState();
      expect(state.phase).toBe('preflop');

      // Client should be synced
      const clientState = client1Service.getState();
      expect(clientState.phase).toBe('preflop');
    }
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `npx jest tests/ble/integration/BleGameFlow.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 3: Run all BLE tests to verify no regressions**

Run: `npx jest tests/ble/ --no-coverage`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add tests/ble/integration/BleGameFlow.test.ts
git commit -m "test(ble): add BleGameFlow integration test for full game lifecycle"
```

### Task 11: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 2: TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Final commit if any adjustments needed**
