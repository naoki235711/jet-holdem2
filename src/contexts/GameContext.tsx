import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { GameState, PlayerAction } from '../gameEngine';
import { ShowdownResult } from '../gameEngine';
import { GameService, ActionInfo } from '../services/GameService';
import { ActionResult } from '../gameEngine';

export interface GameContextValue {
  state: GameState | null;
  mode: 'hotseat' | 'debug';
  viewingSeat: number;
  service: GameService;
  showdownResult: ShowdownResult | null;
  doAction: (seat: number, action: PlayerAction) => ActionResult;
  getActionInfo: (seat: number) => ActionInfo;
  nextRound: () => void;
  setViewingSeat: (seat: number) => void;
}

export const GameContext = createContext<GameContextValue | null>(null);

interface GameProviderProps {
  children: React.ReactNode;
  service: GameService;
  mode: 'hotseat' | 'debug';
}

export function GameProvider({ children, service, mode }: GameProviderProps) {
  const [state, setState] = useState<GameState | null>(null);
  const [viewingSeat, setViewingSeat] = useState(0);
  const [showdownResult, setShowdownResult] = useState<ShowdownResult | null>(null);
  const serviceRef = useRef(service);
  serviceRef.current = service;

  useEffect(() => {
    // Sync initial state in case service already has state before subscription
    try {
      setState(service.getState());
    } catch {
      // Service may not have state yet (e.g., game not started)
    }

    const unsub = service.subscribe((newState) => {
      setState(newState);
    });
    return unsub;
  }, [service]);

  // Auto-update viewingSeat in hotseat mode
  useEffect(() => {
    if (mode === 'hotseat' && state && state.activePlayer >= 0) {
      setViewingSeat(state.activePlayer);
    }
  }, [mode, state?.activePlayer]);

  const doAction = useCallback((seat: number, action: PlayerAction): ActionResult => {
    const result = serviceRef.current.handleAction(seat, action);
    if (!result.valid) return result;

    // Auto-resolve showdown
    const currentState = serviceRef.current.getState();
    if (currentState.phase === 'showdown') {
      const sdResult = serviceRef.current.resolveShowdown();
      setShowdownResult(sdResult);
    }
    return result;
  }, []);

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
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
