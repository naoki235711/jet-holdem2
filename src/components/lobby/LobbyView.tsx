// src/components/lobby/LobbyView.tsx

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../theme/colors';

const PLAYER_COUNTS = [2, 3, 4];
const DEFAULT_NAMES = ['Player 0', 'Player 1', 'Player 2', 'Player 3'];

export function LobbyView() {
  const router = useRouter();
  const [playerCount, setPlayerCount] = useState(3);
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [initialChips, setInitialChips] = useState('1000');
  const [sb, setSb] = useState('5');
  const [bb, setBb] = useState('10');
  const [mode, setMode] = useState<'hotseat' | 'debug'>('hotseat');

  const updateName = (index: number, name: string) => {
    const next = [...names];
    next[index] = name;
    setNames(next);
  };

  const handleStart = () => {
    const playerNames = names.slice(0, playerCount).map((n, i) => n || `Player ${i}`);
    router.push({
      pathname: '/game',
      params: {
        playerNames: JSON.stringify(playerNames),
        initialChips,
        sb,
        bb,
        mode,
      },
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Jet Holdem</Text>

      <Text style={styles.label}>プレイヤー数</Text>
      <View style={styles.countRow}>
        {PLAYER_COUNTS.map(n => (
          <TouchableOpacity
            key={n}
            testID={`count-btn-${n}`}
            style={[styles.countBtn, playerCount === n && styles.countBtnActive]}
            onPress={() => setPlayerCount(n)}
          >
            <Text style={[styles.countText, playerCount === n && styles.countTextActive]}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>プレイヤー名</Text>
      {Array.from({ length: playerCount }, (_, i) => (
        <TextInput
          key={i}
          style={styles.input}
          placeholder={`Player ${i}`}
          placeholderTextColor={Colors.subText}
          value={names[i]}
          onChangeText={(text) => updateName(i, text)}
        />
      ))}

      <Text style={styles.label}>初期チップ</Text>
      <TextInput
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
            style={styles.input}
            value={bb}
            onChangeText={setBb}
            keyboardType="numeric"
            placeholderTextColor={Colors.subText}
          />
        </View>
      </View>

      <Text style={styles.label}>モード</Text>
      <View style={styles.modeRow}>
        <TouchableOpacity
          testID="mode-btn-hotseat"
          style={[styles.modeBtn, mode === 'hotseat' && styles.modeBtnActive]}
          onPress={() => setMode('hotseat')}
        >
          <Text style={[styles.modeText, mode === 'hotseat' && styles.modeTextActive]}>
            ホットシート
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="mode-btn-debug"
          style={[styles.modeBtn, mode === 'debug' && styles.modeBtnActive]}
          onPress={() => setMode('debug')}
        >
          <Text style={[styles.modeText, mode === 'debug' && styles.modeTextActive]}>
            デバッグ
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity testID="start-btn" style={styles.startBtn} onPress={handleStart}>
        <Text style={styles.startBtnText}>ゲーム開始</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: Colors.background,
  },
  title: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 32,
    marginTop: 48,
  },
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
  countRow: { flexDirection: 'row', gap: 12 },
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
  modeRow: { flexDirection: 'row', gap: 12 },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.subText,
    alignItems: 'center',
  },
  modeBtnActive: { borderColor: Colors.active, backgroundColor: 'rgba(6,182,212,0.15)' },
  modeText: { color: Colors.subText, fontWeight: '600' },
  modeTextActive: { color: Colors.active },
  startBtn: {
    backgroundColor: Colors.pot,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  startBtnText: { color: Colors.text, fontSize: 18, fontWeight: 'bold' },
});
