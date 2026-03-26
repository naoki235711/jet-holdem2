import { GameState, PlayerAction, Blinds } from '../../gameEngine/types';
import { ShowdownResult, ActionResult } from '../../gameEngine';
import { GameService, ActionInfo } from '../GameService';
import { BleClientTransport } from './BleTransport';
import { ChunkManager } from './ChunkManager';
import { validateGameHostMessage } from './GameProtocol';

export class BleSpectatorGameService implements GameService {
  private chunkManager = new ChunkManager();
  private currentState: GameState | null = null;
  private lastShowdownResult: ShowdownResult | null = null;
  private listeners = new Set<(state: GameState) => void>();

  constructor(private transport: BleClientTransport) {
    this.transport.onMessageReceived((charId, data) => {
      this.handleMessage(charId, data);
    });
  }

  getState(): GameState {
    if (!this.currentState) throw new Error('Game not started');
    return this.currentState;
  }

  getActionInfo(_seat: number): ActionInfo {
    return { canCheck: false, callAmount: 0, minRaise: 0, maxRaise: 0, canRaise: false };
  }

  startGame(_playerNames: string[], _blinds: Blinds, _initialChips: number, _savedChips?: Record<string, number>): void {
    // no-op
  }

  startRound(): void {
    // no-op
  }

  handleAction(_seat: number, _action: PlayerAction): ActionResult {
    return { valid: false, reason: 'Spectator cannot act' };
  }

  resolveShowdown(): ShowdownResult {
    if (!this.lastShowdownResult) return { winners: [], hands: [] };
    const result = this.lastShowdownResult;
    this.lastShowdownResult = null;
    return result;
  }

  prepareNextRound(): void {
    // no-op
  }

  advanceRunout(): void {
    // no-op: host drives runout; spectator observes via stateUpdate
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private handleMessage(charId: string, data: Uint8Array): void {
    const json = this.chunkManager.decode(charId, data);
    if (!json) return;
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { return; }

    if (charId !== 'gameState') return;
    this.handleGameStateMessage(parsed);
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
        this.notifyListeners();
        break;
      case 'showdownResult':
        this.lastShowdownResult = { winners: msg.winners, hands: msg.hands };
        this.notifyListeners();
        break;
      case 'rematch':
        this.lastShowdownResult = null;
        this.notifyListeners();
        break;
      case 'roundEnd':
        break;
    }
  }

  private notifyListeners(): void {
    if (!this.currentState) return;
    const state = this.getState();
    this.listeners.forEach(l => l(state));
  }
}
