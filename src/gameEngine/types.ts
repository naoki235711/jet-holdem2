// Card notation: 2-character string, e.g., "Ah" = Ace of Hearts
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Suit = 'h' | 'd' | 's' | 'c';
export type Card = `${Rank}${Suit}`;

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS: Suit[] = ['h', 'd', 's', 'c'];

export enum HandRank {
  HighCard = 0,
  OnePair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
}

export interface HandResult {
  rank: HandRank;
  cards: Card[];       // The best 5 cards
  values: number[];    // Numeric values for comparison [rankCategory, ...kickers]
  description: string; // Human-readable, e.g., "Full House, Kings over Sevens"
}

export type PlayerStatus = 'active' | 'folded' | 'allIn' | 'out';

export interface Player {
  seat: number;        // 0-8
  name: string;
  chips: number;
  status: PlayerStatus;
  bet: number;         // Current round bet
  cards: Card[];       // Hole cards (2 cards)
  isBot?: boolean;     // true if bot player, false or undefined if human
  cardsRevealed?: boolean; // true when hole cards are shown face-up to all players
}

export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river'
  | 'allInFlop' | 'allInTurn' | 'allInRiver'
  | 'showdown' | 'roundEnd' | 'gameOver';

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allIn';

export interface PlayerAction {
  action: ActionType;
  amount?: number;     // Required for 'raise'
}

export interface Pot {
  amount: number;
  eligible: number[];  // Seat numbers eligible for this pot
}

export interface Blinds {
  sb: number;
  bb: number;
}

export interface GameState {
  seq: number;
  phase: Phase;
  community: Card[];
  pots: Pot[];
  currentBet: number;
  activePlayer: number; // Seat number of player who must act
  dealer: number;       // Seat number of dealer button
  blinds: Blinds;
  players: Player[];
  foldWin?: { seat: number; amount: number };
}
