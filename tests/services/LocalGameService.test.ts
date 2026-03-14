// tests/services/LocalGameService.test.ts

import { LocalGameService } from '../../src/services/LocalGameService';
import { GameState, PlayerAction } from '../../src/gameEngine';

describe('LocalGameService', () => {
  let service: LocalGameService;

  beforeEach(() => {
    service = new LocalGameService();
    service.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000);
  });

  describe('startGame', () => {
    it('creates players with correct names and chips', () => {
      const state = service.getState();
      expect(state.players).toHaveLength(3);
      expect(state.players[0].name).toBe('Alice');
      expect(state.players[0].chips).toBe(1000);
      expect(state.players[1].name).toBe('Bob');
      expect(state.players[2].name).toBe('Charlie');
    });

    it('sets phase to waiting after startGame', () => {
      const state = service.getState();
      expect(state.phase).toBe('waiting');
    });
  });

  describe('startRound', () => {
    it('transitions to preflop and deals cards', () => {
      service.startRound();
      const state = service.getState();
      expect(state.phase).toBe('preflop');
      for (const p of state.players) {
        expect(p.cards).toHaveLength(2);
      }
    });
  });

  describe('subscribe', () => {
    it('notifies listener on state changes', () => {
      const listener = jest.fn();
      service.subscribe(listener);
      service.startRound();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].phase).toBe('preflop');
    });

    it('returns unsubscribe function', () => {
      const listener = jest.fn();
      const unsub = service.subscribe(listener);
      unsub();
      service.startRound();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getActionInfo', () => {
    it('returns correct info for player who can check', () => {
      service.startRound();
      const state = service.getState();
      const activeSeat = state.activePlayer;
      service.handleAction(activeSeat, { action: 'call' });
      const state2 = service.getState();
      const nextSeat = state2.activePlayer;
      service.handleAction(nextSeat, { action: 'call' });
      const state3 = service.getState();
      const bbSeat = state3.activePlayer;
      service.handleAction(bbSeat, { action: 'check' });

      const flopState = service.getState();
      expect(flopState.phase).toBe('flop');
      const flopActive = flopState.activePlayer;
      const info = service.getActionInfo(flopActive);
      expect(info.canCheck).toBe(true);
      expect(info.callAmount).toBe(0);
      expect(info.minRaise).toBe(10);
      expect(info.canRaise).toBe(true);
    });

    it('returns correct callAmount when there is a bet', () => {
      service.startRound();
      const state = service.getState();
      service.handleAction(state.activePlayer, { action: 'raise', amount: 30 });
      const state2 = service.getState();
      const info = service.getActionInfo(state2.activePlayer);
      expect(info.canCheck).toBe(false);
      expect(info.callAmount).toBe(25);
      expect(info.minRaise).toBe(50);
    });
  });

  describe('handleAction with error translation', () => {
    it('translates engine error to user-friendly message', () => {
      service.startRound();
      const state = service.getState();
      const wrongSeat = (state.activePlayer + 1) % 3;
      const result = service.handleAction(wrongSeat, { action: 'fold' });
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).not.toMatch(/^Seat \d/);
    });
  });

  describe('full round lifecycle', () => {
    it('handles fold → roundEnd correctly', () => {
      service.startRound();
      const state = service.getState();
      service.handleAction(state.activePlayer, { action: 'fold' });
      const state2 = service.getState();
      service.handleAction(state2.activePlayer, { action: 'fold' });
      const finalState = service.getState();
      expect(finalState.phase).toBe('roundEnd');
    });
  });
});
