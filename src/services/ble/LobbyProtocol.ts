export const PROTOCOL_VERSION = 1;

export type LobbyPlayer = {
  seat: number;
  name: string;
  ready: boolean;
};

export type GameSettings = {
  sb: number;
  bb: number;
  initialChips: number;
};

export type LobbyClientMessage =
  | { type: 'join'; protocolVersion: number; playerName: string }
  | { type: 'ready' }
  | { type: 'spectate'; protocolVersion: number; spectatorName: string };

export type LobbyHostMessage =
  | { type: 'joinResponse'; accepted: true; seat: number; players: LobbyPlayer[]; gameSettings: GameSettings }
  | { type: 'joinResponse'; accepted: false; reason: string }
  | { type: 'playerUpdate'; players: LobbyPlayer[] }
  | { type: 'gameStart'; blinds: { sb: number; bb: number }; initialChips: number }
  | { type: 'lobbyClosed'; reason: string }
  | { type: 'spectateResponse'; accepted: true; spectatorId: number; players: LobbyPlayer[]; gameSettings: GameSettings }
  | { type: 'spectateResponse'; accepted: false; reason: string }
  | { type: 'spectatorUpdate'; spectatorCount: number };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateClientMessage(data: unknown): LobbyClientMessage | null {
  if (!isObject(data)) return null;

  switch (data.type) {
    case 'join':
      if (data.protocolVersion !== PROTOCOL_VERSION) return null;
      if (typeof data.playerName !== 'string' || data.playerName === '') return null;
      return { type: 'join', protocolVersion: PROTOCOL_VERSION, playerName: data.playerName };
    case 'ready':
      return { type: 'ready' };
    case 'spectate':
      if (data.protocolVersion !== PROTOCOL_VERSION) return null;
      if (typeof data.spectatorName !== 'string' || data.spectatorName === '') return null;
      return { type: 'spectate', protocolVersion: PROTOCOL_VERSION, spectatorName: data.spectatorName as string };
    default:
      return null;
  }
}

function isLobbyPlayerArray(value: unknown): value is LobbyPlayer[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (p) =>
      isObject(p) &&
      typeof p.seat === 'number' &&
      typeof p.name === 'string' &&
      typeof p.ready === 'boolean',
  );
}

function isValidBlinds(value: unknown): value is { sb: number; bb: number } {
  return isObject(value) && typeof value.sb === 'number' && typeof value.bb === 'number';
}

function isValidGameSettings(value: unknown): value is GameSettings {
  return (
    isObject(value) &&
    typeof value.sb === 'number' &&
    typeof value.bb === 'number' &&
    typeof value.initialChips === 'number'
  );
}

export function validateHostMessage(data: unknown): LobbyHostMessage | null {
  if (!isObject(data)) return null;

  switch (data.type) {
    case 'joinResponse':
      if (data.accepted === true) {
        if (typeof data.seat !== 'number') return null;
        if (!isLobbyPlayerArray(data.players)) return null;
        if (!isValidGameSettings(data.gameSettings)) return null;
        return {
          type: 'joinResponse',
          accepted: true,
          seat: data.seat,
          players: data.players,
          gameSettings: data.gameSettings,
        };
      }
      if (data.accepted === false) {
        if (typeof data.reason !== 'string') return null;
        return { type: 'joinResponse', accepted: false, reason: data.reason };
      }
      return null;
    case 'playerUpdate':
      if (!isLobbyPlayerArray(data.players)) return null;
      return { type: 'playerUpdate', players: data.players };
    case 'gameStart':
      if (!isValidBlinds(data.blinds)) return null;
      if (typeof data.initialChips !== 'number') return null;
      return {
        type: 'gameStart',
        blinds: data.blinds as { sb: number; bb: number },
        initialChips: data.initialChips as number,
      };
    case 'lobbyClosed':
      if (typeof data.reason !== 'string') return null;
      return { type: 'lobbyClosed', reason: data.reason };
    case 'spectateResponse':
      if (data.accepted === true) {
        if (typeof data.spectatorId !== 'number') return null;
        if (!isLobbyPlayerArray(data.players)) return null;
        if (!isValidGameSettings(data.gameSettings)) return null;
        return {
          type: 'spectateResponse',
          accepted: true,
          spectatorId: data.spectatorId as number,
          players: data.players as LobbyPlayer[],
          gameSettings: data.gameSettings as GameSettings,
        };
      }
      if (data.accepted === false) {
        if (typeof data.reason !== 'string') return null;
        return { type: 'spectateResponse', accepted: false, reason: data.reason as string };
      }
      return null;
    case 'spectatorUpdate':
      if (typeof data.spectatorCount !== 'number') return null;
      return { type: 'spectatorUpdate', spectatorCount: data.spectatorCount as number };
    default:
      return null;
  }
}
