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

  afterEach(async () => {
    await transport.stopScanning();
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
