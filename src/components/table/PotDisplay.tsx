// src/components/table/PotDisplay.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { Colors } from '../../theme/colors';

export function PotDisplay() {
  const { state } = useGame();
  if (!state || state.pots.length === 0) return null;

  const total = state.pots.reduce((sum, p) => sum + p.amount, 0);
  if (total === 0) return null;

  const bbCount = Math.floor(total / state.blinds.bb);

  return (
    <View testID="pot-display" style={styles.container}>
      <Text style={styles.amount}>{total.toLocaleString('en-US')}</Text>
      <Text style={styles.bb}>{bbCount} BB</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  amount: { color: Colors.text, fontSize: 18, fontWeight: 'bold' },
  bb: { color: Colors.subText, fontSize: 12 },
});
