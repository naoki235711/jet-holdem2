import { GameLoop } from '../../src/gameEngine/GameLoop';
import { Blinds, Player, Card } from '../../src/gameEngine/types';

const DEFAULT_BLINDS: Blinds = { sb: 5, bb: 10 };

function makeGamePlayers(count: number, chips = 1000): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    seat: i,
    name: `Player${i}`,
    chips,
    status: 'active' as const,
    bet: 0,
    cards: [],
  }));
}

describe('GameLoop', () => {
  describe('initialization', () => {
    it('starts in waiting phase', () => {
      const game = new GameLoop(makeGamePlayers(4), DEFAULT_BLINDS);
      expect(game.phase).toBe('waiting');
    });
  });

  describe('startRound', () => {
    it('transitions to preflop and deals hole cards', () => {
      const game = new GameLoop(makeGamePlayers(4), DEFAULT_BLINDS);
      game.startRound();
      expect(game.phase).toBe('preflop');
      // Each active player has 2 hole cards
      for (const p of game.players) {
        expect(p.cards).toHaveLength(2);
      }
    });

    it('posts blinds correctly for 4 players', () => {
      const players = makeGamePlayers(4);
      const game = new GameLoop(players, DEFAULT_BLINDS);
      // Dealer starts at seat 0 by default
      game.startRound();
      // SB = seat 1, BB = seat 2
      expect(players[1].bet).toBe(5);
      expect(players[1].chips).toBe(995);
      expect(players[2].bet).toBe(10);
      expect(players[2].chips).toBe(990);
    });

    it('posts blinds correctly for 3 players', () => {
      const players = makeGamePlayers(3);
      const game = new GameLoop(players, DEFAULT_BLINDS);
      game.startRound();
      expect(players[1].bet).toBe(5);  // SB
      expect(players[2].bet).toBe(10); // BB
    });

    it('posts blinds correctly for 2 players (heads-up)', () => {
      const players = makeGamePlayers(2);
      const game = new GameLoop(players, DEFAULT_BLINDS);
      game.startRound();
      // Dealer (seat 0) = SB, seat 1 = BB
      expect(players[0].bet).toBe(5);
      expect(players[1].bet).toBe(10);
    });
  });

  describe('phase progression', () => {
    it('advances to flop after preflop betting completes', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      // Heads-up preflop: SB (seat 0) acts first
      game.handleAction(0, { action: 'call' });
      game.handleAction(1, { action: 'check' });
      expect(game.phase).toBe('flop');
      expect(game.community).toHaveLength(3);
    });

    it('advances from flop to turn', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      game.handleAction(0, { action: 'call' });
      game.handleAction(1, { action: 'check' });
      // Flop: Heads-up SB (seat 0 = dealer) acts first post-flop
      game.handleAction(0, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      expect(game.phase).toBe('turn');
      expect(game.community).toHaveLength(4);
    });

    it('advances from turn to river', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      game.handleAction(0, { action: 'call' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      // Turn: SB (seat 0) acts first
      game.handleAction(0, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      expect(game.phase).toBe('river');
      expect(game.community).toHaveLength(5);
    });

    it('advances from river to showdown', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      game.handleAction(0, { action: 'call' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      // River: SB (seat 0) acts first
      game.handleAction(0, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      expect(game.phase).toBe('showdown');
    });
  });

  describe('early termination', () => {
    it('ends round immediately when all but one fold', () => {
      const game = new GameLoop(makeGamePlayers(4), DEFAULT_BLINDS);
      game.startRound();
      // UTG (seat 3) folds, BTN (seat 0) folds, SB (seat 1) folds
      // Preflop: UTG acts first in 4-player
      game.handleAction(3, { action: 'fold' });
      game.handleAction(0, { action: 'fold' });
      game.handleAction(1, { action: 'fold' });
      // BB (seat 2) wins by default
      expect(game.phase).toBe('roundEnd');
    });
  });

  describe('showdown', () => {
    it('resolveShowdown awards pot to winner and transitions to roundEnd', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      // Play through all streets with checks (heads-up: SB/dealer acts first postflop)
      game.handleAction(0, { action: 'call' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      game.handleAction(0, { action: 'check' });
      game.handleAction(1, { action: 'check' });
      expect(game.phase).toBe('showdown');

      const result = game.resolveShowdown();
      expect(result).toBeDefined();
      expect(result.winners.length).toBeGreaterThan(0);
      expect(game.phase).toBe('roundEnd');

      // Total chips should be conserved
      const totalChips = game.players.reduce((sum, p) => sum + p.chips, 0);
      expect(totalChips).toBe(2000); // 2 players * 1000
    });
  });

  describe('dealer rotation', () => {
    it('moves dealer button after startRound', () => {
      const game = new GameLoop(makeGamePlayers(4), DEFAULT_BLINDS);
      expect(game.dealer).toBe(0);
      game.startRound();
      // After first round resolution, prepare next round
      // Fold everyone except seat 1
      game.handleAction(3, { action: 'fold' });
      game.handleAction(0, { action: 'fold' });
      game.handleAction(1, { action: 'fold' });

      game.prepareNextRound();
      expect(game.dealer).toBe(1); // Moved from 0 to 1
    });
  });

  describe('player elimination', () => {
    it('marks player with 0 chips as out', () => {
      const players = makeGamePlayers(3);
      players[0].chips = 10; // Will go all-in with SB and lose
      const game = new GameLoop(players, DEFAULT_BLINDS);
      game.startRound();

      // After round ends and player 0 has 0 chips, prepareNextRound should mark them out
      // For this test, manually set chips to 0
      players[0].chips = 0;
      players[0].status = 'active';
      game.prepareNextRound();
      expect(players[0].status).toBe('out');
    });

    it('excludes 0-chip players in startRound even without prepareNextRound (savedChips scenario)', () => {
      // Bug: when game starts from savedChips, a player with 0 chips (eliminated in prev session)
      // was initialized as 'active' and startRound() was called without prepareNextRound().
      // The player got dealt cards, assigned as SB, and showed "ALL IN" with 0 bet.
      const players = makeGamePlayers(4);
      players[1].chips = 0; // Simulates a player loaded from persistence with 0 chips

      const game = new GameLoop(players, DEFAULT_BLINDS);
      game.startRound();

      // Player 1 should be 'out', not 'active' or 'allIn'
      expect(players[1].status).toBe('out');
      // Player 1 should not be dealt cards
      expect(players[1].cards).toHaveLength(0);
      // Player 1 should not have any bet (SB should not have been posted by them)
      expect(players[1].bet).toBe(0);
    });
  });

  describe('game over', () => {
    it('transitions to gameOver when only one player has chips', () => {
      const players = makeGamePlayers(2);
      players[1].chips = 0;
      players[1].status = 'out';
      const game = new GameLoop(players, DEFAULT_BLINDS);
      game.prepareNextRound();
      expect(game.phase).toBe('gameOver');
    });
  });

  describe('getState', () => {
    it('returns serializable game state', () => {
      const game = new GameLoop(makeGamePlayers(4), DEFAULT_BLINDS);
      game.startRound();
      const state = game.getState();
      expect(state.phase).toBe('preflop');
      expect(state.players).toHaveLength(4);
      expect(state.blinds).toEqual(DEFAULT_BLINDS);
      expect(typeof state.seq).toBe('number');
    });
  });

  describe('getMinRaiseSize', () => {
    it('returns BB when no betting round active', () => {
      const players = makeGamePlayers(3, 1000);
      const loop = new GameLoop(players, { sb: 5, bb: 10 });
      expect(loop.getMinRaiseSize()).toBe(10);
    });

    it('returns BB during preflop before any raise', () => {
      const players = makeGamePlayers(3, 1000);
      const loop = new GameLoop(players, { sb: 5, bb: 10 });
      loop.startRound();
      expect(loop.getMinRaiseSize()).toBe(10);
    });
  });

  describe('edge cases', () => {
    it('handleAction returns error when no betting round is active', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      // Phase is 'waiting', no bettingRound active
      const result = game.handleAction(0, { action: 'check' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('No active betting round');
    });

    it('resolveShowdown throws if not in showdown phase', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      // Still in preflop, not showdown
      expect(() => game.resolveShowdown()).toThrow('Not in showdown phase');
    });

    it('getPrivateHand returns empty array for non-existent seat', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      const hand = game.getPrivateHand(99); // Seat 99 does not exist
      expect(hand).toEqual([]);
    });

    it('getPrivateHand returns hole cards for valid seat', () => {
      const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
      game.startRound();
      const hand = game.getPrivateHand(0);
      expect(hand).toHaveLength(2);
    });

    it('advances through all streets when only one active player (all others all-in)', () => {
      const players = makeGamePlayers(2);
      players[1].chips = 10;
      const game = new GameLoop(players, DEFAULT_BLINDS);
      game.startRound();
      game.handleAction(0, { action: 'allIn' });
      // With new behavior: enters allInFlop instead of jumping to showdown
      expect(['allInFlop', 'allInTurn', 'allInRiver', 'showdown', 'roundEnd'].includes(game.phase)).toBe(true);
    });

    describe('all-in runout phases', () => {
      function makeAllInGame(): GameLoop {
        // Two players, seat 1 only has 10 chips (posts BB, immediately all-in)
        const players = makeGamePlayers(2);
        players[1].chips = 10;
        return new GameLoop(players, DEFAULT_BLINDS);
      }

      it('enters allInFlop (not showdown) when all players are all-in after preflop', () => {
        const game = makeAllInGame();
        game.startRound();
        // Heads-up: seat 0 (SB/dealer) acts first. Seat 1 only posted BB=10 (all chips), so allIn.
        game.handleAction(0, { action: 'allIn' });
        expect(game.phase).toBe('allInFlop');
        expect(game.community).toHaveLength(3);
      });

      it('sets cardsRevealed=true on all non-folded players when entering allInFlop', () => {
        const game = makeAllInGame();
        game.startRound();
        game.handleAction(0, { action: 'allIn' });
        const nonFolded = game.players.filter(p => p.status !== 'folded' && p.status !== 'out');
        expect(nonFolded.every(p => p.cardsRevealed === true)).toBe(true);
      });

      it('advanceRunout transitions allInFlop → allInTurn and deals turn', () => {
        const game = makeAllInGame();
        game.startRound();
        game.handleAction(0, { action: 'allIn' });
        expect(game.phase).toBe('allInFlop');
        game.advanceRunout();
        expect(game.phase).toBe('allInTurn');
        expect(game.community).toHaveLength(4);
      });

      it('advanceRunout transitions allInTurn → allInRiver and deals river', () => {
        const game = makeAllInGame();
        game.startRound();
        game.handleAction(0, { action: 'allIn' });
        game.advanceRunout(); // → allInTurn
        game.advanceRunout(); // → allInRiver
        expect(game.phase).toBe('allInRiver');
        expect(game.community).toHaveLength(5);
      });

      it('advanceRunout transitions allInRiver → showdown', () => {
        const game = makeAllInGame();
        game.startRound();
        game.handleAction(0, { action: 'allIn' });
        game.advanceRunout();
        game.advanceRunout();
        game.advanceRunout();
        expect(game.phase).toBe('showdown');
      });

      it('advanceRunout throws when called outside allIn* phase', () => {
        const game = new GameLoop(makeGamePlayers(2), DEFAULT_BLINDS);
        game.startRound();
        expect(() => game.advanceRunout()).toThrow('advanceRunout called in non-allIn phase');
      });

      it('resets cardsRevealed on startRound', () => {
        const game = makeAllInGame();
        game.startRound();
        game.handleAction(0, { action: 'allIn' });
        // cardsRevealed is now true; simulate next round
        game.advanceRunout();
        game.advanceRunout();
        game.advanceRunout(); // showdown
        game.resolveShowdown();
        game.prepareNextRound();
        // After startRound, cardsRevealed must be cleared
        // We need chips to still be > 0 — adjust so seat 0 wins. Can't control outcome,
        // but we can just check that startRound resets the flag.
        // Give seat 1 enough chips for another round:
        const seat1 = game.players.find(p => p.seat === 1)!;
        seat1.chips = 100; // give them chips so game isn't over
        seat1.status = 'active';
        game.startRound();
        game.players.forEach(p => {
          expect(p.cardsRevealed).toBeUndefined();
        });
      });
    });

    it('advancePhase uses first active seat when dealer is not in active players', () => {
      const players = makeGamePlayers(4);
      // Dealer starts at seat 0 by default
      const game = new GameLoop(players, DEFAULT_BLINDS);
      game.startRound();
      // Mark seat 0 (dealer) as folded — dealer not in active players post-flop
      players[0].status = 'folded';
      // Complete preflop
      game.handleAction(3, { action: 'call' });   // UTG calls
      game.handleAction(0, { action: 'fold' });   // BTN folds (dealer/seat 0)
      game.handleAction(1, { action: 'call' });   // SB calls
      game.handleAction(2, { action: 'check' });  // BB checks — flop starts
      expect(game.phase).toBe('flop');
    });
  });
});
