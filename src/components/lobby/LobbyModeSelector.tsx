import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

export type LobbyMode = 'local' | 'host' | 'join';

type LobbyModeSelectorProps = {
  selected: LobbyMode;
  onSelect: (mode: LobbyMode) => void;
};

const TABS: { mode: LobbyMode; label: string }[] = [
  { mode: 'local', label: 'ローカル' },
  { mode: 'host', label: 'ホスト作成' },
  { mode: 'join', label: 'ゲーム参加' },
];

export function LobbyModeSelector({ selected, onSelect }: LobbyModeSelectorProps) {
  return (
    <View style={styles.container}>
      {TABS.map(({ mode, label }) => (
        <TouchableOpacity
          key={mode}
          testID={`lobby-tab-${mode}`}
          style={[styles.tab, selected === mode && styles.tabActive]}
          onPress={() => onSelect(mode)}
        >
          <Text style={[styles.tabText, selected === mode && styles.tabTextActive]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.subText,
    alignItems: 'center',
  },
  tabActive: {
    borderColor: Colors.active,
    backgroundColor: 'rgba(6,182,212,0.15)',
  },
  tabText: {
    color: Colors.subText,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.active,
  },
});
