// src/components/common/ChipAmount.tsx

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface ChipAmountProps {
  amount: number;
  color?: string;
  fontSize?: number;
  testID?: string;
}

export function ChipAmount({ amount, color = Colors.text, fontSize = 14, testID }: ChipAmountProps) {
  const formatted = amount.toLocaleString('en-US');
  return <Text testID={testID} style={[styles.text, { color, fontSize }]}>{formatted}</Text>;
}

const styles = StyleSheet.create({
  text: { fontWeight: 'bold' },
});
