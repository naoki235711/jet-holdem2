import { evaluate7Cards } from '../../src/gameEngine/HandEvaluator';
import { Card, allCards } from '../../src/gameEngine/Card';

const c = allCards();
for (let i = 0; i < 10000; i++) {
  // pick 7 random cards
  const deck = [...c];
  const hand: Card[] = [];
  for (let j = 0; j < 7; j++) {
    const idx = Math.floor(Math.random() * deck.length);
    hand.push(deck.splice(idx, 1)[0]);
  }
  const result = evaluate7Cards(hand);
  // Optional: check structural correctness
}
console.log("Done");
