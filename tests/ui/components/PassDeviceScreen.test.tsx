// tests/ui/components/PassDeviceScreen.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PassDeviceScreen } from '../../../src/components/common/PassDeviceScreen';

describe('PassDeviceScreen', () => {
  it('displays the player name to pass to', () => {
    render(<PassDeviceScreen playerName="Bob" onDismiss={jest.fn()} />);
    expect(screen.getByText(/Bob/)).toBeTruthy();
    expect(screen.getByText(/渡してください/)).toBeTruthy();
  });

  it('calls onDismiss when tapped', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(<PassDeviceScreen playerName="Bob" onDismiss={onDismiss} />);
    fireEvent.press(getByTestId('pass-device-screen'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
