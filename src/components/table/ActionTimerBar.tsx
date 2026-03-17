import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface ActionTimerBarProps {
  remainingMs: number;
  durationMs: number;
  isActive: boolean;
}

export function ActionTimerBar({ remainingMs, durationMs, isActive }: ActionTimerBarProps) {
  const ratio = Math.max(0, Math.min(1, remainingMs / durationMs));
  const color = timerColor(ratio);

  return (
    <View
      testID="timer-track"
      style={[
        styles.track,
        !isActive && { backgroundColor: 'transparent' },
      ]}
    >
      {isActive && (
        <View
          testID="timer-fill"
          style={[
            styles.fill,
            { width: `${Math.round(ratio * 100)}%`, backgroundColor: color },
          ]}
        />
      )}
    </View>
  );
}

function timerColor(ratio: number): string {
  if (ratio > 0.5) {
    const t = (ratio - 0.5) / 0.5;
    return interpolateColor(Colors.timerWarning, Colors.active, t);
  } else {
    const t = ratio / 0.5;
    return interpolateColor(Colors.timerDanger, Colors.timerWarning, t);
  }
}

function interpolateColor(colorA: string, colorB: string, t: number): string {
  const [rA, gA, bA] = hexToRgb(colorA);
  const [rB, gB, bB] = hexToRgb(colorB);
  const r = Math.round(rA + (rB - rA) * t);
  const g = Math.round(gA + (gB - gA) * t);
  const b = Math.round(bA + (bB - bA) * t);
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 1.5,
    overflow: 'hidden',
    marginTop: 4,
    width: '100%',
  },
  fill: {
    height: '100%',
    borderRadius: 1.5,
  },
});
