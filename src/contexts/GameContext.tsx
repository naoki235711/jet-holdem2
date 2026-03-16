import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { GameState, PlayerAction } from '../gameEngine';
import { ShowdownResult } from '../gameEngine';
import { GameService, ActionInfo } from '../services/GameService';
import { ActionResult } from '../gameEngine';
import { GameRepository } from '../services/persistence/GameRepository';
import { usePersistence, PersistenceConfig } from '../hooks/usePersistence';
import { PreActionType } from '../components/actions/types';

export interface GameContextValue {
  state: GameState | null;
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
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
}

export const GameContext = createContext<GameContextValue | null>(null);

interface GameProviderProps {
  children: React.ReactNode;
  service: GameService;
  mode: 'hotseat' | 'debug' | 'ble-host' | 'ble-client';
  repository?: GameRepository;
  initialChips?: number;
  blinds?: { sb: number; bb: number };
  playerNames?: string[];
}

export function GameProvider({ children, service, mode, repository, initialChips, blinds, playerNames }: GameProviderProps) {
  const [state, setState] = useState<GameState | null>(null);
  const [viewingSeat, setViewingSeat] = useState(0);
  const [showdownResult, setShowdownResult] = useState<ShowdownResult | null>(null);
  const serviceRef = useRef(service);
  serviceRef.current = service;
  const playerNamesRef = useRef(playerNames);
  playerNamesRef.current = playerNames;
  const blindsRef = useRef(blinds);
  blindsRef.current = blinds;
  const initialChipsRef = useRef(initialChips);
  initialChipsRef.current = initialChips;

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
  const persistMode = mode === 'debug' ? 'hotseat' : mode;
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
    if (mode === 'ble-client') return;
    const currentState = serviceRef.current.getState();
    if (currentState.phase === 'showdown') {
      const sdResult = serviceRef.current.resolveShowdown();
      setShowdownResult(sdResult);
    }
  }, [mode]);

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
      if (mode === 'ble-client' && prevPhaseRef.current !== 'showdown' && newState.phase === 'showdown') {
        const sdResult = serviceRef.current.resolveShowdown();
        if (sdResult.winners.length > 0) {
          setShowdownResult(sdResult);
        }
      }
      // BLE client: clear showdownResult on rematch (preflop after gameOver/roundEnd)
      if (mode === 'ble-client' && newState.phase === 'preflop' && prevPhaseRef.current !== 'preflop') {
        setShowdownResult(null);
      }
      prevPhaseRef.current = newState.phase;
    });
    return unsub;
  }, [service, mode, setPreAction, autoResolveShowdown]);

  // Auto-update viewingSeat in hotseat mode
  useEffect(() => {
    if (mode === 'hotseat' && state && state.activePlayer >= 0) {
      setViewingSeat(state.activePlayer);
    }
  }, [mode, state?.activePlayer]);

  const doAction = useCallback((seat: number, action: PlayerAction): ActionResult => {
    const result = serviceRef.current.handleAction(seat, action);
    if (!result.valid) return result;
    autoResolveShowdown();
    return result;
  }, [autoResolveShowdown]);

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
    serviceRef.current.startGame(names, bl, chips);
    serviceRef.current.startRound();
    setShowdownResult(null);
  }, []);

  const value: GameContextValue = {
    state,
    mode,
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
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
