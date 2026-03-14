// tests/ui/components/LobbyView.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { LobbyView } from '../../../src/components/lobby/LobbyView';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('LobbyView', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders title', () => {
    render(<LobbyView />);
    expect(screen.getByText('Jet Holdem')).toBeTruthy();
  });

  it('renders player count selection (2, 3, 4)', () => {
    render(<LobbyView />);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('shows correct number of name inputs for selected player count', () => {
    render(<LobbyView />);
    const inputs = screen.getAllByPlaceholderText(/Player/);
    expect(inputs).toHaveLength(3);
  });

  it('updates player count when tapping a number', () => {
    render(<LobbyView />);
    fireEvent.press(screen.getByText('4'));
    const inputs = screen.getAllByPlaceholderText(/Player/);
    expect(inputs).toHaveLength(4);
  });

  it('shows mode selection (hotseat and debug)', () => {
    render(<LobbyView />);
    expect(screen.getByText('ホットシート')).toBeTruthy();
    expect(screen.getByText('デバッグ')).toBeTruthy();
  });

  it('renders start button', () => {
    render(<LobbyView />);
    expect(screen.getByText('ゲーム開始')).toBeTruthy();
  });

  it('navigates to game screen on start', () => {
    render(<LobbyView />);
    fireEvent.press(screen.getByText('ゲーム開始'));
    expect(mockPush).toHaveBeenCalled();
  });
});
