// src/components/actions/ActionButtons.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { RaiseSlider } from './RaiseSlider';
import { PreActionBar } from './PreActionBar';
import { calculatePresets } from './presetCalculator';
import { Colors } from '../../theme/colors';

export function ActionButtons() {
  const { state, mode, viewingSeat, doAction, getActionInfo, preAction, setPreAction, service } = useGame();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [raiseValue, setRaiseValue] = useState(0);

  const actingSeat = mode === 'debug' ? (state?.activePlayer ?? -1) : viewingSeat;
  const isMyTurn = state?.activePlayer === actingSeat && state?.activePlayer >= 0;
  const isBleMode = mode === 'ble-host' || mode === 'ble-client';

  const isBotTurn = (() => {
    if (!state || state.activePlayer < 0) return false;
    const botSeats = service.getBotSeats?.() ?? new Set<number>();
    return botSeats.has(state.activePlayer);
  })();

  const info = useMemo(() => {
    if (!state || !isMyTurn || isBotTurn) return null;  // ← isBotTurn追加
    return getActionInfo(actingSeat);
  }, [state, isMyTurn, isBotTurn, actingSeat, getActionInfo]);

  useEffect(() => {
    if (info) setRaiseValue(info.minRaise);
  }, [info?.minRaise]);

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  const handleAction = (action: 'fold' | 'check' | 'call' | 'raise' | 'allIn', amount?: number) => {
    const result = doAction(actingSeat, { action, amount });
    if (!result.valid && result.reason) {
      setErrorMsg(result.reason);
    }
  };

  if (!state || state.phase === 'roundEnd' || state.phase === 'showdown') return null;

  // Spectator: show indicator instead of action buttons
  if (mode === 'ble-spectator') {
    return (
      <View style={styles.container}>
        <View style={styles.spectatorIndicator}>
          <Text style={styles.spectatorText}>観戦中</Text>
        </View>
      </View>
    );
  }

  // Pre-action bar: show only in BLE mode when not my turn
  if (!isMyTurn && isBleMode) {
    const myPlayer = state.players.find(p => p.seat === viewingSeat);
    const callAmount = Math.max(0, state.currentBet - (myPlayer?.bet ?? 0));
    return (
      <View style={styles.container}>
        <PreActionBar
          selected={preAction}
          onSelect={setPreAction}
          callAmount={callAmount}
        />
      </View>
    );
  }

  // Non-BLE modes when not my turn: render disabled action buttons (existing behavior)
  const disabled = !isMyTurn;
  const showAllIn = info && !info.canRaise && info.callAmount > 0;

  // Presets
  const presets = state && isMyTurn && info?.canRaise
    ? calculatePresets(state, actingSeat)
    : [];

  // Validate presets against minRaise/maxRaise
  const validatedPresets = presets.map(p => {
    const clamped = Math.min(p.value, info?.maxRaise ?? p.value);
    const isDisabled = clamped < (info?.minRaise ?? 0);
    const isAllIn = clamped >= (info?.maxRaise ?? Infinity);
    return { ...p, value: clamped, isDisabled, isAllIn };
  });
  const hasAnyEnabledPreset = validatedPresets.some(p => !p.isDisabled);

  const handlePresetPress = (value: number, isAllIn: boolean) => {
    if (isAllIn) {
      handleAction('allIn');
    } else {
      handleAction('raise', value);
    }
  };

  return (
    <View style={styles.container}>
      {info?.canRaise && isMyTurn && hasAnyEnabledPreset && (
        <View style={styles.presetRow}>
          {validatedPresets.map(p => (
            <TouchableOpacity
              key={p.label}
              testID={`preset-${p.label}`}
              style={[styles.presetButton, p.isDisabled && styles.disabled]}
              onPress={() => handlePresetPress(p.value, p.isAllIn)}
              disabled={p.isDisabled}
              accessibilityState={{ disabled: p.isDisabled }}
            >
              <Text style={styles.presetText}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {info?.canRaise && isMyTurn && (
        <RaiseSlider
          minRaise={info.minRaise}
          maxRaise={info.maxRaise}
          bbSize={state.blinds.bb}
          value={raiseValue}
          onValueChange={setRaiseValue}
        />
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          testID="fold-btn"
          style={[styles.button, styles.foldBtn, disabled && styles.disabled]}
          onPress={() => handleAction('fold')}
          disabled={disabled}
          accessibilityState={{ disabled }}
        >
          <Text style={styles.buttonText}>FOLD</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="call-btn"
          style={[styles.button, styles.callBtn, disabled && styles.disabled]}
          onPress={() => info?.canCheck
            ? handleAction('check')
            : handleAction('call')
          }
          disabled={disabled}
          accessibilityState={{ disabled }}
        >
          <Text style={styles.buttonText}>
            {info?.canCheck ? 'CHECK' : `CALL ${info?.callAmount ?? 0}`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="raise-btn"
          style={[styles.button, styles.raiseBtn, disabled && styles.disabled]}
          onPress={() => {
            if (showAllIn) {
              handleAction('allIn');
            } else if (info && raiseValue >= info.maxRaise) {
              handleAction('allIn');
            } else {
              handleAction('raise', raiseValue);
            }
          }}
          disabled={disabled || (!info?.canRaise && !showAllIn)}
          accessibilityState={{ disabled: disabled || (!info?.canRaise && !showAllIn) }}
        >
          <Text style={styles.buttonText}>
            {showAllIn
              ? `ALL IN ${info?.maxRaise ?? 0}`
              : raiseValue >= (info?.maxRaise ?? 0)
                ? `ALL IN ${info?.maxRaise ?? 0}`
                : `RAISE ${raiseValue}`}
          </Text>
        </TouchableOpacity>
      </View>

      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    backgroundColor: Colors.background,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 6,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#374151',
    alignItems: 'center',
  },
  presetText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  foldBtn: { backgroundColor: Colors.fold },
  callBtn: { backgroundColor: Colors.call },
  raiseBtn: { backgroundColor: Colors.raise },
  disabled: { opacity: 0.4 },
  buttonText: { color: Colors.text, fontWeight: 'bold', fontSize: 14 },
  error: { color: '#EF4444', fontSize: 12, textAlign: 'center', marginTop: 4 },
  spectatorIndicator: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  spectatorText: {
    color: Colors.subText,
    fontSize: 16,
    fontWeight: '600',
  },
});
