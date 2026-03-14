import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';
import { LobbyPlayer } from '../../services/ble/LobbyProtocol';

type PlayerSlotProps = {
  seatNumber: number;
  player?: LobbyPlayer;
  isMe?: boolean;
};

export function PlayerSlot({ seatNumber, player, isMe }: PlayerSlotProps) {
  if (!player) {
    return (
      <View style={styles.slot}>
        <Text style={styles.seatLabel}>Seat {seatNumber}</Text>
        <Text style={styles.emptyText}>(空席)</Text>
      </View>
    );
  }

  const readyIcon = player.ready ? '✓' : '○';

  return (
    <View style={[styles.slot, player.ready && styles.readySlot]}>
      <Text style={styles.seatLabel}>Seat {seatNumber}</Text>
      <Text style={styles.nameText}>
        {player.name}
        {isMe && ' (あなた)'}
      </Text>
      <Text style={[styles.readyIcon, player.ready && styles.readyIconActive]}>
        {readyIcon}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#374151',
    borderRadius: 8,
    marginBottom: 6,
    gap: 8,
  },
  readySlot: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.active,
  },
  seatLabel: {
    color: Colors.subText,
    fontSize: 12,
    width: 48,
  },
  nameText: {
    color: Colors.text,
    fontSize: 16,
    flex: 1,
  },
  emptyText: {
    color: Colors.subText,
    fontSize: 16,
    flex: 1,
    fontStyle: 'italic',
  },
  readyIcon: {
    color: Colors.subText,
    fontSize: 18,
  },
  readyIconActive: {
    color: Colors.active,
  },
});
