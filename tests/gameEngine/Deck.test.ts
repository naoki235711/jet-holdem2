import { Deck } from '../../src/gameEngine/Deck';

describe('Deck', () => {
  let deck: Deck;

  beforeEach(() => {
    deck = new Deck();
  });

  it('starts with 52 cards', () => {
    expect(deck.remaining).toBe(52);
  });

  it('deals one card and decrements remaining', () => {
    const card = deck.deal();
    expect(card).toBeDefined();
    expect(typeof card).toBe('string');
    expect(card).toHaveLength(2);
    expect(deck.remaining).toBe(51);
  });

  it('deals 52 unique cards', () => {
    const dealt: string[] = [];
    for (let i = 0; i < 52; i++) {
      dealt.push(deck.deal());
    }
    expect(new Set(dealt).size).toBe(52);
  });

  it('throws when dealing from empty deck', () => {
    for (let i = 0; i < 52; i++) deck.deal();
    expect(() => deck.deal()).toThrow('No cards remaining');
  });

  it('dealMultiple returns requested number of cards', () => {
    const cards = deck.dealMultiple(5);
    expect(cards).toHaveLength(5);
    expect(deck.remaining).toBe(47);
  });

  it('shuffle produces different order (statistical)', () => {
    const deck1 = new Deck();
    const deck2 = new Deck();
    const cards1 = Array.from({ length: 52 }, () => deck1.deal());
    const cards2 = Array.from({ length: 52 }, () => deck2.deal());
    // Extremely unlikely to be identical after independent shuffles
    const same = cards1.every((c, i) => c === cards2[i]);
    expect(same).toBe(false);
  });

  it('reset restores full deck', () => {
    deck.dealMultiple(10);
    deck.reset();
    expect(deck.remaining).toBe(52);
  });
});
