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
  sendNotification: (a: string, b: string, c: number[], d?: string) => mockSendNotification(a, b, c, d),
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
});
