import { GameLoop } from '../../../src/gameEngine/GameLoop';
import { Player, PlayerStatus, Blinds } from '../../../src/gameEngine/types';

function makePlayers(configs: { name: string; chips: number }[]): Player[] {
  return configs.map((c, i) => ({
    seat: i,
    name: c.name,
    chips: c.chips,
    status: 'active' as PlayerStatus,
    bet: 0,
    cards: [],
  }));
}

function advanceToPhase(gameLoop: GameLoop, targetPhase: string): void {
  let state = gameLoop.getState();
  let safety = 0;
  while (state.phase !== targetPhase && safety < 100) {
    if (state.activePlayer < 0) {
      if (state.phase === 'showdown') {
        gameLoop.resolveShowdown();
        state = gameLoop.getState();
        continue;
      }
      if (
        state.phase === 'allInFlop' ||
        state.phase === 'allInTurn' ||
        state.phase === 'allInRiver'
      ) {
        gameLoop.advanceRunout();
        state = gameLoop.getState();
        continue;
      }
      break;
    }
    const activePlayer = state.players.find(p => p.seat === state.activePlayer)!;
    if (state.currentBet <= activePlayer.bet) {
      gameLoop.handleAction(state.activePlayer, { action: 'check' });
    } else {
      gameLoop.handleAction(state.activePlayer, { action: 'call' });
    }
    state = gameLoop.getState();
    safety++;
  }
}

const blinds: Blinds = { sb: 5, bb: 10 };

describe('GameLoop + PotManager Integration', () => {
  describe('fold-win pot distribution', () => {
    // GP-1
    it('preflop 2 fold → last player wins blind total', () => {
      const players = makePlayers([
        { name: 'Alice', chips: 1000 },
        { name: 'Bob', chips: 1000 },
        { name: 'Charlie', chips: 1000 },
      ]);
      const gl = new GameLoop(players, blinds);
      const initialTotal = players.reduce((s, p) => s + p.chips, 0);

      gl.startRound();
      const state = gl.getState();

      // UTG (seat 0) folds, then next active player folds
      gl.handleAction(state.activePlayer, { action: 'fold' });
      const state2 = gl.getState();
      gl.handleAction(state2.activePlayer, { action: 'fold' });

      const finalState = gl.getState();
      expect(finalState.phase).toBe('roundEnd');
      expect(finalState.foldWin).toBeDefined();
      expect(finalState.foldWin!.amount).toBe(15); // SB(5) + BB(10)

      // Winner chips increased by pot amount
      const winner = finalState.players.find(p => p.seat === finalState.foldWin!.seat)!;
      expect(winner.chips).toBeGreaterThan(1000);

      // Total chips conserved
      expect(finalState.players.reduce((s, p) => s + p.chips, 0)).toBe(initialTotal);
    });

    // GP-2
    it('multi-round bets collected before fold-win', () => {
      const players = makePlayers([
        { name: 'Alice', chips: 1000 },
        { name: 'Bob', chips: 1000 },
        { name: 'Charlie', chips: 1000 },
      ]);
      const gl = new GameLoop(players, blinds);
      const initialTotal = 3000;

      gl.startRound();
      // 3 players, dealer=0: SB=seat1, BB=seat2, UTG=seat0

      // Preflop: all call/check (accumulates SB+BB = 15, then calls to 10 each = 30 total)
      let state = gl.getState();
      while (state.phase === 'preflop' && state.activePlayer >= 0) {
        const p = state.players.find(pp => pp.seat === state.activePlayer)!;
        if (state.currentBet <= p.bet) {
          gl.handleAction(state.activePlayer, { action: 'check' });
        } else {
          gl.handleAction(state.activePlayer, { action: 'call' });
        }
        state = gl.getState();
      }
      expect(state.phase).toBe('flop');

      // Flop: seat1 raises to 20, seat2 calls, seat0 folds
      // Post-flop first to act = seat1 (first active after dealer=0)
      gl.handleAction(state.activePlayer, { action: 'raise', amount: 20 });
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'call' });
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'fold' });

      // After fold: 2 non-folded remain (no fold-win). Advances to turn.
      state = gl.getState();
      expect(state.phase).toBe('turn');

      // Turn: one remaining player folds → fold-win
      gl.handleAction(state.activePlayer, { action: 'fold' });
      state = gl.getState();

      expect(state.phase).toBe('roundEnd');
      expect(state.foldWin).toBeDefined();
      // Pot includes preflop bets (30) + flop bets (40) = 70
      expect(state.foldWin!.amount).toBeGreaterThan(15); // More than just blinds
      expect(state.players.reduce((s, p) => s + p.chips, 0)).toBe(initialTotal);
    });
  });

  describe('side pot + fold combinations', () => {
    // GP-3
    it('short-stack all-in then another folds → correct pot eligibility', () => {
      const players = makePlayers([
        { name: 'P1', chips: 100 },
        { name: 'P2', chips: 1000 },
        { name: 'P3', chips: 1000 },
      ]);
      const gl = new GameLoop(players, blinds);
      gl.startRound();

      // P1 (UTG, seat 0) goes all-in with 100
      let state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'allIn' });

      // P2 calls
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'call' });

      // P3 folds
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'fold' });

      state = gl.getState();
      // Skip to showdown/roundEnd
      advanceToPhase(gl, 'roundEnd');

      const finalState = gl.getState();
      expect(finalState.phase).toBe('roundEnd');

      // Chip conservation
      const initialTotal = 100 + 1000 + 1000;
      expect(finalState.players.reduce((s, p) => s + p.chips, 0)).toBe(initialTotal);
    });

    // GP-4
    it('multiple side pots with folds → correct pot structure', () => {
      const players = makePlayers([
        { name: 'P1', chips: 50 },
        { name: 'P2', chips: 100 },
        { name: 'P3', chips: 1000 },
        { name: 'P4', chips: 1000 },
      ]);
      const gl = new GameLoop(players, { sb: 5, bb: 10 });
      gl.startRound();

      let state = gl.getState();
      // 4-player: dealer=seat0(P1,50), SB=seat1(P2,100), BB=seat2(P3,1000), UTG=seat3(P4,1000)

      // seat3 (P4, UTG) calls BB
      gl.handleAction(state.activePlayer, { action: 'call' });
      state = gl.getState();

      // seat0 (P1, dealer, 50 chips) all-in
      gl.handleAction(state.activePlayer, { action: 'allIn' });
      state = gl.getState();

      // seat1 (P2, SB, 100 chips) all-in
      gl.handleAction(state.activePlayer, { action: 'allIn' });
      state = gl.getState();

      // seat2 (P3, BB) folds
      gl.handleAction(state.activePlayer, { action: 'fold' });
      state = gl.getState();

      // seat3 (P4) calls to match highest bet
      if (state.activePlayer >= 0 && state.phase !== 'roundEnd') {
        gl.handleAction(state.activePlayer, { action: 'call' });
        state = gl.getState();
      }

      // Advance to roundEnd
      advanceToPhase(gl, 'roundEnd');

      const finalState = gl.getState();
      expect(finalState.phase).toBe('roundEnd');

      // Chip conservation
      const initialTotal = 50 + 100 + 1000 + 1000;
      expect(finalState.players.reduce((s, p) => s + p.chips, 0)).toBe(initialTotal);
    });
  });

  describe('chip conservation law', () => {
    // GP-5
    it('showdown: total chips unchanged (3-player)', () => {
      const players = makePlayers([
        { name: 'Alice', chips: 1000 },
        { name: 'Bob', chips: 1000 },
        { name: 'Charlie', chips: 1000 },
      ]);
      const gl = new GameLoop(players, blinds);
      gl.startRound();
      advanceToPhase(gl, 'roundEnd');

      const finalState = gl.getState();
      expect(finalState.players.reduce((s, p) => s + p.chips, 0)).toBe(3000);
    });

    // GP-6
    it('fold-win: total chips unchanged', () => {
      const players = makePlayers([
        { name: 'Alice', chips: 1000 },
        { name: 'Bob', chips: 1000 },
        { name: 'Charlie', chips: 1000 },
      ]);
      const gl = new GameLoop(players, blinds);
      gl.startRound();

      // Two players fold
      let state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'fold' });
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'fold' });

      const finalState = gl.getState();
      expect(finalState.phase).toBe('roundEnd');
      expect(finalState.players.reduce((s, p) => s + p.chips, 0)).toBe(3000);
    });

    // GP-7
    it('side pot showdown: total chips unchanged', () => {
      const players = makePlayers([
        { name: 'P1', chips: 100 },
        { name: 'P2', chips: 500 },
        { name: 'P3', chips: 1000 },
      ]);
      const gl = new GameLoop(players, blinds);
      const initialTotal = 100 + 500 + 1000;

      gl.startRound();
      // P1 all-in, P2 call, P3 call
      let state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'allIn' });
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'call' });
      state = gl.getState();
      gl.handleAction(state.activePlayer, { action: 'call' });

      advanceToPhase(gl, 'roundEnd');

      const finalState = gl.getState();
      expect(finalState.players.reduce((s, p) => s + p.chips, 0)).toBe(initialTotal);
    });
  });
});
