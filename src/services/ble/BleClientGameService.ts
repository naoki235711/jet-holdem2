// src/services/ble/BleClientGameService.ts

import { GameState, PlayerAction, Blinds, Card } from '../../gameEngine/types';
import { ShowdownResult, ActionResult } from '../../gameEngine';
import { GameService, ActionInfo } from '../GameService';
import { BleClientTransport } from './BleTransport';
import { ChunkManager } from './ChunkManager';
import {
  GameClientMessage,
  validateGameHostMessage,
  validatePrivateHandMessage,
} from './GameProtocol';

export class BleClientGameService implements GameService {
  private chunkManager = new ChunkManager();
  private currentState: GameState | null = null;
  private myCards: Card[] = [];
  private lastShowdownResult: ShowdownResult | null = null;
  private minRaiseSize: number = 0;
  private frozenSeats: number[] = [];
  private listeners = new Set<(state: GameState) => void>();

  constructor(
    private transport: BleClientTransport,
    private mySeat: number,
  ) {
    this.transport.onMessageReceived((charId, data) => {
      this.handleMessage(charId, data);
    });
  }

  getState(): GameState {
    if (!this.currentState) throw new Error('Game not started');
    return {
      ...this.currentState,
      players: this.currentState.players.map(p =>
        p.seat === this.mySeat ? { ...p, cards: this.myCards } : p,
      ),
    };
  }

  getActionInfo(seat: number): ActionInfo {
    if (!this.currentState) throw new Error('Game not started');
    const player = this.currentState.players.find(p => p.seat === seat);
    if (!player) throw new Error(`Invalid seat: ${seat}`);

    const minRaiseTo = this.currentState.currentBet + this.minRaiseSize;
    const maxRaiseTo = player.chips + player.bet;

    return {
      canCheck: this.currentState.currentBet <= player.bet,
      callAmount: Math.min(this.currentState.currentBet - player.bet, player.chips),
      minRaise: minRaiseTo,
      maxRaise: maxRaiseTo,
      canRaise: maxRaiseTo >= minRaiseTo,
    };
  }

  startGame(_playerNames: string[], _blinds: Blinds, _initialChips: number, _savedChips?: Record<string, number>): void {
    // no-op: host controls game lifecycle
  }

  startRound(): void {
    // no-op: host controls round lifecycle; stateUpdate syncs automatically
  }

  handleAction(_seat: number, action: PlayerAction): ActionResult {
    const msg: GameClientMessage = {
      type: 'playerAction',
      action: action.action,
      amount: action.amount,
    };
    this.sendToHost('playerAction', msg);
    return { valid: true };
  }

  resolveShowdown(): ShowdownResult {
    if (!this.lastShowdownResult) {
      return { winners: [], hands: [] };
    }
    const result = this.lastShowdownResult;
    this.lastShowdownResult = null;
    return result;
  }

  prepareNextRound(): void {
    // no-op: host controls round lifecycle; stateUpdate syncs automatically
  }

  advanceRunout(): void {
    // no-op: host drives runout; client observes via stateUpdate
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // --- Private ---

  private handleMessage(charId: string, data: Uint8Array): void {
    const json = this.chunkManager.decode(charId, data);
    if (!json) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return;
    }

    if (charId === 'gameState') {
      this.handleGameStateMessage(parsed);
    } else if (charId === 'privateHand') {
      this.handlePrivateHandMessage(parsed);
    }
  }

  private handleGameStateMessage(parsed: unknown): void {
    const msg = validateGameHostMessage(parsed);
    if (!msg) return;

    switch (msg.type) {
      case 'stateUpdate':
        this.currentState = {
          seq: msg.seq,
          phase: msg.phase,
          community: msg.community,
          pots: msg.pots,
          currentBet: msg.currentBet,
          activePlayer: msg.activePlayer,
          dealer: msg.dealer,
          blinds: msg.blinds,
          players: msg.players.map(p => ({
            seat: p.seat,
            name: p.name,
            chips: p.chips,
            status: p.status,
            bet: p.bet,
            cards: p.cards,
            cardsRevealed: p.cardsRevealed,
          })),
          foldWin: msg.foldWin,
        };
        this.minRaiseSize = msg.minRaiseSize;
        this.frozenSeats = msg.frozenSeats;
        this.notifyListeners();
        break;

      case 'showdownResult':
        this.lastShowdownResult = {
          winners: msg.winners,
          hands: msg.hands,
        };
        this.notifyListeners();
        break;

      case 'roundEnd':
        // roundEnd is informational; state already updated via stateUpdate
        break;

      case 'rematch':
        this.lastShowdownResult = null;
        this.myCards = [];
        this.notifyListeners();
        break;
    }
  }

  private handlePrivateHandMessage(parsed: unknown): void {
    const msg = validatePrivateHandMessage(parsed);
    if (!msg) return;
    if (msg.seat !== this.mySeat) return;
    this.myCards = msg.cards;
    this.notifyListeners();
  }

  private sendToHost(charId: string, msg: GameClientMessage): void {
    const chunks = this.chunkManager.encode(JSON.stringify(msg));
    for (const chunk of chunks) {
      this.transport.sendToHost(charId, chunk);
    }
  }

  private notifyListeners(): void {
    if (!this.currentState) return;
    const state = this.getState();
    this.listeners.forEach(l => l(state));
  }
}
