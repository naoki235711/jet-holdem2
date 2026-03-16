// src/components/result/ResultOverlay.tsx

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useGame } from '../../hooks/useGame';
import { PlayingCard } from '../common/PlayingCard';
import { Colors } from '../../theme/colors';

export function ResultOverlay() {
  const { state, showdownResult, nextRound, mode, rematch } = useGame();
  const router = useRouter();

  if (!state) return null;

  const isRoundEnd = state.phase === 'roundEnd';
  if (!isRoundEnd) return null;

  const activePlayers = state.players.filter(p => p.status !== 'folded' && p.status !== 'out');
  const isFoldWin = !showdownResult && activePlayers.length === 1;
  const foldWinner = isFoldWin ? activePlayers[0] : null;

  const playersWithChips = state.players.filter(p => p.chips > 0);
  const isGameOver = playersWithChips.length <= 1;

  const winnerSeats = new Set(showdownResult?.winners.map(w => w.seat) ?? []);
  if (foldWinner) winnerSeats.add(foldWinner.seat);

  return (
    <Modal transparent animationType="fade">
      <View style={styles.overlay} testID="result-overlay">
        <View style={styles.modal}>
          {foldWinner ? (
            <View style={styles.winnerBlock}>
              <Text testID="winner-text" style={styles.winnerName}>{foldWinner.name} wins!</Text>
              {state.foldWin && (
                <Text style={styles.potWon}>
                  {state.foldWin.amount.toLocaleString('en-US')} chips
                </Text>
              )}
            </View>
          ) : showdownResult ? (
            <View style={styles.winnerBlock}>
              <Text style={styles.potWon}>
                {showdownResult.winners.map(w => w.potAmount).reduce((a, b) => a + b, 0).toLocaleString('en-US')} chips
              </Text>
            </View>
          ) : null}

          {showdownResult && (
            <View style={styles.handsSection}>
              {state.players
                .filter(p => p.status !== 'out')
                .map(p => {
                  const hand = showdownResult.hands.find(h => h.seat === p.seat);
                  const isFolded = p.status === 'folded';
                  const isWinner = winnerSeats.has(p.seat);

                  return (
                    <View
                      key={p.seat}
                      style={[styles.handRow, isWinner && styles.winnerRow]}
                    >
                      <Text style={[styles.playerName, isFolded && styles.foldedText]}>
                        {p.name}
                      </Text>
                      <View style={styles.handCards}>
                        {isFolded ? (
                          <Text style={styles.foldedText}>(folded)</Text>
                        ) : (
                          p.cards.map((card, i) => (
                            <PlayingCard key={i} card={card} faceUp size="hand" />
                          ))
                        )}
                      </View>
                      {hand && !isFolded && (
                        <Text style={styles.handDescSmall}>{hand.description}</Text>
                      )}
                      {isWinner && <Text style={styles.starBadge}>★</Text>}
                    </View>
                  );
                })}
            </View>
          )}

          {showdownResult && state.pots.length > 1 && (
            <View style={styles.potSection}>
              {showdownResult.winners.map((w, i) => (
                <Text key={i} style={styles.potLine}>
                  Pot: {w.potAmount} → {state.players.find(p => p.seat === w.seat)?.name}
                </Text>
              ))}
            </View>
          )}

          {isGameOver ? (
            <View style={styles.gameOverButtons}>
              {mode !== 'ble-client' ? (
                <TouchableOpacity
                  testID="rematch-btn"
                  style={styles.actionBtn}
                  onPress={rematch}
                >
                  <Text style={styles.actionBtnText}>再戦</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.waitingText}>ホストの操作を待っています...</Text>
              )}
              <TouchableOpacity
                testID="back-to-lobby-btn"
                style={styles.lobbyBtn}
                onPress={() => router.replace('/')}
              >
                <Text style={styles.lobbyBtnText}>ロビーに戻る</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity testID="next-round-btn" style={styles.actionBtn} onPress={nextRound}>
              <Text style={styles.actionBtnText}>次のラウンドへ</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
  },
  winnerBlock: { alignItems: 'center', marginBottom: 12 },
  winnerName: { color: Colors.text, fontSize: 20, fontWeight: 'bold' },
  handDesc: { color: Colors.subText, fontSize: 14, marginTop: 2 },
  potWon: { color: Colors.pot, fontSize: 14, marginTop: 2 },
  handsSection: { width: '100%', marginVertical: 12, gap: 6 },
  handRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  winnerRow: { borderWidth: 1, borderColor: Colors.active },
  playerName: { color: Colors.text, fontSize: 13, width: 60 },
  handCards: { flexDirection: 'row', gap: 2 },
  handDescSmall: { color: Colors.subText, fontSize: 11, flex: 1 },
  starBadge: { color: Colors.active, fontSize: 14 },
  foldedText: { color: Colors.subText, fontStyle: 'italic' },
  potSection: { marginVertical: 8 },
  potLine: { color: Colors.subText, fontSize: 12 },
  actionBtn: {
    backgroundColor: Colors.pot,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginTop: 12,
  },
  actionBtnText: { color: Colors.text, fontWeight: 'bold', fontSize: 16 },
  gameOverButtons: { alignItems: 'center', gap: 8, marginTop: 12 },
  waitingText: { color: Colors.subText, fontSize: 14, fontStyle: 'italic', marginTop: 12 },
  lobbyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  lobbyBtnText: { color: Colors.subText, fontSize: 14 },
});
