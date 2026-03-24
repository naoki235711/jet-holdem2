import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../theme/colors';
import { LobbyPlayer } from '../../services/ble/LobbyProtocol';
import { LobbyHost } from '../../services/ble/LobbyHost';
import { MockBleHostTransport } from '../../services/ble/MockBleTransport';
import { setLobbyHost, clearLobbyHost } from '../../services/ble/transportRegistry';
import { PlayerSlot } from './PlayerSlot';

type BleHostLobbyProps = {
  hostName: string;
  sb: number;
  bb: number;
  initialChips: number;
};

const MAX_SEATS = 4;

export function BleHostLobby({ hostName, sb, bb, initialChips }: BleHostLobbyProps) {
  const router = useRouter();
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const playersRef = useRef<LobbyPlayer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lobbyHost = useRef<LobbyHost | null>(null);

  useEffect(() => {
    const transport = new MockBleHostTransport();
    const host = new LobbyHost(transport, hostName, { sb, bb, initialChips });

    setLobbyHost(host);
    host.onPlayersChanged((p) => { setPlayers(p); playersRef.current = p; });
    host.onGameStart(() => {
      const clientSeatMap = host.getClientSeatMap();
      const spectatorIds = host.getSpectatorClientIds();
      const allPlayers = [{ seat: 0, name: hostName }, ...playersRef.current.filter(p => p.seat !== 0)];
      const names = allPlayers.sort((a, b) => a.seat - b.seat).map(p => p.name);
      router.push({
        pathname: '/game',
        params: {
          mode: 'ble-host',
          sb: String(sb),
          bb: String(bb),
          initialChips: String(initialChips),
          seat: '0',
          playerNames: JSON.stringify(names),
          clientSeatMap: JSON.stringify(Object.fromEntries(clientSeatMap)),
          spectatorClientIds: JSON.stringify(spectatorIds),
        },
      });
    });
    host.onError((msg) => setError(msg));
    host.start();
    lobbyHost.current = host;
    return () => {
      host.stop();
      clearLobbyHost();
    };
  }, []);

  const handleStartGame = () => {
    setError(null);
    lobbyHost.current?.startGame();
  };

  const handleClose = () => {
    lobbyHost.current?.stop();
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ロビー: {hostName}</Text>
      <Text style={styles.settings}>SB/BB: {sb}/{bb}  チップ: {initialChips}</Text>

      <View style={styles.playerList}>
        {Array.from({ length: MAX_SEATS }, (_, i) => {
          const player = players.find((p) => p.seat === i);
          return (
            <PlayerSlot
              key={i}
              seatNumber={i}
              player={player}
              isMe={i === 0}
            />
          );
        })}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          testID="host-start-game-btn"
          style={styles.startBtn}
          onPress={handleStartGame}
        >
          <Text style={styles.startBtnText}>ゲーム開始</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="host-close-btn"
          style={styles.closeBtn}
          onPress={handleClose}
        >
          <Text style={styles.closeBtnText}>ロビーを閉じる</Text>
        </TouchableOpacity>
      </View>
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
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 48,
  },
  settings: {
    color: Colors.subText,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  playerList: {
    marginBottom: 16,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  buttonRow: {
    gap: 12,
    marginTop: 16,
  },
  startBtn: {
    backgroundColor: Colors.pot,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startBtnText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeBtn: {
    borderWidth: 2,
    borderColor: Colors.subText,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: Colors.subText,
    fontSize: 16,
    fontWeight: '600',
  },
});
