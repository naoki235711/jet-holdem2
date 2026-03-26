// src/bot/strategy/preflopStrategy.ts

import { GameState, PlayerAction, Card } from '../../gameEngine/types';
// RANKS をエイリアスして types.ts の RANKS と区別する
import { MATRIX, RANKS as PREFLOP_RANKS, getGroup, getFreqTier } from '../../components/preflop/preflopData';

const OPEN_THRESHOLD_BY_COUNT: Record<number, Partial<Record<string, number>>> = {
  2: { BTN: 7, BB: 1 },
  3: { BTN: 7, SB: 7, BB: 1 },
  4: { BTN: 7, SB: 7, BB: 1, UTG: 5 },
  5: { BTN: 7, SB: 7, BB: 1, UTG: 4, CO: 6 },
  6: { BTN: 6, SB: 7, BB: 1, UTG: 3, HJ: 5, CO: 6 },
  7: { BTN: 6, SB: 7, BB: 1, UTG: 3, LJ: 4, HJ: 5, CO: 5 },
  8: { BTN: 6, SB: 7, BB: 1, UTG: 3, 'UTG+1': 3, LJ: 4, HJ: 4, CO: 5 },
  9: { BTN: 6, SB: 7, BB: 1, UTG: 2, 'UTG+1': 3, 'UTG+2': 3, LJ: 4, HJ: 4, CO: 5 },
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

  const thresholdTable = OPEN_THRESHOLD_BY_COUNT[numActive] ?? OPEN_THRESHOLD_BY_COUNT[9]!;
  const effectiveThreshold = thresholdTable[position] ?? 2;

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
  group: number,
  position: string,
  bbDepth: number,
  currentBet: number,
  player: { chips: number; bet: number },
): PlayerAction {
  const isIP = ['BTN', 'CO', 'HJ'].includes(position);

  // ショートスタック（< 15BB）: premium のみ allIn
  if (bbDepth < 15) {
    if (group <= 1) return { action: 'allIn' };
    return { action: 'fold' };
  }

  // ミドルスタック（15–29BB）: 3-bet or fold（コールなし）
  if (bbDepth < 30) {
    if (group <= 1) return makeRaise(currentBet * 3, player);
    return { action: 'fold' };
  }

  // 通常スタック（>= 30BB）
  if (group <= 1) return makeRaise(currentBet * 3, player);  // バリュー 3-bet
  if (group <= 3 && isIP && Math.random() < 0.20) return makeRaise(currentBet * 3, player); // ブラフ 3-bet
  if (group <= 4) {
    const callAmt = Math.min(currentBet - player.bet, player.chips);
    if (callAmt >= player.chips) return { action: 'allIn' };
    return { action: 'call' };
  }
  return { action: 'fold' };
}

function decideSqueezeOrFold(
  group: number,
  numCallers: number,
  bbDepth: number,
  currentBet: number,
  player: { chips: number; bet: number },
): PlayerAction {
  // ショートスタック（< 15BB）: premium のみ push
  if (bbDepth < 15) {
    if (group <= 1) return { action: 'allIn' };
    return { action: 'fold' };
  }

  // 通常スタック
  if (group <= 1) return makeRaise(currentBet * 3.5, player); // バリュースクイーズ
  // コーラー 1 人時のみブラフスクイーズ（2 人以上はブラフなし）
  if (group <= 3 && numCallers === 1 && Math.random() < 0.25) return makeRaise(currentBet * 3.5, player);
  return { action: 'fold' };
}

function decideFacingReraise(
  group: number,
  bbDepth: number,
  currentBet: number,
  player: { chips: number; bet: number },
): PlayerAction {
  // ショートスタック（< 15BB）: premium のみ jam
  if (bbDepth < 15) {
    if (group <= 1) return { action: 'allIn' };
    return { action: 'fold' };
  }

  // 通常スタック
  if (group <= 1) return makeRaise(currentBet * 2.5, player); // 4-bet / re-jam
  // group 2（AKo/JJ/TT 相当）: 深いスタックのみコール
  if (group === 2 && bbDepth >= 40) {
    const callAmt = Math.min(currentBet - player.bet, player.chips);
    if (callAmt >= player.chips) return { action: 'allIn' };
    return { action: 'call' };
  }
  return { action: 'fold' };
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
