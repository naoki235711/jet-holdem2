import { GameState, Card, PlayerAction } from '../../gameEngine/types';
import { estimateEquity } from '../equity/equityCalculator';

type BoardTexture = 'dry' | 'wet';

const RANK_MAP: Record<string, number> = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
  'T':10,'J':11,'Q':12,'K':13,'A':14,
};

export function detectBoardTexture(community: Card[]): BoardTexture {
  if (community.length < 3) return 'dry';

  // Monotone: 3+ cards of same suit
  const suitCounts: Record<string, number> = {};
  for (const card of community) {
    const suit = card[1];
    suitCounts[suit] = (suitCounts[suit] ?? 0) + 1;
    if (suitCounts[suit] >= 3) return 'wet';
  }

  // Connected: 3 strictly consecutive ranks (gap straights are treated as dry)
  const vals = community.map(c => RANK_MAP[c[0]] ?? 0).sort((a, b) => a - b);
  for (let i = 0; i <= vals.length - 3; i++) {
    if (vals[i + 1] === vals[i] + 1 && vals[i + 2] === vals[i] + 2) return 'wet';
  }

  return 'dry';
}

function calcSPR(botChips: number, gameState: GameState, botSeat: number): number {
  const opponentChips = gameState.players
    .filter(p => p.seat !== botSeat && p.status !== 'out' && p.status !== 'folded')
    .map(p => p.chips);
  if (opponentChips.length === 0) return Infinity;
  const effectiveStack = Math.min(botChips, Math.max(...opponentChips));
  const totalPot = gameState.pots.reduce((sum, p) => sum + p.amount, 0);
  if (totalPot === 0) return Infinity;
  return effectiveStack / totalPot;
}

function detectIP(gameState: GameState, seat: number): boolean {
  const active = gameState.players
    .filter(p => p.status === 'active' || p.status === 'allIn')
    .map(p => p.seat);
  if (active.length === 0) return true;

  const numSeats = Math.max(...gameState.players.map(p => p.seat)) + 1;
  const dealer = gameState.dealer;

  // Post-flop index: 0 = first to act (left of dealer), higher = later = IP
  // Use true modulo (always positive) to handle out-of-range dealer values
  const pfIdx = (s: number) => ((s - dealer - 1) % numSeats + numSeats) % numSeats;
  const ipSeat = active.reduce((best, s) => pfIdx(s) > pfIdx(best) ? s : best);
  return ipSeat === seat;
}

function betAmount(equity: number, totalPot: number, botChips: number, minBet: number): number {
  const multiplier = equity > 0.65 ? 0.75 : 0.5;
  return Math.min(Math.max(Math.round(totalPot * multiplier), minBet), botChips);
}

export function decidePostflopAction(
  gameState: GameState,
  holeCards: Card[],
  seat: number
): PlayerAction {
  const player = gameState.players.find(p => p.seat === seat)!;
  const totalPot = gameState.pots.reduce((sum, p) => sum + p.amount, 0);
  const callAmount = gameState.currentBet - player.bet;

  const numOpponents = gameState.players.filter(
    p => p.seat !== seat && (p.status === 'active' || p.status === 'allIn')
  ).length;

  const equity = numOpponents > 0
    ? estimateEquity(holeCards, gameState.community, numOpponents)
    : 1.0;

  const spr = calcSPR(player.chips, gameState, seat);
  const isIP = detectIP(gameState, seat);
  const texture = detectBoardTexture(gameState.community);
  const minBet = gameState.blinds.bb;
  // Minimum raise TO = currentBet + last raise increment (approximated as max(currentBet, BB))
  const minRaiseTo = gameState.currentBet + Math.max(gameState.currentBet, gameState.blinds.bb);

  if (callAmount > 0) {
    // Facing a bet
    const potOdds = callAmount / (totalPot + callAmount);

    // 1. SPR commit + equity advantage → all-in
    if (spr < 2 && equity > 0.50) return { action: 'allIn' };

    // 2. OOP re-raise (exploits check-raise line)
    if (equity > 0.70 && !isIP && Math.random() < 0.3) {
      const amt = betAmount(equity, totalPot, player.chips, minRaiseTo);
      if (amt >= minRaiseTo) return { action: 'raise', amount: amt };
    }

    // 3. Value raise
    if (equity > 0.70 && player.chips + player.bet >= minRaiseTo) {
      const amt = betAmount(equity, totalPot, player.chips, minRaiseTo);
      if (amt >= minRaiseTo) return { action: 'raise', amount: amt };
    }

    // 4. Profitable call
    if (equity > potOdds) {
      if (callAmount >= player.chips) return { action: 'allIn' };
      return { action: 'call' };
    }

    return { action: 'fold' };

  } else {
    // Can check

    // 1. SPR commit + equity advantage → all-in
    if (spr < 2 && equity > 0.50) return { action: 'allIn' };

    // 2. OOP check-raise bait (check with strong hand)
    if (equity > 0.65 && !isIP && Math.random() < 0.3) return { action: 'check' };

    // 3. Strong value bet
    if (equity > 0.65) {
      return { action: 'raise', amount: betAmount(equity, totalPot, player.chips, minBet) };
    }

    // 4. Thin value bet
    if (equity > 0.45) {
      return { action: 'raise', amount: betAmount(equity, totalPot, player.chips, minBet) };
    }

    // 5. Bluff (IP only, frequency adjusted for board texture)
    const bluffFreq = texture === 'wet' ? 0.1 : 0.2;
    if (isIP && Math.random() < bluffFreq) {
      return { action: 'raise', amount: betAmount(equity, totalPot, player.chips, minBet) };
    }

    return { action: 'check' };
  }
}
