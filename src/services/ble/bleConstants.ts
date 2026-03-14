// BLE Service UUID (v4, generated via uuidgen)
export const BLE_SERVICE_UUID = '961d16dc-441a-47e5-8bb4-e67d961d6e50';

// Characteristic UUIDs
export const LOBBY_CHARACTERISTIC_UUID = 'ef385a45-273c-4462-865d-9e19170fcd18';
export const GAME_STATE_CHARACTERISTIC_UUID = '80b2dfbd-e3f2-44ab-bf39-db0e8e649778';
export const PRIVATE_HAND_CHARACTERISTIC_UUID = '2e35ce83-9436-4e80-b375-08ffd01af8e7';
export const PLAYER_ACTION_CHARACTERISTIC_UUID = '548039a6-5bf3-4235-a780-01c1cd5510cd';

/**
 * Creates a Map of logical characteristic names to BLE UUIDs.
 * Used by BleClientTransportImpl and BleHostTransportImpl constructors.
 */
export function createCharacteristicMap(): Map<string, string> {
  return new Map([
    ['lobby', LOBBY_CHARACTERISTIC_UUID],
    ['gameState', GAME_STATE_CHARACTERISTIC_UUID],
    ['privateHand', PRIVATE_HAND_CHARACTERISTIC_UUID],
    ['playerAction', PLAYER_ACTION_CHARACTERISTIC_UUID],
  ]);
}
