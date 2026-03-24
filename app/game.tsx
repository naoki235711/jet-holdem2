// app/game.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { GameProvider } from '../src/contexts/GameContext';
import { GameService } from '../src/services/GameService';
import { LocalGameService } from '../src/services/LocalGameService';
import { BleHostGameService } from '../src/services/ble/BleHostGameService';
import { BleClientGameService } from '../src/services/ble/BleClientGameService';
import { BleSpectatorGameService } from '../src/services/ble/BleSpectatorGameService';
import { getHostTransport, getClientTransport, clearHostTransport, clearClientTransport, getLobbyHost, clearLobbyHost } from '../src/services/ble/transportRegistry';
import { useGame } from '../src/hooks/useGame';
import { PlayerSeat } from '../src/components/table/PlayerSeat';
import { CommunityCards } from '../src/components/table/CommunityCards';
import { PotDisplay } from '../src/components/table/PotDisplay';
import { ActionButtons } from '../src/components/actions/ActionButtons';
import { ResultOverlay } from '../src/components/result/ResultOverlay';
import { PreflopChartModal } from '../src/components/preflop/PreflopChartModal';
import { PassDeviceScreen } from '../src/components/common/PassDeviceScreen';
import { Colors } from '../src/theme/colors';
import { repository } from '../src/services/persistence';

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

function DebugInfoBar() {
  const { state, mode } = useGame();
  if (mode !== 'debug' || !state) return null;

  const potBreakdown = state.pots.map((p, i) =>
    `Pot${i}: ${p.amount} [${p.eligible.join(',')}]`
  ).join(' | ');

  const statuses = state.players.map(p =>
    `${p.name}: ${p.status} (${p.chips})`
  ).join(' | ');

  return (
    <View style={debugStyles.bar}>
      <Text style={debugStyles.text}>Phase: {state.phase} | Dealer: {state.dealer} | Bet: {state.currentBet}</Text>
      <Text style={debugStyles.text}>{potBreakdown}</Text>
      <Text style={debugStyles.text}>{statuses}</Text>
    </View>
  );
}

const debugStyles = StyleSheet.create({
  bar: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 4,
    paddingHorizontal: 8,
  },
  text: {
    color: Colors.subText,
    fontSize: 10,
    fontFamily: 'monospace',
  },
});

function GameView() {
  const { state, mode, viewingSeat } = useGame();
  const [showPassScreen, setShowPassScreen] = useState(false);
  const [nextPlayerName, setNextPlayerName] = useState('');
  const prevActiveRef = React.useRef<number>(-1);
  const [showChart, setShowChart] = useState(false);

  useEffect(() => {
    if (!state || mode !== 'hotseat') return;

    const currentActive = state.activePlayer;
    const prevActive = prevActiveRef.current;

    if (
      currentActive >= 0 &&
      currentActive !== prevActive &&
      state.phase !== 'roundEnd' &&
      state.phase !== 'showdown'
    ) {
      const player = state.players.find(p => p.seat === currentActive);
      if (player) {
        setNextPlayerName(player.name);
        setShowPassScreen(true);
      }
    }
    prevActiveRef.current = currentActive;
  }, [state?.activePlayer, state?.phase, mode]);

  if (showPassScreen) {
    return (
      <PassDeviceScreen
        playerName={nextPlayerName}
        onDismiss={() => setShowPassScreen(false)}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <DebugInfoBar />
      <TableLayout />
      <ActionButtons />
      <ResultOverlay />
      <TouchableOpacity
        testID="rfi-chart-button"
        style={styles.chartButton}
        onPress={() => setShowChart(true)}
      >
        <Text style={styles.chartButtonText}>RFI</Text>
      </TouchableOpacity>
      <PreflopChartModal visible={showChart} onClose={() => setShowChart(false)} />
    </View>
  );
}

export default function GameScreen() {
  const params = useLocalSearchParams<{
    playerNames?: string;
    initialChips: string;
    sb: string;
    bb: string;
    mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client' | 'ble-spectator';
    seat?: string;
    clientSeatMap?: string;
    spectatorClientIds?: string;  // JSON string[]
    playerChips?: string;  // JSON Record<string, number>
  }>();

  const mode = params.mode ?? 'debug';
  const initialChips = Number(params.initialChips ?? '1000');
  const blinds = { sb: Number(params.sb ?? '5'), bb: Number(params.bb ?? '10') };

  const playerNames = React.useMemo<string[]>(() => {
    const parsed: string[] = JSON.parse(params.playerNames ?? '[]');
    return parsed.length > 0 ? parsed : ['P0', 'P1', 'P2'];
  }, [params.playerNames]);

  const [service] = React.useState<GameService>(() => {
    if (mode === 'ble-host') {
      const transport = getHostTransport()!;
      const parsed = JSON.parse(params.clientSeatMap ?? '{}') as Record<string, number>;
      const seatMap = new Map<string, number>(
        Object.entries(parsed).map(([k, v]) => [k, Number(v)]),
      );
      const spectatorIds: string[] = params.spectatorClientIds
        ? JSON.parse(params.spectatorClientIds)
        : [];
      const svc = new BleHostGameService(transport, seatMap, spectatorIds);
      svc.startGame(playerNames, blinds, initialChips);
      svc.startRound();
      return svc;
    }

    if (mode === 'ble-spectator') {
      const transport = getClientTransport()!;
      return new BleSpectatorGameService(transport);
    }

    if (mode === 'ble-client') {
      const transport = getClientTransport()!;
      return new BleClientGameService(transport, Number(params.seat ?? '0'));
    }

    // Local modes (hotseat / debug)
    const playerChipsMap: Record<string, number> | undefined = params.playerChips
      ? JSON.parse(params.playerChips)
      : undefined;
    const svc = new LocalGameService();
    svc.startGame(playerNames, blinds, initialChips, playerChipsMap);
    svc.startRound();
    return svc;
  });

  const viewingSeat = (mode === 'ble-host' || mode === 'ble-spectator')
    ? 0
    : Number(params.seat ?? '0');

  // Cleanup transport registry on unmount
  React.useEffect(() => {
    return () => {
      if (mode === 'ble-host') { clearHostTransport(); clearLobbyHost(); }
      if (mode === 'ble-client' || mode === 'ble-spectator') clearClientTransport();
    };
  }, []);

  // Wire mid-game spectator join for ble-host
  // LobbyHost uses a single-subscriber slot — only one caller can register onSpectatorJoined
  React.useEffect(() => {
    if (mode !== 'ble-host') return;
    const lobbyHost = getLobbyHost();
    if (!lobbyHost) return;
    lobbyHost.onSpectatorJoined((clientId) => {
      (service as BleHostGameService).addSpectator(clientId);
    });
  }, [service]);

  const repo = mode === 'debug' ? undefined : repository;

  return (
    <GameProvider
      service={service}
      mode={mode}
      mySeat={mode === 'ble-client' ? Number(params.seat ?? '0') : undefined}
      repository={repo}
      initialChips={initialChips}
      blinds={blinds}
      playerNames={playerNames}
    >
      <GameView />
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
  chartButton: {
    position: 'absolute',
    bottom: 80,
    right: 12,
    backgroundColor: '#1E3A5F',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  chartButtonText: {
    color: '#3B82F6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
