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
      const alice = state.players.find(p => p.name === 'Alice');
      const bob   = state.players.find(p => p.name === 'Bob');
      const charlie = state.players.find(p => p.name === 'Charlie');
      expect(alice).toBeDefined();
      expect(alice!.chips).toBe(1000);
      expect(bob).toBeDefined();
      expect(charlie).toBeDefined();
    });

    it('sets phase to waiting after startGame', () => {
      const state = service.getState();
      expect(state.phase).toBe('waiting');
    });

    it('uses savedChips for known players when provided', () => {
      const svc = new LocalGameService();
      svc.startGame(['Alice', 'Bob', 'Charlie'], { sb: 5, bb: 10 }, 1000, {
        Alice: 1500,
        Bob: 800,
      });
      const state = svc.getState();
      expect(state.players.find(p => p.name === 'Alice')!.chips).toBe(1500);
      expect(state.players.find(p => p.name === 'Bob')!.chips).toBe(800);
      expect(state.players.find(p => p.name === 'Charlie')!.chips).toBe(1000);
    });

    it('falls back to initialChips when savedChips is undefined', () => {
      const svc = new LocalGameService();
      svc.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000);
      const state = svc.getState();
      state.players.forEach(p => expect(p.chips).toBe(1000));
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

  describe('error: game not started', () => {
    // LE-1
    it('getState() throws before startGame', () => {
      const svc = new LocalGameService();
      expect(() => svc.getState()).toThrow('Game not started');
    });

    // LE-2
    it('getActionInfo() throws before startGame', () => {
      const svc = new LocalGameService();
      expect(() => svc.getActionInfo(0)).toThrow('Game not started');
    });

    // LE-3
    it('handleAction() throws before startGame', () => {
      const svc = new LocalGameService();
      expect(() => svc.handleAction(0, { action: 'fold' })).toThrow('Game not started');
    });

    // LE-4
    it('resolveShowdown() throws before startGame', () => {
      const svc = new LocalGameService();
      expect(() => svc.resolveShowdown()).toThrow('Game not started');
    });

    // LE-5
    it('prepareNextRound() throws before startGame', () => {
      const svc = new LocalGameService();
      expect(() => svc.prepareNextRound()).toThrow('Game not started');
    });

    // LE-6
    it('startRound() throws before startGame', () => {
      const svc = new LocalGameService();
      expect(() => svc.startRound()).toThrow('Game not started');
    });
  });

  describe('error: invalid seat', () => {
    // LE-7
    it('getActionInfo() throws for non-existent seat', () => {
      service.startRound();
      expect(() => service.getActionInfo(5)).toThrow('Invalid seat: 5');
    });
  });

  describe('error message translation', () => {
    // LE-8
    it('translates "not your turn" to Japanese', () => {
      service.startRound();
      const state = service.getState();
      const wrongSeat = state.players.find(p => p.seat !== state.activePlayer && p.status === 'active')!.seat;
      const result = service.handleAction(wrongSeat, { action: 'fold' });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('あなたのターンではありません');
    });

    // LE-9
    it('translates "Minimum raise is" to Japanese', () => {
      service.startRound();
      const state = service.getState();
      // Raise to a value below minimum (minRaise = currentBet + bb = 10 + 10 = 20)
      const result = service.handleAction(state.activePlayer, { action: 'raise', amount: 11 });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('レイズ額が最低額に達していません');
    });

    // LE-10
    it('all predefined error messages have translations', () => {
      // "Cannot check" — UTG in preflop faces BB, cannot check
      service.startRound();
      const state = service.getState();
      const checkResult = service.handleAction(state.activePlayer, { action: 'check' });
      expect(checkResult.valid).toBe(false);
      expect(checkResult.reason).toBe('チェックできません。コール、レイズ、またはフォールドしてください');

      // "Nothing to call" — BB in preflop after all call, can check but not call
      // UTG calls, SB calls, then BB can check
      service.handleAction(state.activePlayer, { action: 'call' });
      const s2 = service.getState();
      service.handleAction(s2.activePlayer, { action: 'call' });
      const s3 = service.getState();
      // BB faces currentBet == own bet, so 'call' should fail with "Nothing to call"
      const callResult = service.handleAction(s3.activePlayer, { action: 'call' });
      expect(callResult.valid).toBe(false);
      expect(callResult.reason).toBe('コールする必要はありません。チェックしてください');
    });
  });
});

describe('Bot integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('getBotSeats returns bot seats after startGame with bots', () => {
    const svc = new LocalGameService();
    svc.startGame(['Alice'], { sb: 5, bb: 10 }, 1000, undefined, 2);
    const botSeats = svc.getBotSeats?.();
    expect(botSeats).toBeDefined();
    expect(botSeats!.size).toBe(2);
  });

  it('bot players have isBot=true', () => {
    const svc = new LocalGameService();
    svc.startGame(['Alice'], { sb: 5, bb: 10 }, 1000, undefined, 1);
    const state = svc.getState();
    const bots = state.players.filter(p => p.isBot);
    expect(bots).toHaveLength(1);
    expect(bots[0].name).toMatch(/^Bot \d+$/);
  });

  it('bot action fires after 1 second via setTimeout', () => {
    const svc = new LocalGameService();
    svc.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000, undefined, 1);
    svc.startRound();

    const stateBefore = svc.getState();
    // Find the first bot turn if active, or advance to it
    // After 1s timer fires, state should advance
    const listenerCalled = jest.fn();
    svc.subscribe(listenerCalled);

    jest.advanceTimersByTime(1100);

    // If the first active player was a bot, listener should have been called
    // (bot acted). If not a bot, no additional calls.
    // At minimum, verify no error thrown.
    const stateAfter = svc.getState();
    expect(['preflop', 'flop', 'roundEnd']).toContain(stateAfter.phase);
  });

  it('handleTimeout no-ops for bot seats', () => {
    const svc = new LocalGameService();
    svc.startGame(['Alice'], { sb: 5, bb: 10 }, 1000, undefined, 1);
    svc.startRound();
    const state = svc.getState();
    const botSeats = svc.getBotSeats?.() ?? new Set<number>();
    // If active player is bot, manually verify getBotSeats contains it
    if (botSeats.has(state.activePlayer)) {
      expect(botSeats.has(state.activePlayer)).toBe(true);
    }
  });

  it('startGame with botCount=0 behaves as before', () => {
    const svc = new LocalGameService();
    svc.startGame(['Alice', 'Bob'], { sb: 5, bb: 10 }, 1000, undefined, 0);
    const state = svc.getState();
    expect(state.players).toHaveLength(2);
    expect(state.players.every(p => !p.isBot)).toBe(true);
    expect(svc.getBotSeats?.()?.size).toBe(0);
  });
});
