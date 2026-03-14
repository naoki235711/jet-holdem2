# BLE Transport Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real BLE transport classes (`BleHostTransportImpl`, `BleClientTransportImpl`) that fulfill existing interfaces, plus build infrastructure (Expo Config Plugin, EAS Build, BLE permissions).

**Architecture:** Two impl classes wrap platform-specific BLE libraries — `@sfourdrinier/react-native-ble-plx` for Central/Client and `react-native-multi-ble-peripheral` for Peripheral/Host. A constants file maps logical characteristic names to BLE UUIDs. A custom Expo Config Plugin injects BLE permissions. EAS Build replaces Expo Go for native module access.

**Tech Stack:** TypeScript, React Native 0.83, Expo SDK 55, `@sfourdrinier/react-native-ble-plx` ^3.5.0, `react-native-multi-ble-peripheral` ^0.1.8, Jest 30

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/services/ble/bleConstants.ts` | BLE Service UUID + Characteristic UUID constants, logical name→UUID mapping factory |
| `src/services/ble/BleClientTransportImpl.ts` | `BleClientTransport` impl wrapping `@sfourdrinier/react-native-ble-plx` (Central/GATT Client) |
| `src/services/ble/BleHostTransportImpl.ts` | `BleHostTransport` impl wrapping `react-native-multi-ble-peripheral` (Peripheral/GATT Server) |
| `plugins/withBlePermissions.js` | Expo Config Plugin — injects iOS usage description + Android BLE permissions |
| `eas.json` | EAS Build profiles (development, preview, production) |
| `tests/ble/bleConstants.test.ts` | Tests for UUID constants and mapping |
| `tests/ble/BleClientTransportImpl.test.ts` | Tests for client transport with mocked native modules |
| `tests/ble/BleHostTransportImpl.test.ts` | Tests for host transport with mocked native modules |

### Modified Files

| File | Changes |
|------|---------|
| `app.json` | Add `@sfourdrinier/react-native-ble-plx` and `./plugins/withBlePermissions` to `plugins` array |
| `package.json` | Add `@sfourdrinier/react-native-ble-plx` and `react-native-multi-ble-peripheral` dependencies |
| `src/services/ble/index.ts` | Export `bleConstants`, `BleClientTransportImpl`, `BleHostTransportImpl` |

---

## Chunk 1: Constants, Config & Build Infrastructure

### Task 1: BLE Constants

**Files:**
- Create: `src/services/ble/bleConstants.ts`
- Create: `tests/ble/bleConstants.test.ts`

- [ ] **Step 1: Generate UUIDs**

Run: `uuidgen && uuidgen && uuidgen && uuidgen && uuidgen`

Save the 5 UUIDs for use in the next step (service, lobby, gameState, privateHand, playerAction).

- [ ] **Step 2: Write failing test for bleConstants**

```typescript
// tests/ble/bleConstants.test.ts
import {
  BLE_SERVICE_UUID,
  LOBBY_CHARACTERISTIC_UUID,
  GAME_STATE_CHARACTERISTIC_UUID,
  PRIVATE_HAND_CHARACTERISTIC_UUID,
  PLAYER_ACTION_CHARACTERISTIC_UUID,
  createCharacteristicMap,
} from '../../src/services/ble/bleConstants';

describe('bleConstants', () => {
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it('exports all required UUIDs as valid v4 UUID strings', () => {
    expect(BLE_SERVICE_UUID).toMatch(UUID_V4_REGEX);
    expect(LOBBY_CHARACTERISTIC_UUID).toMatch(UUID_V4_REGEX);
    expect(GAME_STATE_CHARACTERISTIC_UUID).toMatch(UUID_V4_REGEX);
    expect(PRIVATE_HAND_CHARACTERISTIC_UUID).toMatch(UUID_V4_REGEX);
    expect(PLAYER_ACTION_CHARACTERISTIC_UUID).toMatch(UUID_V4_REGEX);
  });

  it('all UUIDs are unique', () => {
    const uuids = [
      BLE_SERVICE_UUID,
      LOBBY_CHARACTERISTIC_UUID,
      GAME_STATE_CHARACTERISTIC_UUID,
      PRIVATE_HAND_CHARACTERISTIC_UUID,
      PLAYER_ACTION_CHARACTERISTIC_UUID,
    ];
    expect(new Set(uuids).size).toBe(uuids.length);
  });

  describe('createCharacteristicMap', () => {
    it('returns a Map with lobby mapping', () => {
      const map = createCharacteristicMap();
      expect(map.get('lobby')).toBe(LOBBY_CHARACTERISTIC_UUID);
    });

    it('returns a Map with game phase mappings', () => {
      const map = createCharacteristicMap();
      expect(map.get('gameState')).toBe(GAME_STATE_CHARACTERISTIC_UUID);
      expect(map.get('privateHand')).toBe(PRIVATE_HAND_CHARACTERISTIC_UUID);
      expect(map.get('playerAction')).toBe(PLAYER_ACTION_CHARACTERISTIC_UUID);
    });

    it('contains exactly 4 entries', () => {
      const map = createCharacteristicMap();
      expect(map.size).toBe(4);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/ble/bleConstants.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 4: Write bleConstants implementation**

```typescript
// src/services/ble/bleConstants.ts

// BLE Service UUID (v4, generated via uuidgen)
export const BLE_SERVICE_UUID = '<UUID-1-FROM-STEP-1>';

// Characteristic UUIDs
export const LOBBY_CHARACTERISTIC_UUID = '<UUID-2-FROM-STEP-1>';
export const GAME_STATE_CHARACTERISTIC_UUID = '<UUID-3-FROM-STEP-1>';
export const PRIVATE_HAND_CHARACTERISTIC_UUID = '<UUID-4-FROM-STEP-1>';
export const PLAYER_ACTION_CHARACTERISTIC_UUID = '<UUID-5-FROM-STEP-1>';

/**
 * Creates a Map of logical characteristic names to BLE UUIDs.
 * Used by BleClientTransportImpl and BleHostTransportImpl constructors.
 */
export function createCharacteristicMap(): Map<string, string> {
  return new Map([
    ['lobby', LOBBY_CHARACTERISTIC_UUID],
    ['gameState', GAME_STATE_CHARACTERISTIC_UUID],
    ['privateHand', PRIVATE_HAND_CHARACTERISTIC_UUID],
    ['playerAction', PLAYER_ACTION_CHARACTERISTIC_UUID],
  ]);
}
```

Replace `<UUID-N-FROM-STEP-1>` with the actual lowercase UUIDs from Step 1.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/ble/bleConstants.test.ts --no-coverage`
Expected: PASS — all 5 tests green

- [ ] **Step 6: Commit**

```bash
git add src/services/ble/bleConstants.ts tests/ble/bleConstants.test.ts
git commit -m "feat(ble): add BLE UUID constants and characteristic map"
```

---

### Task 2: Expo Config Plugin

**Files:**
- Create: `plugins/withBlePermissions.js`

- [ ] **Step 1: Create the plugins directory**

Run: `mkdir -p plugins`

- [ ] **Step 2: Write the Expo Config Plugin**

```javascript
// plugins/withBlePermissions.js
const { withInfoPlist, withAndroidManifest } = require('expo/config-plugins');

function withBlePermissions(config) {
  // iOS: add Bluetooth usage description
  config = withInfoPlist(config, (config) => {
    config.modResults.NSBluetoothAlwaysUsageDescription =
      'This app uses Bluetooth to connect players for local multiplayer poker.';
    return config;
  });

  // Android: add BLE permissions
  config = withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest;

    // Ensure uses-permission array exists
    if (!mainApplication['uses-permission']) {
      mainApplication['uses-permission'] = [];
    }

    const permissions = [
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_ADVERTISE',
      'android.permission.ACCESS_FINE_LOCATION',
    ];

    for (const perm of permissions) {
      const exists = mainApplication['uses-permission'].some(
        (p) => p.$?.['android:name'] === perm
      );
      if (!exists) {
        mainApplication['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    }

    return config;
  });

  return config;
}

module.exports = withBlePermissions;
```

- [ ] **Step 3: Verify the plugin is loadable**

Run: `node -e "const p = require('./plugins/withBlePermissions'); console.log(typeof p)"`
Expected: `function`

- [ ] **Step 4: Commit**

```bash
git add plugins/withBlePermissions.js
git commit -m "feat(ble): add Expo config plugin for BLE permissions"
```

---

### Task 3: app.json — Add BLE Plugins

**Files:**
- Modify: `app.json`

- [ ] **Step 1: Add BLE plugins to app.json**

In `app.json`, change the `plugins` array from:
```json
"plugins": [
  "expo-router"
]
```
to:
```json
"plugins": [
  "expo-router",
  "@sfourdrinier/react-native-ble-plx",
  "./plugins/withBlePermissions"
]
```

- [ ] **Step 2: Verify JSON is well-formed**

Run: `node -e "require('./app.json'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app.json
git commit -m "feat(ble): add BLE plugins to app.json"
```

---

### Task 4: EAS Build Configuration

**Files:**
- Create: `eas.json`

- [ ] **Step 1: Create eas.json**

```json
{
  "cli": { "version": ">= 15.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

- [ ] **Step 2: Verify JSON is well-formed**

Run: `node -e "require('./eas.json'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add eas.json
git commit -m "feat(ble): add EAS Build configuration"
```

---

### Task 5: Install BLE Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install BLE libraries**

Run: `npx expo install @sfourdrinier/react-native-ble-plx react-native-multi-ble-peripheral`

If `npx expo install` doesn't resolve these (non-Expo packages), fall back to:
Run: `npm install @sfourdrinier/react-native-ble-plx@^3.5.0 react-native-multi-ble-peripheral@^0.1.8`

- [ ] **Step 2: Verify package.json updated**

Run: `grep -E "ble-plx|multi-ble-peripheral" package.json`
Expected: Both packages appear in dependencies.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(ble): add BLE native library dependencies"
```

---

### Task 6: Update barrel export

**Files:**
- Modify: `src/services/ble/index.ts`

- [ ] **Step 1: Add new exports to index.ts**

Add these lines to `src/services/ble/index.ts`:

```typescript
export {
  BLE_SERVICE_UUID,
  LOBBY_CHARACTERISTIC_UUID,
  GAME_STATE_CHARACTERISTIC_UUID,
  PRIVATE_HAND_CHARACTERISTIC_UUID,
  PLAYER_ACTION_CHARACTERISTIC_UUID,
  createCharacteristicMap,
} from './bleConstants';
```

Do NOT add `BleClientTransportImpl` or `BleHostTransportImpl` exports yet — they will be added after implementation in Chunks 2 and 3.

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx jest --no-coverage`
Expected: All existing tests pass (no regressions).

- [ ] **Step 3: Commit**

```bash
git add src/services/ble/index.ts
git commit -m "feat(ble): export BLE constants from barrel"
```

---

## Chunk 2: BleClientTransportImpl (TDD)

### Task 7: BleClientTransportImpl — Test Setup & Scanning

**Files:**
- Create: `tests/ble/BleClientTransportImpl.test.ts`
- Create: `src/services/ble/BleClientTransportImpl.ts`

The test file mocks `@sfourdrinier/react-native-ble-plx` at the top. All tests in this chunk share the same file.

- [ ] **Step 1: Write test file with mock setup and scanning tests**

```typescript
// tests/ble/BleClientTransportImpl.test.ts
import { BleClientTransportImpl } from '../../src/services/ble/BleClientTransportImpl';
import { BleManager } from '@sfourdrinier/react-native-ble-plx';
import {
  BLE_SERVICE_UUID,
  LOBBY_CHARACTERISTIC_UUID,
} from '../../src/services/ble/bleConstants';

// --- Mock setup ---

const mockStopDeviceScan = jest.fn();
const mockConnectToDevice = jest.fn();
const mockCancelConnection = jest.fn();
const mockOnStateChange = jest.fn();

// Capture the scan callback when startDeviceScan is called
let scanCallback: ((error: any, device: any) => void) | null = null;
const mockStartDeviceScan = jest.fn((_uuids, _options, callback) => {
  scanCallback = callback;
});

jest.mock('@sfourdrinier/react-native-ble-plx', () => ({
  BleManager: jest.fn().mockImplementation(() => ({
    startDeviceScan: mockStartDeviceScan,
    stopDeviceScan: mockStopDeviceScan,
    connectToDevice: mockConnectToDevice,
    onStateChange: mockOnStateChange,
  })),
  State: {
    PoweredOn: 'PoweredOn',
    PoweredOff: 'PoweredOff',
  },
}));

describe('BleClientTransportImpl', () => {
  let transport: BleClientTransportImpl;
  const charMap = new Map([['lobby', LOBBY_CHARACTERISTIC_UUID]]);

  beforeEach(() => {
    jest.clearAllMocks();
    scanCallback = null;
    transport = new BleClientTransportImpl(charMap);
  });

  describe('startScanning', () => {
    it('calls BleManager.startDeviceScan with the service UUID', async () => {
      await transport.startScanning(BLE_SERVICE_UUID);
      expect(mockStartDeviceScan).toHaveBeenCalledWith(
        [BLE_SERVICE_UUID],
        expect.any(Object),
        expect.any(Function),
      );
    });
  });

  describe('stopScanning', () => {
    it('calls BleManager.stopDeviceScan', async () => {
      await transport.stopScanning();
      expect(mockStopDeviceScan).toHaveBeenCalled();
    });
  });

  describe('onHostDiscovered', () => {
    it('fires callback when scan finds a device', async () => {
      const cb = jest.fn();
      transport.onHostDiscovered(cb);
      await transport.startScanning(BLE_SERVICE_UUID);

      // Simulate device discovery
      scanCallback!(null, { id: 'device-1', localName: 'HostA' });

      expect(cb).toHaveBeenCalledWith('device-1', 'HostA');
    });

    it('uses device.name as fallback when localName is null', async () => {
      const cb = jest.fn();
      transport.onHostDiscovered(cb);
      await transport.startScanning(BLE_SERVICE_UUID);

      scanCallback!(null, { id: 'device-2', localName: null, name: 'HostB' });

      expect(cb).toHaveBeenCalledWith('device-2', 'HostB');
    });

    it('uses "Unknown" when both localName and name are null', async () => {
      const cb = jest.fn();
      transport.onHostDiscovered(cb);
      await transport.startScanning(BLE_SERVICE_UUID);

      scanCallback!(null, { id: 'device-3', localName: null, name: null });

      expect(cb).toHaveBeenCalledWith('device-3', 'Unknown');
    });

    it('does not fire callback on scan error', async () => {
      const cb = jest.fn();
      transport.onHostDiscovered(cb);
      await transport.startScanning(BLE_SERVICE_UUID);

      scanCallback!(new Error('scan error'), null);

      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('scan timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('auto-stops scanning after 30 seconds', async () => {
      await transport.startScanning(BLE_SERVICE_UUID);
      expect(mockStopDeviceScan).not.toHaveBeenCalled();

      jest.advanceTimersByTime(30_000);

      expect(mockStopDeviceScan).toHaveBeenCalled();
    });

    it('clears timeout when stopScanning is called manually', async () => {
      await transport.startScanning(BLE_SERVICE_UUID);
      await transport.stopScanning();

      jest.advanceTimersByTime(30_000);

      // stopDeviceScan called once (manual), not twice
      expect(mockStopDeviceScan).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ble/BleClientTransportImpl.test.ts --no-coverage`
Expected: FAIL — module `BleClientTransportImpl` not found

- [ ] **Step 3: Write minimal BleClientTransportImpl (scanning only)**

```typescript
// src/services/ble/BleClientTransportImpl.ts
import { BleManager, Device, Subscription } from '@sfourdrinier/react-native-ble-plx';
import { BleClientTransport } from './BleTransport';

export class BleClientTransportImpl implements BleClientTransport {
  private manager: BleManager;
  private charMap: Map<string, string>;
  private reverseCharMap: Map<string, string>;
  private connectedDevice: Device | null = null;
  private subscriptions: Subscription[] = [];
  private scanTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private static readonly SCAN_TIMEOUT_MS = 30_000;

  private _onHostDiscovered: ((hostId: string, hostName: string) => void) | null = null;
  private _onMessageReceived: ((characteristicId: string, data: Uint8Array) => void) | null = null;

  constructor(characteristicMap: Map<string, string>) {
    this.manager = new BleManager();
    this.charMap = characteristicMap;
    // Build reverse map: UUID → logical name
    this.reverseCharMap = new Map();
    for (const [name, uuid] of characteristicMap) {
      this.reverseCharMap.set(uuid, name);
    }
  }

  async startScanning(serviceUuid: string): Promise<void> {
    this.manager.startDeviceScan([serviceUuid], { allowDuplicates: false }, (error, device) => {
      if (error || !device) return;
      const name = device.localName ?? device.name ?? 'Unknown';
      this._onHostDiscovered?.(device.id, name);
    });

    // Auto-stop after timeout
    this.scanTimeoutId = setTimeout(() => {
      this.manager.stopDeviceScan();
      this.scanTimeoutId = null;
    }, BleClientTransportImpl.SCAN_TIMEOUT_MS);
  }

  async stopScanning(): Promise<void> {
    if (this.scanTimeoutId) {
      clearTimeout(this.scanTimeoutId);
      this.scanTimeoutId = null;
    }
    this.manager.stopDeviceScan();
  }

  onHostDiscovered(callback: (hostId: string, hostName: string) => void): void {
    this._onHostDiscovered = callback;
  }

  async connectToHost(_hostId: string): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async disconnect(): Promise<void> {
    throw new Error('Not implemented yet');
  }

  onMessageReceived(callback: (characteristicId: string, data: Uint8Array) => void): void {
    this._onMessageReceived = callback;
  }

  async sendToHost(_characteristicId: string, _data: Uint8Array): Promise<void> {
    throw new Error('Not implemented yet');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ble/BleClientTransportImpl.test.ts --no-coverage`
Expected: PASS — all scanning tests green

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/BleClientTransportImpl.ts tests/ble/BleClientTransportImpl.test.ts
git commit -m "feat(ble): add BleClientTransportImpl scanning (TDD red-green)"
```

---

### Task 8: BleClientTransportImpl — Connect & Monitor

**Files:**
- Modify: `tests/ble/BleClientTransportImpl.test.ts`
- Modify: `src/services/ble/BleClientTransportImpl.ts`

- [ ] **Step 1: Write failing tests for connectToHost and message monitoring**

Append inside the top-level `describe('BleClientTransportImpl', ...)` block in `tests/ble/BleClientTransportImpl.test.ts`:

```typescript
  describe('connectToHost', () => {
    let monitorCallback: ((error: any, char: any) => void) | null;
    const mockMonitorCharacteristic = jest.fn((_sid, _cid, cb) => {
      monitorCallback = cb;
      return { remove: jest.fn() };
    });
    const mockDiscoverAll = jest.fn().mockResolvedValue({
      monitorCharacteristicForService: mockMonitorCharacteristic,
      onDisconnected: jest.fn(),
      cancelConnection: mockCancelConnection,
    });

    beforeEach(() => {
      monitorCallback = null;
      mockConnectToDevice.mockResolvedValue({
        id: 'host-1',
        discoverAllServicesAndCharacteristics: mockDiscoverAll,
        monitorCharacteristicForService: mockMonitorCharacteristic,
        onDisconnected: jest.fn(),
        cancelConnection: mockCancelConnection,
      });
    });

    it('connects and discovers services', async () => {
      await transport.connectToHost('host-1');
      expect(mockConnectToDevice).toHaveBeenCalledWith('host-1');
      expect(mockDiscoverAll).toHaveBeenCalled();
    });

    it('subscribes to notifications on each characteristic in the map', async () => {
      await transport.connectToHost('host-1');
      expect(mockMonitorCharacteristic).toHaveBeenCalledWith(
        BLE_SERVICE_UUID,
        LOBBY_CHARACTERISTIC_UUID,
        expect.any(Function),
      );
    });

    it('routes incoming notifications to onMessageReceived with logical name', async () => {
      const msgCb = jest.fn();
      transport.onMessageReceived(msgCb);
      await transport.connectToHost('host-1');

      // Simulate incoming BLE notification (base64 encoded)
      const testData = new Uint8Array([1, 2, 3]);
      const base64 = Buffer.from(testData).toString('base64');
      monitorCallback!(null, {
        uuid: LOBBY_CHARACTERISTIC_UUID,
        value: base64,
      });

      expect(msgCb).toHaveBeenCalledWith('lobby', expect.any(Uint8Array));
      const receivedData = msgCb.mock.calls[0][1];
      expect(Array.from(receivedData)).toEqual([1, 2, 3]);
    });

    it('ignores notification errors without crashing', async () => {
      const msgCb = jest.fn();
      transport.onMessageReceived(msgCb);
      await transport.connectToHost('host-1');

      monitorCallback!(new Error('notification error'), null);

      expect(msgCb).not.toHaveBeenCalled();
    });
  });

  describe('disconnect detection', () => {
    let mockOnDisconnected: jest.Mock;
    const mockMonitorChar = jest.fn((_sid, _cid, _cb) => ({
      remove: jest.fn(),
    }));

    beforeEach(() => {
      mockOnDisconnected = jest.fn();
      mockConnectToDevice.mockResolvedValue({
        id: 'host-1',
        discoverAllServicesAndCharacteristics: jest.fn().mockResolvedValue({
          monitorCharacteristicForService: mockMonitorChar,
          cancelConnection: mockCancelConnection,
          onDisconnected: mockOnDisconnected,
        }),
      });
    });

    it('calls onDisconnected listener after connecting', async () => {
      await transport.connectToHost('host-1');
      expect(mockOnDisconnected).toHaveBeenCalledWith(expect.any(Function));
    });
  });
```

- [ ] **Step 2: Run test to verify the new tests fail**

Run: `npx jest tests/ble/BleClientTransportImpl.test.ts --no-coverage`
Expected: FAIL — "Not implemented yet" error from `connectToHost`

- [ ] **Step 3: Implement connectToHost and notification monitoring**

Replace the `connectToHost` method in `src/services/ble/BleClientTransportImpl.ts`:

```typescript
  async connectToHost(hostId: string): Promise<void> {
    const device = await this.manager.connectToDevice(hostId);
    this.connectedDevice = await device.discoverAllServicesAndCharacteristics();

    // Listen for unexpected disconnection
    this.connectedDevice.onDisconnected(() => {
      this.connectedDevice = null;
      this.subscriptions = [];
    });

    // Subscribe to notifications for each characteristic
    for (const [_logicalName, uuid] of this.charMap) {
      const sub = this.connectedDevice.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        uuid,
        (error, characteristic) => {
          if (error || !characteristic?.value) return;
          const logicalName = this.reverseCharMap.get(characteristic.uuid);
          if (!logicalName) return;
          const bytes = base64ToUint8Array(characteristic.value);
          this._onMessageReceived?.(logicalName, bytes);
        },
      );
      this.subscriptions.push(sub);
    }
  }
```

Also add the `BLE_SERVICE_UUID` import at the top:

```typescript
import { BLE_SERVICE_UUID } from './bleConstants';
```

And add a helper function at the bottom of the file (module-level, not in class):

```typescript
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ble/BleClientTransportImpl.test.ts --no-coverage`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/BleClientTransportImpl.ts tests/ble/BleClientTransportImpl.test.ts
git commit -m "feat(ble): add BleClientTransportImpl connect and notification monitoring"
```

---

### Task 9: BleClientTransportImpl — Send & Disconnect

**Files:**
- Modify: `tests/ble/BleClientTransportImpl.test.ts`
- Modify: `src/services/ble/BleClientTransportImpl.ts`

- [ ] **Step 1: Write failing tests for sendToHost and disconnect**

Append inside the top-level `describe` block:

```typescript
  describe('sendToHost', () => {
    const mockWriteCharacteristic = jest.fn().mockResolvedValue(undefined);
    const mockMonitorCharacteristic = jest.fn((_sid, _cid, _cb) => ({
      remove: jest.fn(),
    }));

    beforeEach(() => {
      mockConnectToDevice.mockResolvedValue({
        id: 'host-1',
        discoverAllServicesAndCharacteristics: jest.fn().mockResolvedValue({
          monitorCharacteristicForService: mockMonitorCharacteristic,
          writeCharacteristicWithResponseForService: mockWriteCharacteristic,
          onDisconnected: jest.fn(),
          cancelConnection: mockCancelConnection,
        }),
      });
    });

    it('writes base64-encoded data to the correct characteristic UUID', async () => {
      await transport.connectToHost('host-1');

      const data = new Uint8Array([10, 20, 30]);
      await transport.sendToHost('lobby', data);

      expect(mockWriteCharacteristic).toHaveBeenCalledWith(
        BLE_SERVICE_UUID,
        LOBBY_CHARACTERISTIC_UUID,
        expect.any(String), // base64
      );
    });

    it('throws if not connected', async () => {
      await expect(
        transport.sendToHost('lobby', new Uint8Array([1])),
      ).rejects.toThrow();
    });

    it('throws for unknown logical name', async () => {
      await transport.connectToHost('host-1');

      await expect(
        transport.sendToHost('nonexistent', new Uint8Array([1])),
      ).rejects.toThrow('Unknown characteristic');
    });
  });

  describe('disconnect', () => {
    const mockRemove = jest.fn();
    const mockMonitorCharacteristic = jest.fn((_sid, _cid, _cb) => ({
      remove: mockRemove,
    }));

    beforeEach(() => {
      // cancelConnection must be on the discovered device (connectedDevice)
      mockConnectToDevice.mockResolvedValue({
        id: 'host-1',
        discoverAllServicesAndCharacteristics: jest.fn().mockResolvedValue({
          monitorCharacteristicForService: mockMonitorCharacteristic,
          onDisconnected: jest.fn(),
          cancelConnection: mockCancelConnection,
        }),
      });
    });

    it('cancels connection and removes subscriptions', async () => {
      await transport.connectToHost('host-1');
      await transport.disconnect();

      expect(mockCancelConnection).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalled();
    });

    it('is safe to call when not connected', async () => {
      await expect(transport.disconnect()).resolves.not.toThrow();
    });
  });
```

- [ ] **Step 2: Run test to verify the new tests fail**

Run: `npx jest tests/ble/BleClientTransportImpl.test.ts --no-coverage`
Expected: FAIL — "Not implemented yet" errors

- [ ] **Step 3: Implement sendToHost and disconnect**

Replace the `sendToHost` and `disconnect` methods:

```typescript
  async sendToHost(characteristicId: string, data: Uint8Array): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('Not connected to host');
    }
    const uuid = this.charMap.get(characteristicId);
    if (!uuid) {
      throw new Error(`Unknown characteristic: ${characteristicId}`);
    }
    const base64 = uint8ArrayToBase64(data);
    await this.connectedDevice.writeCharacteristicWithResponseForService(
      BLE_SERVICE_UUID,
      uuid,
      base64,
    );
  }

  async disconnect(): Promise<void> {
    for (const sub of this.subscriptions) {
      sub.remove();
    }
    this.subscriptions = [];
    if (this.connectedDevice) {
      await this.connectedDevice.cancelConnection();
      this.connectedDevice = null;
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ble/BleClientTransportImpl.test.ts --no-coverage`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/BleClientTransportImpl.ts tests/ble/BleClientTransportImpl.test.ts
git commit -m "feat(ble): add BleClientTransportImpl send and disconnect"
```

---

## Chunk 3: BleHostTransportImpl (TDD)

### Task 10: BleHostTransportImpl — Test Setup & Advertising

**Files:**
- Create: `tests/ble/BleHostTransportImpl.test.ts`
- Create: `src/services/ble/BleHostTransportImpl.ts`

- [ ] **Step 1: Write test file with mock setup and advertising tests**

```typescript
// tests/ble/BleHostTransportImpl.test.ts
import { BleHostTransportImpl } from '../../src/services/ble/BleHostTransportImpl';
import {
  BLE_SERVICE_UUID,
  LOBBY_CHARACTERISTIC_UUID,
} from '../../src/services/ble/bleConstants';

// --- Mock setup ---

const mockAddService = jest.fn().mockResolvedValue(undefined);
const mockAddCharacteristic = jest.fn().mockResolvedValue(undefined);
const mockStart = jest.fn().mockResolvedValue(undefined);
const mockStop = jest.fn().mockResolvedValue(undefined);
const mockSendNotification = jest.fn().mockResolvedValue(undefined);

// Capture the onWrite listener
let writeListener: ((event: { requestId: string; deviceId: string; characteristicId: string; data: number[] }) => void) | null = null;
const mockOnWrite = jest.fn((cb) => {
  writeListener = cb;
});

jest.mock('react-native-multi-ble-peripheral', () => ({
  addService: (...args: any[]) => mockAddService(...args),
  addCharacteristic: (...args: any[]) => mockAddCharacteristic(...args),
  start: (...args: any[]) => mockStart(...args),
  stop: (...args: any[]) => mockStop(...args),
  sendNotification: (...args: any[]) => mockSendNotification(...args),
  onWrite: (...args: any[]) => mockOnWrite(...args),
}));

describe('BleHostTransportImpl', () => {
  let transport: BleHostTransportImpl;
  const charMap = new Map([['lobby', LOBBY_CHARACTERISTIC_UUID]]);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    writeListener = null;
    transport = new BleHostTransportImpl(charMap);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('startAdvertising', () => {
    it('registers service and lobby characteristic, then starts', async () => {
      await transport.startAdvertising('JetHoldem');

      expect(mockAddService).toHaveBeenCalledWith(BLE_SERVICE_UUID);
      expect(mockAddCharacteristic).toHaveBeenCalledWith(
        BLE_SERVICE_UUID,
        LOBBY_CHARACTERISTIC_UUID,
        expect.any(Number), // permissions bitmask
      );
      expect(mockStart).toHaveBeenCalled();
    });

    it('registers onWrite listener', async () => {
      await transport.startAdvertising('JetHoldem');
      expect(mockOnWrite).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('stopAdvertising', () => {
    it('calls peripheral stop', async () => {
      await transport.startAdvertising('JetHoldem');
      await transport.stopAdvertising();
      expect(mockStop).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ble/BleHostTransportImpl.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal BleHostTransportImpl (advertising only)**

```typescript
// src/services/ble/BleHostTransportImpl.ts
import Peripheral from 'react-native-multi-ble-peripheral';
import { BleHostTransport } from './BleTransport';
import { BLE_SERVICE_UUID } from './bleConstants';

// Characteristic property flags for react-native-multi-ble-peripheral
const READ = 0x02;
const WRITE = 0x08;
const NOTIFY = 0x10;

const CLIENT_TIMEOUT_MS = 30_000;

export class BleHostTransportImpl implements BleHostTransport {
  private charMap: Map<string, string>;
  private reverseCharMap: Map<string, string>;
  private connectedClients = new Map<string, ReturnType<typeof setTimeout>>();

  private _onClientConnected: ((clientId: string) => void) | null = null;
  private _onClientDisconnected: ((clientId: string) => void) | null = null;
  private _onMessageReceived:
    | ((clientId: string, characteristicId: string, data: Uint8Array) => void)
    | null = null;

  constructor(characteristicMap: Map<string, string>) {
    this.charMap = characteristicMap;
    this.reverseCharMap = new Map();
    for (const [name, uuid] of characteristicMap) {
      this.reverseCharMap.set(uuid, name);
    }
  }

  // Note: serviceName is not used by react-native-multi-ble-peripheral's start().
  // The peripheral advertises the service UUID; the human-readable name comes from
  // the device's Bluetooth name set at the OS level.
  async startAdvertising(_serviceName: string): Promise<void> {
    await Peripheral.addService(BLE_SERVICE_UUID);

    // Note: All characteristics currently get READ|WRITE|NOTIFY. When game-phase
    // characteristics are added (Doc 3), permissions should be differentiated per
    // the spec's GATT table (e.g., PlayerAction = WRITE only, GameState = READ|NOTIFY).
    for (const [_logicalName, uuid] of this.charMap) {
      await Peripheral.addCharacteristic(BLE_SERVICE_UUID, uuid, READ | WRITE | NOTIFY);
    }

    Peripheral.onWrite((event) => {
      this.handleWrite(event);
    });

    await Peripheral.start();
  }

  async stopAdvertising(): Promise<void> {
    // Clear all client timeout timers
    for (const timer of this.connectedClients.values()) {
      clearTimeout(timer);
    }
    this.connectedClients.clear();
    await Peripheral.stop();
  }

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
    _clientId: string,
    _characteristicId: string,
    _data: Uint8Array,
  ): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async sendToAll(_characteristicId: string, _data: Uint8Array): Promise<void> {
    throw new Error('Not implemented yet');
  }

  private handleWrite(event: {
    requestId: string;
    deviceId: string;
    characteristicId: string;
    data: number[];
  }): void {
    const { deviceId, characteristicId, data } = event;

    // Client management: detect new clients by first write
    if (!this.connectedClients.has(deviceId)) {
      this._onClientConnected?.(deviceId);
    }
    this.resetClientTimeout(deviceId);

    // Route message
    const logicalName = this.reverseCharMap.get(characteristicId);
    if (logicalName) {
      this._onMessageReceived?.(deviceId, logicalName, new Uint8Array(data));
    }
  }

  private resetClientTimeout(clientId: string): void {
    const existing = this.connectedClients.get(clientId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.connectedClients.delete(clientId);
      this._onClientDisconnected?.(clientId);
    }, CLIENT_TIMEOUT_MS);

    this.connectedClients.set(clientId, timer);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ble/BleHostTransportImpl.test.ts --no-coverage`
Expected: PASS — advertising tests green

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/BleHostTransportImpl.ts tests/ble/BleHostTransportImpl.test.ts
git commit -m "feat(ble): add BleHostTransportImpl advertising (TDD red-green)"
```

---

### Task 11: BleHostTransportImpl — Client Management

**Files:**
- Modify: `tests/ble/BleHostTransportImpl.test.ts`
- (No impl changes needed — logic already in Task 10)

- [ ] **Step 1: Write tests for client connect/disconnect detection**

Append inside the top-level `describe('BleHostTransportImpl', ...)` block:

```typescript
  describe('client management', () => {
    beforeEach(async () => {
      await transport.startAdvertising('JetHoldem');
    });

    it('fires onClientConnected on first write from a new client', () => {
      const cb = jest.fn();
      transport.onClientConnected(cb);

      writeListener!({
        requestId: 'req-1',
        deviceId: 'client-A',
        characteristicId: LOBBY_CHARACTERISTIC_UUID,
        data: [1, 2, 3],
      });

      expect(cb).toHaveBeenCalledWith('client-A');
    });

    it('does not fire onClientConnected on subsequent writes from same client', () => {
      const cb = jest.fn();
      transport.onClientConnected(cb);

      writeListener!({
        requestId: 'req-1',
        deviceId: 'client-A',
        characteristicId: LOBBY_CHARACTERISTIC_UUID,
        data: [1],
      });
      writeListener!({
        requestId: 'req-2',
        deviceId: 'client-A',
        characteristicId: LOBBY_CHARACTERISTIC_UUID,
        data: [2],
      });

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('fires onClientDisconnected after 30s inactivity', () => {
      const disconnectCb = jest.fn();
      transport.onClientDisconnected(disconnectCb);

      writeListener!({
        requestId: 'req-1',
        deviceId: 'client-A',
        characteristicId: LOBBY_CHARACTERISTIC_UUID,
        data: [1],
      });

      expect(disconnectCb).not.toHaveBeenCalled();

      jest.advanceTimersByTime(30_000);

      expect(disconnectCb).toHaveBeenCalledWith('client-A');
    });

    it('resets timeout on subsequent writes', () => {
      const disconnectCb = jest.fn();
      transport.onClientDisconnected(disconnectCb);

      writeListener!({
        requestId: 'req-1',
        deviceId: 'client-A',
        characteristicId: LOBBY_CHARACTERISTIC_UUID,
        data: [1],
      });

      // Advance 20s, then another write
      jest.advanceTimersByTime(20_000);
      writeListener!({
        requestId: 'req-2',
        deviceId: 'client-A',
        characteristicId: LOBBY_CHARACTERISTIC_UUID,
        data: [2],
      });

      // Advance another 20s (total 40s from first write, 20s from second)
      jest.advanceTimersByTime(20_000);
      expect(disconnectCb).not.toHaveBeenCalled();

      // Advance to 30s from second write
      jest.advanceTimersByTime(10_000);
      expect(disconnectCb).toHaveBeenCalledWith('client-A');
    });

    it('routes messages to onMessageReceived with logical name', () => {
      const msgCb = jest.fn();
      transport.onMessageReceived(msgCb);

      writeListener!({
        requestId: 'req-1',
        deviceId: 'client-A',
        characteristicId: LOBBY_CHARACTERISTIC_UUID,
        data: [10, 20, 30],
      });

      expect(msgCb).toHaveBeenCalledWith('client-A', 'lobby', expect.any(Uint8Array));
      const receivedData = msgCb.mock.calls[0][2];
      expect(Array.from(receivedData)).toEqual([10, 20, 30]);
    });

    it('stopAdvertising clears all client timeout timers', async () => {
      const disconnectCb = jest.fn();
      transport.onClientDisconnected(disconnectCb);

      writeListener!({
        requestId: 'req-1',
        deviceId: 'client-A',
        characteristicId: LOBBY_CHARACTERISTIC_UUID,
        data: [1],
      });

      await transport.stopAdvertising();

      // Advance past timeout — callback should NOT fire (timer was cleared)
      jest.advanceTimersByTime(30_000);
      expect(disconnectCb).not.toHaveBeenCalled();
    });

    it('fires onClientConnected again after timeout and re-write', () => {
      const connectCb = jest.fn();
      transport.onClientConnected(connectCb);

      writeListener!({
        requestId: 'req-1',
        deviceId: 'client-A',
        characteristicId: LOBBY_CHARACTERISTIC_UUID,
        data: [1],
      });

      jest.advanceTimersByTime(30_000); // timeout

      writeListener!({
        requestId: 'req-2',
        deviceId: 'client-A',
        characteristicId: LOBBY_CHARACTERISTIC_UUID,
        data: [2],
      });

      expect(connectCb).toHaveBeenCalledTimes(2);
    });
  });
```

- [ ] **Step 2: Run tests**

Run: `npx jest tests/ble/BleHostTransportImpl.test.ts --no-coverage`
Expected: PASS — all client management tests green (logic was already implemented in Task 10)

- [ ] **Step 3: Commit**

```bash
git add tests/ble/BleHostTransportImpl.test.ts
git commit -m "test(ble): add BleHostTransportImpl client management tests"
```

---

### Task 12: BleHostTransportImpl — Send Notifications

**Files:**
- Modify: `tests/ble/BleHostTransportImpl.test.ts`
- Modify: `src/services/ble/BleHostTransportImpl.ts`

- [ ] **Step 1: Write failing tests for sendToClient and sendToAll**

Append inside the top-level `describe` block:

```typescript
  describe('sendToClient', () => {
    beforeEach(async () => {
      await transport.startAdvertising('JetHoldem');
      // Register a client
      writeListener!({
        requestId: 'req-1',
        deviceId: 'client-A',
        characteristicId: LOBBY_CHARACTERISTIC_UUID,
        data: [1],
      });
    });

    it('sends notification with number[] data to specific device', async () => {
      const data = new Uint8Array([10, 20, 30]);
      await transport.sendToClient('client-A', 'lobby', data);

      expect(mockSendNotification).toHaveBeenCalledWith(
        BLE_SERVICE_UUID,
        LOBBY_CHARACTERISTIC_UUID,
        [10, 20, 30],
        'client-A',
      );
    });

    it('throws for unknown logical name', async () => {
      await expect(
        transport.sendToClient('client-A', 'nonexistent', new Uint8Array([1])),
      ).rejects.toThrow('Unknown characteristic');
    });
  });

  describe('sendToAll', () => {
    beforeEach(async () => {
      await transport.startAdvertising('JetHoldem');
    });

    it('sends broadcast notification without deviceId', async () => {
      const data = new Uint8Array([5, 10]);
      await transport.sendToAll('lobby', data);

      expect(mockSendNotification).toHaveBeenCalledWith(
        BLE_SERVICE_UUID,
        LOBBY_CHARACTERISTIC_UUID,
        [5, 10],
      );
    });

    it('throws for unknown logical name', async () => {
      await expect(
        transport.sendToAll('nonexistent', new Uint8Array([1])),
      ).rejects.toThrow('Unknown characteristic');
    });
  });
```

- [ ] **Step 2: Run test to verify the new tests fail**

Run: `npx jest tests/ble/BleHostTransportImpl.test.ts --no-coverage`
Expected: FAIL — "Not implemented yet" errors for sendToClient/sendToAll

- [ ] **Step 3: Implement sendToClient and sendToAll**

Replace the `sendToClient` and `sendToAll` methods in `src/services/ble/BleHostTransportImpl.ts`:

```typescript
  async sendToClient(
    clientId: string,
    characteristicId: string,
    data: Uint8Array,
  ): Promise<void> {
    const uuid = this.charMap.get(characteristicId);
    if (!uuid) {
      throw new Error(`Unknown characteristic: ${characteristicId}`);
    }
    await Peripheral.sendNotification(
      BLE_SERVICE_UUID,
      uuid,
      Array.from(data),
      clientId,
    );
  }

  async sendToAll(characteristicId: string, data: Uint8Array): Promise<void> {
    const uuid = this.charMap.get(characteristicId);
    if (!uuid) {
      throw new Error(`Unknown characteristic: ${characteristicId}`);
    }
    await Peripheral.sendNotification(BLE_SERVICE_UUID, uuid, Array.from(data));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ble/BleHostTransportImpl.test.ts --no-coverage`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/services/ble/BleHostTransportImpl.ts tests/ble/BleHostTransportImpl.test.ts
git commit -m "feat(ble): add BleHostTransportImpl send notifications"
```

---

## Chunk 4: Integration & Finalization

### Task 13: Export Transport Impls from Barrel

**Files:**
- Modify: `src/services/ble/index.ts`

- [ ] **Step 1: Add transport impl exports**

Add these lines to `src/services/ble/index.ts`:

```typescript
export { BleClientTransportImpl } from './BleClientTransportImpl';
export { BleHostTransportImpl } from './BleHostTransportImpl';
```

- [ ] **Step 2: Verify no regressions**

Run: `npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/services/ble/index.ts
git commit -m "feat(ble): export transport implementations from barrel"
```

---

### Task 14: Type Declaration for react-native-multi-ble-peripheral

**Files:**
- Create: `src/types/react-native-multi-ble-peripheral.d.ts`

Since `react-native-multi-ble-peripheral` has no TypeScript types, we need a minimal declaration.

- [ ] **Step 1: Create the types directory and write the type declaration**

Run: `mkdir -p src/types`

```typescript
// src/types/react-native-multi-ble-peripheral.d.ts
declare module 'react-native-multi-ble-peripheral' {
  interface WriteEvent {
    requestId: string;
    deviceId: string;
    characteristicId: string;
    data: number[];
  }

  const Peripheral: {
    addService(serviceUuid: string): Promise<void>;
    addCharacteristic(
      serviceUuid: string,
      characteristicUuid: string,
      permissions: number,
    ): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    sendNotification(
      serviceUuid: string,
      characteristicUuid: string,
      data: number[],
      deviceId?: string,
    ): Promise<void>;
    onWrite(callback: (event: WriteEvent) => void): void;
  };

  export default Peripheral;
}
```

- [ ] **Step 2: Verify tsc recognizes the declaration**

Run: `npx tsc --noEmit`
Expected: No new type errors related to `react-native-multi-ble-peripheral`.

- [ ] **Step 3: Commit**

```bash
git add src/types/react-native-multi-ble-peripheral.d.ts
git commit -m "feat(ble): add type declaration for react-native-multi-ble-peripheral"
```

---

### Task 15: Full Test Suite Verification

**Files:** (none — verification only)

- [ ] **Step 1: Run all tests**

Run: `npx jest --no-coverage`
Expected: ALL tests pass. If any BLE transport test fails due to mock setup issues with the `engine` project's ts-jest config, check that `@sfourdrinier/react-native-ble-plx` and `react-native-multi-ble-peripheral` are listed in `transformIgnorePatterns` or properly mocked. Existing tests should be unaffected.

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No type errors (or only pre-existing ones). If `react-native-multi-ble-peripheral` types fail, verify the declaration file from Task 14 is included by `tsconfig.json`.

- [ ] **Step 3: Commit any fixes if needed**

Only if previous steps required fixes — stage only the specific files that were changed:
```bash
git add <specific-files-that-were-fixed>
git commit -m "fix(ble): resolve test/type issues from transport implementation"
```
