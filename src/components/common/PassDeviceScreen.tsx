// src/components/common/PassDeviceScreen.tsx

import React from 'react';
import { View, Text, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface PassDeviceScreenProps {
  playerName: string;
  onDismiss: () => void;
}

export function PassDeviceScreen({ playerName, onDismiss }: PassDeviceScreenProps) {
  return (
    <TouchableWithoutFeedback onPress={onDismiss} testID="pass-device-screen">
      <View style={styles.container}>
        <Text style={styles.message}>端末を {playerName} に渡してください</Text>
        <Text style={styles.hint}>タップして続行</Text>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  message: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  hint: {
    color: Colors.subText,
    fontSize: 14,
    marginTop: 16,
  },
});
