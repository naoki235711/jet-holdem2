// src/services/ble/BleHostGameService.ts

import { GameState, PlayerAction, Blinds, Player, PlayerStatus, Card } from '../../gameEngine/types';
import { GameLoop, ShowdownResult, ActionResult } from '../../gameEngine';
import { GameService, ActionInfo } from '../GameService';
import { BleHostTransport } from './BleTransport';
import { ChunkManager } from './ChunkManager';
import {
  GameHostMessage,
  GameClientMessage,
  validateGameClientMessage,
} from './GameProtocol';

export class BleHostGameService implements GameService {
  private gameLoop: GameLoop | null = null;
  private chunkManager = new ChunkManager();
  private hostSeat: number = 0;
  private frozenSeats = new Map<number, ReturnType<typeof setTimeout>>();
  private listeners = new Set<(state: GameState) => void>();

  constructor(
    private transport: BleHostTransport,
    private clientSeatMap: Map<string, number>,
  ) {
    this.transport.onMessageReceived((clientId, charId, data) => {
      this.handleClientMessage(clientId, charId, data);
    });
    this.transport.onClientDisconnected((clientId) => {
      this.handleClientDisconnected(clientId);
    });
  }

  getState(): GameState {
    if (!this.gameLoop) throw new Error('Game not started');
    const state = this.gameLoop.getState();
    return {
      ...state,
      players: state.players.map(p =>
        p.seat === this.hostSeat ? p : { ...p, cards: [] },
      ),
    };
  }

  getActionInfo(seat: number): ActionInfo {
    if (!this.gameLoop) throw new Error('Game not started');
    const state = this.gameLoop.getState();
    const player = state.players.find(p => p.seat === seat);
    if (!player) throw new Error(`Invalid seat: ${seat}`);
    const minRaiseIncrement = this.gameLoop.getMinRaiseSize();
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
  }

  startRound(): void {
    if (!this.gameLoop) throw new Error('Game not started');
    this.gameLoop.startRound();
    this.broadcastState();
    this.sendPrivateHands();
    this.notifyListeners();
    this.checkFrozenActivePlayer();
  }

  handleAction(seat: number, action: PlayerAction): ActionResult {
    if (!this.gameLoop) throw new Error('Game not started');
    const result = this.gameLoop.handleAction(seat, action);
    if (result.valid) {
      this.broadcastState();
      this.notifyListeners();
      this.checkFrozenActivePlayer();
    }
    return result;
  }

  resolveShowdown(): ShowdownResult {
    if (!this.gameLoop) throw new Error('Game not started');
    const result = this.gameLoop.resolveShowdown();
    // Send showdown result with revealed hands
    const state = this.gameLoop.getState();
    const msg: GameHostMessage = {
      type: 'showdownResult',
      seq: state.seq,
      winners: result.winners,
      hands: result.hands,
    };
    this.sendToAll('gameState', msg);
    this.broadcastState();
    this.notifyListeners();
    return result;
  }

  prepareNextRound(): void {
    if (!this.gameLoop) throw new Error('Game not started');
    this.gameLoop.prepareNextRound();
    this.broadcastState();
    this.notifyListeners();
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // --- Private: BLE broadcasting ---

  private broadcastState(): void {
    if (!this.gameLoop) return;
    const state = this.gameLoop.getState();

    const msg: GameHostMessage = {
      type: 'stateUpdate',
      seq: state.seq,
      phase: state.phase,
      community: state.community,
      pots: state.pots,
      currentBet: state.currentBet,
      activePlayer: state.activePlayer,
      dealer: state.dealer,
      blinds: state.blinds,
      players: state.players.map(p => ({
        seat: p.seat,
        name: p.name,
        chips: p.chips,
        status: p.status,
        bet: p.bet,
        cards: [] as Card[],
      })),
      minRaiseSize: this.gameLoop.getMinRaiseSize(),
      frozenSeats: Array.from(this.frozenSeats.keys()),
    };

    if (state.foldWin) {
      msg.foldWin = state.foldWin;
    }

    this.sendToAll('gameState', msg);
  }

  private sendPrivateHands(): void {
    if (!this.gameLoop) return;
    for (const [clientId, seat] of this.clientSeatMap) {
      const cards = this.gameLoop.getPrivateHand(seat);
      const chunks = this.chunkManager.encode(
        JSON.stringify({ type: 'privateHand', seat, cards }),
      );
      for (const chunk of chunks) {
        this.transport.sendToClient(clientId, 'privateHand', chunk);
      }
    }
  }

  private sendToAll(charId: string, msg: GameHostMessage): void {
    const chunks = this.chunkManager.encode(JSON.stringify(msg));
    for (const chunk of chunks) {
      this.transport.sendToAll(charId, chunk);
    }
  }

  private sendToClient(clientId: string, charId: string, msg: unknown): void {
    const chunks = this.chunkManager.encode(JSON.stringify(msg));
    for (const chunk of chunks) {
      this.transport.sendToClient(clientId, charId, chunk);
    }
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(l => l(state));
  }

  // --- Private: Client message handling ---

  private handleClientMessage(clientId: string, charId: string, data: Uint8Array): void {
    if (charId !== 'playerAction') return;

    const json = this.chunkManager.decode(clientId, data);
    if (!json) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return;
    }

    const msg = validateGameClientMessage(parsed);
    if (!msg) return;

    if (msg.type === 'rejoin') {
      this.handleRejoin(clientId, msg.seat);
      return;
    }

    const seat = this.clientSeatMap.get(clientId);
    if (seat === undefined) return;

    if (this.frozenSeats.has(seat)) return;

    this.handleAction(seat, { action: msg.action, amount: msg.amount });
  }

  private handleRejoin(clientId: string, seat: number): void {
    if (!this.frozenSeats.has(seat)) return;

    // Clear freeze timeout
    clearTimeout(this.frozenSeats.get(seat)!);
    this.frozenSeats.delete(seat);

    // Update clientSeatMap with new clientId
    for (const [oldId, s] of this.clientSeatMap) {
      if (s === seat) {
        this.clientSeatMap.delete(oldId);
        break;
      }
    }
    this.clientSeatMap.set(clientId, seat);

    // Send current state and private hand to reconnected client
    this.broadcastState();
    this.notifyListeners();
    if (this.gameLoop) {
      const cards = this.gameLoop.getPrivateHand(seat);
      this.sendToClient(clientId, 'privateHand', {
        type: 'privateHand',
        seat,
        cards,
      });
    }
  }

  // --- Private: Disconnection handling ---

  private handleClientDisconnected(clientId: string): void {
    const seat = this.clientSeatMap.get(clientId);
    if (seat === undefined) return;

    const timeout = setTimeout(() => {
      this.frozenSeats.delete(seat);
      // Auto-fold if game is active
      if (this.gameLoop) {
        const state = this.gameLoop.getState();
        const player = state.players.find(p => p.seat === seat);
        if (player && player.status === 'active') {
          this.handleAction(seat, { action: 'fold' });
        }
      }
    }, 30_000);

    this.frozenSeats.set(seat, timeout);
    this.broadcastState();
    this.notifyListeners();
  }

  /** Check if active player is frozen — if so, auto-fold immediately */
  private checkFrozenActivePlayer(): void {
    if (!this.gameLoop) return;
    const state = this.gameLoop.getState();
    if (state.activePlayer >= 0 && this.frozenSeats.has(state.activePlayer)) {
      this.handleAction(state.activePlayer, { action: 'fold' });
    }
  }
}
