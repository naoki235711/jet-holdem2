import {
  setHostTransport,
  getHostTransport,
  clearHostTransport,
  setClientTransport,
  getClientTransport,
  clearClientTransport,
} from '../../src/services/ble/transportRegistry';
import { BleHostTransport, BleClientTransport } from '../../src/services/ble/BleTransport';

describe('transportRegistry', () => {
  afterEach(() => {
    clearHostTransport();
    clearClientTransport();
  });

  describe('host transport', () => {
    it('returns null initially', () => {
      expect(getHostTransport()).toBeNull();
    });

    it('stores and returns the transport after set', () => {
      const t = {} as BleHostTransport;
      setHostTransport(t);
      expect(getHostTransport()).toBe(t);
    });

    it('returns null after clear', () => {
      setHostTransport({} as BleHostTransport);
      clearHostTransport();
      expect(getHostTransport()).toBeNull();
    });
  });

  describe('client transport', () => {
    it('returns null initially', () => {
      expect(getClientTransport()).toBeNull();
    });

    it('stores and returns the transport after set', () => {
      const t = {} as BleClientTransport;
      setClientTransport(t);
      expect(getClientTransport()).toBe(t);
    });

    it('returns null after clear', () => {
      setClientTransport({} as BleClientTransport);
      clearClientTransport();
      expect(getClientTransport()).toBeNull();
    });
  });

  it('host and client transports are independent', () => {
    const host = {} as BleHostTransport;
    const client = {} as BleClientTransport;
    setHostTransport(host);
    setClientTransport(client);
    clearHostTransport();
    expect(getHostTransport()).toBeNull();
    expect(getClientTransport()).toBe(client);
  });
});
