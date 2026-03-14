import {
  validateGameHostMessage,
  validatePrivateHandMessage,
  validateGameClientMessage,
  GAME_PROTOCOL_VERSION,
} from '../../src/services/ble/GameProtocol';

describe('GameProtocol', () => {
  describe('validateGameHostMessage', () => {
    const validStateUpdate = {
      type: 'stateUpdate',
      seq: 1,
      phase: 'preflop',
      community: [],
      pots: [{ amount: 15, eligible: [0, 1, 2] }],
      currentBet: 10,
      activePlayer: 2,
      dealer: 0,
      blinds: { sb: 5, bb: 10 },
      players: [
        { seat: 0, name: 'Alice', chips: 995, status: 'active', bet: 5, cards: [] },
        { seat: 1, name: 'Bob', chips: 990, status: 'active', bet: 10, cards: [] },
        { seat: 2, name: 'Carol', chips: 1000, status: 'active', bet: 0, cards: [] },
      ],
      minRaiseSize: 10,
      frozenSeats: [],
    };

    it('accepts valid stateUpdate', () => {
      expect(validateGameHostMessage(validStateUpdate)).toEqual(validStateUpdate);
    });

    it('accepts stateUpdate with foldWin', () => {
      const msg = { ...validStateUpdate, foldWin: { seat: 0, amount: 30 } };
      expect(validateGameHostMessage(msg)).toEqual(msg);
    });

    it('rejects non-object', () => {
      expect(validateGameHostMessage(null)).toBeNull();
      expect(validateGameHostMessage('string')).toBeNull();
      expect(validateGameHostMessage(42)).toBeNull();
    });

    it('rejects unknown type', () => {
      expect(validateGameHostMessage({ type: 'unknown' })).toBeNull();
    });

    it('rejects stateUpdate missing seq', () => {
      const { seq, ...rest } = validStateUpdate;
      expect(validateGameHostMessage(rest)).toBeNull();
    });

    it('rejects stateUpdate with invalid phase', () => {
      expect(validateGameHostMessage({ ...validStateUpdate, phase: 'invalid' })).toBeNull();
    });

    it('rejects stateUpdate with invalid players array', () => {
      expect(validateGameHostMessage({ ...validStateUpdate, players: 'not-array' })).toBeNull();
    });

    it('rejects stateUpdate with invalid player object', () => {
      expect(validateGameHostMessage({
        ...validStateUpdate,
        players: [{ seat: 'not-number' }],
      })).toBeNull();
    });

    const validShowdown = {
      type: 'showdownResult',
      seq: 1,
      winners: [{ seat: 0, hand: 'Two Pair', potAmount: 30 }],
      hands: [{ seat: 0, cards: ['Ah', 'Kh'], description: 'Two Pair' }],
    };

    it('accepts valid showdownResult', () => {
      expect(validateGameHostMessage(validShowdown)).toEqual(validShowdown);
    });

    it('rejects showdownResult missing winners', () => {
      const { winners, ...rest } = validShowdown;
      expect(validateGameHostMessage(rest)).toBeNull();
    });

    const validRoundEnd = { type: 'roundEnd', seq: 1 };

    it('accepts valid roundEnd', () => {
      expect(validateGameHostMessage(validRoundEnd)).toEqual(validRoundEnd);
    });

    it('rejects roundEnd missing seq', () => {
      expect(validateGameHostMessage({ type: 'roundEnd' })).toBeNull();
    });
  });

  describe('validatePrivateHandMessage', () => {
    it('accepts valid privateHand', () => {
      const msg = { type: 'privateHand', seat: 1, cards: ['Ah', 'Kh'] };
      expect(validatePrivateHandMessage(msg)).toEqual(msg);
    });

    it('rejects non-object', () => {
      expect(validatePrivateHandMessage(null)).toBeNull();
    });

    it('rejects wrong type', () => {
      expect(validatePrivateHandMessage({ type: 'other', seat: 1, cards: [] })).toBeNull();
    });

    it('rejects missing seat', () => {
      expect(validatePrivateHandMessage({ type: 'privateHand', cards: ['Ah'] })).toBeNull();
    });

    it('rejects missing cards', () => {
      expect(validatePrivateHandMessage({ type: 'privateHand', seat: 1 })).toBeNull();
    });
  });

  describe('validateGameClientMessage', () => {
    it('accepts valid playerAction (fold)', () => {
      const msg = { type: 'playerAction', action: 'fold' };
      expect(validateGameClientMessage(msg)).toEqual(msg);
    });

    it('accepts valid playerAction (raise with amount)', () => {
      const msg = { type: 'playerAction', action: 'raise', amount: 50 };
      expect(validateGameClientMessage(msg)).toEqual(msg);
    });

    it('rejects invalid action type', () => {
      expect(validateGameClientMessage({ type: 'playerAction', action: 'invalid' })).toBeNull();
    });

    it('rejects playerAction with non-number amount', () => {
      expect(validateGameClientMessage({ type: 'playerAction', action: 'raise', amount: 'fifty' })).toBeNull();
    });

    it('accepts valid rejoin', () => {
      const msg = { type: 'rejoin', seat: 2 };
      expect(validateGameClientMessage(msg)).toEqual(msg);
    });

    it('rejects rejoin with non-number seat', () => {
      expect(validateGameClientMessage({ type: 'rejoin', seat: 'two' })).toBeNull();
    });

    it('rejects non-object', () => {
      expect(validateGameClientMessage(42)).toBeNull();
    });

    it('rejects unknown type', () => {
      expect(validateGameClientMessage({ type: 'unknown' })).toBeNull();
    });
  });
});
