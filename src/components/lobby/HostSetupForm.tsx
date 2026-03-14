import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

type HostSetupFormProps = {
  onSubmit: (settings: {
    hostName: string;
    sb: string;
    bb: string;
    initialChips: string;
  }) => void;
};

export function HostSetupForm({ onSubmit }: HostSetupFormProps) {
  const [hostName, setHostName] = useState('');
  const [sb, setSb] = useState('5');
  const [bb, setBb] = useState('10');
  const [initialChips, setInitialChips] = useState('1000');

  const isValid = hostName.trim() !== '';

  return (
    <View>
      <Text style={styles.label}>ホスト名</Text>
      <TextInput
        style={styles.input}
        placeholder="ホスト名"
        placeholderTextColor={Colors.subText}
        value={hostName}
        onChangeText={setHostName}
      />

      <View style={styles.blindsRow}>
        <View style={styles.blindInput}>
          <Text style={styles.label}>SB</Text>
          <TextInput
            testID="host-sb-input"
            style={styles.input}
            value={sb}
            onChangeText={setSb}
            keyboardType="numeric"
            placeholderTextColor={Colors.subText}
          />
        </View>
        <View style={styles.blindInput}>
          <Text style={styles.label}>BB</Text>
          <TextInput
            testID="host-bb-input"
            style={styles.input}
            value={bb}
            onChangeText={setBb}
            keyboardType="numeric"
            placeholderTextColor={Colors.subText}
          />
        </View>
      </View>

      <Text style={styles.label}>初期チップ</Text>
      <TextInput
        testID="host-chips-input"
        style={styles.input}
        value={initialChips}
        onChangeText={setInitialChips}
        keyboardType="numeric"
        placeholderTextColor={Colors.subText}
      />

      <TouchableOpacity
        testID="host-create-btn"
        style={[styles.submitBtn, !isValid && styles.submitBtnDisabled]}
        onPress={() => onSubmit({ hostName: hostName.trim(), sb, bb, initialChips })}
        disabled={!isValid}
      >
        <Text style={styles.submitBtnText}>ロビーを作成</Text>
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
  blindsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  blindInput: {
    flex: 1,
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
