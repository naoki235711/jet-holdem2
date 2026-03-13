import { rankValue, parseCard, allCards, compareValues, cardRankValue } from '../../src/gameEngine/Card';
import { Card } from '../../src/gameEngine/types';

describe('Card', () => {
  describe('rankValue', () => {
    it('returns 2 for rank 2', () => {
      expect(rankValue('2')).toBe(2);
    });

    it('returns 14 for Ace', () => {
      expect(rankValue('A')).toBe(14);
    });

    it('returns 10 for T', () => {
      expect(rankValue('T')).toBe(10);
    });

    it('returns 13 for King', () => {
      expect(rankValue('K')).toBe(13);
    });
  });

  describe('parseCard', () => {
    it('parses Ah to rank A, suit h', () => {
      expect(parseCard('Ah')).toEqual({ rank: 'A', suit: 'h' });
    });

    it('parses Td to rank T, suit d', () => {
      expect(parseCard('Td')).toEqual({ rank: 'T', suit: 'd' });
    });
  });

  describe('allCards', () => {
    it('returns 52 unique cards', () => {
      const cards = allCards();
      expect(cards).toHaveLength(52);
      expect(new Set(cards).size).toBe(52);
    });
  });

  describe('compareValues', () => {
    it('returns positive when first is higher', () => {
      expect(compareValues([9, 14], [9, 13])).toBeGreaterThan(0);
    });

    it('returns negative when first is lower', () => {
      expect(compareValues([5], [6])).toBeLessThan(0);
    });

    it('returns 0 for equal values', () => {
      expect(compareValues([9, 14, 13], [9, 14, 13])).toBe(0);
    });
  });

  describe('cardRankValue', () => {
    it('returns numeric rank value for a card string', () => {
      expect(cardRankValue('Ah')).toBe(14);
      expect(cardRankValue('2s')).toBe(2);
      expect(cardRankValue('Td')).toBe(10);
      expect(cardRankValue('Kc')).toBe(13);
    });
  });
});
