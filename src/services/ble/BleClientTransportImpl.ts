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
