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
});
