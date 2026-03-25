// src/bot/strategy/preflopStrategy.ts

import { GameState, PlayerAction, Card } from '../../gameEngine/types';
// RANKS をエイリアスして types.ts の RANKS と区別する
import { MATRIX, RANKS as PREFLOP_RANKS, getGroup, getFreqTier } from '../../components/preflop/preflopData';

// openThreshold: このポジションでRaiseできる最大グループ番号
const OPEN_THRESHOLD: Record<string, number> = {
  BTN: 6, CO: 5, HJ: 4, LJ: 4,
  'UTG+2': 3, 'UTG+1': 3, UTG: 2,
  SB: 7, BB: 1,
};

// N人アクティブプレイヤー時の、BTNから時計回りのポジション名
const POSITION_SEQUENCES: Record<number, string[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO'],
};

function getMatrixValue(holeCards: Card[]): number {
  const [c1, c2] = holeCards;
  // PREFLOP_RANKS は high-to-low: A=0, K=1, ...2=12
  const r1 = PREFLOP_RANKS.indexOf(c1[0] as (typeof PREFLOP_RANKS)[number]);
  const r2 = PREFLOP_RANKS.indexOf(c2[0] as (typeof PREFLOP_RANKS)[number]);
  const s1 = c1[1];
  const s2 = c2[1];

  if (r1 === r2) return MATRIX[r1][r2];                           // ペア
  if (s1 === s2) return MATRIX[Math.min(r1,r2)][Math.max(r1,r2)]; // スーテッド（上三角: row < col）
  return MATRIX[Math.max(r1,r2)][Math.min(r1,r2)];               // オフスーツ（下三角: row > col）
}

function getPosition(state: GameState, seat: number): string {
  const totalSeats = state.players.length;
  const active = state.players
    .filter(p => p.status !== 'out')
    .sort((a, b) => ((a.seat - state.dealer + totalSeats) % totalSeats) -
                    ((b.seat - state.dealer + totalSeats) % totalSeats));

  const posSeq = POSITION_SEQUENCES[active.length] ?? POSITION_SEQUENCES[9];
  const idx = active.findIndex(p => p.seat === seat);
  return posSeq[idx] ?? 'UTG';
}

function calcBBDepth(player: { chips: number }, state: GameState): number {
  return player.chips / state.blinds.bb;
}

function countCallers(state: GameState, seat: number): number {
  return state.players.filter(
    p => p.bet > 0 && p.bet < state.currentBet && p.seat !== seat
  ).length;
}

type PreflopScenario = 'rfi' | 'facing-raise' | 'squeeze' | 'facing-reraise';

function detectPreflopScenario(state: GameState, seat: number): PreflopScenario {
  const bb = state.blinds.bb;
  const player = state.players.find(p => p.seat === seat)!;
  const isRaised = state.currentBet > bb;
  if (!isRaised) return 'rfi';
  if (player.bet > bb && player.bet < state.currentBet) return 'facing-reraise';
  if (countCallers(state, seat) >= 1) return 'squeeze';
  return 'facing-raise';
}

function makeRaise(amount: number, player: { chips: number; bet: number }): PlayerAction {
  const available = player.chips + player.bet;
  if (amount >= available) return { action: 'allIn' };
  return { action: 'raise', amount };
}

// ── Scenario handlers (stubs — to be replaced in Tasks 3–6) ──────────────────

function decideRFI(
  group: number,
  freqTier: number,
  position: string,
  bbDepth: number,
  numActive: number,
  player: { chips: number; bet: number },
  bb: number,
): PlayerAction {
  // BB 特殊ケース: currentBet === bb（RFI シナリオ）では常にチェック
  if (position === 'BB') return { action: 'check' };

  // マルチウェイ補正: 参加者数が増えるほどレンジを絞る
  const penaltyGroups = Math.max(0, numActive - 3);
  const threshold = OPEN_THRESHOLD[position] ?? 2;
  const effectiveThreshold = Math.max(1, threshold - penaltyGroups);

  // ショートスタック（< 15BB）: push or fold
  if (bbDepth < 15) {
    if (group <= 2) return { action: 'allIn' }; // プレミアム + group 2 まで push
    return { action: 'fold' };
  }

  // 通常スタック
  if (group > effectiveThreshold) return { action: 'fold' };
  const raiseProb = freqTier === 1 ? 1.0 : freqTier === 2 ? 0.87 : 0.62;
  if (Math.random() < raiseProb) return makeRaise(bb * 3, player);
  return { action: 'fold' };
}

function decideFacingRaise(
  _group: number, _position: string, _bbDepth: number,
  _currentBet: number, _player: { chips: number; bet: number },
): PlayerAction {
  return { action: 'fold' }; // TODO: Task 4
}

function decideSqueezeOrFold(
  _group: number, _numCallers: number, _bbDepth: number,
  _currentBet: number, _player: { chips: number; bet: number },
): PlayerAction {
  return { action: 'fold' }; // TODO: Task 5
}

function decideFacingReraise(
  _group: number, _bbDepth: number,
  _currentBet: number, _player: { chips: number; bet: number },
): PlayerAction {
  return { action: 'fold' }; // TODO: Task 6
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export function decidePreflopAction(
  state: GameState,
  holeCards: Card[],
  seat: number,
): PlayerAction {
  const matrixVal = getMatrixValue(holeCards);
  const group = getGroup(matrixVal);
  const freqTier = getFreqTier(matrixVal);
  const player = state.players.find(p => p.seat === seat)!;
  const bb = state.blinds.bb;

  // group 0 = 無条件フォールド（matrix value 0 のハンド: 72o 等）
  if (group === 0) return { action: 'fold' };

  const position = getPosition(state, seat);
  const bbDepth = calcBBDepth(player, state);
  const scenario = detectPreflopScenario(state, seat);

  switch (scenario) {
    case 'rfi': {
      const numActive = state.players.filter(p => p.status !== 'out').length;
      return decideRFI(group, freqTier, position, bbDepth, numActive, player, bb);
    }
    case 'facing-raise':
      return decideFacingRaise(group, position, bbDepth, state.currentBet, player);
    case 'squeeze':
      return decideSqueezeOrFold(group, countCallers(state, seat), bbDepth, state.currentBet, player);
    case 'facing-reraise':
      return decideFacingReraise(group, bbDepth, state.currentBet, player);
  }
}
