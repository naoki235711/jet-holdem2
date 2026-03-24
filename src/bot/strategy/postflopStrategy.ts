// src/bot/strategy/postflopStrategy.ts

import { GameState, PlayerAction, Card, HandRank } from '../../gameEngine/types';
import { evaluate7Cards, evaluateHand, compareHands } from '../../gameEngine/HandEvaluator';
import { parseCard } from '../../gameEngine/Card';

type Strength = 'Strong' | 'Medium' | 'Weak' | 'Draw' | 'Air';

/**
 * evaluate7Cards は厳密に7枚を要求するため、フロップ(5枚)・ターン(6枚)では
 * 別の評価方法を使う。
 */
function evaluateBestHand(holeCards: Card[], community: Card[]) {
  const all = [...holeCards, ...community] as Card[];
  if (all.length === 7) return evaluate7Cards(all);
  if (all.length === 5) return evaluateHand(all);
  // ターン(6枚): C(6,5)=6通りの5枚組から最良を選ぶ
  let best = evaluateHand([all[0],all[1],all[2],all[3],all[4]]);
  for (let i = 0; i < all.length; i++) {
    const five = all.filter((_, j) => j !== i) as Card[];
    const result = evaluateHand(five);
    if (compareHands(result, best) > 0) best = result;
  }
  return best;
}

function classifyStrength(holeCards: Card[], community: Card[]): Strength {
  const all = [...holeCards, ...community] as Card[];
  const result = evaluateBestHand(holeCards, community);

  // FullHouse(6) and above are always Strong (set / boat / quads / straight flush)
  if (result.rank >= HandRank.FullHouse)    return 'Strong';
  // Straight(4), ThreeOfAKind(3) — strong made hands
  if (result.rank >= HandRank.ThreeOfAKind) return 'Strong';
  if (result.rank >= HandRank.TwoPair)      return 'Medium';
  if (result.rank === HandRank.OnePair)     return 'Weak';

  // HighCard: check for flush draw (4 suited cards)
  const suits = all.map(c => c[1]);
  const suitCounts = suits.reduce<Record<string,number>>((acc, s) => {
    acc[s] = (acc[s] ?? 0) + 1; return acc;
  }, {});
  if (Object.values(suitCounts).some(n => n >= 4)) return 'Draw'; // flush draw

  // Straight draw: check for 4 consecutive ranks
  const rankVals = [...new Set(all.map(c => {
    const { rank } = parseCard(c);
    const order = '23456789TJQKA';
    return order.indexOf(rank);
  }))].sort((a, b) => a - b);

  for (let i = 0; i <= rankVals.length - 4; i++) {
    if (rankVals[i+3] - rankVals[i] <= 4) return 'Draw'; // OESD or gutshot
  }

  return 'Air';
}

function calcSPR(state: GameState, seat: number): number {
  const bot = state.players.find(p => p.seat === seat)!;
  const opponents = state.players.filter(p => p.seat !== seat && p.status !== 'out' && p.status !== 'folded');
  if (opponents.length === 0) return 999;
  const effectiveStack = Math.min(bot.chips, Math.max(...opponents.map(p => p.chips)));
  const totalPot = state.pots.reduce((sum, p) => sum + p.amount, 0);
  if (totalPot === 0) return 999;
  return effectiveStack / totalPot;
}

/**
 * Postflop: IP = the dealer/BTN (acts last).
 * Sort active players by clockwise distance from dealer ascending;
 * the dealer themselves (distance=0) acts last = IP.
 */
function isIP(state: GameState, seat: number): boolean {
  const totalSeats = state.players.length;
  const active = state.players
    .filter(p => p.status !== 'out' && p.status !== 'folded')
    .sort((a, b) => ((a.seat - state.dealer + totalSeats) % totalSeats) -
                    ((b.seat - state.dealer + totalSeats) % totalSeats));
  // The player with smallest distance (0 = dealer/BTN) acts last postflop = IP
  return active[0]?.seat === seat;
}

function betSize(state: GameState, fraction: number, player: { chips: number; bet: number }): PlayerAction {
  const pot = state.pots.reduce((sum, p) => sum + p.amount, 0);
  const amount = Math.round(pot * fraction);
  const available = player.chips + player.bet;
  if (amount >= available) return { action: 'allIn' };
  if (amount <= state.currentBet) return { action: 'allIn' };
  return { action: 'raise', amount };
}

export function decidePostflopAction(
  state: GameState,
  holeCards: Card[],
  seat: number,
): PlayerAction {
  const strength = classifyStrength(holeCards, state.community);
  const spr = calcSPR(state, seat);
  const ip = isIP(state, seat);
  const canCheck = state.currentBet === 0;
  const player = state.players.find(p => p.seat === seat)!;

  const callAmt = Math.min(state.currentBet - player.bet, player.chips);
  const callFraction = callAmt / (player.chips || 1);

  if (strength === 'Strong') {
    if (spr < 4) return { action: 'allIn' };
    return betSize(state, ip ? 0.75 : 0.75, player);
  }

  if (strength === 'Medium') {
    if (spr < 4) return canCheck ? { action: 'check' } : { action: 'call' };
    if (ip) return canCheck ? betSize(state, 0.5, player) : { action: 'call' };
    if (canCheck) return { action: 'check' };
    return callFraction <= 0.30 ? { action: 'call' } : { action: 'fold' };
  }

  if (strength === 'Weak') {
    if (canCheck) return { action: 'check' };
    return callFraction <= 0.15 ? { action: 'call' } : { action: 'fold' };
  }

  if (strength === 'Draw') {
    if (ip) {
      if (canCheck) return Math.random() < 0.4 ? betSize(state, 0.5, player) : { action: 'check' };
      return callFraction <= 0.25 ? { action: 'call' } : { action: 'fold' };
    }
    if (canCheck) return { action: 'check' };
    return { action: 'fold' };
  }

  // Air
  if (ip) {
    if (canCheck) return Math.random() < 0.25 ? betSize(state, 0.5, player) : { action: 'check' };
    return { action: 'fold' };
  }
  if (canCheck) return { action: 'check' };
  return { action: 'fold' };
}
