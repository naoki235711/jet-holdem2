import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { BleHostLobby } from '../../../src/components/lobby/BleHostLobby';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const mockHost = {
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  startGame: jest.fn(),
  onPlayersChanged: jest.fn(),
  onGameStart: jest.fn(),
  onError: jest.fn(),
};

jest.mock('../../../src/services/ble/LobbyHost', () => ({
  LobbyHost: jest.fn().mockImplementation(() => mockHost),
}));

jest.mock('../../../src/services/ble/MockBleTransport', () => ({
  MockBleHostTransport: jest.fn(),
}));

describe('BleHostLobby', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const defaultProps = { hostName: 'TestHost', sb: 5, bb: 10, initialChips: 1000 };

  it('calls LobbyHost.start on mount', () => {
    render(<BleHostLobby {...defaultProps} />);
    expect(mockHost.start).toHaveBeenCalled();
  });

  it('displays game settings', () => {
    render(<BleHostLobby {...defaultProps} />);
    expect(screen.getByText(/SB.*5/)).toBeTruthy();
    expect(screen.getByText(/BB.*10/)).toBeTruthy();
    expect(screen.getByText(/1000/)).toBeTruthy();
  });

  it('renders player slots when onPlayersChanged fires', async () => {
    render(<BleHostLobby {...defaultProps} />);
    const onPlayersChanged = mockHost.onPlayersChanged.mock.calls[0][0];

    await act(async () => {
      onPlayersChanged([
        { seat: 0, name: 'TestHost', ready: true },
        { seat: 1, name: 'Alice', ready: false },
      ]);
    });

    expect(screen.getByText('TestHost')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('calls startGame when ゲーム開始 button is pressed', async () => {
    render(<BleHostLobby {...defaultProps} />);
    const onPlayersChanged = mockHost.onPlayersChanged.mock.calls[0][0];

    await act(async () => {
      onPlayersChanged([
        { seat: 0, name: 'TestHost', ready: true },
        { seat: 1, name: 'Alice', ready: true },
      ]);
    });

    fireEvent.press(screen.getByTestId('host-start-game-btn'));
    expect(mockHost.startGame).toHaveBeenCalled();
  });

  it('navigates to game when onGameStart fires', async () => {
    render(<BleHostLobby {...defaultProps} />);
    const onGameStart = mockHost.onGameStart.mock.calls[0][0];

    await act(async () => {
      onGameStart({ sb: 5, bb: 10 });
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/game',
      params: { mode: 'ble-host', sb: '5', bb: '10', initialChips: '1000', seat: '0' },
    });
  });

  it('displays error message when onError fires', async () => {
    render(<BleHostLobby {...defaultProps} />);
    const onError = mockHost.onError.mock.calls[0][0];

    await act(async () => {
      onError('Cannot start: need at least 2 players');
    });

    expect(screen.getByText('Cannot start: need at least 2 players')).toBeTruthy();
  });

  it('calls stop and navigates back when ロビーを閉じる is pressed', async () => {
    render(<BleHostLobby {...defaultProps} />);
    fireEvent.press(screen.getByTestId('host-close-btn'));
    expect(mockHost.stop).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });
});
