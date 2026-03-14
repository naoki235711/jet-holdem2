// app/game.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { GameProvider } from '../src/contexts/GameContext';
import { LocalGameService } from '../src/services/LocalGameService';
import { useGame } from '../src/hooks/useGame';
import { PlayerSeat } from '../src/components/table/PlayerSeat';
import { CommunityCards } from '../src/components/table/CommunityCards';
import { PotDisplay } from '../src/components/table/PotDisplay';
import { ActionButtons } from '../src/components/actions/ActionButtons';
import { ResultOverlay } from '../src/components/result/ResultOverlay';
import { Colors } from '../src/theme/colors';

function TableLayout() {
  const { state, viewingSeat } = useGame();
  if (!state) return null;

  const playerCount = state.players.length;
  const allSeats = state.players.map(p => p.seat);

  const myIdx = allSeats.indexOf(viewingSeat);
  const seatAt = (offset: number) => {
    if (myIdx === -1) return -1;
    return allSeats[(myIdx + offset) % playerCount];
  };

  const bottomSeat = seatAt(0);
  const leftSeat = playerCount >= 3 ? seatAt(1) : -1;
  const topSeat = playerCount >= 2 ? seatAt(playerCount === 2 ? 1 : 2) : -1;
  const rightSeat = playerCount >= 4 ? seatAt(3) : -1;

  return (
    <View style={styles.table}>
      <View style={styles.topRow}>
        {topSeat >= 0 && <PlayerSeat seat={topSeat} />}
      </View>

      <View style={styles.middleRow}>
        <View style={styles.sideSlot}>
          {leftSeat >= 0 && <PlayerSeat seat={leftSeat} />}
        </View>
        <View style={styles.center}>
          <PotDisplay />
          <CommunityCards />
        </View>
        <View style={styles.sideSlot}>
          {rightSeat >= 0 && <PlayerSeat seat={rightSeat} />}
        </View>
      </View>

      <View style={styles.bottomRow}>
        {bottomSeat >= 0 && <PlayerSeat seat={bottomSeat} />}
      </View>
    </View>
  );
}

export default function GameScreen() {
  const params = useLocalSearchParams<{
    playerNames: string;
    initialChips: string;
    sb: string;
    bb: string;
    mode: 'hotseat' | 'debug';
  }>();

  const playerNames = JSON.parse(params.playerNames ?? '["P0","P1","P2"]');
  const initialChips = Number(params.initialChips ?? '1000');
  const blinds = { sb: Number(params.sb ?? '5'), bb: Number(params.bb ?? '10') };
  const mode = params.mode ?? 'debug';

  const [service] = React.useState(() => {
    const svc = new LocalGameService();
    svc.startGame(playerNames, blinds, initialChips);
    svc.startRound();
    return svc;
  });

  return (
    <GameProvider service={service} mode={mode}>
      <View style={styles.screen}>
        <TableLayout />
        <ActionButtons />
        <ResultOverlay />
      </View>
    </GameProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  table: {
    flex: 1,
    backgroundColor: Colors.table,
    borderRadius: 100,
    margin: 8,
    padding: 12,
    justifyContent: 'space-between',
  },
  topRow: {
    alignItems: 'center',
    paddingTop: 8,
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideSlot: {
    width: 80,
    alignItems: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  bottomRow: {
    alignItems: 'center',
    paddingBottom: 8,
  },
});
