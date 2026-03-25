// tests/ui/components/LobbyView.test.tsx

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { LobbyView } from '../../../src/components/lobby/LobbyView';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('../../../src/services/persistence', () => ({
  repository: {
    getSettings: jest.fn().mockResolvedValue(null),
    saveSettings: jest.fn(),
    getPlayerChips: jest.fn().mockResolvedValue(null),
    savePlayerChips: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.spyOn(require('react-native').Alert, 'alert');

describe('LobbyView', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders title', () => {
    render(<LobbyView />);
    expect(screen.getByText('Jet Holdem')).toBeTruthy();
  });

  it('renders player count selection (2–9)', () => {
    render(<LobbyView />);
    [2, 3, 4, 5, 6, 7, 8, 9].forEach(n => {
      expect(screen.getByText(String(n))).toBeTruthy();
    });
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

  it('renders player count buttons 5 through 9', () => {
    render(<LobbyView />);
    expect(screen.getByTestId('count-btn-5')).toBeTruthy();
    expect(screen.getByTestId('count-btn-6')).toBeTruthy();
    expect(screen.getByTestId('count-btn-7')).toBeTruthy();
    expect(screen.getByTestId('count-btn-8')).toBeTruthy();
    expect(screen.getByTestId('count-btn-9')).toBeTruthy();
  });

  it('shows 9 name inputs when 9-player count is selected', () => {
    render(<LobbyView />);
    fireEvent.press(screen.getByTestId('count-btn-9'));
    const inputs = screen.getAllByPlaceholderText(/Player/);
    expect(inputs).toHaveLength(9);
  });

  describe('chip reset', () => {
    it('renders chip reset button in local mode', () => {
      render(<LobbyView />);
      expect(screen.getByTestId('chip-reset-btn')).toBeTruthy();
    });

    it('calls savePlayerChips for each player on confirm', async () => {
      const { repository } = require('../../../src/services/persistence');
      repository.savePlayerChips = jest.fn().mockResolvedValue(undefined);

      render(<LobbyView />);
      fireEvent.press(screen.getByTestId('chip-reset-btn'));

      // Alert.alert is called — simulate pressing "はい" (second button)
      const { Alert } = require('react-native');
      const alertCall = Alert.alert.mock.calls[0];
      const confirmButton = alertCall[2].find((b: any) => b.text === 'はい');
      await act(async () => {
        confirmButton.onPress();
      });

      // 3 players by default
      expect(repository.savePlayerChips).toHaveBeenCalledTimes(3);
      expect(repository.savePlayerChips).toHaveBeenCalledWith('Player 0', 1000);
    });
  });
});
