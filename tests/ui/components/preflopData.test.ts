// tests/ui/components/preflopData.test.ts
import {
  MATRIX,
  RANKS,
  GROUP_COLORS,
  GROUP_LABELS,
  getGroup,
  getFreqTier,
} from '../../../src/components/preflop/preflopData';

describe('preflopData', () => {
  describe('getGroup', () => {
    it('extracts tens digit', () => {
      expect(getGroup(11)).toBe(1);
      expect(getGroup(72)).toBe(7);
      expect(getGroup(32)).toBe(3);
    });
    it('returns 0 for fold', () => {
      expect(getGroup(0)).toBe(0);
    });
  });

  describe('getFreqTier', () => {
    it('extracts units digit', () => {
      expect(getFreqTier(11)).toBe(1);
      expect(getFreqTier(32)).toBe(2);
      expect(getFreqTier(33)).toBe(3);
    });
    it('returns 0 for fold', () => {
      expect(getFreqTier(0)).toBe(0);
    });
  });

  describe('MATRIX', () => {
    it('is 13×13', () => {
      expect(MATRIX.length).toBe(13);
      MATRIX.forEach(row => expect(row.length).toBe(13));
    });

    it('all values are 0 or in range 11–73', () => {
      MATRIX.forEach(row =>
        row.forEach(v => {
          expect(v === 0 || (v >= 11 && v <= 73)).toBe(true);
        }),
      );
    });

    it('AA (diagonal 0,0) is group 1 tier 1', () => {
      expect(MATRIX[0][0]).toBe(11);
    });

    it('AKs (upper triangle 0,1) is group 1 tier 1', () => {
      expect(MATRIX[0][1]).toBe(11);
    });

    it('AKo (lower triangle 1,0) is group 1 tier 1', () => {
      expect(MATRIX[1][0]).toBe(11);
    });

    it('A9s (0,5) is group 3 tier 2 (97%)', () => {
      expect(MATRIX[0][5]).toBe(32);
    });

    it('KQo (2,1) is group 3 tier 3 (70%)', () => {
      expect(MATRIX[2][1]).toBe(33);
    });

    it('22 (diagonal 12,12) is group 7 tier 1', () => {
      expect(MATRIX[12][12]).toBe(71);
    });

    it('Q2s (2,12) is fold', () => {
      expect(MATRIX[2][12]).toBe(0);
    });
  });

  describe('GROUP_COLORS', () => {
    it('has entries for groups 1–7', () => {
      for (let g = 1; g <= 7; g++) {
        expect(GROUP_COLORS[g]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe('RANKS', () => {
    it('has 13 ranks starting with A', () => {
      expect(RANKS.length).toBe(13);
      expect(RANKS[0]).toBe('A');
      expect(RANKS[12]).toBe('2');
    });
  });
});
