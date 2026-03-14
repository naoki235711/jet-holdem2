import {
  validateClientMessage,
  validateHostMessage,
  LobbyClientMessage,
  LobbyHostMessage,
  LobbyPlayer,
  PROTOCOL_VERSION,
} from '../../src/services/ble/LobbyProtocol';

describe('LobbyProtocol', () => {
  describe('validateClientMessage', () => {
    it('accepts a valid join message', () => {
      const msg = { type: 'join', protocolVersion: 1, playerName: 'Alice' };
      const result = validateClientMessage(msg);
      expect(result).toEqual({ type: 'join', protocolVersion: 1, playerName: 'Alice' });
    });

    it('accepts a valid ready message', () => {
      const msg = { type: 'ready' };
      const result = validateClientMessage(msg);
      expect(result).toEqual({ type: 'ready' });
    });

    it('rejects null input', () => {
      expect(validateClientMessage(null)).toBeNull();
    });

    it('rejects non-object input', () => {
      expect(validateClientMessage('hello')).toBeNull();
    });

    it('rejects unknown message type', () => {
      expect(validateClientMessage({ type: 'unknown' })).toBeNull();
    });

    it('rejects join with wrong protocolVersion', () => {
      const msg = { type: 'join', protocolVersion: 99, playerName: 'Alice' };
      expect(validateClientMessage(msg)).toBeNull();
    });

    it('rejects join with missing playerName', () => {
      const msg = { type: 'join', protocolVersion: 1 };
      expect(validateClientMessage(msg)).toBeNull();
    });

    it('rejects join with empty playerName', () => {
      const msg = { type: 'join', protocolVersion: 1, playerName: '' };
      expect(validateClientMessage(msg)).toBeNull();
    });
  });
});
