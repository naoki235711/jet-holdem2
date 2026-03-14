export type { BleHostTransport, BleClientTransport } from './BleTransport';
export {
  PROTOCOL_VERSION,
  validateClientMessage,
  validateHostMessage,
} from './LobbyProtocol';
export type {
  LobbyPlayer,
  LobbyClientMessage,
  LobbyHostMessage,
} from './LobbyProtocol';
export { ChunkManager } from './ChunkManager';
export { LobbyHost } from './LobbyHost';
export { LobbyClient } from './LobbyClient';
// MockBleTransport classes are test-only — import directly from './MockBleTransport' in tests
