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

    it('accepts a valid spectate message', () => {
      const msg = { type: 'spectate', protocolVersion: 1, spectatorName: 'Watcher' };
      const result = validateClientMessage(msg);
      expect(result).toEqual({ type: 'spectate', protocolVersion: 1, spectatorName: 'Watcher' });
    });

    it('rejects spectate with wrong protocolVersion', () => {
      const msg = { type: 'spectate', protocolVersion: 99, spectatorName: 'Watcher' };
      expect(validateClientMessage(msg)).toBeNull();
    });

    it('rejects spectate with empty spectatorName', () => {
      const msg = { type: 'spectate', protocolVersion: 1, spectatorName: '' };
      expect(validateClientMessage(msg)).toBeNull();
    });
  });

  describe('validateHostMessage', () => {
    const players: LobbyPlayer[] = [
      { seat: 0, name: 'Host', ready: true },
      { seat: 1, name: 'Alice', ready: false },
    ];

    it('accepts a valid joinResponse (accepted)', () => {
      const msg = {
        type: 'joinResponse',
        accepted: true,
        seat: 1,
        players,
        gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
      };
      expect(validateHostMessage(msg)).not.toBeNull();
      expect(validateHostMessage(msg)!.type).toBe('joinResponse');
    });

    it('accepts a valid joinResponse (rejected)', () => {
      const msg = { type: 'joinResponse', accepted: false, reason: 'Room full' };
      expect(validateHostMessage(msg)).toEqual(msg);
    });

    it('accepts a valid playerUpdate', () => {
      const msg = { type: 'playerUpdate', players };
      expect(validateHostMessage(msg)).toEqual(msg);
    });

    it('accepts a valid gameStart', () => {
      const msg = { type: 'gameStart', blinds: { sb: 5, bb: 10 }, initialChips: 1000 };
      expect(validateHostMessage(msg)).toEqual(msg);
    });

    it('accepts a valid lobbyClosed', () => {
      const msg = { type: 'lobbyClosed', reason: 'Host left' };
      expect(validateHostMessage(msg)).toEqual(msg);
    });

    it('rejects null input', () => {
      expect(validateHostMessage(null)).toBeNull();
    });

    it('rejects unknown type', () => {
      expect(validateHostMessage({ type: 'unknown' })).toBeNull();
    });

    it('rejects joinResponse accepted=true without seat', () => {
      const msg = { type: 'joinResponse', accepted: true, players };
      expect(validateHostMessage(msg)).toBeNull();
    });

    it('rejects joinResponse accepted=true without players', () => {
      const msg = { type: 'joinResponse', accepted: true, seat: 1 };
      expect(validateHostMessage(msg)).toBeNull();
    });

    it('rejects joinResponse accepted=false without reason', () => {
      const msg = { type: 'joinResponse', accepted: false };
      expect(validateHostMessage(msg)).toBeNull();
    });

    it('rejects playerUpdate without players array', () => {
      expect(validateHostMessage({ type: 'playerUpdate' })).toBeNull();
    });

    it('rejects gameStart without blinds', () => {
      expect(validateHostMessage({ type: 'gameStart' })).toBeNull();
    });

    it('rejects gameStart with incomplete blinds', () => {
      expect(validateHostMessage({ type: 'gameStart', blinds: { sb: 5 } })).toBeNull();
    });

    it('rejects lobbyClosed without reason', () => {
      expect(validateHostMessage({ type: 'lobbyClosed' })).toBeNull();
    });

    it('validates joinResponse with gameSettings', () => {
      const msg = validateHostMessage({
        type: 'joinResponse',
        accepted: true,
        seat: 1,
        players: [{ seat: 0, name: 'Host', ready: true }],
        gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
      });
      expect(msg).toEqual({
        type: 'joinResponse',
        accepted: true,
        seat: 1,
        players: [{ seat: 0, name: 'Host', ready: true }],
        gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
      });
    });

    it('rejects joinResponse (accepted) without gameSettings', () => {
      const msg = validateHostMessage({
        type: 'joinResponse',
        accepted: true,
        seat: 1,
        players: [{ seat: 0, name: 'Host', ready: true }],
      });
      expect(msg).toBeNull();
    });

    it('rejects joinResponse with invalid gameSettings', () => {
      const msg = validateHostMessage({
        type: 'joinResponse',
        accepted: true,
        seat: 1,
        players: [{ seat: 0, name: 'Host', ready: true }],
        gameSettings: { sb: 5, bb: 10 }, // missing initialChips
      });
      expect(msg).toBeNull();
    });

    it('validates gameStart with initialChips', () => {
      const msg = validateHostMessage({
        type: 'gameStart',
        blinds: { sb: 5, bb: 10 },
        initialChips: 1000,
      });
      expect(msg).toEqual({
        type: 'gameStart',
        blinds: { sb: 5, bb: 10 },
        initialChips: 1000,
      });
    });

    it('rejects gameStart without initialChips', () => {
      const msg = validateHostMessage({
        type: 'gameStart',
        blinds: { sb: 5, bb: 10 },
      });
      expect(msg).toBeNull();
    });

    it('accepts spectateResponse (accepted)', () => {
      const msg = {
        type: 'spectateResponse',
        accepted: true,
        spectatorId: 0,
        players: [{ seat: 0, name: 'Host', ready: true }],
        gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
      };
      const result = validateHostMessage(msg);
      expect(result).toMatchObject({ type: 'spectateResponse', accepted: true, spectatorId: 0 });
    });

    it('accepts spectateResponse (rejected)', () => {
      const msg = { type: 'spectateResponse', accepted: false, reason: 'Full' };
      const result = validateHostMessage(msg);
      expect(result).toEqual({ type: 'spectateResponse', accepted: false, reason: 'Full' });
    });

    it('accepts spectatorUpdate', () => {
      const msg = { type: 'spectatorUpdate', spectatorCount: 2 };
      const result = validateHostMessage(msg);
      expect(result).toEqual({ type: 'spectatorUpdate', spectatorCount: 2 });
    });
  });
});
