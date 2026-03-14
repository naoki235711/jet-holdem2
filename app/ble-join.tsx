import { useLocalSearchParams } from 'expo-router';
import { BleJoinLobby } from '../src/components/lobby/BleJoinLobby';

export default function BleJoinScreen() {
  const params = useLocalSearchParams<{ playerName: string }>();

  return <BleJoinLobby playerName={params.playerName ?? 'Player'} />;
}
