import { evaluateHand, evaluate7Cards, compareHands } from '../../src/gameEngine/HandEvaluator';
import { Card, HandRank } from '../../src/gameEngine/types';

describe('HandEvaluator', () => {
  describe('evaluateHand (5 cards)', () => {
    it('detects Royal Flush', () => {
      const cards: Card[] = ['Ah', 'Kh', 'Qh', 'Jh', 'Th'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.RoyalFlush);
    });

    it('detects Straight Flush', () => {
      const cards: Card[] = ['9s', '8s', '7s', '6s', '5s'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.StraightFlush);
    });

    it('detects Four of a Kind', () => {
      const cards: Card[] = ['Kh', 'Kd', 'Ks', 'Kc', '3h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.FourOfAKind);
    });

    it('detects Full House', () => {
      const cards: Card[] = ['Kh', 'Kd', 'Ks', '7c', '7h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.FullHouse);
      expect(result.description).toBe('Full House, Kings over Sevens');
    });

    it('detects Flush', () => {
      const cards: Card[] = ['Ah', '9h', '7h', '4h', '2h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.Flush);
    });

    it('detects Straight', () => {
      const cards: Card[] = ['9h', '8d', '7s', '6c', '5h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.Straight);
    });

    it('detects Ace-low Straight (wheel)', () => {
      const cards: Card[] = ['Ah', '2d', '3s', '4c', '5h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.Straight);
      // Ace-low straight: value should be 5 (highest card in the straight)
      expect(result.values[1]).toBe(5);
    });

    it('detects Three of a Kind', () => {
      const cards: Card[] = ['Jh', 'Jd', 'Js', '8c', '3h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.ThreeOfAKind);
    });

    it('detects Two Pair', () => {
      const cards: Card[] = ['Kh', 'Kd', '7s', '7c', '3h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.TwoPair);
    });

    it('detects One Pair', () => {
      const cards: Card[] = ['Ah', 'Ad', '9s', '7c', '3h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.OnePair);
    });

    it('detects High Card', () => {
      const cards: Card[] = ['Ah', 'Jd', '9s', '7c', '3h'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.HighCard);
    });

    it('Ace-low straight flush', () => {
      const cards: Card[] = ['Ac', '2c', '3c', '4c', '5c'];
      const result = evaluateHand(cards);
      expect(result.rank).toBe(HandRank.StraightFlush);
    });
  });

  describe('kicker comparison', () => {
    it('higher kicker wins in One Pair', () => {
      const hand1 = evaluateHand(['Ah', 'Ad', 'Ks', '7c', '3h'] as Card[]);
      const hand2 = evaluateHand(['Ah', 'Ad', 'Qs', '7c', '3h'] as Card[]);
      // hand1 has K kicker, hand2 has Q kicker
      expect(compareHands(hand1, hand2)).toBeGreaterThan(0);
    });

    it('same hand with same kickers is a tie', () => {
      const hand1 = evaluateHand(['Ah', 'Ad', 'Ks', '7c', '3h'] as Card[]);
      const hand2 = evaluateHand(['As', 'Ac', 'Kd', '7h', '3d'] as Card[]);
      expect(compareHands(hand1, hand2)).toBe(0);
    });
  });

  describe('evaluate7Cards', () => {
    it('finds best 5 from 7 cards', () => {
      // 7 cards contain a flush in hearts
      const cards: Card[] = ['Ah', 'Kh', '9h', '7h', '2h', 'Qs', '3d'];
      const result = evaluate7Cards(cards);
      expect(result.rank).toBe(HandRank.Flush);
    });

    it('finds hidden straight in 7 cards', () => {
      const cards: Card[] = ['9h', '8d', '7s', '6c', '5h', 'Kd', '2s'];
      const result = evaluate7Cards(cards);
      expect(result.rank).toBe(HandRank.Straight);
      expect(result.values[1]).toBe(9);
    });

    it('prefers full house over two pair in 7 cards', () => {
      // KKK77 is in there plus extra cards
      const cards: Card[] = ['Kh', 'Kd', 'Ks', '7c', '7h', '3d', '2s'];
      const result = evaluate7Cards(cards);
      expect(result.rank).toBe(HandRank.FullHouse);
    });

    it('finds best full house when two are possible', () => {
      // Cards: KKK 77 33 — best is KKK over 77
      const cards: Card[] = ['Kh', 'Kd', 'Ks', '7c', '7h', '3d', '3s'];
      const result = evaluate7Cards(cards);
      expect(result.rank).toBe(HandRank.FullHouse);
      expect(result.description).toBe('Full House, Kings over Sevens');
    });
  });

  describe('compareHands', () => {
    it('flush beats straight', () => {
      const flush = evaluateHand(['Ah', '9h', '7h', '4h', '2h'] as Card[]);
      const straight = evaluateHand(['9h', '8d', '7s', '6c', '5h'] as Card[]);
      expect(compareHands(flush, straight)).toBeGreaterThan(0);
    });

    it('higher pair beats lower pair', () => {
      const aces = evaluateHand(['Ah', 'Ad', '9s', '7c', '3h'] as Card[]);
      const kings = evaluateHand(['Kh', 'Kd', '9s', '7c', '3h'] as Card[]);
      expect(compareHands(aces, kings)).toBeGreaterThan(0);
    });

    it('returns 0 for equivalent hands', () => {
      const hand1 = evaluateHand(['Ah', 'Kd', '9s', '7c', '3h'] as Card[]);
      const hand2 = evaluateHand(['As', 'Kc', '9d', '7h', '3d'] as Card[]);
      expect(compareHands(hand1, hand2)).toBe(0);
    });
  });
});
