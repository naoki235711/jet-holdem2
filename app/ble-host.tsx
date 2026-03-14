import { useLocalSearchParams } from 'expo-router';
import { BleHostLobby } from '../src/components/lobby/BleHostLobby';

export default function BleHostScreen() {
  const params = useLocalSearchParams<{
    hostName: string;
    sb: string;
    bb: string;
    initialChips: string;
  }>();

  return (
    <BleHostLobby
      hostName={params.hostName ?? 'Host'}
      sb={Number(params.sb ?? '5')}
      bb={Number(params.bb ?? '10')}
      initialChips={Number(params.initialChips ?? '1000')}
    />
  );
}
