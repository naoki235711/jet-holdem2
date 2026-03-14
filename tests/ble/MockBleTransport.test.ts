import { MockBleHostTransport, MockBleClientTransport, MockBleNetwork } from '../../src/services/ble/MockBleTransport';

describe('MockBleTransport', () => {
  describe('MockBleHostTransport', () => {
    it('records sent messages', async () => {
      const host = new MockBleHostTransport();
      const data = new Uint8Array([1, 2, 3]);
      await host.sendToClient('client-1', 'char-1', data);
      expect(host.sentMessages).toHaveLength(1);
      expect(host.sentMessages[0]).toEqual({
        clientId: 'client-1',
        characteristicId: 'char-1',
        data,
      });
    });

    it('fires client connected callback on simulate', () => {
      const host = new MockBleHostTransport();
      const cb = jest.fn();
      host.onClientConnected(cb);
      host.simulateClientConnected('client-1');
      expect(cb).toHaveBeenCalledWith('client-1');
    });

    it('fires client disconnected callback on simulate', () => {
      const host = new MockBleHostTransport();
      const cb = jest.fn();
      host.onClientDisconnected(cb);
      host.simulateClientDisconnected('client-1');
      expect(cb).toHaveBeenCalledWith('client-1');
    });

    it('fires message received callback on simulate', () => {
      const host = new MockBleHostTransport();
      const cb = jest.fn();
      host.onMessageReceived(cb);
      const data = new Uint8Array([1, 2]);
      host.simulateMessageReceived('client-1', 'char-1', data);
      expect(cb).toHaveBeenCalledWith('client-1', 'char-1', data);
    });
  });

  describe('MockBleClientTransport', () => {
    it('records sent messages', async () => {
      const client = new MockBleClientTransport();
      const data = new Uint8Array([4, 5, 6]);
      await client.sendToHost('char-1', data);
      expect(client.sentMessages).toHaveLength(1);
      expect(client.sentMessages[0]).toEqual({
        characteristicId: 'char-1',
        data,
      });
    });

    it('fires host discovered callback on simulate', () => {
      const client = new MockBleClientTransport();
      const cb = jest.fn();
      client.onHostDiscovered(cb);
      client.simulateHostDiscovered('host-1', 'HostName');
      expect(cb).toHaveBeenCalledWith('host-1', 'HostName');
    });

    it('fires message received callback on simulate', () => {
      const client = new MockBleClientTransport();
      const cb = jest.fn();
      client.onMessageReceived(cb);
      const data = new Uint8Array([7, 8]);
      client.simulateMessageReceived('char-1', data);
      expect(cb).toHaveBeenCalledWith('char-1', data);
    });
  });

  describe('MockBleNetwork', () => {
    it('routes host sendToClient to the correct client onMessageReceived', async () => {
      const host = new MockBleHostTransport();
      const client1 = new MockBleClientTransport();
      const client2 = new MockBleClientTransport();
      MockBleNetwork.create(host, [client1, client2]);

      const cb1 = jest.fn();
      const cb2 = jest.fn();
      client1.onMessageReceived(cb1);
      client2.onMessageReceived(cb2);

      const data = new Uint8Array([1, 2, 3]);
      await host.sendToClient('client-1', 'char-1', data);
      expect(cb1).toHaveBeenCalledWith('char-1', data);
      expect(cb2).not.toHaveBeenCalled();
    });

    it('routes host sendToAll to all clients', async () => {
      const host = new MockBleHostTransport();
      const client1 = new MockBleClientTransport();
      const client2 = new MockBleClientTransport();
      MockBleNetwork.create(host, [client1, client2]);

      const cb1 = jest.fn();
      const cb2 = jest.fn();
      client1.onMessageReceived(cb1);
      client2.onMessageReceived(cb2);

      const data = new Uint8Array([4, 5]);
      await host.sendToAll('char-1', data);
      expect(cb1).toHaveBeenCalledWith('char-1', data);
      expect(cb2).toHaveBeenCalledWith('char-1', data);
    });

    it('routes client sendToHost to host onMessageReceived', async () => {
      const host = new MockBleHostTransport();
      const client1 = new MockBleClientTransport();
      MockBleNetwork.create(host, [client1]);

      const cb = jest.fn();
      host.onMessageReceived(cb);

      const data = new Uint8Array([9, 10]);
      await client1.sendToHost('char-1', data);
      expect(cb).toHaveBeenCalledWith('client-1', 'char-1', data);
    });
  });
});
