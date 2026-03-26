// src/components/table/PlayerSeat.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { PlayingCard } from '../common/PlayingCard';
import { ChipAmount } from '../common/ChipAmount';
import { Colors } from '../../theme/colors';
import { ActionTimerBar } from './ActionTimerBar';

interface PlayerSeatProps {
  seat: number;
  compact?: boolean;
}

export function PlayerSeat({ seat, compact = false }: PlayerSeatProps) {
  const { state, mode, viewingSeat, timerRemainingMs, timerDurationMs } = useGame();
  if (!state) return null;

  const player = state.players.find(p => p.seat === seat);
  if (!player) return null;

  const isActive = state.activePlayer === seat;
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'allIn';
  const isDealer = state.dealer === seat;
  const showCards = mode === 'debug' || seat === viewingSeat || player.cardsRevealed === true;
  const timerIsActive = isActive && timerRemainingMs !== null;

  return (
    <View testID={`player-seat-wrapper-${seat}`}>
      {isDealer && (
        <View style={styles.dealerBadgeOuter} testID={`dealer-badge-${seat}`}>
          <Text style={styles.dealer}>D</Text>
        </View>
      )}

      <View
        testID={`player-seat-${seat}`}
        style={[
          styles.container,
          compact && styles.containerCompact,
          isActive && styles.active,
          isFolded && styles.folded,
        ]}
      >
        <Text style={[styles.name, compact && styles.nameCompact]}>{player.name}</Text>
        {player.isBot && !compact && (
          <Text style={styles.botBadge} testID={`bot-badge-${seat}`}>BOT</Text>
        )}

        <View style={styles.cards}>
          {player.cards.map((card, i) => (
            <PlayingCard key={i} card={card} faceUp={showCards} size={compact ? 'small' : 'hand'} />
          ))}
        </View>

        <ChipAmount amount={player.chips} color={Colors.text} fontSize={compact ? 10 : 12} testID={`chip-stack-${seat}`} />

        {isFolded && <Text style={styles.statusBadge}>FOLDED</Text>}
        {isAllIn && <Text style={styles.statusBadge}>ALL IN</Text>}

        <ActionTimerBar
          remainingMs={timerRemainingMs ?? 0}
          durationMs={timerDurationMs}
          isActive={timerIsActive}
        />
      </View>

      {player.bet > 0 && (
        <View testID={`bet-outside-${seat}`} style={styles.betOuter}>
          <ChipAmount amount={player.bet} color={Colors.pot} fontSize={11} testID={`bet-amount-${seat}`} />
        </View>
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
  name: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  dealerBadgeOuter: {
    alignItems: 'center',
    marginBottom: 2,
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
  botBadge: {
    color: '#93C5FD',
    fontSize: 9,
    fontWeight: 'bold',
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginBottom: 2,
  },
  statusBadge: {
    color: Colors.text,
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 2,
  },
  betOuter: {
    alignItems: 'center',
    marginTop: 4,
  },
  containerCompact: {
    padding: 4,
    minWidth: 60,
  },
  nameCompact: {
    fontSize: 10,
  },
});
