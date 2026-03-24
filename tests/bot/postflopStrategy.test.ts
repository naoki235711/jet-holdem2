import { decidePostflopAction } from '../../src/bot/strategy/postflopStrategy';
import { GameState, Player } from '../../src/gameEngine/types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  const players: Player[] = [
    { seat: 0, name: 'Hero',    chips: 1000, status: 'active', bet: 0, cards: [] },
    { seat: 1, name: 'Villain', chips: 1000, status: 'active', bet: 0, cards: [] },
  ];
  return {
    seq: 1,
    phase: 'flop',
    community: ['2c', '8h', 'Ks'],
    pots: [{ amount: 100, eligible: [0, 1] }],
    currentBet: 0,
    activePlayer: 0,
    dealer: 2,   // dealer off-table → seat 0 acts last (IP)
    blinds: { sb: 5, bb: 10 },
    players,
    ...overrides,
  };
}

describe('decidePostflopAction', () => {
  describe('strong hand (AA)', () => {
    it('bets or goes all-in when can check (IP)', () => {
      const state = makeState();
      const result = decidePostflopAction(state, ['Ah', 'Ad'], 0);
      expect(['raise', 'allIn']).toContain(result.action);
    });

    it('does not fold when facing a bet', () => {
      const state = makeState({
        currentBet: 30,
        players: [
          { seat: 0, name: 'Hero',    chips: 1000, status: 'active', bet: 0,  cards: [] },
          { seat: 1, name: 'Villain', chips: 1000, status: 'active', bet: 30, cards: [] },
        ],
      });
      const result = decidePostflopAction(state, ['Ah', 'Ad'], 0);
      expect(result.action).not.toBe('fold');
    });

    it('OOP strong hand: checks at least some of the time (check-raise bait)', () => {
      // dealer=0 → seat 0 is IP, seat 1 is OOP
      const state = makeState({ dealer: 0 });
      const N = 60;
      const checks = Array.from({ length: N }, () =>
        decidePostflopAction(state, ['Ah', 'Ad'], 1)
      ).filter(r => r.action === 'check').length;
      // Expect ~30% check: at least one check in 60 trials
      expect(checks).toBeGreaterThan(0);
    });
  });

  describe('weak hand (air)', () => {
    it('folds 3s4d on AKQ flop facing large bet (pot odds > equity)', () => {
      const state = makeState({
        community: ['As', 'Kc', 'Qd'],
        currentBet: 90,
        pots: [{ amount: 100, eligible: [0, 1] }],
        players: [
          { seat: 0, name: 'Hero',    chips: 1000, status: 'active', bet: 0,  cards: [] },
          { seat: 1, name: 'Villain', chips: 1000, status: 'active', bet: 90, cards: [] },
        ],
      });
      const result = decidePostflopAction(state, ['3s', '4d'], 0);
      expect(result.action).toBe('fold');
    });

    it('checks OOP with air — never bluffs out of position', () => {
      // dealer=0 → seat 0 is IP, seat 1 is OOP
      const state = makeState({ dealer: 0 });
      const results = Array.from({ length: 30 }, () =>
        decidePostflopAction(state, ['3s', '4d'], 1)
      );
      expect(results.every(r => r.action === 'check')).toBe(true);
    });
  });

  describe('SPR < 2', () => {
    it('goes all-in with equity > 0.50 when SPR is low', () => {
      // pot=600, hero chips=1000, villain chips=1200 → effective=1000, SPR=1000/600≈1.67
      const state = makeState({
        pots: [{ amount: 600, eligible: [0, 1] }],
        players: [
          { seat: 0, name: 'Hero',    chips: 1000, status: 'active', bet: 0, cards: [] },
          { seat: 1, name: 'Villain', chips: 1200, status: 'active', bet: 0, cards: [] },
        ],
      });
      const result = decidePostflopAction(state, ['Ah', 'Ad'], 0);
      expect(result.action).toBe('allIn');
    });
  });

  describe('bluff frequency', () => {
    it('IP bluff with air on dry board is roughly 20% (5%–35%)', () => {
      // dealer=2 → seat 0 is IP; 3s4d on 2c-8h-Ks is air
      const state = makeState({ dealer: 2 });
      const N = 300;
      const bets = Array.from({ length: N }, () =>
        decidePostflopAction(state, ['3s', '4d'], 0)
      ).filter(r => r.action === 'raise').length;
      expect(bets / N).toBeGreaterThan(0.05);
      expect(bets / N).toBeLessThan(0.35);
    });

    it('IP bluff with air on wet board is at most 10% (0%–20%)', () => {
      // monotone board = wet
      const state = makeState({
        community: ['8h', '9h', 'Th'],
        dealer: 2,
      });
      const N = 300;
      const bets = Array.from({ length: N }, () =>
        decidePostflopAction(state, ['3s', '4d'], 0)
      ).filter(r => r.action === 'raise').length;
      expect(bets / N).toBeLessThan(0.20);
    });
  });
});
