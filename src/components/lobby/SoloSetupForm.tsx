import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

const PLAYER_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9];

type SoloSetupFormProps = {
  onSubmit: (settings: {
    playerName: string;
    totalCount: number;
    initialChips: string;
    sb: string;
    bb: string;
  }) => void;
};

export function SoloSetupForm({ onSubmit }: SoloSetupFormProps) {
  const [playerName, setPlayerName] = useState('');
  const [totalCount, setTotalCount] = useState(3);
  const [initialChips, setInitialChips] = useState('1000');
  const [sb, setSb] = useState('5');
  const [bb, setBb] = useState('10');

  const isValid = playerName.trim() !== '';

  return (
    <View>
      <Text style={styles.label}>あなたの名前</Text>
      <TextInput
        style={styles.input}
        placeholder="あなたの名前"
        placeholderTextColor={Colors.subText}
        value={playerName}
        onChangeText={setPlayerName}
      />

      <Text style={styles.label}>総プレイヤー数（自分含む）</Text>
      <View style={styles.countRow}>
        {PLAYER_COUNTS.map(n => (
          <TouchableOpacity
            key={n}
            testID={`solo-count-btn-${n}`}
            style={[styles.countBtn, totalCount === n && styles.countBtnActive]}
            onPress={() => setTotalCount(n)}
          >
            <Text style={[styles.countText, totalCount === n && styles.countTextActive]}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>初期チップ</Text>
      <TextInput
        testID="solo-chips-input"
        style={styles.input}
        value={initialChips}
        onChangeText={setInitialChips}
        keyboardType="numeric"
        placeholderTextColor={Colors.subText}
      />

      <View style={styles.blindsRow}>
        <View style={styles.blindInput}>
          <Text style={styles.label}>SB</Text>
          <TextInput
            testID="solo-sb-input"
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
            testID="solo-bb-input"
            style={styles.input}
            value={bb}
            onChangeText={setBb}
            keyboardType="numeric"
            placeholderTextColor={Colors.subText}
          />
        </View>
      </View>

      <TouchableOpacity
        testID="solo-start-btn"
        style={[styles.startBtn, !isValid && styles.startBtnDisabled]}
        onPress={() => onSubmit({ playerName: playerName.trim(), totalCount, initialChips, sb, bb })}
        disabled={!isValid}
      >
        <Text style={styles.startBtnText}>ゲーム開始</Text>
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
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  countBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.subText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBtnActive: { borderColor: Colors.active, backgroundColor: 'rgba(6,182,212,0.15)' },
  countText: { color: Colors.subText, fontSize: 18, fontWeight: 'bold' },
  countTextActive: { color: Colors.active },
  blindsRow: { flexDirection: 'row', gap: 12 },
  blindInput: { flex: 1 },
  startBtn: {
    backgroundColor: Colors.pot,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { color: Colors.text, fontSize: 18, fontWeight: 'bold' },
});
