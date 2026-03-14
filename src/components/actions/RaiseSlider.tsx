// src/components/actions/RaiseSlider.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { Colors } from '../../theme/colors';

interface RaiseSliderProps {
  minRaise: number;
  maxRaise: number;
  bbSize: number;
  value: number;
  onValueChange: (value: number) => void;
}

export function RaiseSlider({ minRaise, maxRaise, bbSize, value, onValueChange }: RaiseSliderProps) {
  const isAllIn = value >= maxRaise;
  const step = bbSize > 0 ? bbSize : 1;

  return (
    <View style={styles.container}>
      <Slider
        testID="raise-slider"
        style={styles.slider}
        minimumValue={minRaise}
        maximumValue={maxRaise}
        step={step}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={Colors.active}
        maximumTrackTintColor={Colors.subText}
        thumbTintColor={Colors.active}
      />
      <View style={styles.labelRow}>
        <Text style={styles.value}>{isAllIn ? 'ALL IN' : value.toLocaleString('en-US')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', paddingHorizontal: 16 },
  slider: { width: '100%', height: 30 },
  labelRow: { alignItems: 'center' },
  value: { color: Colors.text, fontSize: 14, fontWeight: 'bold' },
});
