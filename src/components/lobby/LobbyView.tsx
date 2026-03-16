// src/components/lobby/LobbyView.tsx

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../theme/colors';
import { LobbyModeSelector, LobbyMode } from './LobbyModeSelector';
import { HostSetupForm } from './HostSetupForm';
import { JoinSetupForm } from './JoinSetupForm';
import { repository } from '../../services/persistence';

const PLAYER_COUNTS = [2, 3, 4];
const DEFAULT_NAMES = ['Player 0', 'Player 1', 'Player 2', 'Player 3'];

export function LobbyView() {
  const router = useRouter();
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>('local');
  const [playerCount, setPlayerCount] = useState(3);
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [initialChips, setInitialChips] = useState('1000');
  const [sb, setSb] = useState('5');
  const [bb, setBb] = useState('10');
  const [mode, setMode] = useState<'hotseat' | 'debug'>('hotseat');
  const [resetFeedback, setResetFeedback] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Restore saved settings on mount
  useEffect(() => {
    repository.getSettings().then(saved => {
      if (saved) {
        setInitialChips(String(saved.initialChips));
        setSb(String(saved.sb));
        setBb(String(saved.bb));
        if (saved.playerNames.length > 0) {
          setNames(prev => {
            const next = [...prev];
            saved.playerNames.forEach((name, i) => { next[i] = name; });
            return next;
          });
          setPlayerCount(saved.playerNames.length);
        }
      }
    });
    return () => clearTimeout(resetTimerRef.current);
  }, []);

  const updateName = (index: number, name: string) => {
    const next = [...names];
    next[index] = name;
    setNames(next);
  };

  const handleStart = async () => {
    const playerNames = names.slice(0, playerCount).map((n, i) => n || `Player ${i}`);

    // Save current settings
    repository.saveSettings({
      initialChips: Number(initialChips),
      sb: Number(sb),
      bb: Number(bb),
      playerNames,
    });

    // Load saved chips for each player
    const chipsByPlayer: Record<string, number> = {};
    for (const name of playerNames) {
      const saved = await repository.getPlayerChips(name);
      if (saved !== null) {
        chipsByPlayer[name] = saved;
      }
    }
    const hasChips = Object.keys(chipsByPlayer).length > 0;

    router.push({
      pathname: '/game',
      params: {
        playerNames: JSON.stringify(playerNames),
        initialChips,
        sb,
        bb,
        mode,
        ...(hasChips ? { playerChips: JSON.stringify(chipsByPlayer) } : {}),
      },
    });
  };

  const handleChipReset = () => {
    Alert.alert(
      'チップリセット',
      '全プレイヤーの保存済みチップをリセットしますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'はい',
          onPress: async () => {
            const playerNames = names.slice(0, playerCount).map((n, i) => n || `Player ${i}`);
            for (const name of playerNames) {
              await repository.savePlayerChips(name, Number(initialChips));
            }
            setResetFeedback(true);
            clearTimeout(resetTimerRef.current);
            resetTimerRef.current = setTimeout(() => setResetFeedback(false), 3000);
          },
        },
      ],
    );
  };

  const handleHostSubmit = (settings: { hostName: string; sb: string; bb: string; initialChips: string }) => {
    router.push({
      pathname: '/ble-host',
      params: settings,
    });
  };

  const handleJoinSubmit = (playerName: string) => {
    router.push({
      pathname: '/ble-join',
      params: { playerName },
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Jet Holdem</Text>

      <LobbyModeSelector selected={lobbyMode} onSelect={setLobbyMode} />

      {lobbyMode === 'local' && (
        <>
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

          <TouchableOpacity testID="chip-reset-btn" style={styles.resetBtn} onPress={handleChipReset}>
            <Text style={styles.resetBtnText}>チップをリセット</Text>
          </TouchableOpacity>
          {resetFeedback && (
            <Text style={styles.resetFeedback}>リセットしました</Text>
          )}
          <TouchableOpacity testID="start-btn" style={styles.startBtn} onPress={handleStart}>
            <Text style={styles.startBtnText}>ゲーム開始</Text>
          </TouchableOpacity>
        </>
      )}

      {lobbyMode === 'host' && (
        <HostSetupForm onSubmit={handleHostSubmit} />
      )}

      {lobbyMode === 'join' && (
        <JoinSetupForm onSubmit={handleJoinSubmit} />
      )}
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
  resetBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 16,
  },
  resetBtnText: { color: Colors.subText, fontSize: 14 },
  resetFeedback: { color: Colors.pot, fontSize: 12, textAlign: 'center', marginTop: 4 },
});
