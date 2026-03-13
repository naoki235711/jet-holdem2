import { BettingRound } from '../../src/gameEngine/BettingRound';
import { Player, PlayerAction, Blinds } from '../../src/gameEngine/types';

function makePlayers(count: number, chips = 1000): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    seat: i,
    name: `Player${i}`,
    chips,
    status: 'active' as const,
    bet: 0,
    cards: [],
  }));
}

describe('BettingRound', () => {
  describe('basic actions', () => {
    it('fold changes player status', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      const result = round.handleAction(0, { action: 'fold' });
      expect(result.valid).toBe(true);
      expect(players[0].status).toBe('folded');
    });

    it('check is valid when no bet to match', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      const result = round.handleAction(0, { action: 'check' });
      expect(result.valid).toBe(true);
    });

    it('check is invalid when there is a bet to match', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      // Player 0 raises
      round.handleAction(0, { action: 'raise', amount: 100 });
      // Player 1 tries to check
      const result = round.handleAction(1, { action: 'check' });
      expect(result.valid).toBe(false);
    });

    it('call matches current bet', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'raise', amount: 100 });
      const result = round.handleAction(1, { action: 'call' });
      expect(result.valid).toBe(true);
      expect(players[1].bet).toBe(100);
      expect(players[1].chips).toBe(900);
    });

    it('raise increases the bet', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      const result = round.handleAction(0, { action: 'raise', amount: 200 });
      expect(result.valid).toBe(true);
      expect(round.currentBet).toBe(200);
      expect(players[0].bet).toBe(200);
      expect(players[0].chips).toBe(800);
    });

    it('raise below minimum is invalid', () => {
      const players = makePlayers(4);
      // minRaise = BB = 10
      const round = new BettingRound(players, 0, 10);
      round.handleAction(0, { action: 'raise', amount: 100 });
      // Min re-raise is 100 + (100-0) = 200, so 150 is invalid
      const result = round.handleAction(1, { action: 'raise', amount: 150 });
      expect(result.valid).toBe(false);
    });

    it('all-in with less than call amount is valid', () => {
      const players = makePlayers(2);
      players[1].chips = 50; // Can't afford full call
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'raise', amount: 100 });
      const result = round.handleAction(1, { action: 'allIn' });
      expect(result.valid).toBe(true);
      expect(players[1].status).toBe('allIn');
      expect(players[1].chips).toBe(0);
      expect(players[1].bet).toBe(50);
    });
  });

  describe('turn management', () => {
    it('rejects action from wrong player', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      const result = round.handleAction(2, { action: 'check' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not your turn');
    });

    it('advances to next active player', () => {
      const players = makePlayers(4);
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'check' });
      expect(round.activePlayerSeat).toBe(1);
    });

    it('skips folded players', () => {
      const players = makePlayers(4);
      players[1].status = 'folded';
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'check' });
      expect(round.activePlayerSeat).toBe(2); // Skipped seat 1
    });

    it('skips all-in players', () => {
      const players = makePlayers(4);
      players[1].status = 'allIn';
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'check' });
      expect(round.activePlayerSeat).toBe(2);
    });
  });

  describe('round completion', () => {
    it('round ends when all active players have acted and bets match', () => {
      const players = makePlayers(3);
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'check' });
      round.handleAction(1, { action: 'check' });
      round.handleAction(2, { action: 'check' });
      expect(round.isComplete).toBe(true);
    });

    it('round is not complete when a raise reopens action', () => {
      const players = makePlayers(3);
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'check' });
      round.handleAction(1, { action: 'raise', amount: 100 });
      expect(round.isComplete).toBe(false);
      // Seat 2 and seat 0 still need to act
    });

    it('round ends when only one player remains (all others folded)', () => {
      const players = makePlayers(3);
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'fold' });
      round.handleAction(1, { action: 'fold' });
      expect(round.isComplete).toBe(true);
    });
  });

  describe('preflop with blinds', () => {
    it('creates round with blinds already posted', () => {
      const players = makePlayers(4);
      const blinds: Blinds = { sb: 5, bb: 10 };
      // Dealer is seat 0, SB is seat 1, BB is seat 2, UTG (first to act) is seat 3
      const round = BettingRound.createPreflop(players, 0, blinds);
      expect(players[1].bet).toBe(5);
      expect(players[1].chips).toBe(995);
      expect(players[2].bet).toBe(10);
      expect(players[2].chips).toBe(990);
      expect(round.currentBet).toBe(10);
      expect(round.activePlayerSeat).toBe(3); // UTG acts first
    });

    it('BB gets option to raise when no one raised preflop', () => {
      const players = makePlayers(3);
      const blinds: Blinds = { sb: 5, bb: 10 };
      // Dealer seat 0, SB seat 1, BB seat 2, first to act seat 0 (BTN)
      const round = BettingRound.createPreflop(players, 0, blinds);
      round.handleAction(0, { action: 'call' });    // BTN calls
      round.handleAction(1, { action: 'call' });    // SB calls
      // BB has not acted yet — round should NOT be complete
      expect(round.isComplete).toBe(false);
      expect(round.activePlayerSeat).toBe(2);       // BB gets option
      round.handleAction(2, { action: 'check' });   // BB checks
      expect(round.isComplete).toBe(true);
    });

    it('heads-up: dealer posts SB, other posts BB', () => {
      const players = makePlayers(2);
      const blinds: Blinds = { sb: 5, bb: 10 };
      // Dealer (seat 0) is SB, seat 1 is BB
      const round = BettingRound.createPreflop(players, 0, blinds);
      expect(players[0].bet).toBe(5);   // Dealer = SB
      expect(players[1].bet).toBe(10);  // BB
      expect(round.activePlayerSeat).toBe(0); // Dealer/SB acts first preflop in heads-up
    });
  });

  describe('getBets', () => {
    it('returns current bets for pot collection', () => {
      const players = makePlayers(3);
      const round = new BettingRound(players, 0, 0);
      round.handleAction(0, { action: 'raise', amount: 100 });
      round.handleAction(1, { action: 'call' });
      round.handleAction(2, { action: 'fold' });

      const bets = round.getBets();
      expect(bets).toHaveLength(2); // Only players who bet
      expect(bets.find(b => b.seat === 0)?.amount).toBe(100);
      expect(bets.find(b => b.seat === 1)?.amount).toBe(100);
    });
  });
});
