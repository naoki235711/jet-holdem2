import { BleSpectatorGameService } from '../../src/services/ble/BleSpectatorGameService';
import { MockBleClientTransport } from '../../src/services/ble/MockBleTransport';
import { ChunkManager } from '../../src/services/ble/ChunkManager';
import { GameHostMessage } from '../../src/services/ble/GameProtocol';
import { Player } from '../../src/gameEngine/types';

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
    { seat: 0, name: 'Host', chips: 990, status: 'active', bet: 10, cards: [] },
    { seat: 1, name: 'Alice', chips: 990, status: 'active', bet: 10, cards: [] },
    { seat: 2, name: 'Bob', chips: 980, status: 'active', bet: 0, cards: [] },
  ],
  minRaiseSize: 10,
  frozenSeats: [],
  ...overrides,
});

describe('BleSpectatorGameService', () => {
  let transport: MockBleClientTransport;
  let service: BleSpectatorGameService;

  beforeEach(() => {
    transport = new MockBleClientTransport();
    service = new BleSpectatorGameService(transport);
  });

  it('throws before receiving any state', () => {
    expect(() => service.getState()).toThrow('Game not started');
  });

  it('returns state from stateUpdate with all cards as empty arrays', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    const state = service.getState();
    expect(state.phase).toBe('preflop');
    state.players.forEach((p: Player) => expect(p.cards).toEqual([]));
  });

  it('notifies subscribers on stateUpdate', () => {
    const cb = jest.fn();
    service.subscribe(cb);
    sendMessage(transport, 'gameState', makeStateUpdate());
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].phase).toBe('preflop');
  });

  it('subscribe returns unsubscribe function', () => {
    const cb = jest.fn();
    const unsub = service.subscribe(cb);
    unsub();
    sendMessage(transport, 'gameState', makeStateUpdate());
    expect(cb).not.toHaveBeenCalled();
  });

  it('handles showdownResult and returns it from resolveShowdown()', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    sendMessage(transport, 'gameState', {
      type: 'showdownResult',
      seq: 2,
      winners: [{ seat: 0, hand: 'High Card', potAmount: 30 }],
      hands: [{ seat: 0, cards: ['Ah', 'Kh'], description: 'High Card' }],
    });
    const result = service.resolveShowdown();
    expect(result.winners).toHaveLength(1);
    expect(result.winners[0].seat).toBe(0);
  });

  it('resolveShowdown returns empty result when no showdown received', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    const result = service.resolveShowdown();
    expect(result.winners).toHaveLength(0);
    expect(result.hands).toHaveLength(0);
  });

  it('clears showdownResult on rematch', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    sendMessage(transport, 'gameState', {
      type: 'showdownResult',
      seq: 2,
      winners: [{ seat: 0, hand: 'High Card', potAmount: 30 }],
      hands: [],
    });
    sendMessage(transport, 'gameState', { type: 'rematch', seq: 3 });
    const result = service.resolveShowdown();
    expect(result.winners).toHaveLength(0);
  });

  it('handleAction returns { valid: false }', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    const result = service.handleAction(0, { action: 'fold' });
    expect(result.valid).toBe(false);
  });

  it('getActionInfo returns all-false dummy values', () => {
    const info = service.getActionInfo(0);
    expect(info.canCheck).toBe(false);
    expect(info.canRaise).toBe(false);
    expect(info.callAmount).toBe(0);
  });

  it('ignores privateHand messages', () => {
    sendMessage(transport, 'gameState', makeStateUpdate());
    sendMessage(transport, 'privateHand', { type: 'privateHand', seat: 0, cards: ['Ah', 'Kh'] });
    const state = service.getState();
    // Cards should still be empty — not replaced
    state.players.forEach((p: Player) => expect(p.cards).toEqual([]));
  });
});
