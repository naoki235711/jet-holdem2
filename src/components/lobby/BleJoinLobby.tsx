import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../theme/colors';
import { LobbyPlayer, GameSettings } from '../../services/ble/LobbyProtocol';
import { LobbyClient } from '../../services/ble/LobbyClient';
import { MockBleClientTransport } from '../../services/ble/MockBleTransport';
import { PlayerSlot } from './PlayerSlot';
import { HostList } from './HostList';

type BleJoinLobbyProps = {
  playerName: string;
};

type Phase = 'scanning' | 'connecting' | 'roleSelect' | 'waiting' | 'disconnected';

const MAX_SEATS = 9;

export function BleJoinLobby({ playerName }: BleJoinLobbyProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [hosts, setHosts] = useState<Map<string, string>>(new Map());
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [gameSettings, setGameSettings] = useState<GameSettings | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const lobbyClient = useRef<LobbyClient | null>(null);
  const isSpectatorRef = useRef(false);

  useEffect(() => {
    const transport = new MockBleClientTransport();
    const client = new LobbyClient(transport, playerName);

    client.onHostDiscovered((id, name) => {
      setHosts((prev) => new Map(prev).set(id, name));
    });

    client.onJoinResult((result) => {
      if (result.accepted) {
        setPhase('waiting');
        setGameSettings(result.gameSettings);
        setJoinError(null);
      } else {
        setJoinError(result.reason);
        setPhase('scanning');
      }
    });

    client.onSpectateResult((result) => {
      if (result.accepted) {
        setPhase('waiting');
        setGameSettings(result.gameSettings);
        isSpectatorRef.current = true;
      } else {
        setJoinError(result.reason);
        setPhase('scanning');
      }
    });

    client.onPlayersChanged((p) => setPlayers(p));

    client.onGameStart((config) => {
      router.push({
        pathname: '/game',
        params: isSpectatorRef.current
          ? {
              mode: 'ble-spectator',
              sb: String(config.blinds.sb),
              bb: String(config.blinds.bb),
              initialChips: String(config.initialChips),
            }
          : {
              mode: 'ble-client',
              sb: String(config.blinds.sb),
              bb: String(config.blinds.bb),
              initialChips: String(config.initialChips),
              seat: String(client.mySeat),
            },
      });
    });

    client.onDisconnected(() => setPhase('disconnected'));

    client.startScanning();
    lobbyClient.current = client;

    return () => {
      client.disconnect();
    };
  }, []);

  const handleSelectHost = (hostId: string) => {
    setPhase('connecting');
    lobbyClient.current?.connectAndWait(hostId).then(() => {
      setPhase('roleSelect');
    });
  };

  const handleReady = () => {
    lobbyClient.current?.setReady();
  };

  const handleJoin = () => {
    lobbyClient.current?.join();
    // onJoinResult callback will set phase to 'waiting'
  };

  const handleSpectate = () => {
    lobbyClient.current?.spectate();
  };

  const handleBack = () => {
    lobbyClient.current?.disconnect();
    router.back();
  };

  if (phase === 'disconnected') {
    return (
      <View style={styles.container}>
        <Text style={styles.disconnectedText}>ホストが切断しました</Text>
        <TouchableOpacity
          testID="join-back-btn"
          style={styles.backBtn}
          onPress={handleBack}
        >
          <Text style={styles.backBtnText}>ロビーに戻る</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'roleSelect') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>ロビーに接続しました</Text>
        <TouchableOpacity testID="join-btn" style={styles.readyBtn} onPress={handleJoin}>
          <Text style={styles.readyBtnText}>ゲームに参加</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="spectate-btn" style={styles.readyBtn} onPress={handleSpectate}>
          <Text style={styles.readyBtnText}>観戦する</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backBtnText}>キャンセル</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'scanning' || phase === 'connecting') {
    const hostList = Array.from(hosts.entries()).map(([id, name]) => ({ id, name }));
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>ゲームに参加</Text>

        {phase === 'connecting' && (
          <View style={styles.connectingRow}>
            <ActivityIndicator color={Colors.active} />
            <Text style={styles.connectingText}>接続中...</Text>
          </View>
        )}

        {joinError && <Text style={styles.errorText}>{joinError}</Text>}

        <HostList hosts={hostList} onSelect={handleSelectHost} />

        <TouchableOpacity
          testID="join-cancel-btn"
          style={styles.backBtn}
          onPress={handleBack}
        >
          <Text style={styles.backBtnText}>キャンセル</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // phase === 'waiting'
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ロビー待機中</Text>
      {gameSettings && (
        <Text style={styles.settings}>
          SB/BB: {gameSettings.sb}/{gameSettings.bb}  チップ: {gameSettings.initialChips}
        </Text>
      )}

      <View style={styles.playerList}>
        {Array.from({ length: MAX_SEATS }, (_, i) => {
          const player = players.find((p) => p.seat === i);
          return (
            <PlayerSlot
              key={i}
              seatNumber={i}
              player={player}
              isMe={player?.seat === lobbyClient.current?.mySeat}
            />
          );
        })}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          testID="join-ready-btn"
          style={styles.readyBtn}
          onPress={handleReady}
        >
          <Text style={styles.readyBtnText}>Ready</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="join-leave-btn"
          style={styles.backBtn}
          onPress={handleBack}
        >
          <Text style={styles.backBtnText}>退出</Text>
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
  connectingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  connectingText: {
    color: Colors.subText,
    fontSize: 14,
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
  disconnectedText: {
    color: Colors.text,
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
    marginBottom: 24,
  },
  buttonRow: {
    gap: 12,
    marginTop: 16,
  },
  readyBtn: {
    backgroundColor: Colors.active,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  readyBtnText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  backBtn: {
    borderWidth: 2,
    borderColor: Colors.subText,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  backBtnText: {
    color: Colors.subText,
    fontSize: 16,
    fontWeight: '600',
  },
});
