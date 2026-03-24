// src/components/preflop/PreflopChartModal.tsx

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { PreflopGrid } from './PreflopGrid';
import { GROUP_COLORS, GROUP_LABELS, FOLD_COLOR } from './preflopData';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PreflopChartModal({ visible, onClose }: Props) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.screen} testID="preflop-chart-modal">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Preflop RFI Chart</Text>
            <Text style={styles.subtitle}>9-max · 100BB · No Ante · RFI Only</Text>
          </View>
          <TouchableOpacity
            testID="preflop-chart-close"
            onPress={onClose}
            style={styles.closeBtn}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Legend */}
          <View style={styles.legend}>
            {([1, 2, 3, 4, 5, 6, 7] as const).map(g => (
              <View key={g} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: GROUP_COLORS[g] }]} />
                <Text style={styles.legendText}>{GROUP_LABELS[g]}</Text>
              </View>
            ))}
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: FOLD_COLOR }]} />
              <Text style={styles.legendText}>Fold</Text>
            </View>
          </View>

          {/* Grid */}
          <View style={styles.gridWrapper}>
            <PreflopGrid />
          </View>

          {/* Freq tier note */}
          <View style={styles.tierNote}>
            <Text style={styles.tierNoteText}>● 75–99%   ● 50–74% (薄色)</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F0F1A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D44',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    color: '#9CA3AF',
    fontSize: 18,
  },
  content: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 12,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    color: '#9CA3AF',
    fontSize: 10,
  },
  gridWrapper: {
    alignItems: 'center',
  },
  tierNote: {
    paddingTop: 4,
  },
  tierNoteText: {
    color: '#64748B',
    fontSize: 10,
  },
});
