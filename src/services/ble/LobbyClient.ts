import { BleClientTransport } from './BleTransport';
import { ChunkManager } from './ChunkManager';
import {
  LobbyPlayer,
  LobbyClientMessage,
  LobbyHostMessage,
  validateHostMessage,
  PROTOCOL_VERSION,
} from './LobbyProtocol';

const LOBBY_CHARACTERISTIC = 'lobby';

type LobbyClientState = 'idle' | 'scanning' | 'connecting' | 'joined' | 'ready' | 'gameStarting';

export class LobbyClient {
  private state: LobbyClientState = 'idle';
  private mySeat: number | null = null;
  private players: LobbyPlayer[] = [];
  private chunkManager = new ChunkManager();

  private _onHostDiscovered: ((hostId: string, hostName: string) => void) | null = null;
  private _onJoinResult: ((accepted: boolean, reason?: string) => void) | null = null;
  private _onPlayersChanged: ((players: LobbyPlayer[]) => void) | null = null;
  private _onGameStart: ((blinds: { sb: number; bb: number }) => void) | null = null;
  private _onDisconnected: (() => void) | null = null;
  private _onError: ((error: string) => void) | null = null;

  constructor(
    private transport: BleClientTransport,
    private playerName: string,
  ) {}

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

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this.state = 'idle';
    this.mySeat = null;
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
      case 'playerUpdate':
        this.players = msg.players;
        this._onPlayersChanged?.(msg.players);
        break;
      case 'gameStart':
        this.state = 'gameStarting';
        this._onGameStart?.(msg.blinds);
        break;
      case 'lobbyClosed':
        this.state = 'idle';
        this._onDisconnected?.();
        break;
    }
  }

  private handleJoinResponse(msg: LobbyHostMessage & { type: 'joinResponse' }): void {
    if (msg.accepted) {
      this.state = 'joined';
      this.mySeat = msg.seat;
      this.players = msg.players;
      this._onJoinResult?.(true, undefined);
    } else {
      this.state = 'idle';
      this._onJoinResult?.(false, msg.reason);
    }
  }

  // --- Callbacks ---

  onHostDiscovered(callback: (hostId: string, hostName: string) => void): void {
    this._onHostDiscovered = callback;
  }

  onJoinResult(callback: (accepted: boolean, reason?: string) => void): void {
    this._onJoinResult = callback;
  }

  onPlayersChanged(callback: (players: LobbyPlayer[]) => void): void {
    this._onPlayersChanged = callback;
  }

  onGameStart(callback: (blinds: { sb: number; bb: number }) => void): void {
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
