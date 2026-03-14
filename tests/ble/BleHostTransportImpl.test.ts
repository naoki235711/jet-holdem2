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
  addService: (a: string) => mockAddService(a),
  addCharacteristic: (a: string, b: string, c: number) => mockAddCharacteristic(a, b, c),
  start: () => mockStart(),
  stop: () => mockStop(),
  sendNotification: (a: string, b: string, c: number[], d?: string) =>
    d !== undefined ? mockSendNotification(a, b, c, d) : mockSendNotification(a, b, c),
  onWrite: (cb: Function) => mockOnWrite(cb),
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
});
