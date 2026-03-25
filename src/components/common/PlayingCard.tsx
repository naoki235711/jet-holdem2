// src/components/common/PlayingCard.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card, Rank, Suit } from '../../gameEngine';

const SUIT_SYMBOLS: Record<Suit, string> = { h: '♥', d: '♦', s: '♠', c: '♣' };
const SUIT_COLORS: Record<Suit, string> = { h: '#EF4444', d: '#EF4444', s: '#FFFFFF', c: '#FFFFFF' };

const SIZES = {
  hand:      { width: 25, height: 35, fontSize: 10 },
  small:     { width: 18, height: 26, fontSize: 8  },
  community: { width: 45, height: 65, fontSize: 18 },
};

interface PlayingCardProps {
  card: Card;
  faceUp: boolean;
  size?: 'hand' | 'small' | 'community';
}

export function PlayingCard({ card, faceUp, size = 'hand' }: PlayingCardProps) {
  const dims = SIZES[size];
  const rank = card[0] as Rank;
  const suit = card[1] as Suit;

  return (
    <View
      testID="playing-card"
      style={[styles.card, { width: dims.width, height: dims.height }, !faceUp && styles.faceDown]}
    >
      {faceUp ? (
        <>
          <Text style={[styles.rank, { fontSize: dims.fontSize, color: SUIT_COLORS[suit] }]}>
            {rank}
          </Text>
          <Text style={{ fontSize: dims.fontSize, color: SUIT_COLORS[suit] }}>
            {SUIT_SYMBOLS[suit]}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceDown: {
    backgroundColor: '#1F2937',
  },
  rank: {
    fontWeight: 'bold',
  },
});
