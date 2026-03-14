// tests/ui/components/LobbyView.test.tsx

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
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

  it('navigates to game screen on start', async () => {
    render(<LobbyView />);
    fireEvent.press(screen.getByText('ゲーム開始'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });

  it('renders lobby mode tabs (ローカル, ホスト作成, ゲーム参加)', () => {
    render(<LobbyView />);
    expect(screen.getByText('ローカル')).toBeTruthy();
    expect(screen.getByText('ホスト作成')).toBeTruthy();
    expect(screen.getByText('ゲーム参加')).toBeTruthy();
  });

  it('shows host setup form when ホスト作成 tab is selected', () => {
    render(<LobbyView />);
    fireEvent.press(screen.getByText('ホスト作成'));
    expect(screen.getByPlaceholderText('ホスト名')).toBeTruthy();
  });

  it('shows join setup form when ゲーム参加 tab is selected', () => {
    render(<LobbyView />);
    fireEvent.press(screen.getByText('ゲーム参加'));
    expect(screen.getByPlaceholderText('プレイヤー名')).toBeTruthy();
  });

  it('shows local mode content by default', () => {
    render(<LobbyView />);
    expect(screen.getByText('ゲーム開始')).toBeTruthy();
  });

  it('navigates to ble-host when host form is submitted', () => {
    render(<LobbyView />);
    fireEvent.press(screen.getByText('ホスト作成'));
    fireEvent.changeText(screen.getByPlaceholderText('ホスト名'), 'MyRoom');
    fireEvent.press(screen.getByTestId('host-create-btn'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/ble-host',
      params: { hostName: 'MyRoom', sb: '5', bb: '10', initialChips: '1000' },
    });
  });

  it('navigates to ble-join when join form is submitted', () => {
    render(<LobbyView />);
    fireEvent.press(screen.getByText('ゲーム参加'));
    fireEvent.changeText(screen.getByPlaceholderText('プレイヤー名'), 'Alice');
    fireEvent.press(screen.getByTestId('join-scan-btn'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/ble-join',
      params: { playerName: 'Alice' },
    });
  });
});
