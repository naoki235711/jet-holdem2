export type { BleHostTransport, BleClientTransport } from './BleTransport';
export {
  BLE_SERVICE_UUID,
  LOBBY_CHARACTERISTIC_UUID,
  GAME_STATE_CHARACTERISTIC_UUID,
  PRIVATE_HAND_CHARACTERISTIC_UUID,
  PLAYER_ACTION_CHARACTERISTIC_UUID,
  createCharacteristicMap,
} from './bleConstants';
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
export { BleClientTransportImpl } from './BleClientTransportImpl';
export { BleHostTransportImpl } from './BleHostTransportImpl';
export {
  GAME_PROTOCOL_VERSION,
  validateGameHostMessage,
  validatePrivateHandMessage,
  validateGameClientMessage,
} from './GameProtocol';
export type {
  GameStatePlayer,
  GameHostMessage,
  PrivateHandMessage,
  GameClientMessage,
} from './GameProtocol';
export { BleHostGameService } from './BleHostGameService';
export { BleClientGameService } from './BleClientGameService';
export {
  setHostTransport,
  getHostTransport,
  clearHostTransport,
  setClientTransport,
  getClientTransport,
  clearClientTransport,
} from './transportRegistry';
// MockBleTransport classes are test-only — import directly from './MockBleTransport' in tests
