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
