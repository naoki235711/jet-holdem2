// app/index.tsx

import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../src/theme/colors';

export default function LobbyScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Jet Holdem</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  title: { color: Colors.text, fontSize: 32, fontWeight: 'bold' },
});
