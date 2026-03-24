// src/components/preflop/PreflopGrid.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MATRIX, RANKS, GROUP_COLORS, FOLD_COLOR, getGroup, getFreqTier } from './preflopData';

function cellLabel(row: number, col: number): string {
  const r = RANKS[row];
  const c = RANKS[col];
  if (row === col) return `${r}${c}`;          // pair: AA, KK …
  if (row < col) return `${r}${c}s`;           // suited (upper triangle)
  return `${c}${r}o`;                           // offsuit (lower triangle, higher rank first)
}

function cellBgColor(v: number): string {
  const g = getGroup(v);
  return g === 0 ? FOLD_COLOR : GROUP_COLORS[g];
}

function cellOpacity(v: number): number {
  return getFreqTier(v) === 3 ? 0.6 : 1;
}

export function PreflopGrid() {
  return (
    <View style={styles.grid}>
      {/* Corner */}
      <View style={styles.headerCell} />
      {/* Column headers */}
      {RANKS.map(r => (
        <View key={r} style={styles.headerCell}>
          <Text style={styles.headerText}>{r}</Text>
        </View>
      ))}
      {/* Rows */}
      {MATRIX.map((row, ri) => (
        <React.Fragment key={ri}>
          {/* Row header */}
          <View style={styles.headerCell}>
            <Text style={styles.headerText}>{RANKS[ri]}</Text>
          </View>
          {/* Data cells */}
          {row.map((v, ci) => {
            const tier = getFreqTier(v);
            const showDot = tier === 2 || tier === 3;
            return (
              <View
                key={ci}
                testID={`preflop-cell-${ri}-${ci}`}
                style={[
                  styles.cell,
                  { backgroundColor: cellBgColor(v), opacity: cellOpacity(v) },
                ]}
              >
                <Text style={styles.cellText}>{cellLabel(ri, ci)}</Text>
                {showDot && (
                  <View
                    testID={`preflop-freq-dot-${ri}-${ci}`}
                    style={styles.freqDot}
                  />
                )}
              </View>
            );
          })}
        </React.Fragment>
      ))}
    </View>
  );
}

const CELL = 26;
const GAP = 1;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: (CELL + GAP) * 14,
    gap: GAP,
  },
  headerCell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    color: '#9CA3AF',
    fontSize: 9,
    fontWeight: '600',
  },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
    overflow: 'hidden',
  },
  cellText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  freqDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
});
