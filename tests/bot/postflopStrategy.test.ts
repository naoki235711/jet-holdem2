import { decidePostflopAction } from '../../src/bot/strategy/postflopStrategy';
import { GameState, Player, Card } from '../../src/gameEngine/types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  const players: Player[] = [
    { seat: 0, name: 'Hero', chips: 900, status: 'active', bet: 0, cards: [] },
    { seat: 1, name: 'Opp',  chips: 900, status: 'active', bet: 0, cards: [] },
  ];
  return {
    seq: 1,
    phase: 'flop',
    community: ['Ah', 'Kd', '7c'],
    pots: [{ amount: 200, eligible: [0, 1] }],
    currentBet: 0,
    activePlayer: 0,
    dealer: 0,
    blinds: { sb: 5, bb: 10 },
    players,
    ...overrides,
  };
}

describe('decidePostflopAction', () => {
  it('bets with strong hand (flush) on flop when check is available', () => {
    // Hero: Ad As → evaluate with community Ah Kd 7c = trip aces
    const result = decidePostflopAction(
      makeState(),
      ['Ad', 'As'],  // trip aces on Ah Kd 7c
      0,
    );
    expect(['raise', 'bet', 'allIn']).toContain(result.action);
  });

  it('checks with weak hand (pair) when no bet and OOP', () => {
    // Heads up: dealer=0, so seat 0 is BTN=IP, seat 1 is BB=OOP
    // Flop, no bet, seat 1 acts first (OOP)
    const state = makeState({ activePlayer: 1, currentBet: 0 });
    const result = decidePostflopAction(
      state,
      ['2h', '3d'],  // low pair or worse on A K 7 board
      1,
    );
    // OOP with weak hand and check available → check
    expect(result.action).toBe('check');
  });

  it('folds weak hand facing bet (OOP, no draw)', () => {
    const state = makeState({
      currentBet: 50,
      activePlayer: 1,
      players: [
        { seat: 0, name: 'Hero', chips: 850, status: 'active', bet: 50, cards: [] },
        { seat: 1, name: 'Opp',  chips: 900, status: 'active', bet: 0, cards: [] },
      ],
    });
    // 2d 3h on A K 7 board — HighCard (Air), no draw, OOP, check not possible
    const result = decidePostflopAction(state, ['2d', '3h'], 1);
    expect(result.action).toBe('fold');
  });

  it('calls or folds draw with correct structure', () => {
    // Flush draw: Jh Ts on Ah 7h 2h board (4 hearts total)
    const state = makeState({
      community: ['Ah', '7h', '2h'],
      currentBet: 50,
      players: [
        { seat: 0, name: 'Hero', chips: 850, status: 'active', bet: 50, cards: [] },
        { seat: 1, name: 'Opp',  chips: 900, status: 'active', bet: 0, cards: [] },
      ],
      activePlayer: 1,
    });
    // Jh Ts + Ah 7h 2h = 4 hearts (Jh+Ah+7h+2h) → flush draw, OOP
    const result = decidePostflopAction(state, ['Jh', 'Ts'], 1);
    // OOP with draw facing bet → fold
    expect(result.action).toBe('fold');
  });
});
