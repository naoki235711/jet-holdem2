// tests/ble/BleHostGameService.test.ts

import { BleHostGameService } from '../../src/services/ble/BleHostGameService';
import { MockBleHostTransport } from '../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../src/services/ble/ChunkManager';
import { Blinds } from '../../src/gameEngine/types';

function decodeMessages(transport: MockBleHostTransport, clientId: string): unknown[] {
  const cm = new ChunkManager();
  const results: unknown[] = [];
  for (const msg of transport.sentMessages) {
    if (msg.clientId !== clientId && msg.clientId !== '__all__') continue;
    const json = cm.decode(msg.clientId, msg.data);
    if (json !== null) results.push(JSON.parse(json));
  }
  return results;
}

function decodeBroadcasts(transport: MockBleHostTransport): unknown[] {
  return decodeMessages(transport, '__all__');
}

describe('BleHostGameService', () => {
  let transport: MockBleHostTransport;
  let service: BleHostGameService;
  const blinds: Blinds = { sb: 5, bb: 10 };
  const clientSeatMap = new Map<string, number>([
    ['client-1', 1],
    ['client-2', 2],
  ]);

  beforeEach(() => {
    transport = new MockBleHostTransport();
    service = new BleHostGameService(transport, clientSeatMap);
  });

  describe('startGame + getState', () => {
    it('creates GameLoop and returns state with other players cards hidden', () => {
      service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
      service.startRound();
      const state = service.getState();

      expect(state.phase).toBe('preflop');
      expect(state.players).toHaveLength(3);
      // Host (seat 0) sees own cards
      expect(state.players[0].cards).toHaveLength(2);
      // Other players' cards are hidden
      expect(state.players[1].cards).toEqual([]);
      expect(state.players[2].cards).toEqual([]);
    });

    it('throws if getState called before startGame', () => {
      expect(() => service.getState()).toThrow('Game not started');
    });
  });

  describe('BLE broadcasting', () => {
    beforeEach(() => {
      service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
    });

    it('broadcasts stateUpdate and privateHands on startRound', () => {
      service.startRound();

      // Check broadcasts (sendToAll uses '__all__' clientId)
      const broadcasts = decodeBroadcasts(transport);
      const stateUpdates = broadcasts.filter((m: any) => m.type === 'stateUpdate');
      expect(stateUpdates).toHaveLength(1);
      const su = stateUpdates[0] as any;
      expect(su.phase).toBe('preflop');
      expect(su.players.every((p: any) => p.cards.length === 0)).toBe(true);
      expect(su.minRaiseSize).toBeGreaterThan(0);
      expect(su.frozenSeats).toEqual([]);

      // Check privateHands sent to each client
      const client1Msgs = decodeMessages(transport, 'client-1');
      const ph1 = client1Msgs.find((m: any) => m.type === 'privateHand') as any;
      expect(ph1).toBeDefined();
      expect(ph1.seat).toBe(1);
      expect(ph1.cards).toHaveLength(2);

      const client2Msgs = decodeMessages(transport, 'client-2');
      const ph2 = client2Msgs.find((m: any) => m.type === 'privateHand') as any;
      expect(ph2).toBeDefined();
      expect(ph2.seat).toBe(2);
      expect(ph2.cards).toHaveLength(2);
    });

    it('broadcasts stateUpdate on handleAction', () => {
      service.startRound();
      transport.sentMessages.length = 0; // clear

      const state = service.getState();
      const activeSeat = state.activePlayer;
      service.handleAction(activeSeat, { action: 'fold' });

      const broadcasts = decodeBroadcasts(transport);
      expect(broadcasts.some((m: any) => m.type === 'stateUpdate')).toBe(true);
    });
  });

  describe('client action reception', () => {
    const cm = new ChunkManager();

    beforeEach(() => {
      service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
      service.startRound();
      transport.sentMessages.length = 0;
    });

    it('processes playerAction from client via BLE', () => {
      const state = service.getState();
      // Find which client's turn it is
      const activeSeat = state.activePlayer;
      // Find clientId for that seat
      let activeClientId: string | undefined;
      for (const [cid, seat] of clientSeatMap) {
        if (seat === activeSeat) { activeClientId = cid; break; }
      }
      if (!activeClientId) return; // Host's turn — skip this test path

      const actionMsg = JSON.stringify({ type: 'playerAction', action: 'fold' });
      const chunks = cm.encode(actionMsg);
      for (const chunk of chunks) {
        transport.simulateMessageReceived(activeClientId, 'playerAction', chunk);
      }

      // Verify state was broadcast after action
      const broadcasts = decodeBroadcasts(transport);
      expect(broadcasts.some((m: any) => m.type === 'stateUpdate')).toBe(true);
    });

    it('ignores messages on non-playerAction characteristic', () => {
      const actionMsg = JSON.stringify({ type: 'playerAction', action: 'fold' });
      const chunks = cm.encode(actionMsg);
      for (const chunk of chunks) {
        transport.simulateMessageReceived('client-1', 'gameState', chunk);
      }

      // No broadcast should have been triggered
      expect(decodeBroadcasts(transport)).toHaveLength(0);
    });

    it('ignores messages from unknown clientId', () => {
      const actionMsg = JSON.stringify({ type: 'playerAction', action: 'fold' });
      const chunks = cm.encode(actionMsg);
      for (const chunk of chunks) {
        transport.simulateMessageReceived('unknown-client', 'playerAction', chunk);
      }

      expect(decodeBroadcasts(transport)).toHaveLength(0);
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on state changes', () => {
      const listener = jest.fn();
      service.subscribe(listener);
      service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
      service.startRound();

      expect(listener).toHaveBeenCalled();
      const notifiedState = listener.mock.calls[0][0];
      // Listener receives host-filtered state (other cards hidden)
      expect(notifiedState.players[1].cards).toEqual([]);
    });

    it('returns unsubscribe function', () => {
      const listener = jest.fn();
      const unsub = service.subscribe(listener);
      unsub();
      service.startGame(['Host', 'Alice', 'Bob'], blinds, 1000);
      service.startRound();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('resolveShowdown', () => {
    it('sends showdownResult message via BLE', () => {
      service.startGame(['Host', 'Alice'], blinds, 1000);
      service.startRound();

      // Play through to showdown: both players call/check through all rounds
      let state = service.getState();
      while (state.phase !== 'showdown' && state.phase !== 'roundEnd') {
        if (state.activePlayer < 0) break;
        const info = service.getActionInfo(state.activePlayer);
        if (info.canCheck) {
          service.handleAction(state.activePlayer, { action: 'check' });
        } else {
          service.handleAction(state.activePlayer, { action: 'call' });
        }
        state = service.getState();
      }

      if (state.phase !== 'showdown') return; // foldWin, skip

      transport.sentMessages.length = 0;
      const result = service.resolveShowdown();

      const broadcasts = decodeBroadcasts(transport);
      const sdMsg = broadcasts.find((m: any) => m.type === 'showdownResult') as any;
      expect(sdMsg).toBeDefined();
      expect(sdMsg.winners.length).toBeGreaterThan(0);
      expect(sdMsg.hands.length).toBeGreaterThan(0);

      // Also broadcasts stateUpdate after showdown
      expect(broadcasts.some((m: any) => m.type === 'stateUpdate')).toBe(true);
    });
  });
});
