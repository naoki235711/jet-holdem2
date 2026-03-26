import { evaluateHand, evaluate7Cards, compareHands } from '../../src/gameEngine/HandEvaluator';
import { Card } from '../../src/gameEngine/types';

describe('2 Pair - High Pair Different, Low Pair Same', () => {
  it('correctly compares when high pairs differ but low pairs are the same', () => {
    // QQ88K vs JJ88A without flushes
    const h1 = evaluate7Cards(['Qc', 'Qs', '8d', '8h', 'Kc', '2d', '3h'] as Card[]); // QQ 88 K
    const h2 = evaluate7Cards(['Jc', 'Js', '8s', '8c', 'Ad', '4h', '5d'] as Card[]); // JJ 88 A
    console.log('QQ88K vs JJ88A:', compareHands(h1, h2) > 0 ? 'h1 (QQ88) wins' : 'h2 (JJ88) wins');
    console.log('h1 values:', h1.values);
    console.log('h2 values:', h2.values);
  });
});
