// src/components/table/CommunityCards.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { PlayingCard } from '../common/PlayingCard';

export function CommunityCards() {
  const { state } = useGame();
  const cards = state?.community ?? [];

  return (
    <View style={styles.container}>
      {Array.from({ length: 5 }, (_, i) => (
        <View key={i} testID="card-slot">
          {i < cards.length ? (
            <PlayingCard card={cards[i]} faceUp size="community" />
          ) : (
            <View testID="empty-slot" style={styles.emptySlot} />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptySlot: {
    width: 45,
    height: 65,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
  },
});
