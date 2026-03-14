// src/services/GameService.ts

import { GameState, PlayerAction, Blinds } from '../gameEngine';
import { ActionResult, ShowdownResult } from '../gameEngine';

export interface ActionInfo {
  canCheck: boolean;
  callAmount: number;     // 0 if can check
  minRaise: number;       // Raise TO value (total bet)
  maxRaise: number;       // = player.chips + player.bet
  canRaise: boolean;      // Has enough chips for minRaise
}

export interface GameService {
  getState(): GameState;
  getActionInfo(seat: number): ActionInfo;

  startGame(playerNames: string[], blinds: Blinds, initialChips: number): void;
  startRound(): void;
  handleAction(seat: number, action: PlayerAction): ActionResult;
  resolveShowdown(): ShowdownResult;
  prepareNextRound(): void;

  subscribe(listener: (state: GameState) => void): () => void;
}
