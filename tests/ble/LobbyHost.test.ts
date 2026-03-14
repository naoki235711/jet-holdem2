import { LobbyHost } from '../../src/services/ble/LobbyHost';
import { MockBleHostTransport } from '../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../src/services/ble/ChunkManager';

/** Helper: encode a JSON message as the ChunkManager would, return the single chunk */
function encodeMessage(json: string): Uint8Array {
  return new ChunkManager().encode(json)[0];
}

/** Helper: decode the last sent message from the mock transport */
function decodeLastSent(transport: MockBleHostTransport): unknown {
  const msgs = transport.sentMessages;
  const last = msgs[msgs.length - 1];
  const cm = new ChunkManager();
  return JSON.parse(cm.decode('any', last.data)!);
}

describe('LobbyHost', () => {
  let transport: MockBleHostTransport;
  let host: LobbyHost;

  beforeEach(() => {
    transport = new MockBleHostTransport();
    host = new LobbyHost(transport, 'HostPlayer');
  });

  describe('start', () => {
    it('transitions to waitingForPlayers and host is seat 0', async () => {
      const playersCb = jest.fn();
      host.onPlayersChanged(playersCb);
      await host.start();
      expect(playersCb).toHaveBeenCalledWith([
        { seat: 0, name: 'HostPlayer', ready: true },
      ]);
    });
  });

  describe('client join', () => {
    beforeEach(async () => {
      await host.start();
    });

    it('accepts a valid join and assigns seat 1', () => {
      const playersCb = jest.fn();
      host.onPlayersChanged(playersCb);

      transport.simulateClientConnected('client-1');
      const joinMsg = JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' });
      transport.simulateMessageReceived('client-1', 'lobby', encodeMessage(joinMsg));

      // Should have sent joinResponse to client-1
      const response = decodeLastSent(transport);
      expect(response).toMatchObject({
        type: 'joinResponse',
        accepted: true,
        seat: 1,
      });

      // Players updated callback should include host + Alice
      expect(playersCb).toHaveBeenCalledWith(
        expect.arrayContaining([
          { seat: 0, name: 'HostPlayer', ready: true },
          { seat: 1, name: 'Alice', ready: false },
        ]),
      );
    });

    it('assigns sequential seats (1, 2, 3) to joining clients', () => {
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
      transport.simulateClientConnected('client-2');
      transport.simulateMessageReceived(
        'client-2', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Bob' })),
      );

      // Find the joinResponse for client-2
      const client2Msgs = transport.sentMessages.filter(m => m.clientId === 'client-2');
      const response = JSON.parse(new ChunkManager().decode('any', client2Msgs[0].data)!);
      expect(response).toMatchObject({ type: 'joinResponse', accepted: true, seat: 2 });
    });

    it('rejects the 4th client (room full: host + 3 clients)', () => {
      for (let i = 1; i <= 3; i++) {
        transport.simulateClientConnected(`client-${i}`);
        transport.simulateMessageReceived(
          `client-${i}`, 'lobby',
          encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: `P${i}` })),
        );
      }
      // 4th client
      transport.simulateClientConnected('client-4');
      transport.simulateMessageReceived(
        'client-4', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'P4' })),
      );

      const response = decodeLastSent(transport);
      expect(response).toMatchObject({ type: 'joinResponse', accepted: false });
    });

    it('ignores duplicate join from same clientId', () => {
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
      const countBefore = transport.sentMessages.length;

      // Send join again
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
      expect(transport.sentMessages.length).toBe(countBefore);
    });
  });

  describe('ready', () => {
    beforeEach(async () => {
      await host.start();
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
    });

    it('marks player as ready and broadcasts playerUpdate', () => {
      const playersCb = jest.fn();
      host.onPlayersChanged(playersCb);

      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'ready' })),
      );

      expect(playersCb).toHaveBeenCalledWith(
        expect.arrayContaining([
          { seat: 0, name: 'HostPlayer', ready: true },
          { seat: 1, name: 'Alice', ready: true },
        ]),
      );
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      await host.start();
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
    });

    it('removes player and broadcasts updated list', () => {
      const playersCb = jest.fn();
      host.onPlayersChanged(playersCb);

      transport.simulateClientDisconnected('client-1');

      expect(playersCb).toHaveBeenCalledWith([
        { seat: 0, name: 'HostPlayer', ready: true },
      ]);
    });

    it('frees the seat for a new player after disconnect', () => {
      transport.simulateClientDisconnected('client-1');

      // New player connects and gets seat 1 (freed)
      transport.simulateClientConnected('client-2');
      transport.simulateMessageReceived(
        'client-2', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Bob' })),
      );

      const response = decodeLastSent(transport);
      expect(response).toMatchObject({ type: 'joinResponse', accepted: true, seat: 1 });
    });
  });

  describe('startGame', () => {
    beforeEach(async () => {
      await host.start();
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
    });

    it('sends gameStart when all players are ready and >= 2 players', () => {
      const gameStartCb = jest.fn();
      host.onGameStart(gameStartCb);

      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'ready' })),
      );

      host.startGame({ sb: 5, bb: 10 });

      expect(gameStartCb).toHaveBeenCalledWith({ sb: 5, bb: 10 });
      const lastBroadcast = decodeLastSent(transport);
      expect(lastBroadcast).toMatchObject({ type: 'gameStart', blinds: { sb: 5, bb: 10 } });
    });

    it('fires error if not all players are ready', () => {
      const errorCb = jest.fn();
      host.onError(errorCb);
      host.startGame();
      expect(errorCb).toHaveBeenCalledWith(expect.stringContaining('not all players are ready'));
    });

    it('fires error if only host (1 player)', async () => {
      const soloHost = new LobbyHost(new MockBleHostTransport(), 'Solo');
      await soloHost.start();
      const errorCb = jest.fn();
      soloHost.onError(errorCb);
      soloHost.startGame();
      expect(errorCb).toHaveBeenCalledWith(expect.stringContaining('at least 2'));
    });
  });

  describe('stop', () => {
    it('sends lobbyClosed to all clients', async () => {
      await host.start();
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );

      await host.stop();

      // Find the lobbyClosed message in sentMessages
      const closedMsgs = transport.sentMessages.filter((m) => {
        const json = new ChunkManager().decode('any', m.data);
        if (!json) return false;
        const parsed = JSON.parse(json);
        return parsed.type === 'lobbyClosed';
      });
      expect(closedMsgs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
