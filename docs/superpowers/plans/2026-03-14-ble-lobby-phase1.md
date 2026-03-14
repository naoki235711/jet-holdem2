# BLE Lobby Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement BLE lobby logic (transport abstraction, protocol, state machines, chunking) fully testable with Jest, without actual BLE library dependency.

**Architecture:** BleTransport interface abstracts BLE communication. LobbyHost/LobbyClient state machines handle lobby logic over string messages. ChunkManager handles Uint8Array chunking for BLE MTU limits. MockBleTransport enables full Jest testing.

**Tech Stack:** TypeScript (strict), Jest with ts-jest (node environment), existing Expo/React Native project

**Spec:** `docs/superpowers/specs/2026-03-14-ble-lobby-design.md`

---

## Chunk 1: Foundation — BleTransport Interface & LobbyProtocol

### Task 1: Jest Configuration Update

**Files:**
- Modify: `jest.config.js`

- [ ] **Step 1: Add `tests/ble` to the engine project roots**

```js
// In jest.config.js, update the engine project's roots array:
roots: ['<rootDir>/tests/gameEngine', '<rootDir>/tests/services', '<rootDir>/tests/ble'],
```

- [ ] **Step 2: Verify Jest recognizes the new test root**

Run: `npx jest --showConfig --selectProjects engine 2>&1 | grep roots`
Expected: Output includes `tests/ble`

- [ ] **Step 3: Commit**

```bash
git add jest.config.js
git commit -m "chore: add tests/ble to Jest engine project roots"
```

---

### Task 2: BleTransport Interface

**Files:**
- Create: `src/services/ble/BleTransport.ts`

- [ ] **Step 1: Create the BleTransport interface file**

```typescript
// src/services/ble/BleTransport.ts

/**
 * Role-specific BLE transport interfaces.
 * Split into Host (Peripheral) and Client (Central) to avoid
 * the overloaded onMessageReceived ambiguity.
 * LobbyHost/LobbyClient depend on these abstractions, not on mock classes.
 */

export interface BleHostTransport {
  startAdvertising(serviceName: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  onClientConnected(callback: (clientId: string) => void): void;
  onClientDisconnected(callback: (clientId: string) => void): void;
  onMessageReceived(
    callback: (clientId: string, characteristicId: string, data: Uint8Array) => void,
  ): void;
  sendToClient(clientId: string, characteristicId: string, data: Uint8Array): Promise<void>;
  sendToAll(characteristicId: string, data: Uint8Array): Promise<void>;
}

export interface BleClientTransport {
  startScanning(serviceUuid: string): Promise<void>;
  stopScanning(): Promise<void>;
  onHostDiscovered(callback: (hostId: string, hostName: string) => void): void;
  connectToHost(hostId: string): Promise<void>;
  disconnect(): Promise<void>;
  onMessageReceived(callback: (characteristicId: string, data: Uint8Array) => void): void;
  sendToHost(characteristicId: string, data: Uint8Array): Promise<void>;
}
```

> **Note:** The original spec uses a single `BleTransport` interface, but splitting into `BleHostTransport` / `BleClientTransport` avoids the `onMessageReceived` overload collision and lets `LobbyHost`/`LobbyClient` depend on abstractions rather than concrete mock classes.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/services/ble/BleTransport.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/services/ble/BleTransport.ts
git commit -m "feat(ble): add BleTransport interface"
```

---

### Task 3: LobbyProtocol — Message Types & Validation

**Files:**
- Create: `src/services/ble/LobbyProtocol.ts`
- Create: `tests/ble/LobbyProtocol.test.ts`

#### Step group A: LobbyPlayer type and client message types

- [ ] **Step 1: Write failing tests for `validateClientMessage`**

```typescript
// tests/ble/LobbyProtocol.test.ts

import {
  validateClientMessage,
  validateHostMessage,
  LobbyClientMessage,
  LobbyHostMessage,
  LobbyPlayer,
  PROTOCOL_VERSION,
} from '../../src/services/ble/LobbyProtocol';

describe('LobbyProtocol', () => {
  describe('validateClientMessage', () => {
    it('accepts a valid join message', () => {
      const msg = { type: 'join', protocolVersion: 1, playerName: 'Alice' };
      const result = validateClientMessage(msg);
      expect(result).toEqual({ type: 'join', protocolVersion: 1, playerName: 'Alice' });
    });

    it('accepts a valid ready message', () => {
      const msg = { type: 'ready' };
      const result = validateClientMessage(msg);
      expect(result).toEqual({ type: 'ready' });
    });

    it('rejects null input', () => {
      expect(validateClientMessage(null)).toBeNull();
    });

    it('rejects non-object input', () => {
      expect(validateClientMessage('hello')).toBeNull();
    });

    it('rejects unknown message type', () => {
      expect(validateClientMessage({ type: 'unknown' })).toBeNull();
    });

    it('rejects join with wrong protocolVersion', () => {
      const msg = { type: 'join', protocolVersion: 99, playerName: 'Alice' };
      expect(validateClientMessage(msg)).toBeNull();
    });

    it('rejects join with missing playerName', () => {
      const msg = { type: 'join', protocolVersion: 1 };
      expect(validateClientMessage(msg)).toBeNull();
    });

    it('rejects join with empty playerName', () => {
      const msg = { type: 'join', protocolVersion: 1, playerName: '' };
      expect(validateClientMessage(msg)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects engine tests/ble/LobbyProtocol.test.ts --no-coverage`
Expected: FAIL — cannot find module `../../src/services/ble/LobbyProtocol`

- [ ] **Step 3: Implement LobbyProtocol types and `validateClientMessage`**

```typescript
// src/services/ble/LobbyProtocol.ts

export const PROTOCOL_VERSION = 1;

// --- Shared types ---

export type LobbyPlayer = {
  seat: number;
  name: string;
  ready: boolean;
};

// --- Client → Host messages ---

export type LobbyClientMessage =
  | { type: 'join'; protocolVersion: number; playerName: string }
  | { type: 'ready' };

// --- Host → Client messages ---

export type LobbyHostMessage =
  | { type: 'joinResponse'; accepted: true; seat: number; players: LobbyPlayer[] }
  | { type: 'joinResponse'; accepted: false; reason: string }
  | { type: 'playerUpdate'; players: LobbyPlayer[] }
  | { type: 'gameStart'; blinds: { sb: number; bb: number } }
  | { type: 'lobbyClosed'; reason: string };

// --- Validation ---

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateClientMessage(data: unknown): LobbyClientMessage | null {
  if (!isObject(data)) return null;

  switch (data.type) {
    case 'join':
      if (data.protocolVersion !== PROTOCOL_VERSION) return null;
      if (typeof data.playerName !== 'string' || data.playerName === '') return null;
      return { type: 'join', protocolVersion: PROTOCOL_VERSION, playerName: data.playerName };
    case 'ready':
      return { type: 'ready' };
    default:
      return null;
  }
}

export function validateHostMessage(data: unknown): LobbyHostMessage | null {
  // Implemented in next step group
  if (!isObject(data)) return null;
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects engine tests/ble/LobbyProtocol.test.ts --no-coverage`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/LobbyProtocol.ts tests/ble/LobbyProtocol.test.ts
git commit -m "feat(ble): add LobbyProtocol types and validateClientMessage"
```

#### Step group B: Host message validation

- [ ] **Step 6: Write failing tests for `validateHostMessage`**

Append to the `describe('LobbyProtocol')` block in `tests/ble/LobbyProtocol.test.ts`:

```typescript
  describe('validateHostMessage', () => {
    const players: LobbyPlayer[] = [
      { seat: 0, name: 'Host', ready: true },
      { seat: 1, name: 'Alice', ready: false },
    ];

    it('accepts a valid joinResponse (accepted)', () => {
      const msg = { type: 'joinResponse', accepted: true, seat: 1, players };
      expect(validateHostMessage(msg)).toEqual(msg);
    });

    it('accepts a valid joinResponse (rejected)', () => {
      const msg = { type: 'joinResponse', accepted: false, reason: 'Room full' };
      expect(validateHostMessage(msg)).toEqual(msg);
    });

    it('accepts a valid playerUpdate', () => {
      const msg = { type: 'playerUpdate', players };
      expect(validateHostMessage(msg)).toEqual(msg);
    });

    it('accepts a valid gameStart', () => {
      const msg = { type: 'gameStart', blinds: { sb: 5, bb: 10 } };
      expect(validateHostMessage(msg)).toEqual(msg);
    });

    it('accepts a valid lobbyClosed', () => {
      const msg = { type: 'lobbyClosed', reason: 'Host left' };
      expect(validateHostMessage(msg)).toEqual(msg);
    });

    it('rejects null input', () => {
      expect(validateHostMessage(null)).toBeNull();
    });

    it('rejects unknown type', () => {
      expect(validateHostMessage({ type: 'unknown' })).toBeNull();
    });

    it('rejects joinResponse accepted=true without seat', () => {
      const msg = { type: 'joinResponse', accepted: true, players };
      expect(validateHostMessage(msg)).toBeNull();
    });

    it('rejects joinResponse accepted=true without players', () => {
      const msg = { type: 'joinResponse', accepted: true, seat: 1 };
      expect(validateHostMessage(msg)).toBeNull();
    });

    it('rejects joinResponse accepted=false without reason', () => {
      const msg = { type: 'joinResponse', accepted: false };
      expect(validateHostMessage(msg)).toBeNull();
    });

    it('rejects playerUpdate without players array', () => {
      expect(validateHostMessage({ type: 'playerUpdate' })).toBeNull();
    });

    it('rejects gameStart without blinds', () => {
      expect(validateHostMessage({ type: 'gameStart' })).toBeNull();
    });

    it('rejects gameStart with incomplete blinds', () => {
      expect(validateHostMessage({ type: 'gameStart', blinds: { sb: 5 } })).toBeNull();
    });

    it('rejects lobbyClosed without reason', () => {
      expect(validateHostMessage({ type: 'lobbyClosed' })).toBeNull();
    });
  });
```

- [ ] **Step 7: Run tests to verify the new tests fail**

Run: `npx jest --selectProjects engine tests/ble/LobbyProtocol.test.ts --no-coverage`
Expected: 8 pass, several new tests FAIL (validateHostMessage returns null for valid inputs)

- [ ] **Step 8: Implement `validateHostMessage`**

Replace the stub `validateHostMessage` in `src/services/ble/LobbyProtocol.ts`:

```typescript
function isLobbyPlayerArray(value: unknown): value is LobbyPlayer[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (p) =>
      isObject(p) &&
      typeof p.seat === 'number' &&
      typeof p.name === 'string' &&
      typeof p.ready === 'boolean',
  );
}

function isValidBlinds(value: unknown): value is { sb: number; bb: number } {
  return isObject(value) && typeof value.sb === 'number' && typeof value.bb === 'number';
}

export function validateHostMessage(data: unknown): LobbyHostMessage | null {
  if (!isObject(data)) return null;

  switch (data.type) {
    case 'joinResponse':
      if (data.accepted === true) {
        if (typeof data.seat !== 'number') return null;
        if (!isLobbyPlayerArray(data.players)) return null;
        return {
          type: 'joinResponse',
          accepted: true,
          seat: data.seat,
          players: data.players,
        };
      }
      if (data.accepted === false) {
        if (typeof data.reason !== 'string') return null;
        return { type: 'joinResponse', accepted: false, reason: data.reason };
      }
      return null;
    case 'playerUpdate':
      if (!isLobbyPlayerArray(data.players)) return null;
      return { type: 'playerUpdate', players: data.players };
    case 'gameStart':
      if (!isValidBlinds(data.blinds)) return null;
      return { type: 'gameStart', blinds: data.blinds as { sb: number; bb: number } };
    case 'lobbyClosed':
      if (typeof data.reason !== 'string') return null;
      return { type: 'lobbyClosed', reason: data.reason };
    default:
      return null;
  }
}
```

- [ ] **Step 9: Run tests to verify all pass**

Run: `npx jest --selectProjects engine tests/ble/LobbyProtocol.test.ts --no-coverage`
Expected: All 21 tests PASS

- [ ] **Step 10: Commit**

```bash
git add src/services/ble/LobbyProtocol.ts tests/ble/LobbyProtocol.test.ts
git commit -m "feat(ble): add validateHostMessage"
```

---

## Chunk 2: ChunkManager

### Task 4: ChunkManager — Encode & Decode

**Files:**
- Create: `src/services/ble/ChunkManager.ts`
- Create: `tests/ble/ChunkManager.test.ts`

#### Step group A: Encoding

- [ ] **Step 1: Write failing tests for `encode`**

```typescript
// tests/ble/ChunkManager.test.ts

import { ChunkManager } from '../../src/services/ble/ChunkManager';

describe('ChunkManager', () => {
  describe('encode', () => {
    it('encodes a short message into a single chunk', () => {
      const cm = new ChunkManager(185);
      const chunks = cm.encode('{"type":"ready"}');
      expect(chunks).toHaveLength(1);
      // Header: [0, 1, 0] then UTF-8 payload
      expect(chunks[0][0]).toBe(0);   // chunkIndex
      expect(chunks[0][1]).toBe(1);   // totalChunks
      expect(chunks[0][2]).toBe(0);   // reserved
      const payload = new TextDecoder().decode(chunks[0].slice(3));
      expect(payload).toBe('{"type":"ready"}');
    });

    it('splits a long message into multiple chunks', () => {
      const cm = new ChunkManager(10); // tiny MTU: 7 bytes payload per chunk
      const json = 'ABCDEFGHIJKLMNOPQRST'; // 20 bytes → ceil(20/7) = 3 chunks
      const chunks = cm.encode(json);
      expect(chunks).toHaveLength(3);
      expect(chunks[0][0]).toBe(0); // chunkIndex 0
      expect(chunks[0][1]).toBe(3); // totalChunks 3
      expect(chunks[1][0]).toBe(1);
      expect(chunks[2][0]).toBe(2);
    });

    it('produces chunks no larger than MTU', () => {
      const mtu = 20;
      const cm = new ChunkManager(mtu);
      const json = 'A'.repeat(100);
      const chunks = cm.encode(json);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(mtu);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects engine tests/ble/ChunkManager.test.ts --no-coverage`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement ChunkManager.encode**

```typescript
// src/services/ble/ChunkManager.ts

const HEADER_SIZE = 3; // [chunkIndex, totalChunks, reserved]

export class ChunkManager {
  private mtu: number;
  private receiveBuffers = new Map<
    string,
    { chunks: (Uint8Array | null)[]; total: number; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(mtu: number = 185) {
    this.mtu = mtu;
  }

  encode(json: string): Uint8Array[] {
    const payload = new TextEncoder().encode(json);
    const chunkPayloadSize = this.mtu - HEADER_SIZE;
    const totalChunks = Math.ceil(payload.length / chunkPayloadSize);
    const chunks: Uint8Array[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkPayloadSize;
      const end = Math.min(start + chunkPayloadSize, payload.length);
      const chunkPayload = payload.slice(start, end);

      const chunk = new Uint8Array(HEADER_SIZE + chunkPayload.length);
      chunk[0] = i;            // chunkIndex
      chunk[1] = totalChunks;  // totalChunks
      chunk[2] = 0;            // reserved
      chunk.set(chunkPayload, HEADER_SIZE);
      chunks.push(chunk);
    }

    return chunks;
  }

  decode(senderId: string, chunk: Uint8Array): string | null {
    // Implemented in next step group
    return null;
  }

  /** Clears all receive buffers. Call on cleanup. */
  clear(): void {
    for (const buf of this.receiveBuffers.values()) {
      clearTimeout(buf.timer);
    }
    this.receiveBuffers.clear();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects engine tests/ble/ChunkManager.test.ts --no-coverage`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/ChunkManager.ts tests/ble/ChunkManager.test.ts
git commit -m "feat(ble): add ChunkManager.encode"
```

#### Step group B: Decoding (single chunk, multi-chunk, timeout)

- [ ] **Step 6: Write failing tests for `decode`**

Append to `tests/ble/ChunkManager.test.ts` inside the top-level `describe`:

```typescript
  describe('decode', () => {
    it('decodes a single-chunk message immediately', () => {
      const cm = new ChunkManager(185);
      const chunks = cm.encode('{"type":"ready"}');
      const result = cm.decode('sender-1', chunks[0]);
      expect(result).toBe('{"type":"ready"}');
    });

    it('returns null for incomplete multi-chunk message', () => {
      const cm = new ChunkManager(10);
      const chunks = cm.encode('ABCDEFGHIJKLMNOPQRST');
      expect(chunks.length).toBeGreaterThan(1);
      const result = cm.decode('sender-1', chunks[0]);
      expect(result).toBeNull();
    });

    it('reassembles a multi-chunk message when all chunks arrive', () => {
      const cm = new ChunkManager(10);
      const original = 'ABCDEFGHIJKLMNOPQRST';
      const chunks = cm.encode(original);
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(cm.decode('sender-1', chunks[i])).toBeNull();
      }
      const result = cm.decode('sender-1', chunks[chunks.length - 1]);
      expect(result).toBe(original);
    });

    it('reassembles chunks arriving out of order', () => {
      const cm = new ChunkManager(10);
      const original = 'ABCDEFGHIJKLMNOPQRST';
      const chunks = cm.encode(original);
      // Send last chunk first, then the rest
      expect(cm.decode('sender-1', chunks[chunks.length - 1])).toBeNull();
      for (let i = 0; i < chunks.length - 2; i++) {
        expect(cm.decode('sender-1', chunks[i])).toBeNull();
      }
      const result = cm.decode('sender-1', chunks[chunks.length - 2]);
      expect(result).toBe(original);
    });

    it('handles multiple senders independently', () => {
      const cm = new ChunkManager(10);
      const msg1 = 'ABCDEFGHIJKLMNOPQRST';
      const msg2 = 'UVWXYZ1234567890ABCD';
      const chunks1 = cm.encode(msg1);
      const chunks2 = cm.encode(msg2);

      // Interleave chunks from two senders
      cm.decode('sender-1', chunks1[0]);
      cm.decode('sender-2', chunks2[0]);
      cm.decode('sender-1', chunks1[1]);
      cm.decode('sender-2', chunks2[1]);

      const result1 = cm.decode('sender-1', chunks1[2]);
      expect(result1).toBe(msg1);

      const result2 = cm.decode('sender-2', chunks2[2]);
      expect(result2).toBe(msg2);
    });
  });

  describe('decode timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('discards partial buffer after 5 seconds and allows fresh reassembly', () => {
      const cm = new ChunkManager(10);
      const original = 'ABCDEFGHIJKLMNOPQRST';
      const chunks = cm.encode(original);

      // Send only the first chunk
      cm.decode('sender-1', chunks[0]);

      // Advance time past the 5s timeout
      jest.advanceTimersByTime(5000);

      // Re-send ALL chunks — should reassemble from scratch (old buffer was discarded)
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(cm.decode('sender-1', chunks[i])).toBeNull();
      }
      const result = cm.decode('sender-1', chunks[chunks.length - 1]);
      expect(result).toBe(original);
    });
  });
```

- [ ] **Step 7: Run tests to verify the new decode tests fail**

Run: `npx jest --selectProjects engine tests/ble/ChunkManager.test.ts --no-coverage`
Expected: encode tests pass, decode tests FAIL (decode returns null always)

- [ ] **Step 8: Implement `decode`**

Replace the `decode` stub in `src/services/ble/ChunkManager.ts` and add the `TIMEOUT_MS` static field to the `ChunkManager` class:

```typescript
  private static readonly TIMEOUT_MS = 5000;

  decode(senderId: string, chunk: Uint8Array): string | null {
    const chunkIndex = chunk[0];
    const totalChunks = chunk[1];
    // reserved = chunk[2]
    const payload = chunk.slice(HEADER_SIZE);

    // Single-chunk fast path
    if (totalChunks === 1) {
      return new TextDecoder().decode(payload);
    }

    let buffer = this.receiveBuffers.get(senderId);
    if (!buffer || buffer.total !== totalChunks) {
      // New message or mismatched total — start fresh
      if (buffer) clearTimeout(buffer.timer);
      buffer = {
        chunks: new Array<Uint8Array | null>(totalChunks).fill(null),
        total: totalChunks,
        timer: setTimeout(() => {
          this.receiveBuffers.delete(senderId);
        }, ChunkManager.TIMEOUT_MS),
      };
      this.receiveBuffers.set(senderId, buffer);
    }

    buffer.chunks[chunkIndex] = payload;

    // Check if all chunks received
    const complete = buffer.chunks.every((c) => c !== null);
    if (!complete) return null;

    // Reassemble
    clearTimeout(buffer.timer);
    this.receiveBuffers.delete(senderId);
    const totalLength = buffer.chunks.reduce((sum, c) => sum + c!.length, 0);
    const assembled = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of buffer.chunks) {
      assembled.set(part!, offset);
      offset += part!.length;
    }
    return new TextDecoder().decode(assembled);
  }
```

- [ ] **Step 9: Run tests to verify all pass**

Run: `npx jest --selectProjects engine tests/ble/ChunkManager.test.ts --no-coverage`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add src/services/ble/ChunkManager.ts tests/ble/ChunkManager.test.ts
git commit -m "feat(ble): add ChunkManager.decode with timeout"
```

---

## Chunk 3: MockBleTransport & LobbyHost

### Task 5: MockBleTransport & MockBleNetwork

**Files:**
- Create: `src/services/ble/MockBleTransport.ts`
- Create: `tests/ble/MockBleTransport.test.ts`

- [ ] **Step 1: Write failing tests for MockBleTransport**

```typescript
// tests/ble/MockBleTransport.test.ts

import { MockBleHostTransport, MockBleClientTransport, MockBleNetwork } from '../../src/services/ble/MockBleTransport';

describe('MockBleTransport', () => {
  describe('MockBleHostTransport', () => {
    it('records sent messages', async () => {
      const host = new MockBleHostTransport();
      const data = new Uint8Array([1, 2, 3]);
      await host.sendToClient('client-1', 'char-1', data);
      expect(host.sentMessages).toHaveLength(1);
      expect(host.sentMessages[0]).toEqual({
        clientId: 'client-1',
        characteristicId: 'char-1',
        data,
      });
    });

    it('fires client connected callback on simulate', () => {
      const host = new MockBleHostTransport();
      const cb = jest.fn();
      host.onClientConnected(cb);
      host.simulateClientConnected('client-1');
      expect(cb).toHaveBeenCalledWith('client-1');
    });

    it('fires client disconnected callback on simulate', () => {
      const host = new MockBleHostTransport();
      const cb = jest.fn();
      host.onClientDisconnected(cb);
      host.simulateClientDisconnected('client-1');
      expect(cb).toHaveBeenCalledWith('client-1');
    });

    it('fires message received callback on simulate', () => {
      const host = new MockBleHostTransport();
      const cb = jest.fn();
      host.onMessageReceived(cb);
      const data = new Uint8Array([1, 2]);
      host.simulateMessageReceived('client-1', 'char-1', data);
      expect(cb).toHaveBeenCalledWith('client-1', 'char-1', data);
    });
  });

  describe('MockBleClientTransport', () => {
    it('records sent messages', async () => {
      const client = new MockBleClientTransport();
      const data = new Uint8Array([4, 5, 6]);
      await client.sendToHost('char-1', data);
      expect(client.sentMessages).toHaveLength(1);
      expect(client.sentMessages[0]).toEqual({
        characteristicId: 'char-1',
        data,
      });
    });

    it('fires host discovered callback on simulate', () => {
      const client = new MockBleClientTransport();
      const cb = jest.fn();
      client.onHostDiscovered(cb);
      client.simulateHostDiscovered('host-1', 'HostName');
      expect(cb).toHaveBeenCalledWith('host-1', 'HostName');
    });

    it('fires message received callback on simulate', () => {
      const client = new MockBleClientTransport();
      const cb = jest.fn();
      client.onMessageReceived(cb);
      const data = new Uint8Array([7, 8]);
      client.simulateMessageReceived('char-1', data);
      expect(cb).toHaveBeenCalledWith('char-1', data);
    });
  });

  describe('MockBleNetwork', () => {
    it('routes host sendToClient to the correct client onMessageReceived', async () => {
      const host = new MockBleHostTransport();
      const client1 = new MockBleClientTransport();
      const client2 = new MockBleClientTransport();
      MockBleNetwork.create(host, [client1, client2]);

      const cb1 = jest.fn();
      const cb2 = jest.fn();
      client1.onMessageReceived(cb1);
      client2.onMessageReceived(cb2);

      const data = new Uint8Array([1, 2, 3]);
      await host.sendToClient('client-1', 'char-1', data);
      expect(cb1).toHaveBeenCalledWith('char-1', data);
      expect(cb2).not.toHaveBeenCalled();
    });

    it('routes host sendToAll to all clients', async () => {
      const host = new MockBleHostTransport();
      const client1 = new MockBleClientTransport();
      const client2 = new MockBleClientTransport();
      MockBleNetwork.create(host, [client1, client2]);

      const cb1 = jest.fn();
      const cb2 = jest.fn();
      client1.onMessageReceived(cb1);
      client2.onMessageReceived(cb2);

      const data = new Uint8Array([4, 5]);
      await host.sendToAll('char-1', data);
      expect(cb1).toHaveBeenCalledWith('char-1', data);
      expect(cb2).toHaveBeenCalledWith('char-1', data);
    });

    it('routes client sendToHost to host onMessageReceived', async () => {
      const host = new MockBleHostTransport();
      const client1 = new MockBleClientTransport();
      MockBleNetwork.create(host, [client1]);

      const cb = jest.fn();
      host.onMessageReceived(cb);

      const data = new Uint8Array([9, 10]);
      await client1.sendToHost('char-1', data);
      expect(cb).toHaveBeenCalledWith('client-1', 'char-1', data);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects engine tests/ble/MockBleTransport.test.ts --no-coverage`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement MockBleHostTransport, MockBleClientTransport, MockBleNetwork**

```typescript
// src/services/ble/MockBleTransport.ts

import { BleHostTransport, BleClientTransport } from './BleTransport';

export class MockBleHostTransport implements BleHostTransport {
  sentMessages: { clientId: string; characteristicId: string; data: Uint8Array }[] = [];

  private _onClientConnected: ((clientId: string) => void) | null = null;
  private _onClientDisconnected: ((clientId: string) => void) | null = null;
  private _onMessageReceived:
    | ((clientId: string, characteristicId: string, data: Uint8Array) => void)
    | null = null;

  // --- Send methods (record + optional network routing) ---
  private _sendHook:
    | ((clientId: string, characteristicId: string, data: Uint8Array) => void)
    | null = null;
  private _sendAllHook:
    | ((characteristicId: string, data: Uint8Array) => void)
    | null = null;

  async startAdvertising(_serviceName: string): Promise<void> {}
  async stopAdvertising(): Promise<void> {}

  onClientConnected(callback: (clientId: string) => void): void {
    this._onClientConnected = callback;
  }

  onClientDisconnected(callback: (clientId: string) => void): void {
    this._onClientDisconnected = callback;
  }

  onMessageReceived(
    callback: (clientId: string, characteristicId: string, data: Uint8Array) => void,
  ): void {
    this._onMessageReceived = callback;
  }

  async sendToClient(
    clientId: string,
    characteristicId: string,
    data: Uint8Array,
  ): Promise<void> {
    this.sentMessages.push({ clientId, characteristicId, data });
    this._sendHook?.(clientId, characteristicId, data);
  }

  async sendToAll(characteristicId: string, data: Uint8Array): Promise<void> {
    this.sentMessages.push({ clientId: '__all__', characteristicId, data });
    this._sendAllHook?.(characteristicId, data);
  }

  // --- Test helpers ---
  simulateClientConnected(clientId: string): void {
    this._onClientConnected?.(clientId);
  }

  simulateClientDisconnected(clientId: string): void {
    this._onClientDisconnected?.(clientId);
  }

  simulateMessageReceived(
    clientId: string,
    characteristicId: string,
    data: Uint8Array,
  ): void {
    this._onMessageReceived?.(clientId, characteristicId, data);
  }
}

export class MockBleClientTransport implements BleClientTransport {
  sentMessages: { characteristicId: string; data: Uint8Array }[] = [];

  private _onHostDiscovered: ((hostId: string, hostName: string) => void) | null = null;
  private _onMessageReceived:
    | ((characteristicId: string, data: Uint8Array) => void)
    | null = null;

  private _sendHook: ((characteristicId: string, data: Uint8Array) => void) | null = null;

  async startScanning(_serviceUuid: string): Promise<void> {}
  async stopScanning(): Promise<void> {}
  onHostDiscovered(callback: (hostId: string, hostName: string) => void): void {
    this._onHostDiscovered = callback;
  }
  async connectToHost(_hostId: string): Promise<void> {}
  async disconnect(): Promise<void> {}

  onMessageReceived(callback: (characteristicId: string, data: Uint8Array) => void): void {
    this._onMessageReceived = callback;
  }

  async sendToHost(characteristicId: string, data: Uint8Array): Promise<void> {
    this.sentMessages.push({ characteristicId, data });
    this._sendHook?.(characteristicId, data);
  }

  // --- Test helpers ---
  simulateHostDiscovered(hostId: string, hostName: string): void {
    this._onHostDiscovered?.(hostId, hostName);
  }

  simulateMessageReceived(characteristicId: string, data: Uint8Array): void {
    this._onMessageReceived?.(characteristicId, data);
  }
}

/**
 * Connects mock transports so that:
 *  - host.sendToClient(clientId, ...) → matching client.onMessageReceived(...)
 *  - host.sendToAll(...) → all clients.onMessageReceived(...)
 *  - client.sendToHost(...) → host.onMessageReceived(clientId, ...)
 *
 * Client IDs are assigned as "client-1", "client-2", etc.
 */
export class MockBleNetwork {
  static create(
    host: MockBleHostTransport,
    clients: MockBleClientTransport[],
  ): void {
    const clientMap = new Map<string, MockBleClientTransport>();
    clients.forEach((client, index) => {
      const clientId = `client-${index + 1}`;
      clientMap.set(clientId, client);

      // Wire client → host
      client._sendHook = (characteristicId, data) => {
        host.simulateMessageReceived(clientId, characteristicId, data);
      };
    });

    // Wire host → client
    host._sendHook = (clientId, characteristicId, data) => {
      const client = clientMap.get(clientId);
      client?.simulateMessageReceived(characteristicId, data);
    };

    host._sendAllHook = (characteristicId, data) => {
      for (const client of clientMap.values()) {
        client.simulateMessageReceived(characteristicId, data);
      }
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects engine tests/ble/MockBleTransport.test.ts --no-coverage`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/MockBleTransport.ts tests/ble/MockBleTransport.test.ts
git commit -m "feat(ble): add MockBleTransport and MockBleNetwork"
```

---

### Task 6: LobbyHost State Machine

**Files:**
- Create: `src/services/ble/LobbyHost.ts`
- Create: `tests/ble/LobbyHost.test.ts`

The characteristic ID used for lobby messages is a constant. Define it in LobbyHost:

```typescript
const LOBBY_CHARACTERISTIC = 'lobby';
```

LobbyHost uses `ChunkManager` internally for encoding/decoding. It accepts `MockBleHostTransport` (duck-typed — no explicit interface coupling needed since both share the same method signatures).

#### Step group A: Initialization and client join

- [ ] **Step 1: Write failing tests for host start and client join**

```typescript
// tests/ble/LobbyHost.test.ts

import { LobbyHost } from '../../src/services/ble/LobbyHost';
import { MockBleHostTransport } from '../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../src/services/ble/ChunkManager';

/** Helper: encode a JSON message as the ChunkManager would, return the single chunk */
function encodeMessage(json: string): Uint8Array {
  return new ChunkManager().encode(json)[0];
}

/** Helper: decode the last sent message from the mock transport */
function decodeLastSent(transport: MockBleHostTransport): unknown {
  const msgs = transport.sentMessages;
  const last = msgs[msgs.length - 1];
  const cm = new ChunkManager();
  return JSON.parse(cm.decode('any', last.data)!);
}

describe('LobbyHost', () => {
  let transport: MockBleHostTransport;
  let host: LobbyHost;

  beforeEach(() => {
    transport = new MockBleHostTransport();
    host = new LobbyHost(transport, 'HostPlayer');
  });

  describe('start', () => {
    it('transitions to waitingForPlayers and host is seat 0', async () => {
      const playersCb = jest.fn();
      host.onPlayersChanged(playersCb);
      await host.start();
      expect(playersCb).toHaveBeenCalledWith([
        { seat: 0, name: 'HostPlayer', ready: true },
      ]);
    });
  });

  describe('client join', () => {
    beforeEach(async () => {
      await host.start();
    });

    it('accepts a valid join and assigns seat 1', () => {
      const playersCb = jest.fn();
      host.onPlayersChanged(playersCb);

      transport.simulateClientConnected('client-1');
      const joinMsg = JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' });
      transport.simulateMessageReceived('client-1', 'lobby', encodeMessage(joinMsg));

      // Should have sent joinResponse to client-1
      const response = decodeLastSent(transport);
      expect(response).toMatchObject({
        type: 'joinResponse',
        accepted: true,
        seat: 1,
      });

      // Players updated callback should include host + Alice
      expect(playersCb).toHaveBeenCalledWith(
        expect.arrayContaining([
          { seat: 0, name: 'HostPlayer', ready: true },
          { seat: 1, name: 'Alice', ready: false },
        ]),
      );
    });

    it('assigns sequential seats (1, 2, 3) to joining clients', () => {
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
      transport.simulateClientConnected('client-2');
      transport.simulateMessageReceived(
        'client-2', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Bob' })),
      );

      // Find the joinResponse for client-2
      const client2Msgs = transport.sentMessages.filter(m => m.clientId === 'client-2');
      const response = JSON.parse(new ChunkManager().decode('any', client2Msgs[0].data)!);
      expect(response).toMatchObject({ type: 'joinResponse', accepted: true, seat: 2 });
    });

    it('rejects the 4th client (room full: host + 3 clients)', () => {
      for (let i = 1; i <= 3; i++) {
        transport.simulateClientConnected(`client-${i}`);
        transport.simulateMessageReceived(
          `client-${i}`, 'lobby',
          encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: `P${i}` })),
        );
      }
      // 4th client
      transport.simulateClientConnected('client-4');
      transport.simulateMessageReceived(
        'client-4', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'P4' })),
      );

      const response = decodeLastSent(transport);
      expect(response).toMatchObject({ type: 'joinResponse', accepted: false });
    });

    it('ignores duplicate join from same clientId', () => {
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
      const countBefore = transport.sentMessages.length;

      // Send join again
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
      expect(transport.sentMessages.length).toBe(countBefore);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects engine tests/ble/LobbyHost.test.ts --no-coverage`
Expected: FAIL — cannot find module `../../src/services/ble/LobbyHost`

- [ ] **Step 3: Implement LobbyHost — constructor, start, client join**

```typescript
// src/services/ble/LobbyHost.ts

import { BleHostTransport } from './BleTransport';
import { ChunkManager } from './ChunkManager';
import {
  LobbyPlayer,
  LobbyHostMessage,
  validateClientMessage,
} from './LobbyProtocol';

const LOBBY_CHARACTERISTIC = 'lobby';
const MAX_PLAYERS = 4; // host included

type LobbyHostState = 'idle' | 'advertising' | 'waitingForPlayers' | 'gameStarting';

export class LobbyHost {
  private state: LobbyHostState = 'idle';
  private players = new Map<string, LobbyPlayer>(); // clientId → LobbyPlayer
  private chunkManager = new ChunkManager();

  private _onPlayersChanged: ((players: LobbyPlayer[]) => void) | null = null;
  private _onGameStart: ((blinds: { sb: number; bb: number }) => void) | null = null;
  private _onError: ((error: string) => void) | null = null;

  constructor(
    private transport: BleHostTransport,
    private hostName: string,
  ) {}

  async start(): Promise<void> {
    await this.transport.startAdvertising('JetHoldem');
    this.state = 'waitingForPlayers';

    // Host is always seat 0, always ready
    this.players.set('__host__', { seat: 0, name: this.hostName, ready: true });

    this.transport.onClientConnected((clientId) => this.handleClientConnected(clientId));
    this.transport.onClientDisconnected((clientId) => this.handleClientDisconnected(clientId));
    this.transport.onMessageReceived((clientId, _charId, data) => {
      const json = this.chunkManager.decode(clientId, data);
      if (json) this.handleMessage(clientId, json);
    });

    this.notifyPlayersChanged();
  }

  async stop(): Promise<void> {
    await this.sendToAll({ type: 'lobbyClosed', reason: 'Host closed the lobby' });
    await this.transport.stopAdvertising();
    this.state = 'idle';
    this.chunkManager.clear();
  }

  startGame(blinds: { sb: number; bb: number } = { sb: 5, bb: 10 }): void {
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
    this.sendToAll({ type: 'gameStart', blinds });
    this._onGameStart?.(blinds);
  }

  // --- Event handlers ---

  private handleClientConnected(_clientId: string): void {
    // Wait for join message before adding to players
  }

  private handleClientDisconnected(clientId: string): void {
    if (this.players.has(clientId)) {
      this.players.delete(clientId);
      this.notifyPlayersChanged();
      this.sendToAll({ type: 'playerUpdate', players: this.getPlayerList() });
    }
  }

  private handleMessage(clientId: string, json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return; // Ignore unparseable messages
    }

    const msg = validateClientMessage(parsed);
    if (!msg) return;

    switch (msg.type) {
      case 'join':
        this.handleJoin(clientId, msg.playerName);
        break;
      case 'ready':
        this.handleReady(clientId);
        break;
    }
  }

  private handleJoin(clientId: string, playerName: string): void {
    // Ignore duplicate join
    if (this.players.has(clientId)) return;

    if (this.players.size >= MAX_PLAYERS) {
      this.sendToClient(clientId, {
        type: 'joinResponse',
        accepted: false,
        reason: 'Room is full',
      });
      return;
    }

    const seat = this.findNextSeat();
    this.players.set(clientId, { seat, name: playerName, ready: false });

    this.sendToClient(clientId, {
      type: 'joinResponse',
      accepted: true,
      seat,
      players: this.getPlayerList(),
    });

    this.notifyPlayersChanged();
    // Broadcast updated player list to all other clients
    this.sendToAll({ type: 'playerUpdate', players: this.getPlayerList() });
  }

  private handleReady(clientId: string): void {
    const player = this.players.get(clientId);
    if (!player) return;
    player.ready = true;
    this.notifyPlayersChanged();
    this.sendToAll({ type: 'playerUpdate', players: this.getPlayerList() });
  }

  // --- Callbacks ---

  onPlayersChanged(callback: (players: LobbyPlayer[]) => void): void {
    this._onPlayersChanged = callback;
  }

  onGameStart(callback: (blinds: { sb: number; bb: number }) => void): void {
    this._onGameStart = callback;
  }

  onError(callback: (error: string) => void): void {
    this._onError = callback;
  }

  // --- Helpers ---

  private getPlayerList(): LobbyPlayer[] {
    return Array.from(this.players.values()).sort((a, b) => a.seat - b.seat);
  }

  private findNextSeat(): number {
    const taken = new Set(Array.from(this.players.values()).map((p) => p.seat));
    for (let s = 1; s <= 3; s++) {
      if (!taken.has(s)) return s;
    }
    return -1; // Should never happen if size check is correct
  }

  private notifyPlayersChanged(): void {
    this._onPlayersChanged?.(this.getPlayerList());
  }

  private async sendToClient(clientId: string, msg: LobbyHostMessage): Promise<void> {
    const chunks = this.chunkManager.encode(JSON.stringify(msg));
    for (const chunk of chunks) {
      await this.transport.sendToClient(clientId, LOBBY_CHARACTERISTIC, chunk);
    }
  }

  private async sendToAll(msg: LobbyHostMessage): Promise<void> {
    const chunks = this.chunkManager.encode(JSON.stringify(msg));
    for (const chunk of chunks) {
      await this.transport.sendToAll(LOBBY_CHARACTERISTIC, chunk);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects engine tests/ble/LobbyHost.test.ts --no-coverage`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/LobbyHost.ts tests/ble/LobbyHost.test.ts
git commit -m "feat(ble): add LobbyHost with join handling"
```

#### Step group B: Ready, disconnect, startGame, stop

- [ ] **Step 6: Write failing tests for ready, disconnect, startGame, stop**

Append to the `describe('LobbyHost')` block in `tests/ble/LobbyHost.test.ts`:

```typescript
  describe('ready', () => {
    beforeEach(async () => {
      await host.start();
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
    });

    it('marks player as ready and broadcasts playerUpdate', () => {
      const playersCb = jest.fn();
      host.onPlayersChanged(playersCb);

      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'ready' })),
      );

      expect(playersCb).toHaveBeenCalledWith(
        expect.arrayContaining([
          { seat: 0, name: 'HostPlayer', ready: true },
          { seat: 1, name: 'Alice', ready: true },
        ]),
      );
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      await host.start();
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
    });

    it('removes player and broadcasts updated list', () => {
      const playersCb = jest.fn();
      host.onPlayersChanged(playersCb);

      transport.simulateClientDisconnected('client-1');

      expect(playersCb).toHaveBeenCalledWith([
        { seat: 0, name: 'HostPlayer', ready: true },
      ]);
    });

    it('frees the seat for a new player after disconnect', () => {
      transport.simulateClientDisconnected('client-1');

      // New player connects and gets seat 1 (freed)
      transport.simulateClientConnected('client-2');
      transport.simulateMessageReceived(
        'client-2', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Bob' })),
      );

      const response = decodeLastSent(transport);
      expect(response).toMatchObject({ type: 'joinResponse', accepted: true, seat: 1 });
    });
  });

  describe('startGame', () => {
    beforeEach(async () => {
      await host.start();
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
    });

    it('sends gameStart when all players are ready and >= 2 players', () => {
      const gameStartCb = jest.fn();
      host.onGameStart(gameStartCb);

      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'ready' })),
      );

      host.startGame({ sb: 5, bb: 10 });

      expect(gameStartCb).toHaveBeenCalledWith({ sb: 5, bb: 10 });
      const lastBroadcast = decodeLastSent(transport);
      expect(lastBroadcast).toMatchObject({ type: 'gameStart', blinds: { sb: 5, bb: 10 } });
    });

    it('fires error if not all players are ready', () => {
      const errorCb = jest.fn();
      host.onError(errorCb);
      host.startGame();
      expect(errorCb).toHaveBeenCalledWith(expect.stringContaining('not all players are ready'));
    });

    it('fires error if only host (1 player)', async () => {
      const soloHost = new LobbyHost(new MockBleHostTransport(), 'Solo');
      await soloHost.start();
      const errorCb = jest.fn();
      soloHost.onError(errorCb);
      soloHost.startGame();
      expect(errorCb).toHaveBeenCalledWith(expect.stringContaining('at least 2'));
    });
  });

  describe('stop', () => {
    it('sends lobbyClosed to all clients', async () => {
      await host.start();
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );

      await host.stop();

      // Find the lobbyClosed message in sentMessages
      const closedMsgs = transport.sentMessages.filter((m) => {
        const json = new ChunkManager().decode('any', m.data);
        if (!json) return false;
        const parsed = JSON.parse(json);
        return parsed.type === 'lobbyClosed';
      });
      expect(closedMsgs.length).toBeGreaterThanOrEqual(1);
    });
  });
```

- [ ] **Step 7: Run tests to verify new tests fail (or pass if logic already covers them)**

Run: `npx jest --selectProjects engine tests/ble/LobbyHost.test.ts --no-coverage`
Expected: All tests PASS (the implementation from Step 3 already covers these behaviors)

> If any test fails, fix the implementation to match the spec and re-run.

- [ ] **Step 8: Commit**

```bash
git add tests/ble/LobbyHost.test.ts
git commit -m "test(ble): add LobbyHost tests for ready, disconnect, startGame, stop"
```

---

## Chunk 4: LobbyClient & Integration Tests

### Task 7: LobbyClient State Machine

**Files:**
- Create: `src/services/ble/LobbyClient.ts`
- Create: `tests/ble/LobbyClient.test.ts`

#### Step group A: Scanning, connecting, join handling

- [ ] **Step 1: Write failing tests for LobbyClient join flow**

```typescript
// tests/ble/LobbyClient.test.ts

import { LobbyClient } from '../../src/services/ble/LobbyClient';
import { MockBleClientTransport } from '../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../src/services/ble/ChunkManager';

/** Helper: encode a JSON message as a single chunk */
function encodeMessage(json: string): Uint8Array {
  return new ChunkManager().encode(json)[0];
}

/** Helper: decode the last sent message from the mock transport */
function decodeLastSent(transport: MockBleClientTransport): unknown {
  const msgs = transport.sentMessages;
  const last = msgs[msgs.length - 1];
  const cm = new ChunkManager();
  return JSON.parse(cm.decode('any', last.data)!);
}

describe('LobbyClient', () => {
  let transport: MockBleClientTransport;
  let client: LobbyClient;

  beforeEach(() => {
    transport = new MockBleClientTransport();
    client = new LobbyClient(transport, 'Alice');
  });

  describe('host discovery', () => {
    it('reports discovered hosts via callback', async () => {
      const cb = jest.fn();
      client.onHostDiscovered(cb);
      await client.startScanning();
      transport.simulateHostDiscovered('host-1', 'HostPlayer');
      expect(cb).toHaveBeenCalledWith('host-1', 'HostPlayer');
    });
  });

  describe('connect and join', () => {
    it('sends join message automatically after connecting', async () => {
      await client.connectToHost('host-1');
      expect(transport.sentMessages).toHaveLength(1);
      const sent = decodeLastSent(transport);
      expect(sent).toEqual({ type: 'join', protocolVersion: 1, playerName: 'Alice' });
    });
  });

  describe('joinResponse handling', () => {
    beforeEach(async () => {
      await client.connectToHost('host-1');
    });

    it('calls onJoinResult(true) and stores seat on accepted', () => {
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
      });
      transport.simulateMessageReceived('lobby', encodeMessage(response));

      expect(joinCb).toHaveBeenCalledWith(true, undefined);
    });

    it('calls onJoinResult(false, reason) on rejected', () => {
      const joinCb = jest.fn();
      client.onJoinResult(joinCb);

      const response = JSON.stringify({
        type: 'joinResponse',
        accepted: false,
        reason: 'Room is full',
      });
      transport.simulateMessageReceived('lobby', encodeMessage(response));

      expect(joinCb).toHaveBeenCalledWith(false, 'Room is full');
    });
  });

  describe('playerUpdate handling', () => {
    beforeEach(async () => {
      await client.connectToHost('host-1');
      // Simulate accepted join
      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({
          type: 'joinResponse', accepted: true, seat: 1,
          players: [{ seat: 0, name: 'Host', ready: true }, { seat: 1, name: 'Alice', ready: false }],
        })),
      );
    });

    it('updates players list via callback', () => {
      const playersCb = jest.fn();
      client.onPlayersChanged(playersCb);

      const updatedPlayers = [
        { seat: 0, name: 'Host', ready: true },
        { seat: 1, name: 'Alice', ready: false },
        { seat: 2, name: 'Bob', ready: false },
      ];
      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({ type: 'playerUpdate', players: updatedPlayers })),
      );

      expect(playersCb).toHaveBeenCalledWith(updatedPlayers);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --selectProjects engine tests/ble/LobbyClient.test.ts --no-coverage`
Expected: FAIL — cannot find module `../../src/services/ble/LobbyClient`

- [ ] **Step 3: Implement LobbyClient**

```typescript
// src/services/ble/LobbyClient.ts

import { BleClientTransport } from './BleTransport';
import { ChunkManager } from './ChunkManager';
import {
  LobbyPlayer,
  LobbyClientMessage,
  LobbyHostMessage,
  validateHostMessage,
  PROTOCOL_VERSION,
} from './LobbyProtocol';

const LOBBY_CHARACTERISTIC = 'lobby';

type LobbyClientState = 'idle' | 'scanning' | 'connecting' | 'joined' | 'ready' | 'gameStarting';

export class LobbyClient {
  private state: LobbyClientState = 'idle';
  private mySeat: number | null = null;
  private players: LobbyPlayer[] = [];
  private chunkManager = new ChunkManager();

  private _onHostDiscovered: ((hostId: string, hostName: string) => void) | null = null;
  private _onJoinResult: ((accepted: boolean, reason?: string) => void) | null = null;
  private _onPlayersChanged: ((players: LobbyPlayer[]) => void) | null = null;
  private _onGameStart: ((blinds: { sb: number; bb: number }) => void) | null = null;
  private _onDisconnected: (() => void) | null = null;
  private _onError: ((error: string) => void) | null = null;

  constructor(
    private transport: BleClientTransport,
    private playerName: string,
  ) {}

  async startScanning(): Promise<void> {
    this.state = 'scanning';
    this.transport.onHostDiscovered((hostId, hostName) => {
      this._onHostDiscovered?.(hostId, hostName);
    });
    await this.transport.startScanning('jet-holdem');
  }

  async connectToHost(hostId: string): Promise<void> {
    this.state = 'connecting';
    await this.transport.connectToHost(hostId);

    this.transport.onMessageReceived((_charId: string, data: Uint8Array) => {
      const json = this.chunkManager.decode('host', data);
      if (json) this.handleMessage(json);
    });

    // Auto-send join
    await this.sendToHost({ type: 'join', protocolVersion: PROTOCOL_VERSION, playerName: this.playerName });
  }

  setReady(): void {
    if (this.state !== 'joined') return;
    this.state = 'ready';
    this.sendToHost({ type: 'ready' });
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this.state = 'idle';
    this.mySeat = null;
    this.players = [];
    this.chunkManager.clear();
  }

  // --- Message handling ---

  private handleMessage(json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return;
    }

    const msg = validateHostMessage(parsed);
    if (!msg) return;

    switch (msg.type) {
      case 'joinResponse':
        this.handleJoinResponse(msg);
        break;
      case 'playerUpdate':
        this.players = msg.players;
        this._onPlayersChanged?.(msg.players);
        break;
      case 'gameStart':
        this.state = 'gameStarting';
        this._onGameStart?.(msg.blinds);
        break;
      case 'lobbyClosed':
        this.state = 'idle';
        this._onDisconnected?.();
        break;
    }
  }

  private handleJoinResponse(msg: LobbyHostMessage & { type: 'joinResponse' }): void {
    if (msg.accepted) {
      this.state = 'joined';
      this.mySeat = msg.seat;
      this.players = msg.players;
      this._onJoinResult?.(true);
    } else {
      this.state = 'idle';
      this._onJoinResult?.(false, msg.reason);
    }
  }

  // --- Callbacks ---

  onHostDiscovered(callback: (hostId: string, hostName: string) => void): void {
    this._onHostDiscovered = callback;
  }

  onJoinResult(callback: (accepted: boolean, reason?: string) => void): void {
    this._onJoinResult = callback;
  }

  onPlayersChanged(callback: (players: LobbyPlayer[]) => void): void {
    this._onPlayersChanged = callback;
  }

  onGameStart(callback: (blinds: { sb: number; bb: number }) => void): void {
    this._onGameStart = callback;
  }

  onDisconnected(callback: () => void): void {
    this._onDisconnected = callback;
  }

  onError(callback: (error: string) => void): void {
    this._onError = callback;
  }

  // --- Helpers ---

  private async sendToHost(msg: LobbyClientMessage): Promise<void> {
    const chunks = this.chunkManager.encode(JSON.stringify(msg));
    for (const chunk of chunks) {
      await this.transport.sendToHost(LOBBY_CHARACTERISTIC, chunk);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --selectProjects engine tests/ble/LobbyClient.test.ts --no-coverage`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/LobbyClient.ts tests/ble/LobbyClient.test.ts
git commit -m "feat(ble): add LobbyClient state machine"
```

#### Step group B: setReady, gameStart, lobbyClosed, disconnect

- [ ] **Step 6: Write failing tests for setReady, gameStart, lobbyClosed**

Append to the `describe('LobbyClient')` block in `tests/ble/LobbyClient.test.ts`:

```typescript
  describe('setReady', () => {
    beforeEach(async () => {
      await client.connectToHost('host-1');
      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({
          type: 'joinResponse', accepted: true, seat: 1,
          players: [{ seat: 0, name: 'Host', ready: true }, { seat: 1, name: 'Alice', ready: false }],
        })),
      );
    });

    it('sends ready message to host', () => {
      const countBefore = transport.sentMessages.length;
      client.setReady();
      expect(transport.sentMessages.length).toBe(countBefore + 1);
      const sent = decodeLastSent(transport);
      expect(sent).toEqual({ type: 'ready' });
    });
  });

  describe('gameStart handling', () => {
    beforeEach(async () => {
      await client.connectToHost('host-1');
      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({
          type: 'joinResponse', accepted: true, seat: 1,
          players: [{ seat: 0, name: 'Host', ready: true }, { seat: 1, name: 'Alice', ready: false }],
        })),
      );
    });

    it('fires onGameStart callback with blinds', () => {
      const gameStartCb = jest.fn();
      client.onGameStart(gameStartCb);

      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({ type: 'gameStart', blinds: { sb: 5, bb: 10 } })),
      );

      expect(gameStartCb).toHaveBeenCalledWith({ sb: 5, bb: 10 });
    });
  });

  describe('lobbyClosed handling', () => {
    beforeEach(async () => {
      await client.connectToHost('host-1');
      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({
          type: 'joinResponse', accepted: true, seat: 1,
          players: [{ seat: 0, name: 'Host', ready: true }, { seat: 1, name: 'Alice', ready: false }],
        })),
      );
    });

    it('fires onDisconnected callback when lobby is closed', () => {
      const disconnectCb = jest.fn();
      client.onDisconnected(disconnectCb);

      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({ type: 'lobbyClosed', reason: 'Host left' })),
      );

      expect(disconnectCb).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      await client.connectToHost('host-1');
      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({
          type: 'joinResponse', accepted: true, seat: 1,
          players: [{ seat: 0, name: 'Host', ready: true }, { seat: 1, name: 'Alice', ready: false }],
        })),
      );
    });

    it('resets client state on disconnect', async () => {
      await client.disconnect();
      // After disconnect, setReady should be a no-op (state is idle, not joined)
      const countBefore = transport.sentMessages.length;
      client.setReady();
      expect(transport.sentMessages.length).toBe(countBefore);
    });
  });
```

- [ ] **Step 7: Run tests to verify all pass**

Run: `npx jest --selectProjects engine tests/ble/LobbyClient.test.ts --no-coverage`
Expected: All 10 tests PASS (implementation already handles these)

- [ ] **Step 8: Commit**

```bash
git add tests/ble/LobbyClient.test.ts
git commit -m "test(ble): add LobbyClient tests for ready, gameStart, lobbyClosed, disconnect"
```

---

### Task 8: Integration Test — Full Lobby Flow

**Files:**
- Create: `tests/ble/integration/LobbyFlow.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// tests/ble/integration/LobbyFlow.test.ts

import { LobbyHost } from '../../../src/services/ble/LobbyHost';
import { LobbyClient } from '../../../src/services/ble/LobbyClient';
import {
  MockBleHostTransport,
  MockBleClientTransport,
  MockBleNetwork,
} from '../../../src/services/ble/MockBleTransport';

describe('LobbyFlow integration', () => {
  let hostTransport: MockBleHostTransport;
  let clientTransport1: MockBleClientTransport;
  let clientTransport2: MockBleClientTransport;
  let host: LobbyHost;
  let client1: LobbyClient;
  let client2: LobbyClient;

  beforeEach(() => {
    hostTransport = new MockBleHostTransport();
    clientTransport1 = new MockBleClientTransport();
    clientTransport2 = new MockBleClientTransport();
    MockBleNetwork.create(hostTransport, [clientTransport1, clientTransport2]);

    host = new LobbyHost(hostTransport, 'Host');
    client1 = new LobbyClient(clientTransport1, 'Alice');
    client2 = new LobbyClient(clientTransport2, 'Bob');
  });

  it('full flow: 2 clients join → ready → gameStart', async () => {
    const hostPlayersCb = jest.fn();
    const client1JoinCb = jest.fn();
    const client2JoinCb = jest.fn();
    const client1GameStartCb = jest.fn();
    const client2GameStartCb = jest.fn();
    const hostGameStartCb = jest.fn();

    host.onPlayersChanged(hostPlayersCb);
    host.onGameStart(hostGameStartCb);
    client1.onJoinResult(client1JoinCb);
    client2.onJoinResult(client2JoinCb);
    client1.onGameStart(client1GameStartCb);
    client2.onGameStart(client2GameStartCb);

    // Host starts lobby
    await host.start();

    // Client 1 joins
    hostTransport.simulateClientConnected('client-1');
    await client1.connectToHost('host-1');

    expect(client1JoinCb).toHaveBeenCalledWith(true, undefined);

    // Client 2 joins
    hostTransport.simulateClientConnected('client-2');
    await client2.connectToHost('host-1');

    expect(client2JoinCb).toHaveBeenCalledWith(true, undefined);

    // Both clients are listed on host
    const lastHostPlayers = hostPlayersCb.mock.calls[hostPlayersCb.mock.calls.length - 1][0];
    expect(lastHostPlayers).toHaveLength(3);

    // Both clients set ready
    client1.setReady();
    client2.setReady();

    // Host starts game
    host.startGame({ sb: 5, bb: 10 });

    expect(hostGameStartCb).toHaveBeenCalledWith({ sb: 5, bb: 10 });
    expect(client1GameStartCb).toHaveBeenCalledWith({ sb: 5, bb: 10 });
    expect(client2GameStartCb).toHaveBeenCalledWith({ sb: 5, bb: 10 });
  });

  it('client disconnect mid-lobby: player removed, seat freed', async () => {
    const hostPlayersCb = jest.fn();
    host.onPlayersChanged(hostPlayersCb);

    await host.start();

    // Client 1 joins
    hostTransport.simulateClientConnected('client-1');
    await client1.connectToHost('host-1');

    // Client 1 disconnects
    hostTransport.simulateClientDisconnected('client-1');

    const lastPlayers = hostPlayersCb.mock.calls[hostPlayersCb.mock.calls.length - 1][0];
    expect(lastPlayers).toHaveLength(1); // Only host remains
    expect(lastPlayers[0]).toEqual({ seat: 0, name: 'Host', ready: true });
  });

  it('host stop: all clients receive lobbyClosed', async () => {
    const client1DisconnectCb = jest.fn();
    const client2DisconnectCb = jest.fn();
    client1.onDisconnected(client1DisconnectCb);
    client2.onDisconnected(client2DisconnectCb);

    await host.start();

    hostTransport.simulateClientConnected('client-1');
    await client1.connectToHost('host-1');
    hostTransport.simulateClientConnected('client-2');
    await client2.connectToHost('host-1');

    await host.stop();

    expect(client1DisconnectCb).toHaveBeenCalled();
    expect(client2DisconnectCb).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx jest --selectProjects engine tests/ble/integration/LobbyFlow.test.ts --no-coverage`
Expected: All 3 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/ble/integration/LobbyFlow.test.ts
git commit -m "test(ble): add LobbyFlow integration tests"
```

---

### Task 9: Barrel Export & Final Verification

**Files:**
- Create: `src/services/ble/index.ts`

- [ ] **Step 1: Create barrel export**

```typescript
// src/services/ble/index.ts

export type { BleHostTransport, BleClientTransport } from './BleTransport';
export {
  PROTOCOL_VERSION,
  validateClientMessage,
  validateHostMessage,
} from './LobbyProtocol';
export type {
  LobbyPlayer,
  LobbyClientMessage,
  LobbyHostMessage,
} from './LobbyProtocol';
export { ChunkManager } from './ChunkManager';
export { LobbyHost } from './LobbyHost';
export { LobbyClient } from './LobbyClient';
// MockBleTransport classes are test-only — import directly from './MockBleTransport' in tests
```

- [ ] **Step 2: Verify TypeScript compiles the barrel export**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run all BLE tests**

Run: `npx jest --selectProjects engine --testPathPattern='tests/ble' --no-coverage`
Expected: All tests PASS (LobbyProtocol, ChunkManager, MockBleTransport, LobbyHost, LobbyClient, LobbyFlow)

- [ ] **Step 4: Run full test suite to check for regressions**

Run: `npx jest --no-coverage`
Expected: All existing tests still PASS, all new BLE tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/index.ts
git commit -m "feat(ble): add barrel export for ble module"
```
