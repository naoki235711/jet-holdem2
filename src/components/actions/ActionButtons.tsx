// src/components/actions/ActionButtons.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { RaiseSlider } from './RaiseSlider';
import { Colors } from '../../theme/colors';

export function ActionButtons() {
  const { state, mode, viewingSeat, doAction, getActionInfo } = useGame();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [raiseValue, setRaiseValue] = useState(0);

  const actingSeat = mode === 'debug' ? (state?.activePlayer ?? -1) : viewingSeat;
  const isMyTurn = state?.activePlayer === actingSeat && state?.activePlayer >= 0;

  const info = useMemo(() => {
    if (!state || !isMyTurn) return null;
    return getActionInfo(actingSeat);
  }, [state, isMyTurn, actingSeat, getActionInfo]);

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

  const disabled = !isMyTurn;
  const showAllIn = info && !info.canRaise && info.callAmount > 0;

  return (
    <View style={styles.container}>
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
});
