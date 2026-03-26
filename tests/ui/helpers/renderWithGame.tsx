import React from 'react';
import { render } from '@testing-library/react-native';
import { GameContext, GameContextValue } from '../../../src/contexts/GameContext';
import { GameState, PlayerAction, Blinds } from '../../../src/gameEngine';
import { ActionResult, ShowdownResult } from '../../../src/gameEngine';
import { GameService, ActionInfo } from '../../../src/services/GameService';

export function createMockService(overrides: Partial<GameService> = {}): GameService {
  return {
    getState: jest.fn(() => createMockGameState()),
    getActionInfo: jest.fn(() => ({
      canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
    })),
    startGame: jest.fn(),
    startRound: jest.fn(),
    handleAction: jest.fn(() => ({ valid: true })),
    resolveShowdown: jest.fn(() => ({ winners: [], hands: [] })),
    prepareNextRound: jest.fn(),
    advanceRunout: jest.fn(),
    subscribe: jest.fn(() => () => {}),
    ...overrides,
  };
}

export function createMockGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    seq: 1,
    phase: 'preflop',
    community: [],
    pots: [{ amount: 15, eligible: [0, 1, 2] }],
    currentBet: 10,
    activePlayer: 0,
    dealer: 0,
    blinds: { sb: 5, bb: 10 },
    players: [
      { seat: 0, name: 'Alice', chips: 990, status: 'active', bet: 0, cards: ['Ah', 'Kh'] },
      { seat: 1, name: 'Bob', chips: 995, status: 'active', bet: 5, cards: ['Td', 'Jd'] },
      { seat: 2, name: 'Charlie', chips: 990, status: 'active', bet: 10, cards: ['7s', '8s'] },
    ],
    ...overrides,
  };
}

export function renderWithGame(
  ui: React.ReactElement,
  contextOverrides: Partial<GameContextValue> = {},
) {
  const defaultValue: GameContextValue = {
    state: createMockGameState(),
    mode: 'debug',
    viewingSeat: 0,
    service: createMockService(),
    showdownResult: null,
    doAction: jest.fn(() => ({ valid: true })),
    getActionInfo: jest.fn(() => ({
      canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
    })),
    nextRound: jest.fn(),
    rematch: jest.fn(),
    setViewingSeat: jest.fn(),
    preAction: null,
    setPreAction: jest.fn(),
    timerRemainingMs: null,
    timerDurationMs: 30000,
    ...contextOverrides,
  };

  return {
    ...render(
      <GameContext.Provider value={defaultValue}>{ui}</GameContext.Provider>,
    ),
    contextValue: defaultValue,
  };
}
