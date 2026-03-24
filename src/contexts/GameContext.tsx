import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { GameState, PlayerAction } from '../gameEngine';
import { ShowdownResult } from '../gameEngine';
import { GameService, ActionInfo } from '../services/GameService';
import { ActionResult } from '../gameEngine';
import { GameRepository } from '../services/persistence/GameRepository';
import { usePersistence, PersistenceConfig } from '../hooks/usePersistence';
import { PreActionType } from '../components/actions/types';
import { useActionTimer, ACTION_TIMER_DURATION_MS } from '../hooks/useActionTimer';

export interface GameContextValue {
  state: GameState | null;
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client' | 'ble-spectator';
  viewingSeat: number;
  service: GameService;
  showdownResult: ShowdownResult | null;
  doAction: (seat: number, action: PlayerAction) => ActionResult;
  getActionInfo: (seat: number) => ActionInfo;
  nextRound: () => void;
  setViewingSeat: (seat: number) => void;
  rematch: () => void;
  preAction: PreActionType;
  setPreAction: (action: PreActionType) => void;
  timerRemainingMs: number | null;
  timerDurationMs: number;
}

export const GameContext = createContext<GameContextValue | null>(null);

interface GameProviderProps {
  children: React.ReactNode;
  service: GameService;
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client' | 'ble-spectator';
  repository?: GameRepository;
  initialChips?: number;
  blinds?: { sb: number; bb: number };
  playerNames?: string[];
  botCount?: number;
  mySeat?: number;
}

export function GameProvider({ children, service, mode, repository, initialChips, blinds, playerNames, botCount = 0, mySeat: mySeatProp }: GameProviderProps) {
  const [state, setState] = useState<GameState | null>(null);
  const [viewingSeat, setViewingSeat] = useState(0);
  const [showdownResult, setShowdownResult] = useState<ShowdownResult | null>(null);
  const [effectiveMode, setEffectiveMode] = useState(mode);
  const effectiveModeRef = useRef(effectiveMode);
  useEffect(() => { effectiveModeRef.current = effectiveMode; }, [effectiveMode]);
  const serviceRef = useRef(service);
  serviceRef.current = service;
  const playerNamesRef = useRef(playerNames);
  playerNamesRef.current = playerNames;
  const blindsRef = useRef(blinds);
  blindsRef.current = blinds;
  const initialChipsRef = useRef(initialChips);
  initialChipsRef.current = initialChips;
  const botCountRef = useRef(botCount);
  botCountRef.current = botCount;

  // Pre-action state (BLE modes only)
  const [preAction, setPreActionState] = useState<PreActionType>(null);
  const preActionRef = useRef<PreActionType>(null);
  const prevCurrentBetRef = useRef<number>(0);

  // mySeat: fixed seat for BLE modes. For hotseat/debug, pre-actions are disabled.
  // ble-host is always seat 0; ble-client gets viewingSeat (set from route param).
  const mySeatRef = useRef<number | null>(
    mode === 'ble-host' || mode === 'ble-client' ? viewingSeat : null,
  );

  const setPreAction = useCallback((pa: PreActionType) => {
    setPreActionState(pa);
    preActionRef.current = pa;
  }, []);

  useEffect(() => {
    if (mode === 'ble-host' || mode === 'ble-client') {
      mySeatRef.current = viewingSeat;
    }
  }, [viewingSeat, mode]);

  // Persistence hook (always called unconditionally; repository=null disables)
  const persistMode = mode === 'debug' ? 'hotseat' : (mode === 'ble-spectator' ? 'ble-client' : mode);
  usePersistence(
    service,
    repository ?? null,
    {
      mode: persistMode as PersistenceConfig['mode'],
      initialChips: initialChips ?? 0,
      blinds: blinds ?? { sb: 0, bb: 0 },
    },
  );

  const prevPhaseRef = useRef<string | null>(null);

  const autoResolveShowdown = useCallback(() => {
    if (effectiveModeRef.current === 'ble-client' || effectiveModeRef.current === 'ble-spectator') return;
    const currentState = serviceRef.current.getState();
    if (currentState.phase === 'showdown') {
      const sdResult = serviceRef.current.resolveShowdown();
      setShowdownResult(sdResult);
    }
  }, []);

  useEffect(() => {
    // Sync initial state in case service already has state before subscription
    try {
      setState(service.getState());
    } catch {
      // Service may not have state yet (e.g., game not started)
    }

    const unsub = service.subscribe((newState) => {
      setState(newState);

      // Pre-action: reset Call when currentBet changes
      if (preActionRef.current === 'call' && newState.currentBet !== prevCurrentBetRef.current) {
        setPreAction(null);
      }
      prevCurrentBetRef.current = newState.currentBet;

      // Pre-action: auto-execute when it becomes my turn
      const mySeat = mySeatRef.current;
      if (mySeat !== null && newState.activePlayer === mySeat && preActionRef.current) {
        const pa = preActionRef.current;
        setPreAction(null);

        const info = serviceRef.current.getActionInfo(mySeat);
        if (pa === 'checkFold') {
          serviceRef.current.handleAction(mySeat, info.canCheck ? { action: 'check' } : { action: 'fold' });
        } else if (pa === 'call' || pa === 'callAny') {
          serviceRef.current.handleAction(mySeat, info.canCheck ? { action: 'check' } : { action: 'call' });
        }

        autoResolveShowdown();
      }

      // BLE client: detect showdown from host's stateUpdate.
      // showdownResult message arrives before the stateUpdate (same characteristic,
      // sent first in resolveShowdown), so lastShowdownResult is already set.
      if (
        (effectiveModeRef.current === 'ble-client' || effectiveModeRef.current === 'ble-spectator') &&
        prevPhaseRef.current !== 'showdown' &&
        newState.phase === 'showdown'
      ) {
        const sdResult = serviceRef.current.resolveShowdown();
        if (sdResult.winners.length > 0) {
          setShowdownResult(sdResult);
        }
      }
      // BLE client: clear showdownResult on rematch (preflop after gameOver/roundEnd)
      if (
        (effectiveModeRef.current === 'ble-client' || effectiveModeRef.current === 'ble-spectator') &&
        newState.phase === 'preflop' &&
        prevPhaseRef.current !== 'preflop'
      ) {
        setShowdownResult(null);
      }
      prevPhaseRef.current = newState.phase;

      // Auto-transition to ble-spectator when mySeat player busts
      if (effectiveModeRef.current === 'ble-client' && mySeatProp !== undefined) {
        const myPlayer = newState.players.find(p => p.seat === mySeatProp);
        if (myPlayer?.status === 'out') {
          setEffectiveMode('ble-spectator');
        }
      }
    });
    return unsub;
  }, [service, mode, setPreAction, autoResolveShowdown]);

  // Auto-update viewingSeat in hotseat mode（Bot席はスキップ）
  useEffect(() => {
    if (mode === 'hotseat' && state && state.activePlayer >= 0) {
      const botSeats = serviceRef.current.getBotSeats?.() ?? new Set<number>();
      if (!botSeats.has(state.activePlayer)) {
        setViewingSeat(state.activePlayer);
      }
    }
  }, [mode, state?.activePlayer]);

  const doAction = useCallback((seat: number, action: PlayerAction): ActionResult => {
    if (effectiveMode === 'ble-spectator') {
      return { valid: false, reason: 'Spectator cannot act' };
    }
    const result = serviceRef.current.handleAction(seat, action);
    if (!result.valid) return result;
    autoResolveShowdown();
    return result;
  }, [effectiveMode, autoResolveShowdown]);

  const getActionInfo = useCallback((seat: number): ActionInfo => {
    return serviceRef.current.getActionInfo(seat);
  }, []);

  const nextRound = useCallback(() => {
    serviceRef.current.prepareNextRound();
    const nextState = serviceRef.current.getState();
    if (nextState.phase !== 'gameOver') {
      serviceRef.current.startRound();
    }
    setShowdownResult(null);
  }, []);

  const rematch = useCallback(() => {
    const names = playerNamesRef.current;
    const bl = blindsRef.current;
    const chips = initialChipsRef.current;
    if (names == null || bl == null || chips == null) return;
    serviceRef.current.startGame(names, bl, chips, undefined, botCountRef.current);
    serviceRef.current.startRound();
    setShowdownResult(null);
  }, []);

  const handleTimeout = useCallback(() => {
    if (mode === 'debug' || mode === 'ble-client') return;

    const currentState = serviceRef.current.getState();
    if (currentState.activePlayer < 0) return;

    const seat = currentState.activePlayer;
    // Bot席はタイムアウト処理しない（Bot自身が1秒タイマーで処理する）
    const botSeats = serviceRef.current.getBotSeats?.() ?? new Set<number>();
    if (botSeats.has(seat)) return;
    const actionInfo = serviceRef.current.getActionInfo(seat);

    if (actionInfo.canCheck) {
      doAction(seat, { action: 'check' });
    } else {
      doAction(seat, { action: 'fold' });
    }
  }, [mode, doAction]);

  const { remainingMs, durationMs, isRunning } = useActionTimer({
    mode: mode,
    activePlayer: state?.activePlayer ?? -1,
    phase: state?.phase ?? 'waiting',
    onTimeout: handleTimeout,
  });

  const value: GameContextValue = {
    state,
    mode: effectiveMode,
    viewingSeat,
    service,
    showdownResult,
    doAction,
    getActionInfo,
    nextRound,
    setViewingSeat,
    rematch,
    preAction,
    setPreAction,
    timerRemainingMs: effectiveMode === 'debug' ? null : (isRunning ? remainingMs : null),
    timerDurationMs: durationMs,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
