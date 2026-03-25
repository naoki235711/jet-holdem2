import { estimateEquity } from '../../src/bot/equity/equityCalculator';

describe('estimateEquity', () => {
  it('returns 1.0 when numOpponents is 0', () => {
    expect(estimateEquity(['Ah', 'Ad'], [], 0)).toBe(1.0);
  });

  it('AA vs 1 opponent on flop has equity > 0.75', () => {
    const equity = estimateEquity(['Ah', 'Ad'], ['2c', '7h', 'Ks'], 1, 1000);
    expect(equity).toBeGreaterThan(0.75);
  });

  it('72o vs 1 opponent on AKQ flop has equity < 0.40', () => {
    const equity = estimateEquity(['7h', '2d'], ['As', 'Kc', 'Qd'], 1, 1000);
    expect(equity).toBeLessThan(0.40);
  });

  it('Royal Flush on river (5 community cards) has equity === 1.0', () => {
    // Ah Kh + Qh Jh Th 5d 8c → Royal Flush; Th excluded from deck so no opponent can beat it
    const equity = estimateEquity(['Ah', 'Kh'], ['Qh', 'Jh', 'Th', '5d', '8c'], 1, 100);
    expect(equity).toBe(1.0);
  });

  it('returns value between 0 and 1', () => {
    const equity = estimateEquity(['Th', 'Ts'], ['2c', '5h', '9d'], 2, 200);
    expect(equity).toBeGreaterThanOrEqual(0);
    expect(equity).toBeLessThanOrEqual(1);
  });

  it('standard deviation across 5 runs (n=1000) is below 0.025', () => {
    const results = Array.from({ length: 5 }, () =>
      estimateEquity(['Ah', 'Kh'], ['2c', '7d', 'Ts'], 1, 1000)
    );
    const mean = results.reduce((a, b) => a + b) / results.length;
    const variance = results.reduce((s, r) => s + (r - mean) ** 2, 0) / results.length;
    expect(Math.sqrt(variance)).toBeLessThan(0.025);
  });
});
