import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { useActionTimer, ACTION_TIMER_DURATION_MS } from '../../src/hooks/useActionTimer';
import { Phase } from '../../src/gameEngine';

// Helper component to consume the hook and expose values via testIDs
function TimerConsumer({
  mode = 'hotseat' as const,
  activePlayer = 0,
  phase = 'preflop' as Phase,
  onTimeout = jest.fn(),
}: {
  mode?: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
  activePlayer?: number;
  phase?: Phase;
  onTimeout?: () => void;
}) {
  const { remainingMs, durationMs, isRunning } = useActionTimer({
    mode,
    activePlayer,
    phase,
    onTimeout,
  });
  return (
    <View>
      <Text testID="remainingMs">{remainingMs}</Text>
      <Text testID="durationMs">{durationMs}</Text>
      <Text testID="isRunning">{String(isRunning)}</Text>
    </View>
  );
}

// Helper component that allows re-rendering with changed props
function DynamicTimerConsumer({
  initialActivePlayer = 0,
  initialPhase = 'preflop' as Phase,
  mode = 'hotseat' as const,
  onTimeout = jest.fn(),
}: {
  initialActivePlayer?: number;
  initialPhase?: Phase;
  mode?: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
  onTimeout?: () => void;
}) {
  const [activePlayer, setActivePlayer] = useState(initialActivePlayer);
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const { remainingMs, durationMs, isRunning } = useActionTimer({
    mode,
    activePlayer,
    phase,
    onTimeout,
  });
  return (
    <View>
      <Text testID="remainingMs">{remainingMs}</Text>
      <Text testID="durationMs">{durationMs}</Text>
      <Text testID="isRunning">{String(isRunning)}</Text>
      <Text testID="setActivePlayer" onPress={() => setActivePlayer(prev => prev + 1)} />
      <Text testID="setPhase" onPress={() => setPhase('showdown')} />
    </View>
  );
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useActionTimer', () => {
  it('starts running in hotseat mode during betting phase', () => {
    const { getByTestId } = render(
      <TimerConsumer mode="hotseat" activePlayer={0} phase="preflop" />,
    );
    expect(getByTestId('isRunning').props.children).toBe('true');
    expect(getByTestId('durationMs').props.children).toBe(ACTION_TIMER_DURATION_MS);
  });

  it('decreases remainingMs over time', () => {
    const { getByTestId } = render(
      <TimerConsumer mode="hotseat" activePlayer={0} phase="preflop" />,
    );
    act(() => { jest.advanceTimersByTime(5000); });
    const remaining = Number(getByTestId('remainingMs').props.children);
    expect(remaining).toBeLessThanOrEqual(25000);
    expect(remaining).toBeGreaterThanOrEqual(24900);
  });
});
