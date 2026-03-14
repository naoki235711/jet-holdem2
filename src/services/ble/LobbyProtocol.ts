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

export function validateHostMessage(data: unknown): LobbyHostMessage | null {
  // Stub — implemented in step group B
  if (!isObject(data)) return null;
  return null;
}
