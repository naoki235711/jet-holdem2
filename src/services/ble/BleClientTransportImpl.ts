// src/services/ble/BleClientTransportImpl.ts
import { BleManager, Device, Subscription } from '@sfourdrinier/react-native-ble-plx';
import { BleClientTransport } from './BleTransport';
import { BLE_SERVICE_UUID } from './bleConstants';

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

  onMessageReceived(callback: (characteristicId: string, data: Uint8Array) => void): void {
    this._onMessageReceived = callback;
  }

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
}

function base64ToUint8Array(base64: string): Uint8Array {
  const buf = Buffer.from(base64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
