import { BleClientTransport } from './BleTransport';
import { ChunkManager } from './ChunkManager';
import {
  LobbyPlayer,
  LobbyClientMessage,
  LobbyHostMessage,
  GameSettings,
  validateHostMessage,
  PROTOCOL_VERSION,
} from './LobbyProtocol';

const LOBBY_CHARACTERISTIC = 'lobby';

type LobbyClientState = 'idle' | 'scanning' | 'connecting' | 'joined' | 'ready' | 'gameStarting';

export type JoinResult =
  | { accepted: true; gameSettings: GameSettings }
  | { accepted: false; reason: string };

export type SpectateResult =
  | { accepted: true; gameSettings: GameSettings }
  | { accepted: false; reason: string };

export type GameStartConfig = {
  blinds: { sb: number; bb: number };
  initialChips: number;
};

export class LobbyClient {
  private state: LobbyClientState = 'idle';
  private _mySeat: number | null = null;
  private players: LobbyPlayer[] = [];
  private chunkManager = new ChunkManager();

  private _onHostDiscovered: ((hostId: string, hostName: string) => void) | null = null;
  private _onJoinResult: ((result: JoinResult) => void) | null = null;
  private _onSpectateResult: ((result: SpectateResult) => void) | null = null;
  private _onPlayersChanged: ((players: LobbyPlayer[]) => void) | null = null;
  private _onGameStart: ((config: GameStartConfig) => void) | null = null;
  private _onDisconnected: (() => void) | null = null;
  private _onError: ((error: string) => void) | null = null;

  constructor(
    private transport: BleClientTransport,
    private playerName: string,
  ) {}

  get mySeat(): number | null {
    return this._mySeat;
  }

  async startScanning(): Promise<void> {
    this.state = 'scanning';
    this.transport.onHostDiscovered((hostId, hostName) => {
      this._onHostDiscovered?.(hostId, hostName);
    });
    await this.transport.startScanning('jet-holdem');
  }

  async connectToHost(hostId: string): Promise<void> {
    this.state = 'connecting';
    await this.transport.connectToHost(hostId);

    this.transport.onMessageReceived((_charId: string, data: Uint8Array) => {
      const json = this.chunkManager.decode('host', data);
      if (json) this.handleMessage(json);
    });

    // Auto-send join
    await this.sendToHost({ type: 'join', protocolVersion: PROTOCOL_VERSION, playerName: this.playerName });
  }

  setReady(): void {
    if (this.state !== 'joined') return;
    this.state = 'ready';
    this.sendToHost({ type: 'ready' });
  }

  spectate(): void {
    if (this.state === 'idle' || this.state === 'scanning') return;
    this.sendToHost({ type: 'spectate', protocolVersion: PROTOCOL_VERSION, spectatorName: this.playerName });
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this.state = 'idle';
    this._mySeat = null;
    this.players = [];
    this.chunkManager.clear();
  }

  // --- Message handling ---

  private handleMessage(json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return;
    }

    const msg = validateHostMessage(parsed);
    if (!msg) return;

    switch (msg.type) {
      case 'joinResponse':
        this.handleJoinResponse(msg);
        break;
      case 'spectateResponse':
        this.handleSpectateResponse(msg);
        break;
      case 'playerUpdate':
        this.players = msg.players;
        this._onPlayersChanged?.(msg.players);
        break;
      case 'gameStart':
        this.state = 'gameStarting';
        this._onGameStart?.({ blinds: msg.blinds, initialChips: msg.initialChips });
        break;
      case 'lobbyClosed':
        this.state = 'idle';
        this._onDisconnected?.();
        break;
      case 'spectatorUpdate':
        break; // no-op in client lobby (count not displayed here)
    }
  }

  private handleJoinResponse(msg: LobbyHostMessage & { type: 'joinResponse' }): void {
    if (msg.accepted) {
      this.state = 'joined';
      this._mySeat = msg.seat;
      this.players = msg.players;
      this._onJoinResult?.({ accepted: true, gameSettings: msg.gameSettings });
    } else {
      this.state = 'idle';
      this._onJoinResult?.({ accepted: false, reason: msg.reason });
    }
  }

  private handleSpectateResponse(msg: LobbyHostMessage & { type: 'spectateResponse' }): void {
    if (msg.accepted) {
      this.state = 'joined'; // reuse joined state for spectators
      this._onSpectateResult?.({ accepted: true, gameSettings: msg.gameSettings });
    } else {
      this.state = 'idle';
      this._onSpectateResult?.({ accepted: false, reason: msg.reason });
    }
  }

  // --- Callbacks ---

  onHostDiscovered(callback: (hostId: string, hostName: string) => void): void {
    this._onHostDiscovered = callback;
  }

  onJoinResult(callback: (result: JoinResult) => void): void {
    this._onJoinResult = callback;
  }

  onSpectateResult(callback: (result: SpectateResult) => void): void {
    this._onSpectateResult = callback;
  }

  onPlayersChanged(callback: (players: LobbyPlayer[]) => void): void {
    this._onPlayersChanged = callback;
  }

  onGameStart(callback: (config: GameStartConfig) => void): void {
    this._onGameStart = callback;
  }

  onDisconnected(callback: () => void): void {
    this._onDisconnected = callback;
  }

  onError(callback: (error: string) => void): void {
    this._onError = callback;
  }

  // --- Helpers ---

  private async sendToHost(msg: LobbyClientMessage): Promise<void> {
    const chunks = this.chunkManager.encode(JSON.stringify(msg));
    for (const chunk of chunks) {
      await this.transport.sendToHost(LOBBY_CHARACTERISTIC, chunk);
    }
  }
}
