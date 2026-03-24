import { decidePreflopAction } from '../../src/bot/strategy/preflopStrategy';
import { GameState, Player, PlayerAction } from '../../src/gameEngine/types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  const players: Player[] = [
    { seat: 0, name: 'P0', chips: 1000, status: 'active', bet: 0, cards: [] },
    { seat: 1, name: 'P1', chips: 1000, status: 'active', bet: 10, cards: [] },
    { seat: 2, name: 'P2', chips: 1000, status: 'active', bet: 5, cards: [] },
  ];
  return {
    seq: 1,
    phase: 'preflop',
    community: [],
    pots: [{ amount: 15, eligible: [0, 1, 2] }],
    currentBet: 10,
    activePlayer: 0,
    dealer: 0,  // seat 0 = BTN (3-player: BTN/SB/BB)
    blinds: { sb: 5, bb: 10 },
    players,
    ...overrides,
  };
}

describe('decidePreflopAction', () => {
  it('raises AA from any position (group 1, freqTier 1)', () => {
    const state = makeState();  // BTN, unraised → RFI
    const result = decidePreflopAction(state, ['Ah', 'Ad'], 0);
    expect(result.action).toBe('raise');
    expect(result.amount).toBe(30);  // 3 × BB(10)
  });

  it('folds 72o from UTG (group 0 hand)', () => {
    // 4-player game: dealer=0=BTN, SB=1, BB=2, UTG=3
    const players: Player[] = [
      { seat: 0, name: 'BTN', chips: 1000, status: 'active', bet: 0, cards: [] },
      { seat: 1, name: 'SB',  chips: 995,  status: 'active', bet: 5, cards: [] },
      { seat: 2, name: 'BB',  chips: 990,  status: 'active', bet: 10, cards: [] },
      { seat: 3, name: 'UTG', chips: 1000, status: 'active', bet: 0, cards: [] },
    ];
    const state = makeState({
      players,
      dealer: 0,
      activePlayer: 3,
      currentBet: 10,
    });
    const result = decidePreflopAction(state, ['7h', '2d'], 3);
    expect(result.action).toBe('fold');
  });

  it('folds 72o from UTG even when no one has raised', () => {
    const players: Player[] = [
      { seat: 0, name: 'BTN', chips: 1000, status: 'active', bet: 0, cards: [] },
      { seat: 1, name: 'SB',  chips: 1000, status: 'active', bet: 0, cards: [] },
      { seat: 2, name: 'BB',  chips: 990,  status: 'active', bet: 10, cards: [] },
      { seat: 3, name: 'UTG', chips: 1000, status: 'active', bet: 0, cards: [] },
    ];
    const state = makeState({ players, dealer: 0, activePlayer: 3, currentBet: 10 });
    const result = decidePreflopAction(state, ['7h', '2d'], 3);
    expect(result.action).toBe('fold');
  });

  it('calls with medium hand facing raise', () => {
    // KQs is group 3 (UTG+1/+2 range) → call facing raise
    const state = makeState({ currentBet: 30, activePlayer: 1 });
    const result = decidePreflopAction(state, ['Kh', 'Qh'], 1);
    expect(result.action).toBe('call');
  });

  it('3-bets with strong hand facing raise', () => {
    // AKs is group 2 → 3-bet
    const state = makeState({ currentBet: 30, activePlayer: 1 });
    const result = decidePreflopAction(state, ['Ah', 'Kh'], 1);
    expect(result.action).toBe('raise');
    expect(result.amount).toBe(90);  // 3 × currentBet(30)
  });

  it('goes all-in when raise amount exceeds chips', () => {
    const state = makeState({
      currentBet: 0,
      players: [
        { seat: 0, name: 'P0', chips: 20, status: 'active', bet: 0, cards: [] },
        { seat: 1, name: 'P1', chips: 995, status: 'active', bet: 5, cards: [] },
        { seat: 2, name: 'P2', chips: 990, status: 'active', bet: 10, cards: [] },
      ],
      activePlayer: 0,
      dealer: 0,
      blinds: { sb: 5, bb: 10 },
    });
    const result = decidePreflopAction(state, ['Ah', 'Ad'], 0);
    expect(result.action).toBe('allIn');
  });
});
