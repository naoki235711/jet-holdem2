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
