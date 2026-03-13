import { Card } from './types';
import { allCards } from './Card';

export class Deck {
  private cards: Card[] = [];

  constructor() {
    this.reset();
  }

  get remaining(): number {
    return this.cards.length;
  }

  reset(): void {
    this.cards = allCards();
    this.shuffle();
  }

  /** Fisher-Yates shuffle */
  private shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(): Card {
    if (this.cards.length === 0) {
      throw new Error('No cards remaining');
    }
    return this.cards.pop()!;
  }

  dealMultiple(count: number): Card[] {
    const result: Card[] = [];
    for (let i = 0; i < count; i++) {
      result.push(this.deal());
    }
    return result;
  }
}
