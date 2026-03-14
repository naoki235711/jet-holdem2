import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

type JoinSetupFormProps = {
  onSubmit: (playerName: string) => void;
};

export function JoinSetupForm({ onSubmit }: JoinSetupFormProps) {
  const [playerName, setPlayerName] = useState('');

  const isValid = playerName.trim() !== '';

  return (
    <View>
      <Text style={styles.label}>プレイヤー名</Text>
      <TextInput
        style={styles.input}
        placeholder="プレイヤー名"
        placeholderTextColor={Colors.subText}
        value={playerName}
        onChangeText={setPlayerName}
      />

      <TouchableOpacity
        testID="join-scan-btn"
        style={[styles.submitBtn, !isValid && styles.submitBtnDisabled]}
        onPress={() => onSubmit(playerName.trim())}
        disabled={!isValid}
      >
        <Text style={styles.submitBtnText}>スキャン開始</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: Colors.subText,
    fontSize: 14,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#374151',
    color: Colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  submitBtn: {
    backgroundColor: Colors.pot,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
});
