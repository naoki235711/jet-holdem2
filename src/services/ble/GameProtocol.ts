import { Card, Phase, Pot, Blinds, PlayerStatus, ActionType } from '../../gameEngine/types';

export const GAME_PROTOCOL_VERSION = 1;

const VALID_PHASES: Phase[] = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown', 'roundEnd', 'gameOver'];
const VALID_STATUSES: PlayerStatus[] = ['active', 'folded', 'allIn', 'out'];
const VALID_ACTIONS: ActionType[] = ['fold', 'check', 'call', 'raise', 'allIn'];

// --- Host → Client (gameState characteristic) ---

export type GameStatePlayer = {
  seat: number;
  name: string;
  chips: number;
  status: PlayerStatus;
  bet: number;
  cards: Card[];
};

export type GameHostMessage =
  | {
      type: 'stateUpdate';
      seq: number;
      phase: Phase;
      community: Card[];
      pots: Pot[];
      currentBet: number;
      activePlayer: number;
      dealer: number;
      blinds: Blinds;
      players: GameStatePlayer[];
      minRaiseSize: number;
      frozenSeats: number[];
      foldWin?: { seat: number; amount: number };
    }
  | {
      type: 'showdownResult';
      seq: number;
      winners: { seat: number; hand: string; potAmount: number }[];
      hands: { seat: number; cards: Card[]; description: string }[];
    }
  | {
      type: 'roundEnd';
      seq: number;
    }
  | {
      type: 'rematch';
      seq: number;
    };

// --- Host → Client (privateHand characteristic) ---

export type PrivateHandMessage = {
  type: 'privateHand';
  seat: number;
  cards: Card[];
};

// --- Client → Host (playerAction characteristic) ---

export type GameClientMessage =
  | { type: 'playerAction'; action: ActionType; amount?: number }
  | { type: 'rejoin'; seat: number };

// --- Validation ---

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCardArray(value: unknown): value is Card[] {
  if (!Array.isArray(value)) return false;
  return value.every(c => typeof c === 'string');
}

function isValidBlinds(value: unknown): value is Blinds {
  return isObject(value) && typeof value.sb === 'number' && typeof value.bb === 'number';
}

function isPotArray(value: unknown): value is Pot[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    p => isObject(p) && typeof p.amount === 'number' && Array.isArray(p.eligible),
  );
}

function isGameStatePlayerArray(value: unknown): value is GameStatePlayer[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    p =>
      isObject(p) &&
      typeof p.seat === 'number' &&
      typeof p.name === 'string' &&
      typeof p.chips === 'number' &&
      typeof p.status === 'string' &&
      VALID_STATUSES.includes(p.status as PlayerStatus) &&
      typeof p.bet === 'number' &&
      isCardArray(p.cards),
  );
}

function isNumberArray(value: unknown): value is number[] {
  if (!Array.isArray(value)) return false;
  return value.every(n => typeof n === 'number');
}

function validateStateUpdate(data: Record<string, unknown>): GameHostMessage | null {
  if (typeof data.seq !== 'number') return null;
  if (typeof data.phase !== 'string' || !VALID_PHASES.includes(data.phase as Phase)) return null;
  if (!isCardArray(data.community)) return null;
  if (!isPotArray(data.pots)) return null;
  if (typeof data.currentBet !== 'number') return null;
  if (typeof data.activePlayer !== 'number') return null;
  if (typeof data.dealer !== 'number') return null;
  if (!isValidBlinds(data.blinds)) return null;
  if (!isGameStatePlayerArray(data.players)) return null;
  if (typeof data.minRaiseSize !== 'number') return null;
  if (!isNumberArray(data.frozenSeats)) return null;

  const msg: GameHostMessage = {
    type: 'stateUpdate',
    seq: data.seq,
    phase: data.phase as Phase,
    community: data.community as Card[],
    pots: data.pots as Pot[],
    currentBet: data.currentBet,
    activePlayer: data.activePlayer,
    dealer: data.dealer,
    blinds: data.blinds as Blinds,
    players: data.players as GameStatePlayer[],
    minRaiseSize: data.minRaiseSize,
    frozenSeats: data.frozenSeats as number[],
  };

  if (data.foldWin !== undefined) {
    if (
      !isObject(data.foldWin) ||
      typeof data.foldWin.seat !== 'number' ||
      typeof data.foldWin.amount !== 'number'
    ) {
      return null;
    }
    msg.foldWin = { seat: data.foldWin.seat as number, amount: data.foldWin.amount as number };
  }

  return msg;
}

function validateShowdownResult(data: Record<string, unknown>): GameHostMessage | null {
  if (typeof data.seq !== 'number') return null;
  if (!Array.isArray(data.winners)) return null;
  if (
    !data.winners.every(
      (w: unknown) =>
        isObject(w) &&
        typeof w.seat === 'number' &&
        typeof w.hand === 'string' &&
        typeof w.potAmount === 'number',
    )
  ) return null;
  if (!Array.isArray(data.hands)) return null;
  if (
    !data.hands.every(
      (h: unknown) =>
        isObject(h) &&
        typeof h.seat === 'number' &&
        isCardArray(h.cards) &&
        typeof h.description === 'string',
    )
  ) return null;

  return {
    type: 'showdownResult',
    seq: data.seq,
    winners: data.winners as { seat: number; hand: string; potAmount: number }[],
    hands: data.hands as { seat: number; cards: Card[]; description: string }[],
  };
}

export function validateGameHostMessage(data: unknown): GameHostMessage | null {
  if (!isObject(data)) return null;

  switch (data.type) {
    case 'stateUpdate':
      return validateStateUpdate(data);
    case 'showdownResult':
      return validateShowdownResult(data);
    case 'roundEnd':
      if (typeof data.seq !== 'number') return null;
      return { type: 'roundEnd', seq: data.seq };
    case 'rematch':
      if (typeof data.seq !== 'number') return null;
      return { type: 'rematch', seq: data.seq };
    default:
      return null;
  }
}

export function validatePrivateHandMessage(data: unknown): PrivateHandMessage | null {
  if (!isObject(data)) return null;
  if (data.type !== 'privateHand') return null;
  if (typeof data.seat !== 'number') return null;
  if (!isCardArray(data.cards)) return null;
  return { type: 'privateHand', seat: data.seat, cards: data.cards as Card[] };
}

export function validateGameClientMessage(data: unknown): GameClientMessage | null {
  if (!isObject(data)) return null;

  switch (data.type) {
    case 'playerAction': {
      if (typeof data.action !== 'string' || !VALID_ACTIONS.includes(data.action as ActionType)) return null;
      const msg: GameClientMessage = { type: 'playerAction', action: data.action as ActionType };
      if (data.amount !== undefined) {
        if (typeof data.amount !== 'number') return null;
        msg.amount = data.amount;
      }
      return msg;
    }
    case 'rejoin':
      if (typeof data.seat !== 'number') return null;
      return { type: 'rejoin', seat: data.seat };
    default:
      return null;
  }
}
