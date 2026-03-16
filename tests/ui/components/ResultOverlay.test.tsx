// tests/ui/components/ResultOverlay.test.tsx

import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { ResultOverlay } from '../../../src/components/result/ResultOverlay';
import { renderWithGame, createMockGameState } from '../helpers/renderWithGame';
import { ShowdownResult } from '../../../src/gameEngine';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockShowdownResult: ShowdownResult = {
  winners: [{ seat: 1, hand: 'Full House, Kings over Sevens', potAmount: 300 }],
  hands: [
    { seat: 0, cards: ['Ah', 'Kh'], description: 'One Pair, Aces' },
    { seat: 1, cards: ['Ks', 'Kd'], description: 'Full House, Kings over Sevens' },
    { seat: 2, cards: ['7s', '8c'], description: '' },
  ],
};

describe('ResultOverlay', () => {
  it('does not render when no showdown result', () => {
    const { queryByTestId } = renderWithGame(<ResultOverlay />, {
      state: createMockGameState({ phase: 'preflop' }),
      showdownResult: null,
    });
    expect(queryByTestId('result-overlay')).toBeNull();
  });

  it('renders when phase is roundEnd and showdownResult exists', () => {
    const { getByTestId } = renderWithGame(<ResultOverlay />, {
      state: createMockGameState({ phase: 'roundEnd' }),
      showdownResult: mockShowdownResult,
    });
    expect(getByTestId('result-overlay')).toBeTruthy();
  });

  it('renders when phase is roundEnd with no showdownResult (fold win)', () => {
    const { getByTestId } = renderWithGame(<ResultOverlay />, {
      state: createMockGameState({
        phase: 'roundEnd',
        players: [
          { seat: 0, name: 'Alice', chips: 1015, status: 'active', bet: 0, cards: ['Ah', 'Kh'] },
          { seat: 1, name: 'Bob', chips: 995, status: 'folded', bet: 0, cards: ['Td', 'Jd'] },
          { seat: 2, name: 'Charlie', chips: 990, status: 'folded', bet: 0, cards: ['7s', '8s'] },
        ],
      }),
      showdownResult: null,
    });
    expect(getByTestId('result-overlay')).toBeTruthy();
  });

  it('displays winner name and hand', () => {
    renderWithGame(<ResultOverlay />, {
      state: createMockGameState({ phase: 'roundEnd' }),
      showdownResult: mockShowdownResult,
    });
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Full House, Kings over Sevens')).toBeTruthy();
  });

  it('shows folded players as (folded)', () => {
    const state = createMockGameState({
      phase: 'roundEnd',
      players: [
        { seat: 0, name: 'Alice', chips: 990, status: 'active', bet: 0, cards: ['Ah', 'Kh'] },
        { seat: 1, name: 'Bob', chips: 1295, status: 'active', bet: 0, cards: ['Ks', 'Kd'] },
        { seat: 2, name: 'Charlie', chips: 990, status: 'folded', bet: 0, cards: ['7s', '8c'] },
      ],
    });
    renderWithGame(<ResultOverlay />, { state, showdownResult: mockShowdownResult });
    expect(screen.getByText('(folded)')).toBeTruthy();
  });

  it('calls nextRound when button pressed', () => {
    const nextRound = jest.fn();
    renderWithGame(<ResultOverlay />, {
      state: createMockGameState({ phase: 'roundEnd' }),
      showdownResult: mockShowdownResult,
      nextRound,
    });
    fireEvent.press(screen.getByText('次のラウンドへ'));
    expect(nextRound).toHaveBeenCalled();
  });

  it('shows lobby button on gameOver (only one player has chips)', () => {
    const gameOverState = createMockGameState({
      phase: 'roundEnd',
      players: [
        { seat: 0, name: 'Alice', chips: 0, status: 'out', bet: 0, cards: ['Ah', 'Kh'] },
        { seat: 1, name: 'Bob', chips: 3000, status: 'active', bet: 0, cards: ['Ks', 'Kd'] },
        { seat: 2, name: 'Charlie', chips: 0, status: 'out', bet: 0, cards: ['7s', '8c'] },
      ],
    });
    renderWithGame(<ResultOverlay />, {
      state: gameOverState,
      showdownResult: mockShowdownResult,
    });
    expect(screen.getByText('ロビーに戻る')).toBeTruthy();
    expect(screen.queryByText('次のラウンドへ')).toBeNull();
  });
});

describe('game over buttons', () => {
  const gameOverState = createMockGameState({
    phase: 'roundEnd',
    players: [
      { seat: 0, name: 'Alice', chips: 3000, status: 'active', bet: 0, cards: ['Ah', 'Kh'] },
      { seat: 1, name: 'Bob', chips: 0, status: 'out', bet: 0, cards: [] },
      { seat: 2, name: 'Charlie', chips: 0, status: 'out', bet: 0, cards: [] },
    ],
  });

  it('shows rematch and back-to-lobby buttons on game over (non-BLE-client)', () => {
    const { getByTestId } = renderWithGame(<ResultOverlay />, {
      state: gameOverState,
      showdownResult: mockShowdownResult,
      mode: 'debug',
    });
    expect(getByTestId('rematch-btn')).toBeTruthy();
    expect(getByTestId('back-to-lobby-btn')).toBeTruthy();
  });

  it('calls rematch when rematch button is pressed', () => {
    const rematchFn = jest.fn();
    const { getByTestId } = renderWithGame(<ResultOverlay />, {
      state: gameOverState,
      showdownResult: mockShowdownResult,
      mode: 'debug',
      rematch: rematchFn,
    });
    fireEvent.press(getByTestId('rematch-btn'));
    expect(rematchFn).toHaveBeenCalledTimes(1);
  });

  it('hides rematch button for ble-client, shows waiting text', () => {
    const { queryByTestId, getByText } = renderWithGame(<ResultOverlay />, {
      state: gameOverState,
      showdownResult: mockShowdownResult,
      mode: 'ble-client',
    });
    expect(queryByTestId('rematch-btn')).toBeNull();
    expect(getByText('ホストの操作を待っています...')).toBeTruthy();
    expect(queryByTestId('back-to-lobby-btn')).toBeTruthy();
  });

  it('shows rematch button for ble-host', () => {
    const { getByTestId } = renderWithGame(<ResultOverlay />, {
      state: gameOverState,
      showdownResult: mockShowdownResult,
      mode: 'ble-host',
    });
    expect(getByTestId('rematch-btn')).toBeTruthy();
  });
});
