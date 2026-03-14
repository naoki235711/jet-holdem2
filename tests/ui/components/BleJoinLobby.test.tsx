import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { BleJoinLobby } from '../../../src/components/lobby/BleJoinLobby';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const mockClient = {
  startScanning: jest.fn().mockResolvedValue(undefined),
  connectToHost: jest.fn().mockResolvedValue(undefined),
  setReady: jest.fn(),
  disconnect: jest.fn().mockResolvedValue(undefined),
  onHostDiscovered: jest.fn(),
  onJoinResult: jest.fn(),
  onPlayersChanged: jest.fn(),
  onGameStart: jest.fn(),
  onDisconnected: jest.fn(),
  onError: jest.fn(),
  mySeat: 1,
};

jest.mock('../../../src/services/ble/LobbyClient', () => ({
  LobbyClient: jest.fn().mockImplementation(() => mockClient),
}));

jest.mock('../../../src/services/ble/MockBleTransport', () => ({
  MockBleClientTransport: jest.fn(),
}));

describe('BleJoinLobby', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.mySeat = 1;
  });

  it('starts scanning on mount', () => {
    render(<BleJoinLobby playerName="Alice" />);
    expect(mockClient.startScanning).toHaveBeenCalled();
  });

  it('shows scanning state initially', () => {
    render(<BleJoinLobby playerName="Alice" />);
    expect(screen.getByText('ホストを探しています...')).toBeTruthy();
  });

  it('displays discovered hosts', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onHostDiscovered = mockClient.onHostDiscovered.mock.calls[0][0];

    await act(async () => {
      onHostDiscovered('host-1', 'Room A');
    });

    expect(screen.getByText('Room A')).toBeTruthy();
  });

  it('connects to host when selected', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onHostDiscovered = mockClient.onHostDiscovered.mock.calls[0][0];

    await act(async () => {
      onHostDiscovered('host-1', 'Room A');
    });

    fireEvent.press(screen.getByText('Room A'));
    expect(mockClient.connectToHost).toHaveBeenCalledWith('host-1');
  });

  it('shows waiting state after successful join', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onJoinResult = mockClient.onJoinResult.mock.calls[0][0];

    await act(async () => {
      onJoinResult({
        accepted: true,
        gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
      });
    });

    expect(screen.getByText(/SB.*5/)).toBeTruthy();
    expect(screen.getByText(/BB.*10/)).toBeTruthy();
  });

  it('shows error and returns to scanning on join rejection', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onJoinResult = mockClient.onJoinResult.mock.calls[0][0];

    await act(async () => {
      onJoinResult({ accepted: false, reason: 'Room is full' });
    });

    expect(screen.getByText('Room is full')).toBeTruthy();
  });

  it('renders player slots when onPlayersChanged fires', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onJoinResult = mockClient.onJoinResult.mock.calls[0][0];
    const onPlayersChanged = mockClient.onPlayersChanged.mock.calls[0][0];

    await act(async () => {
      onJoinResult({
        accepted: true,
        gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
      });
    });

    await act(async () => {
      onPlayersChanged([
        { seat: 0, name: 'Host', ready: true },
        { seat: 1, name: 'Alice', ready: false },
      ]);
    });

    expect(screen.getByText('Host')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('calls setReady when Ready button is pressed', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onJoinResult = mockClient.onJoinResult.mock.calls[0][0];

    await act(async () => {
      onJoinResult({
        accepted: true,
        gameSettings: { sb: 5, bb: 10, initialChips: 1000 },
      });
    });

    fireEvent.press(screen.getByTestId('join-ready-btn'));
    expect(mockClient.setReady).toHaveBeenCalled();
  });

  it('navigates to game when onGameStart fires', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onGameStart = mockClient.onGameStart.mock.calls[0][0];

    await act(async () => {
      onGameStart({ blinds: { sb: 5, bb: 10 }, initialChips: 1000 });
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/game',
      params: { mode: 'ble-client', sb: '5', bb: '10', initialChips: '1000', seat: '1' },
    });
  });

  it('shows disconnected state when host disconnects', async () => {
    render(<BleJoinLobby playerName="Alice" />);
    const onDisconnected = mockClient.onDisconnected.mock.calls[0][0];

    await act(async () => {
      onDisconnected();
    });

    expect(screen.getByText('ホストが切断しました')).toBeTruthy();
  });
});
