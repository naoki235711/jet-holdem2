# Action Timer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 30-second action timer that auto-checks or auto-folds on timeout, with a visual progress bar on the active player's seat.

**Architecture:** `useActionTimer` hook manages countdown in GameContext layer (not GameEngine). Timer resets on `activePlayer`/`phase` changes, fires `onTimeout` callback at 0. ActionTimerBar renders a color-transitioning progress bar in PlayerSeat. BLE host owns timer authority; client timer is display-only. PlayerSeat layout is restructured (dealer badge outside, bet outside, status badges added).

**Tech Stack:** React Native, TypeScript, Jest, React Native Testing Library

**Spec:** `docs/superpowers/specs/2026-03-16-action-timer-design.md`

---

## Chunk 1: Timer Colors & useActionTimer Hook

### Task 1: Add timer colors to theme

**Files:**
- Modify: `src/theme/colors.ts:3-13`

- [ ] **Step 1: Add timerWarning and timerDanger colors**

```typescript
// src/theme/colors.ts — add before closing `} as const`
  timerWarning: '#FBBF24',
  timerDanger: '#EF4444',
```

The full `Colors` object becomes:
```typescript
export const Colors = {
  background: '#1A1A2E',
  table: '#16213E',
  text: '#FFFFFF',
  active: '#06B6D4',
  pot: '#10B981',
  subText: '#9CA3AF',
  fold: '#3B82F6',
  call: '#EF4444',
  raise: '#B91C1C',
  overlay: 'rgba(0,0,0,0.7)',
  timerWarning: '#FBBF24',
  timerDanger: '#EF4444',
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/theme/colors.ts
git commit -m "feat: add timer warning/danger colors to theme"
```

---

### Task 2: useActionTimer — TDD

**Files:**
- Create: `src/hooks/useActionTimer.ts`
- Create: `tests/hooks/useActionTimer.test.tsx`

**Reference docs:**
- Spec Section 2: useActionTimer Hook interface and behavior rules
- `src/gameEngine/types.ts:40` for `Phase` type

#### Step Group A: Basic start/stop behavior

- [ ] **Step 1: Write failing tests — timer starts and ticks down**

```typescript
// tests/hooks/useActionTimer.test.tsx

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/hooks/useActionTimer.test.tsx --no-coverage
```

Expected: FAIL — module `../../src/hooks/useActionTimer` not found

- [ ] **Step 3: Write minimal useActionTimer implementation**

```typescript
// src/hooks/useActionTimer.ts

import { useState, useEffect, useRef } from 'react';
import { Phase } from '../gameEngine';

export const ACTION_TIMER_DURATION_MS = 30_000;
const TICK_INTERVAL_MS = 100;

interface UseActionTimerOptions {
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
  activePlayer: number;
  phase: Phase;
  onTimeout: () => void;
}

interface UseActionTimerResult {
  remainingMs: number;
  durationMs: number;
  isRunning: boolean;
}

export function useActionTimer({
  mode,
  activePlayer,
  phase,
  onTimeout,
}: UseActionTimerOptions): UseActionTimerResult {
  const [remainingMs, setRemainingMs] = useState(ACTION_TIMER_DURATION_MS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const shouldRun =
    mode !== 'debug' &&
    activePlayer >= 0 &&
    (phase === 'preflop' || phase === 'flop' || phase === 'turn' || phase === 'river');

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!shouldRun) {
      setRemainingMs(ACTION_TIMER_DURATION_MS);
      return;
    }

    const startTime = Date.now();
    setRemainingMs(ACTION_TIMER_DURATION_MS);

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, ACTION_TIMER_DURATION_MS - elapsed);
      setRemainingMs(remaining);

      if (remaining <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        onTimeoutRef.current();
      }
    }, TICK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activePlayer, phase, shouldRun]);

  return {
    remainingMs,
    durationMs: ACTION_TIMER_DURATION_MS,
    isRunning: shouldRun && remainingMs > 0,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/hooks/useActionTimer.test.tsx --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useActionTimer.ts tests/hooks/useActionTimer.test.tsx
git commit -m "feat: add useActionTimer hook with basic start/tick behavior"
```

#### Step Group B: Timeout, reset, and disabled states

- [ ] **Step 6: Write failing tests — timeout callback, reset, and disabled modes**

Add to `tests/hooks/useActionTimer.test.tsx` inside the `describe('useActionTimer', ...)` block:

```typescript
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
    // Need a component that can change phase while keeping it a betting phase
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
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx jest tests/hooks/useActionTimer.test.tsx --no-coverage
```

Expected: PASS (implementation already handles these cases)

- [ ] **Step 8: Commit**

```bash
git add tests/hooks/useActionTimer.test.tsx
git commit -m "test: add timeout, reset, and disabled mode tests for useActionTimer"
```

---

## Chunk 2: ActionTimerBar Component

### Task 3: ActionTimerBar — TDD

**Files:**
- Create: `src/components/table/ActionTimerBar.tsx`
- Create: `tests/ui/components/ActionTimerBar.test.tsx`

**Reference docs:**
- Spec Section 4: ActionTimerBar interface, color transition, layout

- [ ] **Step 1: Write failing tests**

```typescript
// tests/ui/components/ActionTimerBar.test.tsx

import React from 'react';
import { render } from '@testing-library/react-native';
import { ActionTimerBar } from '../../../src/components/table/ActionTimerBar';

describe('ActionTimerBar', () => {
  it('renders fill bar at 50% width when half time remains', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={15000} durationMs={30000} isActive={true} />,
    );
    const fill = getByTestId('timer-fill');
    const widthStyle = fill.props.style.find(
      (s: any) => s && typeof s === 'object' && 'width' in s,
    );
    expect(widthStyle.width).toBe('50%');
  });

  it('renders fill bar at 100% width when full time remains', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={30000} durationMs={30000} isActive={true} />,
    );
    const fill = getByTestId('timer-fill');
    const widthStyle = fill.props.style.find(
      (s: any) => s && typeof s === 'object' && 'width' in s,
    );
    expect(widthStyle.width).toBe('100%');
  });

  it('renders fill bar at 0% width when time expired', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={0} durationMs={30000} isActive={true} />,
    );
    const fill = getByTestId('timer-fill');
    const widthStyle = fill.props.style.find(
      (s: any) => s && typeof s === 'object' && 'width' in s,
    );
    expect(widthStyle.width).toBe('0%');
  });

  it('uses cyan-ish color when ratio > 0.5', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={25000} durationMs={30000} isActive={true} />,
    );
    const fill = getByTestId('timer-fill');
    const bgStyle = fill.props.style.find(
      (s: any) => s && typeof s === 'object' && 'backgroundColor' in s,
    );
    // Should be interpolated between cyan and yellow, but closer to cyan
    expect(bgStyle.backgroundColor).toMatch(/^rgb\(/);
  });

  it('uses red-ish color when ratio < 0.2', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={3000} durationMs={30000} isActive={true} />,
    );
    const fill = getByTestId('timer-fill');
    const bgStyle = fill.props.style.find(
      (s: any) => s && typeof s === 'object' && 'backgroundColor' in s,
    );
    // Parse the rgb to check red channel is high
    const match = bgStyle.backgroundColor.match(/rgb\((\d+),(\d+),(\d+)\)/);
    expect(Number(match[1])).toBeGreaterThan(200); // red channel high
  });

  it('renders transparent when isActive is false', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={15000} durationMs={30000} isActive={false} />,
    );
    const track = getByTestId('timer-track');
    const trackStyles = track.props.style;
    // Track should exist but be transparent
    expect(trackStyles).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: 'transparent' })]),
    );
  });

  it('always reserves 3px height even when inactive', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={15000} durationMs={30000} isActive={false} />,
    );
    const track = getByTestId('timer-track');
    const heightStyle = track.props.style.find(
      (s: any) => s && typeof s === 'object' && 'height' in s,
    );
    expect(heightStyle.height).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/components/ActionTimerBar.test.tsx --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement ActionTimerBar**

```typescript
// src/components/table/ActionTimerBar.tsx

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

interface ActionTimerBarProps {
  remainingMs: number;
  durationMs: number;
  isActive: boolean;
}

export function ActionTimerBar({ remainingMs, durationMs, isActive }: ActionTimerBarProps) {
  const ratio = Math.max(0, Math.min(1, remainingMs / durationMs));
  const color = timerColor(ratio);

  return (
    <View
      testID="timer-track"
      style={[
        styles.track,
        !isActive && { backgroundColor: 'transparent' },
      ]}
    >
      {isActive && (
        <View
          testID="timer-fill"
          style={[
            styles.fill,
            { width: `${Math.round(ratio * 100)}%`, backgroundColor: color },
          ]}
        />
      )}
    </View>
  );
}

function timerColor(ratio: number): string {
  if (ratio > 0.5) {
    const t = (ratio - 0.5) / 0.5;
    return interpolateColor(Colors.timerWarning, Colors.active, t);
  } else {
    const t = ratio / 0.5;
    return interpolateColor(Colors.timerDanger, Colors.timerWarning, t);
  }
}

function interpolateColor(colorA: string, colorB: string, t: number): string {
  const [rA, gA, bA] = hexToRgb(colorA);
  const [rB, gB, bB] = hexToRgb(colorB);
  const r = Math.round(rA + (rB - rA) * t);
  const g = Math.round(gA + (gB - gA) * t);
  const b = Math.round(bA + (bB - bA) * t);
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 1.5,
    overflow: 'hidden',
    marginTop: 4,
    width: '100%',
  },
  fill: {
    height: '100%',
    borderRadius: 1.5,
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/components/ActionTimerBar.test.tsx --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/table/ActionTimerBar.tsx tests/ui/components/ActionTimerBar.test.tsx
git commit -m "feat: add ActionTimerBar component with color interpolation"
```

---

## Chunk 3: GameContext Integration

### Task 4: Update test helper renderWithGame

**Files:**
- Modify: `tests/ui/helpers/renderWithGame.tsx:47-71`

- [ ] **Step 1: Add timer fields to renderWithGame defaultValue**

Add `timerRemainingMs` and `timerDurationMs` to the `defaultValue` object in `renderWithGame()`:

```typescript
// In the defaultValue object, add after setPreAction:
    timerRemainingMs: null,
    timerDurationMs: 30000,
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

```bash
npx jest --no-coverage
```

Expected: All existing tests still pass

- [ ] **Step 3: Commit**

```bash
git add tests/ui/helpers/renderWithGame.tsx
git commit -m "chore: add timer fields to renderWithGame test helper"
```

---

### Task 5: GameContext timer integration — TDD

**Files:**
- Modify: `src/contexts/GameContext.tsx:1-199`
- Modify: `tests/ui/contexts/GameContext.test.tsx`

**Reference docs:**
- Spec Section 3: GameContext Integration (handleTimeout design, timerRemainingMs values)

- [ ] **Step 1: Write failing tests for GameContext timer integration**

Add to `tests/ui/contexts/GameContext.test.tsx`:

```typescript
// Add imports at top of file
import React from 'react';
import { Text } from 'react-native';
import { render, act, screen } from '@testing-library/react-native';
import { GameContext, GameProvider } from '../../../src/contexts/GameContext';
import { createMockService, createMockGameState } from '../helpers/renderWithGame';
import { ACTION_TIMER_DURATION_MS } from '../../../src/hooks/useActionTimer';

// Note: These tests use mock service (not LocalGameService) because we need to
// assert on handleAction calls without game engine side effects interfering.

// Add new describe block
describe('action timer integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exposes timerRemainingMs as null in debug mode', () => {
    // Use a test component that reads context
    function TimerReader() {
      const ctx = React.useContext(GameContext);
      return <Text testID="timerRemainingMs">{String(ctx?.timerRemainingMs)}</Text>;
    }

    const service = createMockService();
    (service.getState as jest.Mock).mockReturnValue(
      createMockGameState({ phase: 'preflop', activePlayer: 0 }),
    );
    render(
      <GameProvider service={service} mode="debug">
        <TimerReader />
      </GameProvider>,
    );

    expect(screen.getByTestId('timerRemainingMs').props.children).toBe('null');
  });

  it('auto-checks on timeout when canCheck is true', () => {
    function TimerReader() {
      const ctx = React.useContext(GameContext);
      return <Text testID="timerRemainingMs">{String(ctx?.timerRemainingMs)}</Text>;
    }

    const service = createMockService();
    const gameState = createMockGameState({ phase: 'preflop', activePlayer: 0 });
    (service.getState as jest.Mock).mockReturnValue(gameState);
    (service.getActionInfo as jest.Mock).mockReturnValue({
      canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
    });
    (service.handleAction as jest.Mock).mockReturnValue({ valid: true });

    render(
      <GameProvider service={service} mode="hotseat">
        <TimerReader />
      </GameProvider>,
    );

    act(() => { jest.advanceTimersByTime(30100); });

    expect(service.handleAction).toHaveBeenCalledWith(0, { action: 'check' });
  });

  it('auto-folds on timeout when canCheck is false', () => {
    function TimerReader() {
      const ctx = React.useContext(GameContext);
      return <Text testID="timerRemainingMs">{String(ctx?.timerRemainingMs)}</Text>;
    }

    const service = createMockService();
    const gameState = createMockGameState({ phase: 'preflop', activePlayer: 0 });
    (service.getState as jest.Mock).mockReturnValue(gameState);
    (service.getActionInfo as jest.Mock).mockReturnValue({
      canCheck: false, callAmount: 10, minRaise: 20, maxRaise: 1000, canRaise: true,
    });
    (service.handleAction as jest.Mock).mockReturnValue({ valid: true });

    render(
      <GameProvider service={service} mode="hotseat">
        <TimerReader />
      </GameProvider>,
    );

    act(() => { jest.advanceTimersByTime(30100); });

    expect(service.handleAction).toHaveBeenCalledWith(0, { action: 'fold' });
  });

  it('does not auto-action on timeout in ble-client mode', () => {
    function TimerReader() {
      const ctx = React.useContext(GameContext);
      return <Text testID="timerRemainingMs">{String(ctx?.timerRemainingMs)}</Text>;
    }

    const service = createMockService();
    const gameState = createMockGameState({ phase: 'preflop', activePlayer: 0 });
    (service.getState as jest.Mock).mockReturnValue(gameState);

    render(
      <GameProvider service={service} mode="ble-client">
        <TimerReader />
      </GameProvider>,
    );

    act(() => { jest.advanceTimersByTime(31000); });

    // handleAction should not have been called (except possibly from subscribe mock)
    // Check that no check/fold was issued
    const calls = (service.handleAction as jest.Mock).mock.calls;
    const timeoutCalls = calls.filter(
      ([, action]: [number, any]) => action.action === 'check' || action.action === 'fold',
    );
    expect(timeoutCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/contexts/GameContext.test.tsx --no-coverage
```

Expected: FAIL — `timerRemainingMs` not in GameContextValue

- [ ] **Step 3: Integrate useActionTimer into GameContext**

Modify `src/contexts/GameContext.tsx`:

1. Add import at top (after existing imports):
```typescript
import { useActionTimer, ACTION_TIMER_DURATION_MS } from '../hooks/useActionTimer';
```

2. Add `timerRemainingMs` and `timerDurationMs` to `GameContextValue` interface (after `setPreAction`):
```typescript
  timerRemainingMs: number | null;
  timerDurationMs: number;
```

3. Add `handleTimeout` callback and `useActionTimer` call in `GameProvider` (after `rematch` callback, before the `value` construction):
```typescript
  const handleTimeout = useCallback(() => {
    if (mode === 'debug' || mode === 'ble-client') return;

    const currentState = serviceRef.current.getState();
    if (currentState.activePlayer < 0) return;

    const seat = currentState.activePlayer;
    const actionInfo = serviceRef.current.getActionInfo(seat);

    if (actionInfo.canCheck) {
      doAction(seat, { action: 'check' });
    } else {
      doAction(seat, { action: 'fold' });
    }
  }, [mode, doAction]);

  const { remainingMs, durationMs, isRunning } = useActionTimer({
    mode,
    activePlayer: state?.activePlayer ?? -1,
    phase: state?.phase ?? 'waiting',
    onTimeout: handleTimeout,
  });
```

4. Add timer fields to `value` object (after `setPreAction`):
```typescript
    timerRemainingMs: mode === 'debug' ? null : (isRunning ? remainingMs : null),
    timerDurationMs: durationMs,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/ui/contexts/GameContext.test.tsx --no-coverage
```

Expected: PASS

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npx jest --no-coverage
```

Expected: All tests pass. Some tests may fail if `GameContextValue` shape is checked — fix by ensuring `renderWithGame` has the new fields (done in Task 4).

- [ ] **Step 6: Commit**

```bash
git add src/contexts/GameContext.tsx tests/ui/contexts/GameContext.test.tsx
git commit -m "feat: integrate useActionTimer into GameContext with auto-check/fold on timeout"
```

---

## Chunk 4: PlayerSeat Layout & Timer Bar Integration

### Task 6: PlayerSeat layout restructure + ActionTimerBar

**Files:**
- Modify: `src/components/table/PlayerSeat.tsx:1-97`
- Modify: `tests/ui/components/PlayerSeat.test.tsx:1-73`

**Reference docs:**
- Spec Section 4: PlayerSeat layout change, ActionTimerBar integration
- Current PlayerSeat: dealer badge in header (line 37), bet inside container (lines 48-50)

- [ ] **Step 1: Write failing tests for new layout**

Add to `tests/ui/components/PlayerSeat.test.tsx`:

```typescript
// Add import
import { ACTION_TIMER_DURATION_MS } from '../../../src/hooks/useActionTimer';

  it('shows status badge for folded player', () => {
    const state = createMockGameState({
      players: [
        { seat: 0, name: 'Alice', chips: 990, status: 'folded', bet: 0, cards: ['Ah', 'Kh'] },
        { seat: 1, name: 'Bob', chips: 995, status: 'active', bet: 5, cards: ['Td', 'Jd'] },
        { seat: 2, name: 'Charlie', chips: 990, status: 'active', bet: 10, cards: ['7s', '8s'] },
      ],
    });
    renderWithGame(<PlayerSeat seat={0} />, { state });
    expect(screen.getByText('FOLDED')).toBeTruthy();
  });

  it('shows status badge for allIn player', () => {
    const state = createMockGameState({
      players: [
        { seat: 0, name: 'Alice', chips: 0, status: 'allIn', bet: 990, cards: ['Ah', 'Kh'] },
        { seat: 1, name: 'Bob', chips: 995, status: 'active', bet: 5, cards: ['Td', 'Jd'] },
        { seat: 2, name: 'Charlie', chips: 990, status: 'active', bet: 10, cards: ['7s', '8s'] },
      ],
    });
    renderWithGame(<PlayerSeat seat={0} />, { state });
    expect(screen.getByText('ALL IN')).toBeTruthy();
  });

  it('renders timer bar track for active player', () => {
    const { getByTestId } = renderWithGame(<PlayerSeat seat={0} />, {
      state: createMockGameState({ activePlayer: 0 }),
      mode: 'hotseat',
      timerRemainingMs: 15000,
      timerDurationMs: ACTION_TIMER_DURATION_MS,
    });
    expect(getByTestId('timer-track')).toBeTruthy();
  });

  it('renders transparent timer bar for non-active player', () => {
    const { getByTestId } = renderWithGame(<PlayerSeat seat={1} />, {
      state: createMockGameState({ activePlayer: 0 }),
      mode: 'hotseat',
      timerRemainingMs: 15000,
      timerDurationMs: ACTION_TIMER_DURATION_MS,
    });
    const track = getByTestId('timer-track');
    expect(track.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: 'transparent' })]),
    );
  });

  it('renders dealer badge outside container', () => {
    const { getByTestId } = renderWithGame(<PlayerSeat seat={0} />, {
      state: createMockGameState({ dealer: 0 }),
    });
    // Dealer badge should be a sibling of the main container, not inside header
    const wrapper = getByTestId('player-seat-wrapper-0');
    expect(wrapper).toBeTruthy();
    expect(screen.getByTestId('dealer-badge-0')).toBeTruthy();
  });

  it('renders bet amount outside container', () => {
    const { getByTestId } = renderWithGame(<PlayerSeat seat={2} />, {
      state: createMockGameState(),
    });
    expect(getByTestId('bet-outside-2')).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/ui/components/PlayerSeat.test.tsx --no-coverage
```

Expected: FAIL — missing testIDs and elements

- [ ] **Step 3: Rewrite PlayerSeat with new layout**

```typescript
// src/components/table/PlayerSeat.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { PlayingCard } from '../common/PlayingCard';
import { ChipAmount } from '../common/ChipAmount';
import { Colors } from '../../theme/colors';
import { ActionTimerBar } from './ActionTimerBar';

interface PlayerSeatProps {
  seat: number;
}

export function PlayerSeat({ seat }: PlayerSeatProps) {
  const { state, mode, viewingSeat, timerRemainingMs, timerDurationMs } = useGame();
  if (!state) return null;

  const player = state.players.find(p => p.seat === seat);
  if (!player) return null;

  const isActive = state.activePlayer === seat;
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'allIn';
  const isDealer = state.dealer === seat;
  const showCards = mode === 'debug' || seat === viewingSeat;
  const timerIsActive = isActive && timerRemainingMs !== null;

  return (
    <View testID={`player-seat-wrapper-${seat}`}>
      {isDealer && (
        <View style={styles.dealerBadgeOuter} testID={`dealer-badge-${seat}`}>
          <Text style={styles.dealer}>D</Text>
        </View>
      )}

      <View
        testID={`player-seat-${seat}`}
        style={[
          styles.container,
          isActive && styles.active,
          isFolded && styles.folded,
        ]}
      >
        <Text style={styles.name}>{player.name}</Text>

        <View style={styles.cards}>
          {player.cards.map((card, i) => (
            <PlayingCard key={i} card={card} faceUp={showCards} size="hand" />
          ))}
        </View>

        <ChipAmount amount={player.chips} color={Colors.text} fontSize={12} testID={`chip-stack-${seat}`} />

        {isFolded && <Text style={styles.statusBadge}>FOLDED</Text>}
        {isAllIn && <Text style={styles.statusBadge}>ALL IN</Text>}

        <ActionTimerBar
          remainingMs={timerRemainingMs ?? 0}
          durationMs={timerDurationMs}
          isActive={timerIsActive}
        />
      </View>

      {player.bet > 0 && (
        <View testID={`bet-outside-${seat}`} style={styles.betOuter}>
          <ChipAmount amount={player.bet} color={Colors.pot} fontSize={11} testID={`bet-amount-${seat}`} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.05)',
    minWidth: 70,
  },
  active: {
    borderColor: Colors.active,
  },
  folded: {
    opacity: 0.5,
  },
  name: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  dealerBadgeOuter: {
    alignItems: 'center',
    marginBottom: 2,
  },
  dealer: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: '#78350F',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  cards: {
    flexDirection: 'row',
    gap: 2,
    marginVertical: 4,
  },
  statusBadge: {
    color: Colors.text,
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 2,
  },
  betOuter: {
    alignItems: 'center',
    marginTop: 4,
  },
});
```

- [ ] **Step 4: Update existing tests that may break**

Some existing tests reference the old structure. Update as needed:

1. The "shows dealer badge" test now needs to find 'D' via `dealer-badge-0` testID
2. The "shows bet amount" test — bet still renders with text '10', should still pass
3. Tests that check `player-seat-0` style array — the container is now nested inside a wrapper

Review each failing test and adjust assertions to match the new DOM structure.

- [ ] **Step 5: Run tests to verify all pass**

```bash
npx jest tests/ui/components/PlayerSeat.test.tsx --no-coverage
```

Expected: PASS

- [ ] **Step 6: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/components/table/PlayerSeat.tsx tests/ui/components/PlayerSeat.test.tsx
git commit -m "feat: restructure PlayerSeat layout with timer bar, dealer/bet outside, status badges"
```

---

## Chunk 5: Final Integration & Verification

### Task 7: Full integration test run

- [ ] **Step 1: Run complete test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass

- [ ] **Step 2: Run TypeScript type check**

```bash
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 3: Verify no lint errors**

```bash
npx eslint src/hooks/useActionTimer.ts src/components/table/ActionTimerBar.tsx src/components/table/PlayerSeat.tsx src/contexts/GameContext.tsx src/theme/colors.ts
```

Expected: No errors

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address lint/type issues from action timer integration"
```

(Skip if no fixes were needed)
