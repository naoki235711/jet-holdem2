import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PlayerSlot } from '../../../src/components/lobby/PlayerSlot';

describe('PlayerSlot', () => {
  it('renders ready player with checkmark', () => {
    render(
      <PlayerSlot
        seatNumber={0}
        player={{ seat: 0, name: 'HostPlayer', ready: true }}
      />,
    );
    expect(screen.getByText('HostPlayer')).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();
  });

  it('renders not-ready player with circle', () => {
    render(
      <PlayerSlot
        seatNumber={1}
        player={{ seat: 1, name: 'Alice', ready: false }}
      />,
    );
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('○')).toBeTruthy();
  });

  it('renders empty seat', () => {
    render(<PlayerSlot seatNumber={2} />);
    expect(screen.getByText('(空席)')).toBeTruthy();
  });

  it('renders "(あなた)" suffix when isMe is true', () => {
    render(
      <PlayerSlot
        seatNumber={0}
        player={{ seat: 0, name: 'Me', ready: true }}
        isMe
      />,
    );
    expect(screen.getByText(/Me/)).toBeTruthy();
    expect(screen.getByText(/あなた/)).toBeTruthy();
  });
});
