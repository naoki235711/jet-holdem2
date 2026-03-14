// src/components/table/PlayerSeat.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { PlayingCard } from '../common/PlayingCard';
import { ChipAmount } from '../common/ChipAmount';
import { Colors } from '../../theme/colors';

interface PlayerSeatProps {
  seat: number;
}

export function PlayerSeat({ seat }: PlayerSeatProps) {
  const { state, mode, viewingSeat } = useGame();
  if (!state) return null;

  const player = state.players.find(p => p.seat === seat);
  if (!player) return null;

  const isActive = state.activePlayer === seat;
  const isFolded = player.status === 'folded';
  const isDealer = state.dealer === seat;
  const showCards = mode === 'debug' || seat === viewingSeat;

  return (
    <View
      testID={`player-seat-${seat}`}
      style={[
        styles.container,
        isActive && styles.active,
        isFolded && styles.folded,
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.name}>{player.name}</Text>
        {isDealer && <Text style={styles.dealer}>D</Text>}
      </View>

      <View style={styles.cards}>
        {player.cards.map((card, i) => (
          <PlayingCard key={i} card={card} faceUp={showCards} size="hand" />
        ))}
      </View>

      <ChipAmount amount={player.chips} color={Colors.text} fontSize={12} testID={`chip-stack-${seat}`} />

      {player.bet > 0 && (
        <ChipAmount amount={player.bet} color={Colors.pot} fontSize={11} testID={`bet-amount-${seat}`} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.05)',
    minWidth: 70,
  },
  active: {
    borderColor: Colors.active,
  },
  folded: {
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  name: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  dealer: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: '#78350F',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  cards: {
    flexDirection: 'row',
    gap: 2,
    marginVertical: 4,
  },
});
