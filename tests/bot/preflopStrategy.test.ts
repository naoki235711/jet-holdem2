import { decidePreflopAction } from '../../src/bot/strategy/preflopStrategy';
import { GameState, Player } from '../../src/gameEngine/types';

/** 2人テーブルのデフォルト状態: dealer=2(off-table) → seat 0=BTN, seat 1=BB */
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    seq: 1,
    phase: 'preflop',
    community: [],
    pots: [{ amount: 15, eligible: [0, 1] }],
    currentBet: 10,   // bb
    activePlayer: 0,
    dealer: 2,        // off-table → seat 0 が BTN, seat 1 が BB
    blinds: { sb: 5, bb: 10 },
    players: [
      { seat: 0, name: 'Hero',    chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'Villain', chips: 990, status: 'active', bet: 10, cards: [] },
    ],
    ...overrides,
  };
}

// ─── RFI ──────────────────────────────────────────────────────────────────────

describe('decidePreflopAction — RFI', () => {
  it('AA — BTN で RFI → raise 30', () => {
    // dealer=2(off): seat 0=BTN, currentBet=10=bb → RFI
    const state = makeState({ currentBet: 10 });
    const result = decidePreflopAction(state, ['Ah', 'Ad'], 0);
    expect(['raise', 'allIn']).toContain(result.action);
    if (result.action === 'raise') expect(result.amount).toBe(30); // 3×bb
  });

  it('72o — UTG で RFI → fold（group 0）', () => {
    // 4-player: dealer=0=BTN, SB=1, BB=2, UTG=3
    const players: Player[] = [
      { seat: 0, name: 'BTN', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'SB',  chips: 990, status: 'active', bet: 5,  cards: [] },
      { seat: 2, name: 'BB',  chips: 990, status: 'active', bet: 10, cards: [] },
      { seat: 3, name: 'UTG', chips: 990, status: 'active', bet: 0,  cards: [] },
    ];
    const state = makeState({ players, dealer: 0, currentBet: 10, activePlayer: 3 });
    expect(decidePreflopAction(state, ['7h', '2d'], 3).action).toBe('fold');
  });

  it('BB — currentBet === bb → check（RFI 時は常にチェック）', () => {
    // dealer=2(off): seat 1 が BB、currentBet=10=bb → RFI
    const state = makeState({ currentBet: 10, activePlayer: 1 });
    expect(decidePreflopAction(state, ['Kh', 'Qh'], 1).action).toBe('check');
  });

  it('bbDepth < 15 — AA RFI → allIn（ショートスタック push）', () => {
    // chips=100, bb=10 → bbDepth=10 < 15
    const players: Player[] = [
      { seat: 0, name: 'Hero',    chips: 100, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'Villain', chips: 990, status: 'active', bet: 10, cards: [] },
    ];
    const state = makeState({ players, currentBet: 10 });
    expect(decidePreflopAction(state, ['Ah', 'Ad'], 0).action).toBe('allIn');
  });

  it('6人卓 BTN JTo → fold（マルチウェイ補正でレンジ絞り）', () => {
    // numActive=6, penaltyGroups=3, BTN threshold=6 → effectiveThreshold=3
    // JTo = MATRIX[4][3] = 62 → group 6 > 3 → fold
    const players: Player[] = [
      { seat: 0, name: 'BTN', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'SB',  chips: 990, status: 'active', bet: 5,  cards: [] },
      { seat: 2, name: 'BB',  chips: 990, status: 'active', bet: 10, cards: [] },
      { seat: 3, name: 'UTG', chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 4, name: 'HJ',  chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 5, name: 'CO',  chips: 990, status: 'active', bet: 0,  cards: [] },
    ];
    const state = makeState({ players, dealer: 0, currentBet: 10, activePlayer: 0 });
    expect(decidePreflopAction(state, ['Jh', 'Td'], 0).action).toBe('fold');
  });
});

// ─── Facing Raise ─────────────────────────────────────────────────────────────

// 「raiser のみ存在（callers なし）」を再現するため players を明示する。
// seat 1 が raiser（bet=currentBet）、seat 0 が Hero（bet=0）
function makeFacingRaiseState(overrides: Partial<GameState> = {}): GameState {
  const players: Player[] = [
    { seat: 0, name: 'Hero',   chips: 990, status: 'active', bet: 0,  cards: [] },
    { seat: 1, name: 'Raiser', chips: 960, status: 'active', bet: 30, cards: [] },
  ];
  return makeState({ players, currentBet: 30, activePlayer: 0, ...overrides });
}

describe('decidePreflopAction — Facing Raise', () => {
  it('AA — facing raise → raise（バリュー 3-bet）', () => {
    // group 1, bbDepth=99 → raise(90)
    const result = decidePreflopAction(makeFacingRaiseState(), ['Ah', 'Ad'], 0);
    expect(result.action).toBe('raise');
    expect(result.amount).toBe(90); // 3 × 30
  });

  it('AKs — facing raise → raise（バリュー 3-bet）', () => {
    // AKs = MATRIX[0][1]=11 → group 1
    const result = decidePreflopAction(makeFacingRaiseState(), ['Ah', 'Kh'], 0);
    expect(result.action).toBe('raise');
  });

  it('KQs — facing raise, OOP → call（group 2, bluff 3-bet なし）', () => {
    // seat 1 = BB (OOP): dealer=2(off), 2-player → seat 1 = BB
    // BB は OOP → isIP=false → ブラフ 3-bet なし → group 2 → call
    const players: Player[] = [
      { seat: 0, name: 'Raiser', chips: 960, status: 'active', bet: 30, cards: [] },
      { seat: 1, name: 'Hero',   chips: 990, status: 'active', bet: 10, cards: [] },
    ];
    const state = makeState({ players, currentBet: 30, activePlayer: 1 });
    expect(decidePreflopAction(state, ['Kh', 'Qh'], 1).action).toBe('call');
  });

  it('72o — facing raise → fold', () => {
    expect(decidePreflopAction(makeFacingRaiseState(), ['7h', '2d'], 0).action).toBe('fold');
  });

  it('bbDepth < 15 — AA facing raise → allIn（ショートスタック push）', () => {
    // chips=100 → bbDepth=10 < 15
    const players: Player[] = [
      { seat: 0, name: 'Hero',   chips: 100, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'Raiser', chips: 960, status: 'active', bet: 30, cards: [] },
    ];
    const state = makeState({ players, currentBet: 30, activePlayer: 0 });
    expect(decidePreflopAction(state, ['Ah', 'Ad'], 0).action).toBe('allIn');
  });

  it('bbDepth < 15 — KQo facing raise → fold', () => {
    // chips=100 → bbDepth=10 < 15; KQo=group 2 → 15未満では group <= 1 のみ allIn, それ以外 fold
    const players: Player[] = [
      { seat: 0, name: 'Hero',   chips: 100, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'Raiser', chips: 960, status: 'active', bet: 30, cards: [] },
    ];
    const state = makeState({ players, currentBet: 30, activePlayer: 0 });
    expect(decidePreflopAction(state, ['Kh', 'Qd'], 0).action).toBe('fold');
  });

  it('BB — facing steal（currentBet=30）、KQs → call（BB ディフェンス）', () => {
    // seat 1 = BB (OOP); chips=990 → bbDepth=99; group 2 → call
    const players: Player[] = [
      { seat: 0, name: 'Raiser', chips: 960, status: 'active', bet: 30, cards: [] },
      { seat: 1, name: 'Hero',   chips: 990, status: 'active', bet: 10, cards: [] },
    ];
    const state = makeState({ players, currentBet: 30, activePlayer: 1 });
    expect(decidePreflopAction(state, ['Kh', 'Qh'], 1).action).toBe('call');
  });

  it('IP ブラフ 3-bet 頻度（KQs, BTN, facing raise）→ 約 20%', () => {
    // seat 0=BTN(IP), KQs=group 2 → bluff 3-bet 20%
    let raises = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      if (decidePreflopAction(makeFacingRaiseState(), ['Kh', 'Qh'], 0).action === 'raise') raises++;
    }
    const rate = raises / N;
    expect(rate).toBeGreaterThan(0.08);  // 20% ± 許容誤差
    expect(rate).toBeLessThan(0.35);
  });
});

// ─── Squeeze ─────────────────────────────────────────────────────────────────

describe('decidePreflopAction — Squeeze', () => {
  // raiser(bet=30) + caller(bet=20 < currentBet=30) がいる状態
  function makeSqueezeState(): GameState {
    const players: Player[] = [
      { seat: 0, name: 'Hero',   chips: 990, status: 'active', bet: 0,  cards: [] },
      { seat: 1, name: 'Raiser', chips: 960, status: 'active', bet: 30, cards: [] },
      { seat: 2, name: 'Caller', chips: 970, status: 'active', bet: 20, cards: [] },
    ];
    return makeState({ players, currentBet: 30, activePlayer: 0, dealer: 0 });
  }

  it('AA — squeeze spot（callers=1）→ raise', () => {
    expect(decidePreflopAction(makeSqueezeState(), ['Ah', 'Ad'], 0).action).toBe('raise');
  });

  it('72o — squeeze spot → fold', () => {
    expect(decidePreflopAction(makeSqueezeState(), ['7h', '2d'], 0).action).toBe('fold');
  });
});

// ─── Facing Reraise ──────────────────────────────────────────────────────────

describe('decidePreflopAction — Facing Reraise', () => {
  // Hero が 3-bet 済み（bet=30）、相手がさらにレイズ（currentBet=90）
  function makeFacingReraiseState(heroChips: number = 960): GameState {
    const players: Player[] = [
      { seat: 0, name: 'Hero',    chips: heroChips, status: 'active', bet: 30, cards: [] },
      { seat: 1, name: 'Villain', chips: 900,       status: 'active', bet: 90, cards: [] },
    ];
    return makeState({ players, currentBet: 90, activePlayer: 0 });
  }

  it('AA — facing reraise → raise（4-bet）', () => {
    // bbDepth=96 → normal stack; group 1 → raise(90*2.5=225)
    const result = decidePreflopAction(makeFacingReraiseState(), ['Ah', 'Ad'], 0);
    expect(['raise', 'allIn']).toContain(result.action);
  });

  it('72o — facing reraise → fold', () => {
    expect(decidePreflopAction(makeFacingReraiseState(), ['7h', '2d'], 0).action).toBe('fold');
  });

  it('AA — facing reraise, bbDepth<15 → allIn', () => {
    // chips=100 → bbDepth=10 < 15; group 1 → allIn
    expect(decidePreflopAction(makeFacingReraiseState(100), ['Ah', 'Ad'], 0).action).toBe('allIn');
  });

  it('KQo — facing reraise → fold（bbDepth=30 < 40、group 2 コール条件非該当）', () => {
    // KQo = MATRIX[2][1]=23 → group 2; chips=300 → bbDepth=30 < 40 → fold
    const players: Player[] = [
      { seat: 0, name: 'Hero',    chips: 300, status: 'active', bet: 30, cards: [] },
      { seat: 1, name: 'Villain', chips: 900, status: 'active', bet: 90, cards: [] },
    ];
    const state = makeState({ players, currentBet: 90, activePlayer: 0 });
    expect(decidePreflopAction(state, ['Kh', 'Qd'], 0).action).toBe('fold');
  });
});
