import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { JoinSetupForm } from '../../../src/components/lobby/JoinSetupForm';

describe('JoinSetupForm', () => {
  it('renders player name input', () => {
    render(<JoinSetupForm onSubmit={jest.fn()} />);
    expect(screen.getByPlaceholderText('プレイヤー名')).toBeTruthy();
  });

  it('disables submit button when name is empty', () => {
    render(<JoinSetupForm onSubmit={jest.fn()} />);
    const btn = screen.getByTestId('join-scan-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('enables submit button when name is filled', () => {
    render(<JoinSetupForm onSubmit={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText('プレイヤー名'), 'Alice');
    const btn = screen.getByTestId('join-scan-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeFalsy();
  });

  it('calls onSubmit with player name when button pressed', () => {
    const onSubmit = jest.fn();
    render(<JoinSetupForm onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByPlaceholderText('プレイヤー名'), 'Alice');
    fireEvent.press(screen.getByTestId('join-scan-btn'));
    expect(onSubmit).toHaveBeenCalledWith('Alice');
  });
});
