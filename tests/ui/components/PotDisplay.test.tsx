// tests/ui/components/PotDisplay.test.tsx

import React from 'react';
import { screen } from '@testing-library/react-native';
import { PotDisplay } from '../../../src/components/table/PotDisplay';
import { renderWithGame, createMockGameState } from '../helpers/renderWithGame';

describe('PotDisplay', () => {
  it('renders total pot amount', () => {
    renderWithGame(<PotDisplay />, {
      state: createMockGameState({ pots: [{ amount: 300, eligible: [0, 1, 2] }] }),
    });
    expect(screen.getByText('300')).toBeTruthy();
  });

  it('sums multiple pots', () => {
    renderWithGame(<PotDisplay />, {
      state: createMockGameState({
        pots: [
          { amount: 300, eligible: [0, 1, 2] },
          { amount: 100, eligible: [0, 1] },
        ],
      }),
    });
    expect(screen.getByText('400')).toBeTruthy();
  });

  it('shows BB equivalent', () => {
    renderWithGame(<PotDisplay />, {
      state: createMockGameState({
        pots: [{ amount: 100, eligible: [0, 1, 2] }],
        blinds: { sb: 5, bb: 10 },
      }),
    });
    expect(screen.getByText('10 BB')).toBeTruthy();
  });

  it('renders nothing when no pots', () => {
    const { queryByTestId } = renderWithGame(<PotDisplay />, {
      state: createMockGameState({ pots: [] }),
    });
    expect(queryByTestId('pot-display')).toBeNull();
  });
});
