import { LobbyClient } from '../../src/services/ble/LobbyClient';
import { MockBleClientTransport } from '../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../src/services/ble/ChunkManager';

/** Helper: encode a JSON message as a single chunk */
function encodeMessage(json: string): Uint8Array {
  return new ChunkManager().encode(json)[0];
}

/** Helper: decode the last sent message from the mock transport */
function decodeLastSent(transport: MockBleClientTransport): unknown {
  const msgs = transport.sentMessages;
  const last = msgs[msgs.length - 1];
  const cm = new ChunkManager();
  return JSON.parse(cm.decode('any', last.data)!);
}

describe('LobbyClient', () => {
  let transport: MockBleClientTransport;
  let client: LobbyClient;

  beforeEach(() => {
    transport = new MockBleClientTransport();
    client = new LobbyClient(transport, 'Alice');
  });

  describe('host discovery', () => {
    it('reports discovered hosts via callback', async () => {
      const cb = jest.fn();
      client.onHostDiscovered(cb);
      await client.startScanning();
      transport.simulateHostDiscovered('host-1', 'HostPlayer');
      expect(cb).toHaveBeenCalledWith('host-1', 'HostPlayer');
    });
  });

  describe('connect and join', () => {
    it('sends join message automatically after connecting', async () => {
      await client.connectToHost('host-1');
      expect(transport.sentMessages).toHaveLength(1);
      const sent = decodeLastSent(transport);
      expect(sent).toEqual({ type: 'join', protocolVersion: 1, playerName: 'Alice' });
    });
  });

  describe('joinResponse handling', () => {
    beforeEach(async () => {
      await client.connectToHost('host-1');
    });

    it('calls onJoinResult(true) and stores seat on accepted', () => {
      const joinCb = jest.fn();
      client.onJoinResult(joinCb);

      const response = JSON.stringify({
        type: 'joinResponse',
        accepted: true,
        seat: 2,
        players: [
          { seat: 0, name: 'Host', ready: true },
          { seat: 2, name: 'Alice', ready: false },
        ],
      });
      transport.simulateMessageReceived('lobby', encodeMessage(response));

      expect(joinCb).toHaveBeenCalledWith(true, undefined);
    });

    it('calls onJoinResult(false, reason) on rejected', () => {
      const joinCb = jest.fn();
      client.onJoinResult(joinCb);

      const response = JSON.stringify({
        type: 'joinResponse',
        accepted: false,
        reason: 'Room is full',
      });
      transport.simulateMessageReceived('lobby', encodeMessage(response));

      expect(joinCb).toHaveBeenCalledWith(false, 'Room is full');
    });
  });

  describe('playerUpdate handling', () => {
    beforeEach(async () => {
      await client.connectToHost('host-1');
      // Simulate accepted join
      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({
          type: 'joinResponse', accepted: true, seat: 1,
          players: [{ seat: 0, name: 'Host', ready: true }, { seat: 1, name: 'Alice', ready: false }],
        })),
      );
    });

    it('updates players list via callback', () => {
      const playersCb = jest.fn();
      client.onPlayersChanged(playersCb);

      const updatedPlayers = [
        { seat: 0, name: 'Host', ready: true },
        { seat: 1, name: 'Alice', ready: false },
        { seat: 2, name: 'Bob', ready: false },
      ];
      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({ type: 'playerUpdate', players: updatedPlayers })),
      );

      expect(playersCb).toHaveBeenCalledWith(updatedPlayers);
    });
  });

  describe('setReady', () => {
    beforeEach(async () => {
      await client.connectToHost('host-1');
      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({
          type: 'joinResponse', accepted: true, seat: 1,
          players: [{ seat: 0, name: 'Host', ready: true }, { seat: 1, name: 'Alice', ready: false }],
        })),
      );
    });

    it('sends ready message to host', () => {
      const countBefore = transport.sentMessages.length;
      client.setReady();
      expect(transport.sentMessages.length).toBe(countBefore + 1);
      const sent = decodeLastSent(transport);
      expect(sent).toEqual({ type: 'ready' });
    });
  });

  describe('gameStart handling', () => {
    beforeEach(async () => {
      await client.connectToHost('host-1');
      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({
          type: 'joinResponse', accepted: true, seat: 1,
          players: [{ seat: 0, name: 'Host', ready: true }, { seat: 1, name: 'Alice', ready: false }],
        })),
      );
    });

    it('fires onGameStart callback with blinds', () => {
      const gameStartCb = jest.fn();
      client.onGameStart(gameStartCb);

      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({ type: 'gameStart', blinds: { sb: 5, bb: 10 } })),
      );

      expect(gameStartCb).toHaveBeenCalledWith({ sb: 5, bb: 10 });
    });
  });

  describe('lobbyClosed handling', () => {
    beforeEach(async () => {
      await client.connectToHost('host-1');
      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({
          type: 'joinResponse', accepted: true, seat: 1,
          players: [{ seat: 0, name: 'Host', ready: true }, { seat: 1, name: 'Alice', ready: false }],
        })),
      );
    });

    it('fires onDisconnected callback when lobby is closed', () => {
      const disconnectCb = jest.fn();
      client.onDisconnected(disconnectCb);

      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({ type: 'lobbyClosed', reason: 'Host left' })),
      );

      expect(disconnectCb).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      await client.connectToHost('host-1');
      transport.simulateMessageReceived(
        'lobby',
        encodeMessage(JSON.stringify({
          type: 'joinResponse', accepted: true, seat: 1,
          players: [{ seat: 0, name: 'Host', ready: true }, { seat: 1, name: 'Alice', ready: false }],
        })),
      );
    });

    it('resets client state on disconnect', async () => {
      await client.disconnect();
      // After disconnect, setReady should be a no-op (state is idle, not joined)
      const countBefore = transport.sentMessages.length;
      client.setReady();
      expect(transport.sentMessages.length).toBe(countBefore);
    });
  });
});
