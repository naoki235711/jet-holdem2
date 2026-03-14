import { BleHostTransport } from './BleTransport';
import { ChunkManager } from './ChunkManager';
import {
  LobbyPlayer,
  LobbyHostMessage,
  GameSettings,
  validateClientMessage,
} from './LobbyProtocol';

const LOBBY_CHARACTERISTIC = 'lobby';
const MAX_PLAYERS = 4; // host included

type LobbyHostState = 'idle' | 'advertising' | 'waitingForPlayers' | 'gameStarting';

export class LobbyHost {
  private state: LobbyHostState = 'idle';
  private players = new Map<string, LobbyPlayer>(); // clientId → LobbyPlayer
  private chunkManager = new ChunkManager();

  private _onPlayersChanged: ((players: LobbyPlayer[]) => void) | null = null;
  private _onGameStart: ((blinds: { sb: number; bb: number }) => void) | null = null;
  private _onError: ((error: string) => void) | null = null;

  constructor(
    private transport: BleHostTransport,
    private hostName: string,
    private gameSettings: GameSettings = { sb: 5, bb: 10, initialChips: 1000 },
  ) {}

  async start(): Promise<void> {
    await this.transport.startAdvertising('JetHoldem');
    this.state = 'waitingForPlayers';

    // Host is always seat 0, always ready
    this.players.set('__host__', { seat: 0, name: this.hostName, ready: true });

    this.transport.onClientConnected((clientId) => this.handleClientConnected(clientId));
    this.transport.onClientDisconnected((clientId) => this.handleClientDisconnected(clientId));
    this.transport.onMessageReceived((clientId, _charId, data) => {
      const json = this.chunkManager.decode(clientId, data);
      if (json) this.handleMessage(clientId, json);
    });

    this.notifyPlayersChanged();
  }

  async stop(): Promise<void> {
    await this.sendToAll({ type: 'lobbyClosed', reason: 'Host closed the lobby' });
    await this.transport.stopAdvertising();
    this.state = 'idle';
    this.chunkManager.clear();
  }

  startGame(): void {
    const playerList = this.getPlayerList();
    const nonHostPlayers = playerList.filter((p) => p.seat !== 0);

    if (playerList.length < 2) {
      this._onError?.('Cannot start: need at least 2 players');
      return;
    }
    if (!nonHostPlayers.every((p) => p.ready)) {
      this._onError?.('Cannot start: not all players are ready');
      return;
    }

    this.state = 'gameStarting';
    const blinds = { sb: this.gameSettings.sb, bb: this.gameSettings.bb };
    this.sendToAll({
      type: 'gameStart',
      blinds,
      initialChips: this.gameSettings.initialChips,
    });
    this._onGameStart?.(blinds);
  }

  // --- Event handlers ---

  private handleClientConnected(_clientId: string): void {
    // Wait for join message before adding to players
  }

  private handleClientDisconnected(clientId: string): void {
    if (this.players.has(clientId)) {
      this.players.delete(clientId);
      this.notifyPlayersChanged();
      this.sendToAll({ type: 'playerUpdate', players: this.getPlayerList() });
    }
  }

  private handleMessage(clientId: string, json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return; // Ignore unparseable messages
    }

    const msg = validateClientMessage(parsed);
    if (!msg) return;

    switch (msg.type) {
      case 'join':
        this.handleJoin(clientId, msg.playerName);
        break;
      case 'ready':
        this.handleReady(clientId);
        break;
    }
  }

  private handleJoin(clientId: string, playerName: string): void {
    // Ignore duplicate join
    if (this.players.has(clientId)) return;

    if (this.players.size >= MAX_PLAYERS) {
      this.sendToClient(clientId, {
        type: 'joinResponse',
        accepted: false,
        reason: 'Room is full',
      });
      return;
    }

    const seat = this.findNextSeat();
    this.players.set(clientId, { seat, name: playerName, ready: false });

    this.notifyPlayersChanged();
    // Broadcast updated player list to all other clients first
    this.sendToAll({ type: 'playerUpdate', players: this.getPlayerList() });

    // Send joinResponse last so it is the most recent message to this client
    this.sendToClient(clientId, {
      type: 'joinResponse',
      accepted: true,
      seat,
      players: this.getPlayerList(),
      gameSettings: this.gameSettings,
    });
  }

  private handleReady(clientId: string): void {
    const player = this.players.get(clientId);
    if (!player) return;
    player.ready = true;
    this.notifyPlayersChanged();
    this.sendToAll({ type: 'playerUpdate', players: this.getPlayerList() });
  }

  // --- Callbacks ---

  onPlayersChanged(callback: (players: LobbyPlayer[]) => void): void {
    this._onPlayersChanged = callback;
  }

  onGameStart(callback: (blinds: { sb: number; bb: number }) => void): void {
    this._onGameStart = callback;
  }

  onError(callback: (error: string) => void): void {
    this._onError = callback;
  }

  // --- Helpers ---

  private getPlayerList(): LobbyPlayer[] {
    return Array.from(this.players.values()).sort((a, b) => a.seat - b.seat);
  }

  private findNextSeat(): number {
    const taken = new Set(Array.from(this.players.values()).map((p) => p.seat));
    for (let s = 1; s <= 3; s++) {
      if (!taken.has(s)) return s;
    }
    return -1; // Should never happen if size check is correct
  }

  private notifyPlayersChanged(): void {
    this._onPlayersChanged?.(this.getPlayerList());
  }

  private async sendToClient(clientId: string, msg: LobbyHostMessage): Promise<void> {
    const chunks = this.chunkManager.encode(JSON.stringify(msg));
    for (const chunk of chunks) {
      await this.transport.sendToClient(clientId, LOBBY_CHARACTERISTIC, chunk);
    }
  }

  private async sendToAll(msg: LobbyHostMessage): Promise<void> {
    const chunks = this.chunkManager.encode(JSON.stringify(msg));
    for (const chunk of chunks) {
      await this.transport.sendToAll(LOBBY_CHARACTERISTIC, chunk);
    }
  }
}
