import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';
import { PreActionType } from './types';

interface PreActionBarProps {
  selected: PreActionType;
  onSelect: (action: PreActionType) => void;
  callAmount: number;
}

const BUTTONS: { key: Exclude<PreActionType, null>; label: (callAmount: number) => string }[] = [
  { key: 'checkFold', label: () => 'Check/Fold' },
  { key: 'call', label: (amt) => `Call ${amt}` },
  { key: 'callAny', label: () => 'Call Any' },
];

export function PreActionBar({ selected, onSelect, callAmount }: PreActionBarProps) {
  return (
    <View style={styles.container}>
      {BUTTONS.map(({ key, label }) => {
        const isSelected = selected === key;
        return (
          <TouchableOpacity
            key={key}
            testID={`preaction-${key}${isSelected ? '-selected' : ''}`}
            style={[styles.button, isSelected && styles.selectedButton]}
            onPress={() => onSelect(isSelected ? null : key)}
          >
            <Text style={[styles.text, isSelected && styles.selectedText]}>
              {label(callAmount)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    padding: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.subText,
    alignItems: 'center',
  },
  selectedButton: {
    borderColor: Colors.active,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
  },
  text: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  selectedText: {
    color: Colors.active,
  },
});
