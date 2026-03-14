// tests/ui/components/PlayingCard.test.tsx

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PlayingCard } from '../../../src/components/common/PlayingCard';

describe('PlayingCard', () => {
  it('renders rank and suit for face-up card', () => {
    render(<PlayingCard card="Ah" faceUp />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('♥')).toBeTruthy();
  });

  it('renders red color for hearts', () => {
    render(<PlayingCard card="Ah" faceUp />);
    const suit = screen.getByText('♥');
    expect(suit.props.style).toEqual(expect.objectContaining({ color: '#EF4444' }));
  });

  it('renders red color for diamonds', () => {
    render(<PlayingCard card="Td" faceUp />);
    expect(screen.getByText('♦')).toBeTruthy();
  });

  it('renders white color for spades', () => {
    render(<PlayingCard card="Ks" faceUp />);
    const suit = screen.getByText('♠');
    expect(suit.props.style).toEqual(expect.objectContaining({ color: '#FFFFFF' }));
  });

  it('does not show rank/suit when face-down', () => {
    render(<PlayingCard card="Ah" faceUp={false} />);
    expect(screen.queryByText('A')).toBeNull();
    expect(screen.queryByText('♥')).toBeNull();
  });

  it('renders with community size when specified', () => {
    const { getByTestId } = render(<PlayingCard card="Ah" faceUp size="community" />);
    expect(getByTestId('playing-card')).toBeTruthy();
  });
});
