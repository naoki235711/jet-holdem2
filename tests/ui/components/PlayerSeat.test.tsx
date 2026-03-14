// tests/ui/components/PlayerSeat.test.tsx

import React from 'react';
import { screen } from '@testing-library/react-native';
import { PlayerSeat } from '../../../src/components/table/PlayerSeat';
import { renderWithGame, createMockGameState } from '../helpers/renderWithGame';

describe('PlayerSeat', () => {
  it('renders player name and chips', () => {
    renderWithGame(<PlayerSeat seat={0} />, {
      state: createMockGameState(),
    });
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('990')).toBeTruthy();
  });

  it('shows face-up cards for viewing seat in debug mode', () => {
    renderWithGame(<PlayerSeat seat={0} />, {
      state: createMockGameState(),
      mode: 'debug',
      viewingSeat: 0,
    });
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getAllByText('♥').length).toBeGreaterThan(0);
  });

  it('shows face-down cards for non-viewing seat in hotseat mode', () => {
    renderWithGame(<PlayerSeat seat={1} />, {
      state: createMockGameState(),
      mode: 'hotseat',
      viewingSeat: 0,
    });
    expect(screen.queryByText('T')).toBeNull();
  });

  it('applies folded style for folded player', () => {
    const state = createMockGameState({
      players: [
        { seat: 0, name: 'Alice', chips: 990, status: 'folded', bet: 0, cards: ['Ah', 'Kh'] },
        { seat: 1, name: 'Bob', chips: 995, status: 'active', bet: 5, cards: ['Td', 'Jd'] },
        { seat: 2, name: 'Charlie', chips: 990, status: 'active', bet: 10, cards: ['7s', '8s'] },
      ],
    });
    const { getByTestId } = renderWithGame(<PlayerSeat seat={0} />, { state });
    expect(getByTestId('player-seat-0').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0.5 })]),
    );
  });

  it('shows active highlight for active player', () => {
    const { getByTestId } = renderWithGame(<PlayerSeat seat={0} />, {
      state: createMockGameState({ activePlayer: 0 }),
    });
    expect(getByTestId('player-seat-0').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderColor: '#06B6D4' })]),
    );
  });

  it('shows dealer badge', () => {
    renderWithGame(<PlayerSeat seat={0} />, {
      state: createMockGameState({ dealer: 0 }),
    });
    expect(screen.getByText('D')).toBeTruthy();
  });

  it('shows bet amount when player has bet', () => {
    renderWithGame(<PlayerSeat seat={2} />, {
      state: createMockGameState(),
    });
    expect(screen.getByText('10')).toBeTruthy();
  });
});
