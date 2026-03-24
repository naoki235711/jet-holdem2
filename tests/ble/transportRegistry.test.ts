import {
  setHostTransport,
  getHostTransport,
  clearHostTransport,
  setClientTransport,
  getClientTransport,
  clearClientTransport,
  setLobbyHost,
  getLobbyHost,
  clearLobbyHost,
} from '../../src/services/ble/transportRegistry';
import { BleHostTransport, BleClientTransport } from '../../src/services/ble/BleTransport';
import { LobbyHost } from '../../src/services/ble/LobbyHost';
import { MockBleHostTransport } from '../../src/services/ble/MockBleTransport';

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

describe('lobbyHost registry', () => {
  afterEach(() => clearLobbyHost());

  it('returns null when not set', () => {
    expect(getLobbyHost()).toBeNull();
  });

  it('returns the set LobbyHost', () => {
    const transport = new MockBleHostTransport();
    const host = new LobbyHost(transport, 'Host');
    setLobbyHost(host);
    expect(getLobbyHost()).toBe(host);
  });

  it('returns null after clear', () => {
    const transport = new MockBleHostTransport();
    const host = new LobbyHost(transport, 'Host');
    setLobbyHost(host);
    clearLobbyHost();
    expect(getLobbyHost()).toBeNull();
  });
});
