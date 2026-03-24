// src/components/preflop/preflopData.ts

export const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'] as const;
export type Rank = typeof RANKS[number];

// エンコーディング: tens digit = group (1–7), units digit = freqTier (1=100%, 2=75–99%, 3=50–74%)
// 0 = fold
// 上三角 (row < col) = suited, 対角 = ペア, 下三角 (row > col) = offsuit
export const MATRIX: number[][] = [
//   A    K    Q    J    T    9    8    7    6    5    4    3    2
  [ 11,  11,  11,  21,  21,  22,  32,  42,  41,  43,  41,  42,  51], // A
  [ 11,  11,  21,  21,  22,  41,  61,  62,  63,  71,  71,  71,  71], // K
  [ 21,  23,  11,  31,  31,  42,  62,  71,  71,  71,  71,  71,  71], // Q
  [ 21,  41,  51,  21,  31,  42,  62,  71,  71,  71,   0,   0,   0], // J
  [ 32,  51,  61,  62,  21,  41,  62,  71,  71,   0,   0,   0,   0], // T
  [ 33,  71,  71,  71,  71,  21,  62,  71,  71,   0,   0,   0,   0], // 9
  [ 51,  71,  71,  72,  71,  72,  21,  71,  71,   0,   0,   0,   0], // 8
  [ 51,  71,  72,   0,   0,   0,   0,  33,  71,  71,   0,   0,   0], // 7
  [ 61,  71,   0,   0,   0,   0,   0,   0,  31,  71,   0,   0,   0], // 6
  [ 61,  71,   0,   0,   0,   0,   0,   0,   0,  41,  71,   0,   0], // 5
  [ 61,  71,   0,   0,   0,   0,   0,   0,   0,   0,  41,   0,   0], // 4
  [ 61,  71,   0,   0,   0,   0,   0,   0,   0,   0,   0,  43,   0], // 3
  [ 61,  71,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  51], // 2
];

export const GROUP_COLORS: Record<number, string> = {
  1: '#B91C1C',
  2: '#DC6B20',
  3: '#CA8A04',
  4: '#16A34A',
  5: '#0D9488',
  6: '#3B82F6',
  7: '#7C3AED',
};

export const GROUP_LABELS: Record<number, string> = {
  1: 'UTG Strong (後ろに8人 premium)',
  2: 'UTG (後ろに8人)',
  3: 'UTG1+UTG2 (後ろに6・7人)',
  4: 'LJ+HJ (後ろに4・5人)',
  5: 'CO (後ろに3人)',
  6: 'BTN (後ろに2人)',
  7: 'SB (後ろに1人)',
};

export const FOLD_COLOR = '#1E293B';

export const getGroup = (v: number): number => Math.floor(v / 10);
export const getFreqTier = (v: number): number => v % 10;
