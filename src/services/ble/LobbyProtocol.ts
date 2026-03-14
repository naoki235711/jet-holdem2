export const PROTOCOL_VERSION = 1;

export type LobbyPlayer = {
  seat: number;
  name: string;
  ready: boolean;
};

export type LobbyClientMessage =
  | { type: 'join'; protocolVersion: number; playerName: string }
  | { type: 'ready' };

export type LobbyHostMessage =
  | { type: 'joinResponse'; accepted: true; seat: number; players: LobbyPlayer[] }
  | { type: 'joinResponse'; accepted: false; reason: string }
  | { type: 'playerUpdate'; players: LobbyPlayer[] }
  | { type: 'gameStart'; blinds: { sb: number; bb: number } }
  | { type: 'lobbyClosed'; reason: string };

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

export function validateHostMessage(data: unknown): LobbyHostMessage | null {
  if (!isObject(data)) return null;

  switch (data.type) {
    case 'joinResponse':
      if (data.accepted === true) {
        if (typeof data.seat !== 'number') return null;
        if (!isLobbyPlayerArray(data.players)) return null;
        return {
          type: 'joinResponse',
          accepted: true,
          seat: data.seat,
          players: data.players,
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
      return { type: 'gameStart', blinds: data.blinds as { sb: number; bb: number } };
    case 'lobbyClosed':
      if (typeof data.reason !== 'string') return null;
      return { type: 'lobbyClosed', reason: data.reason };
    default:
      return null;
  }
}
