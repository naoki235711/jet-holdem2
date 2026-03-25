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
import { getTableSlots } from '../src/components/table/tableSlots';
import { CommunityCards } from '../src/components/table/CommunityCards';
import { PotDisplay } from '../src/components/table/PotDisplay';
import { ActionButtons } from '../src/components/actions/ActionButtons';
import { ResultOverlay } from '../src/components/result/ResultOverlay';
import { PreflopChartModal } from '../src/components/preflop/PreflopChartModal';
import { PassDeviceScreen } from '../src/components/common/PassDeviceScreen';
import { Colors } from '../src/theme/colors';
import { repository } from '../src/services/persistence';

export function TableLayout() {
  const { state, viewingSeat } = useGame();
  if (!state) return null;

  const allSeats = state.players.map(p => p.seat);
  const myIdx = allSeats.indexOf(viewingSeat);
  const compact = allSeats.length >= 5;
  const slots = getTableSlots(allSeats, myIdx);

  const seat = (name: keyof typeof slots) =>
    slots[name] !== undefined ? (
      <PlayerSeat seat={slots[name]!} compact={compact} />
    ) : null;

  return (
    <View style={styles.table}>
      <View style={styles.topRow}>
        {seat('TL')}
        {seat('TC')}
        {seat('TR')}
      </View>

      <View style={styles.middleRow}>
        <View style={styles.sideCol}>
          {seat('LT')}
          {seat('LB')}
        </View>
        <View style={styles.center}>
          <PotDisplay />
          <CommunityCards />
        </View>
        <View style={styles.sideCol}>
          {seat('RT')}
          {seat('RB')}
        </View>
      </View>

      <View style={styles.bottomRow}>
        {seat('BL')}
        {seat('BC')}
        {seat('BR')}
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
      // Only show PassDeviceScreen if player is not a bot
      if (player && !player.isBot) {
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
    botCount?: string;
  }>();

  const mode = params.mode ?? 'debug';
  const initialChips = Number(params.initialChips ?? '1000');
  const blinds = { sb: Number(params.sb ?? '5'), bb: Number(params.bb ?? '10') };
  const botCount = Number(params.botCount ?? '0');

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
    svc.startGame(playerNames, blinds, initialChips, playerChipsMap, botCount);
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
      botCount={botCount}
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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 8,
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideCol: {
    minWidth: 56,
    alignItems: 'center',
    gap: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 8,
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
