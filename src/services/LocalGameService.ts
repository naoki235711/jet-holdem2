// src/services/LocalGameService.ts

import { GameState, PlayerAction, Blinds, Player, PlayerStatus, GameLoop } from '../gameEngine';
import { ActionResult, ShowdownResult } from '../gameEngine';
import { GameService, ActionInfo } from './GameService';
import { decide } from '../bot/BotPlayerService';

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

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class LocalGameService implements GameService {
  private gameLoop: GameLoop | null = null;
  private listeners = new Set<(state: GameState) => void>();
  private botSeats = new Set<number>();
  private pendingBotTimer: ReturnType<typeof setTimeout> | null = null;

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

  getBotSeats(): ReadonlySet<number> {
    return this.botSeats;
  }

  startGame(
    playerNames: string[],
    blinds: Blinds,
    initialChips: number,
    savedChips?: Record<string, number>,
    botCount = 0,
  ): void {
    if (playerNames.length + botCount > 9) {
      throw new Error('Total players cannot exceed 9');
    }

    // Staleタイマーをキャンセル
    if (this.pendingBotTimer !== null) {
      clearTimeout(this.pendingBotTimer);
      this.pendingBotTimer = null;
    }
    this.botSeats.clear();

    const botNames = Array.from({ length: botCount }, (_, i) => `Bot ${i + 1}`);
    const allEntries: Array<{ name: string; isBot: boolean }> = [
      ...playerNames.map(name => ({ name, isBot: false })),
      ...botNames.map(name => ({ name, isBot: true })),
    ];
    const shuffled = botCount > 0 ? fisherYatesShuffle(allEntries) : allEntries;

    const players: Player[] = shuffled.map((entry, i) => ({
      seat: i,
      name: entry.name,
      chips: savedChips?.[entry.name] ?? initialChips,
      status: 'active' as PlayerStatus,
      bet: 0,
      cards: [],
      isBot: entry.isBot,
    }));

    players.filter(p => p.isBot).forEach(p => this.botSeats.add(p.seat));

    this.gameLoop = new GameLoop(players, blinds);
    this.notify();
  }

  startRound(): void {
    if (!this.gameLoop) throw new Error('Game not started');
    this.gameLoop.startRound();
    this.notify();
    this.scheduleBotIfNeeded();
  }

  handleAction(seat: number, action: PlayerAction): ActionResult {
    if (!this.gameLoop) throw new Error('Game not started');
    const result = this.gameLoop.handleAction(seat, action);
    if (!result.valid && result.reason) {
      return { valid: false, reason: translateError(result.reason) };
    }
    this.notify();
    this.scheduleBotIfNeeded();
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

  private scheduleBotIfNeeded(): void {
    const state = this.gameLoop!.getState();
    if (state.activePlayer === -1) return;
    if (!this.botSeats.has(state.activePlayer)) return;

    if (this.pendingBotTimer !== null) {
      clearTimeout(this.pendingBotTimer);
    }

    this.pendingBotTimer = setTimeout(() => {
      this.pendingBotTimer = null;
      const s = this.gameLoop!.getState();
      const botSeat = s.activePlayer;
      if (botSeat === -1 || !this.botSeats.has(botSeat)) return;

      const holeCards = this.gameLoop!.getPrivateHand(botSeat);
      const action = decide({ gameState: s, holeCards, seat: botSeat });
      this.handleAction(botSeat, action);
    }, 1000);
  }

  private notify(): void {
    if (!this.gameLoop) return;
    const state = this.gameLoop.getState();
    this.listeners.forEach(l => l(state));
  }
}
