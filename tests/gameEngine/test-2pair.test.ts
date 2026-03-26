import { evaluateHand, evaluate7Cards, compareHands } from '../../src/gameEngine/HandEvaluator';
import { Card } from '../../src/gameEngine/types';

describe('2 Pair vs 2 Pair', () => {
  it('correctly compares 2 pair vs 2 pair', () => {
    // Basic test
    const h1 = evaluate7Cards(['Ac', 'As', 'Kd', 'Ks', '2h', '3d', '4c'] as Card[]); // AAKK
    const h2 = evaluate7Cards(['Ac', 'As', 'Qd', 'Qs', 'Jh', 'Td', '9c'] as Card[]); // AAQQ
    console.log('1. AAKK vs AAQQ:', compareHands(h1, h2) > 0 ? 'h1 wins' : 'h2 wins', h1.values, h2.values);

    // Same 2 pair, different kicker
    const h3 = evaluate7Cards(['Ac', 'As', 'Kd', 'Ks', 'Jh', '2d', '3c'] as Card[]); // AAKK J
    const h4 = evaluate7Cards(['Ad', 'Ah', 'Kc', 'Kh', 'Td', '9c', '8s'] as Card[]); // AAKK T (no flush)
    console.log('2. AAKK J vs AAKK T:', compareHands(h3, h4) > 0 ? 'h3 wins' : 'h4 wins', h3.values, h4.values);

    // 2 pair where the low pair differentiates
    const h5 = evaluate7Cards(['Ac', 'As', 'Jd', 'Js', '4h', '5d', '6c'] as Card[]); // AAJJ
    const h6 = evaluate7Cards(['Ad', 'Ah', 'Td', 'Ts', 'Kh', 'Qd', '2c'] as Card[]); // AATT
    console.log('3. AAJJ vs AATT:', compareHands(h5, h6) > 0 ? 'h5 wins' : 'h6 wins', h5.values, h6.values);

    // Both have AAKK, tie
    const h7 = evaluate7Cards(['Ac', 'As', 'Kd', 'Ks', 'Jh', '2d', '3c'] as Card[]); // AAKK J
    const h8 = evaluate7Cards(['Ad', 'Ah', 'Kc', 'Kh', 'Jd', '4c', '5s'] as Card[]); // AAKK J
    console.log('4. AAKK J vs AAKK J:', compareHands(h7, h8) === 0 ? 'Tie' : (compareHands(h7, h8) > 0 ? 'h7 wins' : 'h8 wins'), h7.values, h8.values);
  });
});
