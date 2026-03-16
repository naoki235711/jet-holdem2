import { calculatePresets, Preset } from '../../../src/components/actions/presetCalculator';
import { GameState } from '../../../src/gameEngine';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    seq: 1,
    phase: 'preflop',
    community: [],
    pots: [{ amount: 15, eligible: [0, 1, 2] }],
    currentBet: 10,
    activePlayer: 0,
    dealer: 0,
    blinds: { sb: 5, bb: 10 },
    players: [
      { seat: 0, name: 'A', chips: 990, status: 'active', bet: 0, cards: [] },
      { seat: 1, name: 'B', chips: 995, status: 'active', bet: 5, cards: [] },
      { seat: 2, name: 'C', chips: 990, status: 'active', bet: 10, cards: [] },
    ],
    ...overrides,
  };
}

describe('calculatePresets', () => {
  describe('preflop', () => {
    it('returns BB-multiple presets', () => {
      const state = makeState(); // bb=10
      const presets = calculatePresets(state, 0);
      expect(presets).toEqual([
        { label: '2.5BB', value: 30 },  // round(10*2.5 / 10) * 10 = 30
        { label: '3BB', value: 30 },     // 10*3 = 30
        { label: '4BB', value: 40 },     // 10*4 = 40
      ]);
    });

    it('rounds to BB unit', () => {
      const state = makeState({ blinds: { sb: 3, bb: 6 } });
      const presets = calculatePresets(state, 0);
      // 6*2.5=15 -> round(15/6)*6 = round(2.5)*6 = 3*6 = 18
      expect(presets[0]).toEqual({ label: '2.5BB', value: 18 });
      // 6*3=18
      expect(presets[1]).toEqual({ label: '3BB', value: 18 });
      // 6*4=24
      expect(presets[2]).toEqual({ label: '4BB', value: 24 });
    });
  });

  describe('postflop', () => {
    it('returns pot-fraction presets with no bet (bet scenario)', () => {
      // pot=300, currentBet=0, myBet=0 → potAfterCall=300
      const state = makeState({
        phase: 'flop',
        pots: [{ amount: 300, eligible: [0, 1, 2] }],
        currentBet: 0,
        players: [
          { seat: 0, name: 'A', chips: 1000, status: 'active', bet: 0, cards: [] },
          { seat: 1, name: 'B', chips: 1000, status: 'active', bet: 0, cards: [] },
          { seat: 2, name: 'C', chips: 1000, status: 'active', bet: 0, cards: [] },
        ],
      });
      const presets = calculatePresets(state, 0);
      expect(presets).toEqual([
        { label: '1/3', value: 100 },   // 0 + 300*1/3 = 100
        { label: '1/2', value: 150 },   // 0 + 300*1/2 = 150
        { label: '2/3', value: 200 },   // 0 + 300*2/3 = 200
        { label: '3/4', value: 230 },   // 0 + 300*3/4 = 225 → round to 230 (bb=10)
        { label: 'Pot', value: 300 },   // 0 + 300*1.0 = 300
      ]);
    });

    it('returns pot-fraction presets facing a bet (raise scenario)', () => {
      // pot collected=200, opponent bet=100 → totalPot=300
      // currentBet=100, myBet=0 → callAmount=100, potAfterCall=400
      const state = makeState({
        phase: 'flop',
        pots: [{ amount: 200, eligible: [0, 1] }],
        currentBet: 100,
        players: [
          { seat: 0, name: 'A', chips: 1000, status: 'active', bet: 0, cards: [] },
          { seat: 1, name: 'B', chips: 900, status: 'active', bet: 100, cards: [] },
        ],
      });
      const presets = calculatePresets(state, 0);
      // potAfterCall = (200+100) + 100 = 400
      expect(presets).toEqual([
        { label: '1/3', value: 230 },   // 100 + 400/3 = 233 → round to 230
        { label: '1/2', value: 300 },   // 100 + 400/2 = 300
        { label: '2/3', value: 370 },   // 100 + 400*2/3 = 367 → round to 370
        { label: '3/4', value: 400 },   // 100 + 400*3/4 = 400
        { label: 'Pot', value: 500 },   // 100 + 400*1.0 = 500
      ]);
    });

    it('works on turn and river phases too', () => {
      const state = makeState({
        phase: 'turn',
        pots: [{ amount: 100, eligible: [0, 1] }],
        currentBet: 0,
        players: [
          { seat: 0, name: 'A', chips: 500, status: 'active', bet: 0, cards: [] },
          { seat: 1, name: 'B', chips: 500, status: 'active', bet: 0, cards: [] },
        ],
      });
      const presets = calculatePresets(state, 0);
      expect(presets[0].label).toBe('1/3');
      expect(presets[4].label).toBe('Pot');
      expect(presets[4].value).toBe(100); // 0 + 100*1.0
    });
  });
});
