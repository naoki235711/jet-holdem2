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

  it('disables all buttons when not active player turn', () => {
    const { getByTestId } = renderWithGame(<ActionButtons />, {
      state: createMockGameState({ activePlayer: 1 }),
      viewingSeat: 0,
      mode: 'debug',
    });
    expect(getByTestId('fold-btn').props.accessibilityState?.disabled).toBe(true);
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
});
