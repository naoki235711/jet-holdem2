import React from 'react';
import { screen } from '@testing-library/react-native';
import { TableLayout } from '../../../app/game';
import { renderWithGame, createMockGameState } from '../helpers/renderWithGame';
import { Player } from '../../../src/gameEngine/types';

function makeState(n: number) {
  const players: Player[] = Array.from({ length: n }, (_, i) => ({
    seat: i,
    name: `P${i}`,
    chips: 1000,
    status: 'active',
    bet: 0,
    cards: ['Ah', 'Kh'],
  }));
  return createMockGameState({ players, activePlayer: 0, dealer: 0 });
}

describe('TableLayout', () => {
  it('renders 2-player layout: both seat wrappers visible', () => {
    renderWithGame(<TableLayout />, { state: makeState(2), viewingSeat: 0 });
    expect(screen.getByTestId('player-seat-wrapper-0')).toBeTruthy();
    expect(screen.getByTestId('player-seat-wrapper-1')).toBeTruthy();
  });

  it('renders 4-player layout: all 4 seat wrappers visible', () => {
    renderWithGame(<TableLayout />, { state: makeState(4), viewingSeat: 0 });
    for (let i = 0; i < 4; i++) {
      expect(screen.getByTestId(`player-seat-wrapper-${i}`)).toBeTruthy();
    }
  });

  it('renders 6-player layout: all 6 seat wrappers visible', () => {
    renderWithGame(<TableLayout />, { state: makeState(6), viewingSeat: 0 });
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`player-seat-wrapper-${i}`)).toBeTruthy();
    }
  });

  it('renders 9-player layout: all 9 seat wrappers visible', () => {
    renderWithGame(<TableLayout />, { state: makeState(9), viewingSeat: 0 });
    for (let i = 0; i < 9; i++) {
      expect(screen.getByTestId(`player-seat-wrapper-${i}`)).toBeTruthy();
    }
  });

  it('uses compact seats when 5 or more players', () => {
    const { getByTestId } = renderWithGame(<TableLayout />, {
      state: makeState(5),
      viewingSeat: 0,
    });
    expect(getByTestId('player-seat-0').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ minWidth: 52 })]),
    );
  });

  it('does not use compact seats for 4 or fewer players', () => {
    const { getByTestId } = renderWithGame(<TableLayout />, {
      state: makeState(4),
      viewingSeat: 0,
    });
    expect(getByTestId('player-seat-0').props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ minWidth: 52 })]),
    );
  });
});
