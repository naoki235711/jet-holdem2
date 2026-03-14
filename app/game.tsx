// app/game.tsx

import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../src/theme/colors';

export default function GameScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Game Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  text: { color: Colors.text, fontSize: 24 },
});
