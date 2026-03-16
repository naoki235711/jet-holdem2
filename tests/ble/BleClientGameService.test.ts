// tests/ble/BleClientGameService.test.ts

import { BleClientGameService } from '../../src/services/ble/BleClientGameService';
import { MockBleClientTransport } from '../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../src/services/ble/ChunkManager';
import { GameHostMessage, PrivateHandMessage } from '../../src/services/ble/GameProtocol';

function sendMessage(transport: MockBleClientTransport, charId: string, msg: unknown): void {
  const cm = new ChunkManager();
  const chunks = cm.encode(JSON.stringify(msg));
  for (const chunk of chunks) {
    transport.simulateMessageReceived(charId, chunk);
  }
}

const makeStateUpdate = (overrides: Partial<GameHostMessage & { type: 'stateUpdate' }> = {}): GameHostMessage => ({
  type: 'stateUpdate',
  seq: 1,
  phase: 'preflop',
  community: [],
  pots: [{ amount: 15, eligible: [0, 1, 2] }],
  currentBet: 10,
  activePlayer: 2,
  dealer: 0,
  blinds: { sb: 5, bb: 10 },
  players: [
    { seat: 0, name: 'Host', chips: 995, status: 'active', bet: 5, cards: [] },
    { seat: 1, name: 'Alice', chips: 990, status: 'active', bet: 10, cards: [] },
    { seat: 2, name: 'Bob', chips: 1000, status: 'active', bet: 0, cards: [] },
  ],
  minRaiseSize: 10,
  frozenSeats: [],
  ...overrides,
});

describe('BleClientGameService', () => {
  let transport: MockBleClientTransport;
  let service: BleClientGameService;

  beforeEach(() => {
    transport = new MockBleClientTransport();
    service = new BleClientGameService(transport, 1); // mySeat = 1
  });

  describe('state reception', () => {
    it('throws before receiving any state', () => {
      expect(() => service.getState()).toThrow('Game not started');
    });

    it('updates state from stateUpdate message', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());
      const state = service.getState();
      expect(state.phase).toBe('preflop');
      expect(state.players).toHaveLength(3);
    });

    it('replaces own cards with privateHand data', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());
      sendMessage(transport, 'privateHand', {
        type: 'privateHand',
        seat: 1,
        cards: ['Ah', 'Kh'],
      });

      const state = service.getState();
      expect(state.players[1].cards).toEqual(['Ah', 'Kh']);
      // Other players still have empty cards
      expect(state.players[0].cards).toEqual([]);
      expect(state.players[2].cards).toEqual([]);
    });
  });

  describe('handleAction (optimistic)', () => {
    it('returns valid immediately and sends playerAction via BLE', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());

      const result = service.handleAction(1, { action: 'fold' });
      expect(result).toEqual({ valid: true });

      // Check message was sent
      const cm = new ChunkManager();
      expect(transport.sentMessages).toHaveLength(1);
      expect(transport.sentMessages[0].characteristicId).toBe('playerAction');
      const json = cm.decode('host', transport.sentMessages[0].data);
      expect(JSON.parse(json!)).toEqual({ type: 'playerAction', action: 'fold' });
    });

    it('sends raise with amount', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());

      service.handleAction(1, { action: 'raise', amount: 50 });

      const cm = new ChunkManager();
      const json = cm.decode('host', transport.sentMessages[0].data);
      expect(JSON.parse(json!)).toEqual({ type: 'playerAction', action: 'raise', amount: 50 });
    });
  });

  describe('getActionInfo', () => {
    it('computes action info from received state', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());

      const info = service.getActionInfo(2); // Bob: chips=1000, bet=0, currentBet=10
      expect(info.canCheck).toBe(false);
      expect(info.callAmount).toBe(10);
      expect(info.minRaise).toBe(20); // currentBet(10) + minRaiseSize(10)
      expect(info.maxRaise).toBe(1000); // chips(1000) + bet(0)
      expect(info.canRaise).toBe(true);
    });

    it('throws before receiving state', () => {
      expect(() => service.getActionInfo(0)).toThrow('Game not started');
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on stateUpdate', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      sendMessage(transport, 'gameState', makeStateUpdate());
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].phase).toBe('preflop');
    });

    it('notifies listeners on privateHand', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      sendMessage(transport, 'gameState', makeStateUpdate());
      listener.mockClear();

      sendMessage(transport, 'privateHand', { type: 'privateHand', seat: 1, cards: ['Ah', 'Kh'] });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].players[1].cards).toEqual(['Ah', 'Kh']);
    });

    it('returns unsubscribe function', () => {
      const listener = jest.fn();
      const unsub = service.subscribe(listener);
      unsub();
      sendMessage(transport, 'gameState', makeStateUpdate());
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('resolveShowdown', () => {
    it('returns showdownResult received from host', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());
      sendMessage(transport, 'gameState', {
        type: 'showdownResult',
        seq: 1,
        winners: [{ seat: 0, hand: 'Two Pair', potAmount: 30 }],
        hands: [
          { seat: 0, cards: ['Ah', 'Kh'], description: 'Two Pair' },
          { seat: 1, cards: ['2s', '3s'], description: 'High Card' },
        ],
      });

      const result = service.resolveShowdown();
      expect(result.winners).toHaveLength(1);
      expect(result.winners[0].seat).toBe(0);
      expect(result.hands).toHaveLength(2);
    });

    it('returns empty result if no showdown received', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());
      const result = service.resolveShowdown();
      expect(result.winners).toEqual([]);
      expect(result.hands).toEqual([]);
    });
  });

  describe('rematch handling', () => {
    it('clears showdownResult and myCards on rematch message', () => {
      // Set up state with showdown data
      sendMessage(transport, 'gameState', makeStateUpdate({ phase: 'roundEnd' as any }));
      sendMessage(transport, 'privateHand', { type: 'privateHand', seat: 1, cards: ['Ah', 'Kh'] });
      sendMessage(transport, 'gameState', {
        type: 'showdownResult',
        seq: 2,
        winners: [{ seat: 0, hand: 'Pair', potAmount: 100 }],
        hands: [{ seat: 0, cards: ['Qs', 'Qd'], description: 'Pair' }],
      });

      // Send rematch (without consuming showdownResult first)
      sendMessage(transport, 'gameState', { type: 'rematch', seq: 0 });

      // resolveShowdown should return empty because rematch cleared it
      const sdAfter = service.resolveShowdown();
      expect(sdAfter.winners).toHaveLength(0);

      // Cards should be cleared
      sendMessage(transport, 'gameState', makeStateUpdate({ seq: 10, phase: 'preflop' }));
      const state = service.getState();
      expect(state.players.find(p => p.seat === 1)?.cards).toEqual([]);
    });

    it('notifies listeners on rematch message', () => {
      sendMessage(transport, 'gameState', makeStateUpdate());
      const listener = jest.fn();
      service.subscribe(listener);
      listener.mockClear();

      sendMessage(transport, 'gameState', { type: 'rematch', seq: 0 });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('no-op methods', () => {
    it('startGame is no-op', () => {
      expect(() => service.startGame(['A', 'B'], { sb: 5, bb: 10 }, 1000)).not.toThrow();
    });

    it('startRound is no-op', () => {
      expect(() => service.startRound()).not.toThrow();
    });

    it('prepareNextRound is no-op', () => {
      expect(() => service.prepareNextRound()).not.toThrow();
    });
  });
});
