// src/services/LocalGameService.ts

import { GameState, PlayerAction, Blinds, Player, PlayerStatus, GameLoop } from '../gameEngine';
import { ActionResult, ShowdownResult } from '../gameEngine';
import { GameService, ActionInfo } from './GameService';

const ERROR_MESSAGES: Record<string, string> = {
  'No active betting round': 'ベッティングラウンドが開始されていません',
  'Cannot check — must call, raise, or fold': 'チェックできません。コール、レイズ、またはフォールドしてください',
  'Nothing to call — use check': 'コールする必要はありません。チェックしてください',
  'Not enough chips — use all-in': 'チップが不足しています。オールインしてください',
  'Unknown action': '不明なアクションです',
};

function translateError(reason: string): string {
  if (ERROR_MESSAGES[reason]) return ERROR_MESSAGES[reason];
  if (reason.startsWith('Seat ') && reason.includes('not your turn')) {
    return 'あなたのターンではありません';
  }
  if (reason.startsWith('Minimum raise is')) {
    return 'レイズ額が最低額に達していません';
  }
  return reason;
}

export class LocalGameService implements GameService {
  private gameLoop: GameLoop | null = null;
  private listeners = new Set<(state: GameState) => void>();

  getState(): GameState {
    if (!this.gameLoop) throw new Error('Game not started');
    return this.gameLoop.getState();
  }

  getActionInfo(seat: number): ActionInfo {
    const state = this.getState();
    const player = state.players.find(p => p.seat === seat);
    if (!player) throw new Error(`Invalid seat: ${seat}`);
    const minRaiseIncrement = this.gameLoop!.getMinRaiseSize();
    const minRaiseTo = state.currentBet + minRaiseIncrement;
    const maxRaiseTo = player.chips + player.bet;

    return {
      canCheck: state.currentBet <= player.bet,
      callAmount: Math.min(state.currentBet - player.bet, player.chips),
      minRaise: minRaiseTo,
      maxRaise: maxRaiseTo,
      canRaise: maxRaiseTo >= minRaiseTo,
    };
  }

  startGame(playerNames: string[], blinds: Blinds, initialChips: number): void {
    const players: Player[] = playerNames.map((name, i) => ({
      seat: i,
      name,
      chips: initialChips,
      status: 'active' as PlayerStatus,
      bet: 0,
      cards: [],
    }));
    this.gameLoop = new GameLoop(players, blinds);
    this.notify();
  }

  startRound(): void {
    if (!this.gameLoop) throw new Error('Game not started');
    this.gameLoop.startRound();
    this.notify();
  }

  handleAction(seat: number, action: PlayerAction): ActionResult {
    if (!this.gameLoop) throw new Error('Game not started');
    const result = this.gameLoop.handleAction(seat, action);
    if (!result.valid && result.reason) {
      return { valid: false, reason: translateError(result.reason) };
    }
    this.notify();
    return result;
  }

  resolveShowdown(): ShowdownResult {
    if (!this.gameLoop) throw new Error('Game not started');
    const result = this.gameLoop.resolveShowdown();
    this.notify();
    return result;
  }

  prepareNextRound(): void {
    if (!this.gameLoop) throw new Error('Game not started');
    this.gameLoop.prepareNextRound();
    this.notify();
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    if (!this.gameLoop) return;
    const state = this.gameLoop.getState();
    this.listeners.forEach(l => l(state));
  }
}
