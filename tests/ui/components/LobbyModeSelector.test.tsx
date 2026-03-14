import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { LobbyModeSelector } from '../../../src/components/lobby/LobbyModeSelector';

describe('LobbyModeSelector', () => {
  it('renders all three tabs', () => {
    render(<LobbyModeSelector selected="local" onSelect={jest.fn()} />);
    expect(screen.getByText('ローカル')).toBeTruthy();
    expect(screen.getByText('ホスト作成')).toBeTruthy();
    expect(screen.getByText('ゲーム参加')).toBeTruthy();
  });

  it('calls onSelect with "host" when ホスト作成 is pressed', () => {
    const onSelect = jest.fn();
    render(<LobbyModeSelector selected="local" onSelect={onSelect} />);
    fireEvent.press(screen.getByText('ホスト作成'));
    expect(onSelect).toHaveBeenCalledWith('host');
  });

  it('calls onSelect with "join" when ゲーム参加 is pressed', () => {
    const onSelect = jest.fn();
    render(<LobbyModeSelector selected="local" onSelect={onSelect} />);
    fireEvent.press(screen.getByText('ゲーム参加'));
    expect(onSelect).toHaveBeenCalledWith('join');
  });

  it('calls onSelect with "local" when ローカル is pressed', () => {
    const onSelect = jest.fn();
    render(<LobbyModeSelector selected="host" onSelect={onSelect} />);
    fireEvent.press(screen.getByText('ローカル'));
    expect(onSelect).toHaveBeenCalledWith('local');
  });
});
