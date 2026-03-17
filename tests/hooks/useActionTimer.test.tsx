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

  it('calls onTimeout exactly once after 30 seconds', () => {
    const onTimeout = jest.fn();
    render(
      <TimerConsumer mode="hotseat" activePlayer={0} phase="preflop" onTimeout={onTimeout} />,
    );
    act(() => { jest.advanceTimersByTime(30000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not call onTimeout before 30 seconds', () => {
    const onTimeout = jest.fn();
    render(
      <TimerConsumer mode="hotseat" activePlayer={0} phase="preflop" onTimeout={onTimeout} />,
    );
    act(() => { jest.advanceTimersByTime(29900); });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('resets timer when activePlayer changes', () => {
    const { getByTestId } = render(<DynamicTimerConsumer />);
    act(() => { jest.advanceTimersByTime(15000); });
    const beforeReset = Number(getByTestId('remainingMs').props.children);
    expect(beforeReset).toBeLessThan(20000);

    // Change activePlayer
    act(() => { getByTestId('setActivePlayer').props.onPress(); });
    act(() => { jest.advanceTimersByTime(100); });
    const afterReset = Number(getByTestId('remainingMs').props.children);
    expect(afterReset).toBeGreaterThanOrEqual(29000);
  });

  it('is disabled in debug mode', () => {
    const onTimeout = jest.fn();
    const { getByTestId } = render(
      <TimerConsumer mode="debug" activePlayer={0} phase="preflop" onTimeout={onTimeout} />,
    );
    expect(getByTestId('isRunning').props.children).toBe('false');
    act(() => { jest.advanceTimersByTime(31000); });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('is disabled during non-betting phases', () => {
    const { getByTestId } = render(
      <TimerConsumer mode="hotseat" activePlayer={0} phase="showdown" />,
    );
    expect(getByTestId('isRunning').props.children).toBe('false');
  });

  it('is disabled when activePlayer is -1', () => {
    const { getByTestId } = render(
      <TimerConsumer mode="hotseat" activePlayer={-1} phase="preflop" />,
    );
    expect(getByTestId('isRunning').props.children).toBe('false');
  });

  it('resets timer when phase changes between betting phases', () => {
    function PhaseChanger() {
      const [phase, setPhase] = React.useState<Phase>('preflop');
      const onTimeout = jest.fn();
      const { remainingMs } = useActionTimer({
        mode: 'hotseat',
        activePlayer: 0,
        phase,
        onTimeout,
      });
      return (
        <View>
          <Text testID="remainingMs">{remainingMs}</Text>
          <Text testID="toFlop" onPress={() => setPhase('flop')} />
        </View>
      );
    }

    const { getByTestId } = render(<PhaseChanger />);
    act(() => { jest.advanceTimersByTime(15000); });
    const beforeReset = Number(getByTestId('remainingMs').props.children);
    expect(beforeReset).toBeLessThan(20000);

    // Change phase from preflop to flop (both betting phases)
    act(() => { getByTestId('toFlop').props.onPress(); });
    act(() => { jest.advanceTimersByTime(100); });
    const afterReset = Number(getByTestId('remainingMs').props.children);
    expect(afterReset).toBeGreaterThanOrEqual(29000);
  });

  it('runs in all betting phases', () => {
    for (const phase of ['preflop', 'flop', 'turn', 'river'] as Phase[]) {
      const { getByTestId, unmount } = render(
        <TimerConsumer mode="hotseat" activePlayer={0} phase={phase} />,
      );
      expect(getByTestId('isRunning').props.children).toBe('true');
      unmount();
    }
  });

  it('fires timeout immediately when Date.now jumps forward (background recovery)', () => {
    const onTimeout = jest.fn();
    render(
      <TimerConsumer mode="hotseat" activePlayer={0} phase="preflop" onTimeout={onTimeout} />,
    );
    // Advance real time by 31 seconds in one jump
    act(() => { jest.advanceTimersByTime(31000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
