# BLE Infrastructure & Transport Design Spec

**Date:** 2026-03-15
**Status:** Approved
**Depends on:** [BLE Lobby Phase 1 Design](2026-03-14-ble-lobby-design.md) (transport interfaces)
**Related:** [BLE Lobby UI Design](2026-03-14-ble-lobby-ui-design.md) (Doc 2)

## Overview

Implement real BLE transport classes (`BleHostTransportImpl`, `BleClientTransportImpl`) that fulfill the existing `BleHostTransport` / `BleClientTransport` interfaces defined in Phase 1. Migrate from Expo Managed Workflow to Development Build to enable native BLE modules. Configure EAS Build for cloud-based iOS/Android builds (no local Mac required).

## Scope

**In scope:**
- `BleClientTransportImpl` — Central (GATT Client) using `@sfourdrinier/react-native-ble-plx`
- `BleHostTransportImpl` — Peripheral (GATT Server) using `react-native-multi-ble-peripheral`
- BLE constants (Service UUID, Characteristic UUIDs)
- Custom Expo Config Plugin for BLE permissions
- `app.json` plugin configuration
- `eas.json` for EAS Build
- Jest unit tests with mocked native modules

**Out of scope:**
- LobbyHost / LobbyClient changes (completed in Doc 1/2)
- Game phase characteristics (Doc 3: BLE Game Play)
- Data persistence (Doc 4)
- Cloud Mac setup (using EAS Build instead)

## Architecture

```
┌─────────────────────────────────────────────┐
│           LobbyHost / LobbyClient           │  ← Existing (Phase 1)
│        GameService (Doc 3)                   │
├─────────────────────────────────────────────┤
│    BleHostTransport    BleClientTransport    │  ← Existing interfaces
├─────────────────────────────────────────────┤
│  BleHostTransportImpl  BleClientTransportImpl│  ← NEW (this doc)
├──────────────────┬──────────────────────────┤
│ react-native-    │ @sfourdrinier/           │  ← NEW (BLE libraries)
│ multi-ble-       │ react-native-ble-plx     │
│ peripheral       │                          │
├──────────────────┴──────────────────────────┤
│        Expo Dev Build + EAS Build           │  ← NEW (build infra)
├─────────────────────────────────────────────┤
│  iOS CoreBluetooth  /  Android Bluetooth LE │
└─────────────────────────────────────────────┘
```

## BLE Library Selection

### Central (Client): `@sfourdrinier/react-native-ble-plx` ^3.5.0

- Fork of `react-native-ble-plx` with Expo SDK 54+ / RN 0.81+ support
- Built-in Expo Config Plugin
- TypeScript, 11 stars
- Official `react-native-ble-plx` v3.5.1 (~90K weekly downloads) is incompatible with Expo 55 due to dependency conflicts (declares direct dependencies on old Expo packages instead of peer dependencies)
- **Note:** This library uses base64-encoded strings internally for characteristic read/write. The transport implementation must bridge between `Uint8Array` (interface contract) and base64 strings (library API).

### Peripheral (Host): `react-native-multi-ble-peripheral` v0.1.8

- Only viable iOS + Android GATT server library
- Supports read/write/notify characteristics
- 12 stars, last release 2025-11
- No built-in Expo Config Plugin (custom plugin needed)
- **Risk:** Small community. If abandoned, may need to fork or find alternative.

### Rejected Alternatives

- `react-native-ble-plx` v3.5.1 — Central-only, incompatible with Expo 55
- `react-native-peripheral` — iOS-only, abandoned since 2023

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/services/ble/bleConstants.ts` | Service UUID, Characteristic UUIDs |
| `src/services/ble/BleClientTransportImpl.ts` | Central (GATT Client) implementation |
| `src/services/ble/BleHostTransportImpl.ts` | Peripheral (GATT Server) implementation |
| `plugins/withBlePermissions.js` | Expo Config Plugin for BLE permissions |
| `eas.json` | EAS Build configuration |
| `tests/ble/BleClientTransportImpl.test.ts` | Client transport unit tests |
| `tests/ble/BleHostTransportImpl.test.ts` | Host transport unit tests |

### Modified Files

| File | Changes |
|------|---------|
| `app.json` | Add BLE plugins |
| `package.json` | Add BLE library dependencies |

## Component Details

### bleConstants.ts

UUIDs are v4, generated at implementation time using `uuidgen` CLI. The placeholder values below are intentional — each `PLACEHOLDER` must be replaced with a unique generated UUID during the first implementation task.

```typescript
export const BLE_SERVICE_UUID = 'PLACEHOLDER'; // replace with uuidgen output
export const LOBBY_CHARACTERISTIC_UUID = 'PLACEHOLDER'; // replace with uuidgen output
// Game phase (Doc 3 — defined here for forward compatibility)
export const GAME_STATE_CHARACTERISTIC_UUID = 'PLACEHOLDER'; // replace with uuidgen output
export const PRIVATE_HAND_CHARACTERISTIC_UUID = 'PLACEHOLDER'; // replace with uuidgen output
export const PLAYER_ACTION_CHARACTERISTIC_UUID = 'PLACEHOLDER'; // replace with uuidgen output
```

GATT Server structure (Host):

| Characteristic | Properties | Purpose |
|---|---|---|
| Lobby | Read, Write, Notify | Bidirectional lobby messages |
| GameState | Read, Notify | Public game state broadcast (Doc 3) |
| PrivateHand | Read, Notify | Per-player hand data (Doc 3) |
| PlayerAction | Write | Client→Host actions (Doc 3) |

Only the Lobby characteristic is used in this doc. Game characteristics are defined as UUIDs but not registered until Doc 3.

### BleClientTransportImpl

Implements `BleClientTransport` interface wrapping `@sfourdrinier/react-native-ble-plx`.

**Design rule — logical names vs UUIDs:** The existing code (`LobbyHost`, `LobbyClient`) passes **logical names** like `'lobby'` as the `characteristicId` parameter to transport methods. The impl layer is solely responsible for resolving these logical names to actual BLE UUIDs. Upper layers never see or use raw UUIDs.

**Constructor:** Receives a `Map<string, string>` for logical name → UUID mapping (e.g., `{ 'lobby': LOBBY_CHARACTERISTIC_UUID }`).

**Key behaviors:**
- `startScanning(serviceUuid)`: Calls `manager.startDeviceScan()` with service UUID filter. Reports discovered devices via `onHostDiscovered` callback with `device.id` and `device.localName`.
- `stopScanning()`: Calls `manager.stopDeviceScan()`.
- `connectToHost(hostId)`: Calls `manager.connectToDevice(hostId)` → `discoverAllServicesAndCharacteristics()` → `characteristic.monitor()` to subscribe to Notify. Incoming data is routed to `onMessageReceived` callback with logical name (reverse UUID lookup).
- `sendToHost(characteristicId, data)`: Looks up UUID from logical name, converts `Uint8Array` to base64, calls `characteristic.writeWithResponse(base64)`.
- `disconnect()`: Calls `device.cancelConnection()`, cleans up subscriptions.

**Data encoding bridge:**
`react-native-ble-plx` uses base64 strings for all characteristic data. The transport layer converts:
- Outbound: `Uint8Array` → base64 string (before `writeWithResponse`)
- Inbound: base64 string → `Uint8Array` (after `monitor` notification)

**Error handling:**
- BLE state monitoring: `manager.onStateChange()` detects Bluetooth OFF
- Disconnection detection: `device.onDisconnected()` notifies upper layer
- Scan timeout: 30 seconds auto-stop (configurable)

### BleHostTransportImpl

Implements `BleHostTransport` interface wrapping `react-native-multi-ble-peripheral`.

**Constructor:** Receives same logical name → UUID mapping.

**Key behaviors:**
- `startAdvertising(serviceName)`: Calls `addService(BLE_SERVICE_UUID)` → `addCharacteristic(LOBBY_CHARACTERISTIC_UUID, Read|Write|Notify)` → `start()`.
- `stopAdvertising()`: Calls `stop()`, cleans up resources and timers.
- `onClientConnected(callback)`: Stores callback. Fired when a new clientId is detected via first Write (see client management below).
- `onClientDisconnected(callback)`: Stores callback. Fired on inactivity timeout (see client management below).
- `onMessageReceived`: Listens to `onWrite` events. Routes to callback with `clientId` + logical name + data.
- `sendToClient(clientId, characteristicId, data)`: Calls `sendNotification(uuid, data, deviceId)` for targeted notification.
- `sendToAll(characteristicId, data)`: Calls `sendNotification(uuid, data)` for broadcast (all connected clients).

**Client management (peripheral library limitation):**
`react-native-multi-ble-peripheral` does not provide explicit connect/disconnect events. Workaround:

```
Write received → check clientId
  ├─ New: add to connectedClients → fire onClientConnected
  └─ Known: reset timeout timer
Timeout (30s no activity) → remove from connectedClients → fire onClientDisconnected
```

**Data encoding:**
`react-native-multi-ble-peripheral` `onWrite` delivers data as a `number[]` (byte array). `sendNotification` accepts `number[]`. The transport layer converts:
- Inbound: `number[]` → `Uint8Array` (before passing to `onMessageReceived` callback)
- Outbound: `Uint8Array` → `number[]` (before calling `sendNotification`)

**Constraints:**
- No MTU negotiation — uses fixed value. Existing `ChunkManager` (182-byte payload) handles this.

### Expo Config Plugin

**File:** `plugins/withBlePermissions.js`

Uses `expo/config-plugins` (`withInfoPlist`, `withAndroidManifest`) to inject:

**iOS (Info.plist):**
- `NSBluetoothAlwaysUsageDescription` — Required usage description (covers both Central and Peripheral on iOS 13+)

**Android (AndroidManifest.xml):**
- `android.permission.BLUETOOTH_SCAN`
- `android.permission.BLUETOOTH_CONNECT`
- `android.permission.BLUETOOTH_ADVERTISE`
- `android.permission.ACCESS_FINE_LOCATION`

Note: `@sfourdrinier/react-native-ble-plx` has its own built-in Expo Config Plugin that handles Central-side permissions. The custom plugin adds Peripheral-specific permissions (`BLUETOOTH_ADVERTISE`) and iOS usage descriptions.

**Out of scope:** iOS `UIBackgroundModes` for background BLE advertising. The app is expected to be in the foreground during play.

### app.json Changes

```json
{
  "expo": {
    "plugins": [
      "@sfourdrinier/react-native-ble-plx",
      "./plugins/withBlePermissions"
    ]
  }
}
```

### EAS Build Configuration

**File:** `eas.json`

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

**Build commands (from WSL):**
- iOS: `eas build --platform ios --profile development`
- Android: `eas build --platform android --profile development`
- Free tier: 30 builds/month (iOS + Android combined)
- **Prerequisite:** iOS builds require an Apple Developer account ($99/year) for `"distribution": "internal"`

**Dev Build migration impact:**

| Item | Current (Expo Go) | After (Dev Build) |
|---|---|---|
| BLE access | Not possible | Available |
| Build location | Not needed | EAS Cloud |
| Dev connection | `npx expo start` | `npx expo start --dev-client` |
| OTA updates | Supported | Supported |

## Testing Strategy

### Automated Tests (Jest)

BLE native modules are mocked in Jest. Tests verify:
- Interface compliance (all `BleClientTransport` / `BleHostTransport` methods implemented)
- Logical name ↔ UUID mapping correctness
- Error callbacks (BLE OFF, disconnection)
- Client management logic (registration on first write, timeout disconnection)

```typescript
// Example mock setup
jest.mock('@sfourdrinier/react-native-ble-plx', () => ({
  BleManager: jest.fn().mockImplementation(() => ({
    startDeviceScan: jest.fn(),
    stopDeviceScan: jest.fn(),
    connectToDevice: jest.fn(),
    onStateChange: jest.fn(),
  })),
}));

jest.mock('react-native-multi-ble-peripheral', () => ({
  addService: jest.fn(),
  addCharacteristic: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  sendNotification: jest.fn(),
  onWrite: jest.fn(),
}));
```

### Manual Tests (Device)

After EAS Dev Build install:
1. Host device starts advertising → Client device discovers host
2. Client connects → Lobby join flow works
3. Communication interruption recovery

### Existing Test Impact

- Existing `MockBleTransport` tests (LobbyHost, LobbyClient) — **no changes needed**
- New `BleClientTransportImpl` / `BleHostTransportImpl` are additive files
- `app.json` changes affect `npx expo start` but not Jest
