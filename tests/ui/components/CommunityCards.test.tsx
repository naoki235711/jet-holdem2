// tests/ui/components/CommunityCards.test.tsx

import React from 'react';
import { screen } from '@testing-library/react-native';
import { CommunityCards } from '../../../src/components/table/CommunityCards';
import { renderWithGame, createMockGameState } from '../helpers/renderWithGame';
import { Card } from '../../../src/gameEngine';

describe('CommunityCards', () => {
  it('renders 5 card slots', () => {
    const { getAllByTestId } = renderWithGame(<CommunityCards />, {
      state: createMockGameState({ community: [] }),
    });
    expect(getAllByTestId('card-slot')).toHaveLength(5);
  });

  it('renders dealt cards face-up', () => {
    const community: Card[] = ['Ah', 'Kd', 'Qs'];
    renderWithGame(<CommunityCards />, {
      state: createMockGameState({ community }),
    });
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('K')).toBeTruthy();
    expect(screen.getByText('Q')).toBeTruthy();
  });

  it('renders empty slots for undealt cards', () => {
    const { getAllByTestId } = renderWithGame(<CommunityCards />, {
      state: createMockGameState({ community: ['Ah', 'Kd', 'Qs'] as Card[] }),
    });
    const emptySlots = getAllByTestId('empty-slot');
    expect(emptySlots).toHaveLength(2);
  });
});
