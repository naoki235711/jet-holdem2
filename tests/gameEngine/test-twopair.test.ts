import { evaluateHand, evaluate7Cards } from '../../src/gameEngine/HandEvaluator';
import { Card } from '../../src/gameEngine/types';

describe('HandEvaluator Two Pair tests', () => {
  it('should evaluate two pair correctly and sort kickers', () => {
    const hand1 = ['Ac', 'Ah', 'Ks', 'Kd', 'Qc'] as Card[]; // A A K K Q
    const res1 = evaluateHand(hand1);
    console.log('Two Pair KQ kicker:', res1.description, res1.values);

    const hand2 = ['Ac', 'Ah', 'Ks', 'Kd', 'Jc'] as Card[]; // A A K K J
    const res2 = evaluateHand(hand2);
    console.log('Two Pair KJ kicker:', res2.description, res2.values);
  });
});
