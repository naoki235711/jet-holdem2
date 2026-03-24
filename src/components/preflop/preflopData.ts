// src/components/preflop/preflopData.ts

export const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'] as const;
export type Rank = typeof RANKS[number];

// エンコーディング: tens digit = group (1–7), units digit = freqTier (1=100%, 2=75–99%, 3=50–74%)
// 0 = fold
// 上三角 (row < col) = suited, 対角 = ペア, 下三角 (row > col) = offsuit
export const MATRIX: number[][] = [
//   A    K    Q    J    T    9    8    7    6    5    4    3    2
  [ 11,  11,  11,  21,  21,  32,  42,  42,  41,  33,  41,  42,  51], // A
  [ 11,  11,  21,  21,  32,  41,  51,  51,  53,  61,  61,  61,  71], // K
  [ 21,  33,  11,  21,  31,  41,  52,  61,  61,  71,  71,  71,   0], // Q
  [ 31,  31,  41,  21,  21,  32,  52,  61,  71,  71,   0,   0,   0], // J
  [ 41,  41,  41,  42,  21,  31,  42,  51,  61,   0,   0,   0,   0], // T
  [ 51,  51,  51,  51,  51,  31,  42,  51,  61,  71,   0,   0,   0], // 9
  [ 61,  61,  61,  62,  61,  63,  31,  41,  51,  61,   0,   0,   0], // 8
  [ 61,  71,  72,  71,  71,  71,  61,  41,  51,  61,  71,   0,   0], // 7
  [ 71,  71,   0,   0,   0,  71,  71,  61,  41,  51,  61,  71,   0], // 6
  [ 71,   0,   0,   0,   0,   0,   0,  71,  61,  51,  61,  71,   0], // 5
  [ 71,   0,   0,   0,   0,   0,   0,   0,  71,  71,  51,  61,  71], // 4
  [  0,   0,   0,   0,   0,   0,   0,   0,   0,  71,  71,  61,  71], // 3
  [  0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  71,  71], // 2
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
  1: '8人・強ハンド',
  2: '後ろに8人 (UTG)',
  3: '後ろに6,7人 (UTG+1/+2)',
  4: '後ろに4,5人 (HJ/LJ)',
  5: '後ろに3人 (CO)',
  6: '後ろに2人 (BTN)',
  7: '後ろに1人 (SB)',
};

export const FOLD_COLOR = '#1E293B';

export const getGroup = (v: number): number => Math.floor(v / 10);
export const getFreqTier = (v: number): number => v % 10;
