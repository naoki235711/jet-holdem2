import { LobbyHost } from '../../src/services/ble/LobbyHost';
import { MockBleHostTransport } from '../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../src/services/ble/ChunkManager';

/** Flush all pending microtasks/promises */
const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Helper: encode a JSON message as the ChunkManager would, return the single chunk */
function encodeMessage(json: string): Uint8Array {
  return new ChunkManager().encode(json)[0];
}

/**
 * Decode all chunks from a given clientId in order, returning all decoded messages.
 * Handles multi-chunk messages correctly by feeding all chunks through a ChunkManager.
 */
function decodeAllFrom(
  transport: MockBleHostTransport,
  clientId: string,
): unknown[] {
  const cm = new ChunkManager();
  const results: unknown[] = [];
  for (const msg of transport.sentMessages) {
    if (msg.clientId !== clientId) continue;
    const json = cm.decode(clientId, msg.data);
    if (json !== null) results.push(JSON.parse(json));
  }
  return results;
}

/** Helper: decode the last complete sent message for a given clientId */
function decodeLastFrom(transport: MockBleHostTransport, clientId: string): unknown {
  const msgs = decodeAllFrom(transport, clientId);
  return msgs[msgs.length - 1] ?? null;
}

/** Helper: decode the last complete sent message from the mock transport (any clientId) */
function decodeLastSent(transport: MockBleHostTransport): unknown {
  // Determine which clientId sent the last message
  const msgs = transport.sentMessages;
  if (msgs.length === 0) return null;
  const last = msgs[msgs.length - 1];
  return decodeLastFrom(transport, last.clientId);
}

const DEFAULT_GAME_SETTINGS = { sb: 5, bb: 10, initialChips: 1000 };

describe('LobbyHost', () => {
  let transport: MockBleHostTransport;
  let host: LobbyHost;

  beforeEach(() => {
    transport = new MockBleHostTransport();
    host = new LobbyHost(transport, 'HostPlayer', DEFAULT_GAME_SETTINGS);
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

    it('accepts a valid join and assigns seat 1', async () => {
      const playersCb = jest.fn();
      host.onPlayersChanged(playersCb);

      transport.simulateClientConnected('client-1');
      const joinMsg = JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' });
      transport.simulateMessageReceived('client-1', 'lobby', encodeMessage(joinMsg));
      await flushPromises();

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

    it('assigns sequential seats (1, 2, 3) to joining clients', async () => {
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
      await flushPromises();

      // Find the joinResponse for client-2
      const response = decodeLastFrom(transport, 'client-2');
      expect(response).toMatchObject({ type: 'joinResponse', accepted: true, seat: 2 });
    });

    it('rejects the 10th client (room full: host + 8 clients = 9 total)', async () => {
      for (let i = 1; i <= 8; i++) {
        transport.simulateClientConnected(`client-${i}`);
        transport.simulateMessageReceived(
          `client-${i}`, 'lobby',
          encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: `P${i}` })),
        );
      }
      // 9th client attempt (10th person total including host)
      transport.simulateClientConnected('client-9');
      transport.simulateMessageReceived(
        'client-9', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'P9' })),
      );
      await flushPromises();

      const response = decodeLastFrom(transport, 'client-9');
      expect(response).toMatchObject({ type: 'joinResponse', accepted: false });
    });

    it('assigns seats 1 through 8 to 8 joining clients', async () => {
      for (let i = 1; i <= 8; i++) {
        transport.simulateClientConnected(`client-${i}`);
        transport.simulateMessageReceived(
          `client-${i}`, 'lobby',
          encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: `P${i}` })),
        );
        await flushPromises();
        const response = decodeLastFrom(transport, `client-${i}`);
        expect(response).toMatchObject({ type: 'joinResponse', accepted: true, seat: i });
      }
    });

    it('ignores duplicate join from same clientId', async () => {
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
      await flushPromises();
      const countBefore = transport.sentMessages.length;

      // Send join again
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
      await flushPromises();
      expect(transport.sentMessages.length).toBe(countBefore);
    });

    it('includes gameSettings in joinResponse', async () => {
      transport.simulateClientConnected('client-1');
      const joinMsg = JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' });
      transport.simulateMessageReceived('client-1', 'lobby', encodeMessage(joinMsg));
      await flushPromises();

      // Find the joinResponse message sent to client-1
      const decoded = decodeLastFrom(transport, 'client-1');
      expect(decoded).toBeDefined();
      expect((decoded as Record<string, unknown>).gameSettings).toEqual({ sb: 5, bb: 10, initialChips: 1000 });
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

    it('frees the seat for a new player after disconnect', async () => {
      transport.simulateClientDisconnected('client-1');

      // New player connects and gets seat 1 (freed)
      transport.simulateClientConnected('client-2');
      transport.simulateMessageReceived(
        'client-2', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Bob' })),
      );
      await flushPromises();

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

    it('sends gameStart when all players are ready and >= 2 players', async () => {
      const gameStartCb = jest.fn();
      host.onGameStart(gameStartCb);

      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'ready' })),
      );

      host.startGame();
      await flushPromises();

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
      const soloHost = new LobbyHost(new MockBleHostTransport(), 'Solo', DEFAULT_GAME_SETTINGS);
      await soloHost.start();
      const errorCb = jest.fn();
      soloHost.onError(errorCb);
      soloHost.startGame();
      expect(errorCb).toHaveBeenCalledWith(expect.stringContaining('at least 2'));
    });

    it('includes initialChips in gameStart message', async () => {
      transport.simulateMessageReceived(
        'client-1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'ready' })),
      );

      transport.sentMessages.length = 0; // Clear previous messages
      host.startGame();
      await flushPromises();

      // Decode the gameStart broadcast
      const decoded = decodeLastFrom(transport, '__all__');
      expect(decoded).toBeDefined();
      expect(decoded).toEqual({
        type: 'gameStart',
        blinds: { sb: 5, bb: 10 },
        initialChips: 1000,
      });
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
      const allBroadcasts = decodeAllFrom(transport, '__all__');
      const closedMsgs = allBroadcasts.filter(
        (m) => (m as Record<string, unknown>).type === 'lobbyClosed',
      );
      expect(closedMsgs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getClientSeatMap', () => {
    it('returns clientId→seat map excluding host', async () => {
      await host.start();
      transport.simulateClientConnected('client-1');
      transport.simulateMessageReceived(
        'client-1',
        'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' })),
      );
      await flushPromises();

      const seatMap = host.getClientSeatMap();
      expect(seatMap.size).toBe(1);
      expect(seatMap.get('client-1')).toBe(1);
    });
  });

  describe('spectator management', () => {
    it('accepts spectate and sends spectateResponse', async () => {
      await host.start();
      transport.simulateClientConnected('spec1');
      transport.simulateMessageReceived('spec1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'Watcher' }))
      );
      await flushPromises();

      const resp = decodeLastFrom(transport, 'spec1');
      expect(resp).toMatchObject({ type: 'spectateResponse', accepted: true, spectatorId: 0 });
    });

    it('rejects spectate when spectator slots are full (max 4)', async () => {
      await host.start();
      for (let i = 0; i < 4; i++) {
        transport.simulateClientConnected(`spec${i}`);
        transport.simulateMessageReceived(`spec${i}`, 'lobby',
          encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: `W${i}` }))
        );
        await flushPromises();
      }
      transport.simulateClientConnected('spec4');
      transport.simulateMessageReceived('spec4', 'lobby',
        encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'W4' }))
      );
      await flushPromises();

      const resp = decodeLastFrom(transport, 'spec4');
      expect(resp).toMatchObject({ type: 'spectateResponse', accepted: false });
    });

    it('broadcasts spectatorUpdate after spectate', async () => {
      const cb = jest.fn();
      host.onSpectatorCountChanged(cb);
      await host.start();
      transport.simulateClientConnected('spec1');
      transport.simulateMessageReceived('spec1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'W' }))
      );
      await flushPromises();
      expect(cb).toHaveBeenCalledWith(1);
    });

    it('removes spectator on disconnect and decrements count', async () => {
      const cb = jest.fn();
      host.onSpectatorCountChanged(cb);
      await host.start();
      transport.simulateClientConnected('spec1');
      transport.simulateMessageReceived('spec1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'W' }))
      );
      await flushPromises();
      transport.simulateClientDisconnected('spec1');
      await flushPromises();
      expect(cb).toHaveBeenLastCalledWith(0);
    });

    it('sends gameStart to spectators when game starts', async () => {
      // Add two players so startGame is valid
      await host.start();
      transport.simulateClientConnected('c1');
      transport.simulateMessageReceived('c1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' }))
      );
      await flushPromises();
      transport.simulateMessageReceived('c1', 'lobby', encodeMessage(JSON.stringify({ type: 'ready' })));
      await flushPromises();
      // Add spectator
      transport.simulateClientConnected('spec1');
      transport.simulateMessageReceived('spec1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'W' }))
      );
      await flushPromises();

      host.startGame();
      await flushPromises();

      // gameStart is sent via sendToAll (clientId '__all__'), which reaches spectators too
      const msgs = decodeAllFrom(transport, '__all__');
      const gameStart = msgs.find((m: any) => m.type === 'gameStart');
      expect(gameStart).toBeTruthy();
    });

    it('accepts spectate during game, rejects join during game', async () => {
      await host.start();
      // Add player and start game
      transport.simulateClientConnected('c1');
      transport.simulateMessageReceived('c1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Alice' }))
      );
      await flushPromises();
      transport.simulateMessageReceived('c1', 'lobby', encodeMessage(JSON.stringify({ type: 'ready' })));
      await flushPromises();
      host.startGame();
      await flushPromises();

      // Try to join during game — should be rejected
      transport.simulateClientConnected('late1');
      transport.simulateMessageReceived('late1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'join', protocolVersion: 1, playerName: 'Late' }))
      );
      await flushPromises();
      expect(decodeLastFrom(transport, 'late1')).toMatchObject({ type: 'joinResponse', accepted: false });

      // Try to spectate during game — should be accepted
      transport.simulateClientConnected('spec1');
      transport.simulateMessageReceived('spec1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'W' }))
      );
      await flushPromises();
      expect(decodeLastFrom(transport, 'spec1')).toMatchObject({ type: 'spectateResponse', accepted: true });
    });

    it('calls onSpectatorJoined callback when spectate accepted', async () => {
      const cb = jest.fn();
      host.onSpectatorJoined(cb);
      await host.start();
      transport.simulateClientConnected('spec1');
      transport.simulateMessageReceived('spec1', 'lobby',
        encodeMessage(JSON.stringify({ type: 'spectate', protocolVersion: 1, spectatorName: 'W' }))
      );
      await flushPromises();
      expect(cb).toHaveBeenCalledWith('spec1');
    });
  });
});
