import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { HostList } from '../../../src/components/lobby/HostList';

describe('HostList', () => {
  const hosts = [
    { id: 'host-1', name: 'Room A' },
    { id: 'host-2', name: 'Room B' },
  ];

  it('renders all discovered hosts', () => {
    render(<HostList hosts={hosts} onSelect={jest.fn()} />);
    expect(screen.getByText('Room A')).toBeTruthy();
    expect(screen.getByText('Room B')).toBeTruthy();
  });

  it('calls onSelect with hostId when tapped', () => {
    const onSelect = jest.fn();
    render(<HostList hosts={hosts} onSelect={onSelect} />);
    fireEvent.press(screen.getByText('Room A'));
    expect(onSelect).toHaveBeenCalledWith('host-1');
  });

  it('renders empty state when no hosts', () => {
    render(<HostList hosts={[]} onSelect={jest.fn()} />);
    expect(screen.getByText('ホストを探しています...')).toBeTruthy();
  });
});
