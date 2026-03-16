// tests/ui/components/ActionButtons.test.tsx

import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { ActionButtons } from '../../../src/components/actions/ActionButtons';
import { renderWithGame, createMockGameState } from '../helpers/renderWithGame';

describe('ActionButtons', () => {
  it('shows FOLD, CHECK, RAISE when no bet to call', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0, currentBet: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    expect(screen.getByText('FOLD')).toBeTruthy();
    expect(screen.getByText('CHECK')).toBeTruthy();
    expect(screen.getByText(/RAISE/)).toBeTruthy();
  });

  it('shows FOLD, CALL, RAISE when there is a bet', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0, currentBet: 20 }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: false, callAmount: 20, minRaise: 40, maxRaise: 1000, canRaise: true,
      })),
    });
    expect(screen.getByText('FOLD')).toBeTruthy();
    expect(screen.getByText(/CALL 20/)).toBeTruthy();
    expect(screen.getByText(/RAISE/)).toBeTruthy();
  });

  it('shows ALL IN when cannot raise but can call', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: false, callAmount: 100, minRaise: 200, maxRaise: 150, canRaise: false,
      })),
    });
    expect(screen.getByText(/ALL IN/)).toBeTruthy();
  });

  it('disables all buttons when not active player turn in hotseat mode', () => {
    const { getByTestId } = renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 1 }),
      viewingSeat: 0,
      mode: 'hotseat',
    });
    expect(getByTestId('fold-btn').props.accessibilityState?.disabled).toBe(true);
  });

  it('enables buttons in debug mode regardless of viewingSeat', () => {
    const { getByTestId } = renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 1 }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    expect(getByTestId('fold-btn').props.accessibilityState?.disabled).toBe(false);
  });

  it('calls doAction with fold when FOLD pressed', () => {
    const doAction = jest.fn(() => ({ valid: true }));
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      doAction,
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    fireEvent.press(screen.getByText('FOLD'));
    expect(doAction).toHaveBeenCalledWith(0, { action: 'fold' });
  });

  it('calls doAction with raise TO amount', () => {
    const doAction = jest.fn(() => ({ valid: true }));
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      doAction,
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    fireEvent.press(screen.getByText(/RAISE/));
    expect(doAction).toHaveBeenCalledWith(0, { action: 'raise', amount: 20 });
  });

  it('shows error message when action is invalid', () => {
    const doAction = jest.fn(() => ({ valid: false, reason: 'テスト用エラー' }));
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      doAction,
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    fireEvent.press(screen.getByText('FOLD'));
    expect(screen.getByText('テスト用エラー')).toBeTruthy();
  });

  it('shows postflop preset buttons when canRaise on flop', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({
        phase: 'flop',
        activePlayer: 0,
        currentBet: 0,
        pots: [{ amount: 300, eligible: [0, 1, 2] }],
      }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByText('Pot')).toBeTruthy();
  });

  it('shows preflop preset buttons on preflop', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: false, callAmount: 10, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    expect(screen.getByText('2.5BB')).toBeTruthy();
    expect(screen.getByText('3BB')).toBeTruthy();
    expect(screen.getByText('4BB')).toBeTruthy();
  });

  it('executes raise immediately when preset button pressed', () => {
    const doAction = jest.fn(() => ({ valid: true }));
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({
        phase: 'flop',
        activePlayer: 0,
        currentBet: 0,
        pots: [{ amount: 300, eligible: [0, 1, 2] }],
        players: [
          { seat: 0, name: 'Alice', chips: 1000, status: 'active', bet: 0, cards: ['Ah', 'Kh'] },
          { seat: 1, name: 'Bob', chips: 1000, status: 'active', bet: 0, cards: ['Td', 'Jd'] },
          { seat: 2, name: 'Charlie', chips: 1000, status: 'active', bet: 0, cards: ['7s', '8s'] },
        ],
      }),
      viewingSeat: 0,
      mode: 'debug',
      doAction,
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
      })),
    });
    fireEvent.press(screen.getByText('1/2'));
    // 1/2 pot of 300 = 150
    expect(doAction).toHaveBeenCalledWith(0, { action: 'raise', amount: 150 });
  });

  it('executes allIn when preset value >= maxRaise', () => {
    const doAction = jest.fn(() => ({ valid: true }));
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({
        phase: 'flop',
        activePlayer: 0,
        currentBet: 0,
        pots: [{ amount: 300, eligible: [0, 1, 2] }],
        players: [
          { seat: 0, name: 'Alice', chips: 1000, status: 'active', bet: 0, cards: ['Ah', 'Kh'] },
          { seat: 1, name: 'Bob', chips: 1000, status: 'active', bet: 0, cards: ['Td', 'Jd'] },
          { seat: 2, name: 'Charlie', chips: 1000, status: 'active', bet: 0, cards: ['7s', '8s'] },
        ],
      }),
      viewingSeat: 0,
      mode: 'debug',
      doAction,
      getActionInfo: jest.fn(() => ({
        canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 200, canRaise: true,
      })),
    });
    // Pot = 300, but maxRaise = 200, so Pot preset is clamped to 200 → allIn
    fireEvent.press(screen.getByText('Pot'));
    expect(doAction).toHaveBeenCalledWith(0, { action: 'allIn' });
  });

  it('hides presets when canRaise is false', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ phase: 'flop', activePlayer: 0 }),
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: false, callAmount: 100, minRaise: 200, maxRaise: 150, canRaise: false,
      })),
    });
    expect(screen.queryByText('1/3')).toBeNull();
    expect(screen.queryByText('1/2')).toBeNull();
  });

  it('disables preset buttons below minRaise', () => {
    const { getByTestId } = renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }), // preflop, bb=10
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: false, callAmount: 10, minRaise: 40, maxRaise: 1000, canRaise: true,
      })),
    });
    // 2.5BB=30, 3BB=30 — both below minRaise=40 → disabled
    // 4BB=40 → enabled
    expect(getByTestId('preset-2.5BB').props.accessibilityState?.disabled).toBe(true);
    expect(getByTestId('preset-3BB').props.accessibilityState?.disabled).toBe(true);
    expect(getByTestId('preset-4BB').props.accessibilityState?.disabled).toBe(false);
  });

  it('hides preset row when all presets are below minRaise', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 0 }), // preflop, bb=10
      viewingSeat: 0,
      mode: 'debug',
      getActionInfo: jest.fn(() => ({
        canCheck: false, callAmount: 10, minRaise: 100, maxRaise: 1000, canRaise: true,
      })),
    });
    // All presets (30, 30, 40) < 100 → entire row hidden
    expect(screen.queryByText('2.5BB')).toBeNull();
    expect(screen.queryByText('3BB')).toBeNull();
    expect(screen.queryByText('4BB')).toBeNull();
  });

  it('shows PreActionBar when not my turn in BLE mode', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 1 }),
      viewingSeat: 0,
      mode: 'ble-host',
    });
    expect(screen.getByText('Check/Fold')).toBeTruthy();
    expect(screen.getByText(/Call Any/)).toBeTruthy();
  });

  it('does NOT show PreActionBar in hotseat mode when not turn', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 1 }),
      viewingSeat: 0,
      mode: 'hotseat',
    });
    expect(screen.queryByText('Check/Fold')).toBeNull();
  });

  it('does NOT show PreActionBar in debug mode', () => {
    renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 1 }),
      viewingSeat: 0,
      mode: 'debug',
    });
    // In debug mode, actingSeat === activePlayer, so isMyTurn is always true
    // PreActionBar should not appear
    expect(screen.queryByText('Check/Fold')).toBeNull();
  });
});
