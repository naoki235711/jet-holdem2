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

function makeRaise(amount: number, player: { chips: number; bet: number }): PlayerAction {
  const available = player.chips + player.bet;
  if (amount >= available) return { action: 'allIn' };
  return { action: 'raise', amount };
}

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

  // group 0 = 無条件フォールド（freqTierは参照しない）
  if (group === 0) return { action: 'fold' };

  const isRaised = state.currentBet > bb;

  if (!isRaised) {
    // RFI状況
    const position = getPosition(state, seat);

    // BB特殊ケース: 全員がBB以下でリンプ → BBはチェック可能
    if (position === 'BB') return { action: 'check' };

    const threshold = OPEN_THRESHOLD[position] ?? 2;
    if (group > threshold) return { action: 'fold' };

    // freqTier による確率判断
    const raiseProb = freqTier === 1 ? 1.0 : freqTier === 2 ? 0.87 : 0.62;
    if (Math.random() < raiseProb) {
      return makeRaise(bb * 3, player);
    }
    return { action: 'fold' };
  }

  // レイズ済みポット
  if (group <= 1) return makeRaise(state.currentBet * 3, player);
  if (group <= 4) {
    const callAmt = Math.min(state.currentBet - player.bet, player.chips);
    if (callAmt >= player.chips) return { action: 'allIn' };
    return { action: 'call' };
  }
  if (Math.random() < 0.15) {
    const callAmt = Math.min(state.currentBet - player.bet, player.chips);
    if (callAmt >= player.chips) return { action: 'allIn' };
    return { action: 'call' };
  }
  return { action: 'fold' };
}
