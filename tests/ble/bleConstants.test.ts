import {
  BLE_SERVICE_UUID,
  LOBBY_CHARACTERISTIC_UUID,
  GAME_STATE_CHARACTERISTIC_UUID,
  PRIVATE_HAND_CHARACTERISTIC_UUID,
  PLAYER_ACTION_CHARACTERISTIC_UUID,
  createCharacteristicMap,
} from '../../src/services/ble/bleConstants';

describe('bleConstants', () => {
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it('exports all required UUIDs as valid v4 UUID strings', () => {
    expect(BLE_SERVICE_UUID).toMatch(UUID_V4_REGEX);
    expect(LOBBY_CHARACTERISTIC_UUID).toMatch(UUID_V4_REGEX);
    expect(GAME_STATE_CHARACTERISTIC_UUID).toMatch(UUID_V4_REGEX);
    expect(PRIVATE_HAND_CHARACTERISTIC_UUID).toMatch(UUID_V4_REGEX);
    expect(PLAYER_ACTION_CHARACTERISTIC_UUID).toMatch(UUID_V4_REGEX);
  });

  it('all UUIDs are unique', () => {
    const uuids = [
      BLE_SERVICE_UUID,
      LOBBY_CHARACTERISTIC_UUID,
      GAME_STATE_CHARACTERISTIC_UUID,
      PRIVATE_HAND_CHARACTERISTIC_UUID,
      PLAYER_ACTION_CHARACTERISTIC_UUID,
    ];
    expect(new Set(uuids).size).toBe(uuids.length);
  });

  describe('createCharacteristicMap', () => {
    it('returns a Map with lobby mapping', () => {
      const map = createCharacteristicMap();
      expect(map.get('lobby')).toBe(LOBBY_CHARACTERISTIC_UUID);
    });

    it('returns a Map with game phase mappings', () => {
      const map = createCharacteristicMap();
      expect(map.get('gameState')).toBe(GAME_STATE_CHARACTERISTIC_UUID);
      expect(map.get('privateHand')).toBe(PRIVATE_HAND_CHARACTERISTIC_UUID);
      expect(map.get('playerAction')).toBe(PLAYER_ACTION_CHARACTERISTIC_UUID);
    });

    it('contains exactly 4 entries', () => {
      const map = createCharacteristicMap();
      expect(map.size).toBe(4);
    });
  });
});
