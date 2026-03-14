import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { HostSetupForm } from '../../../src/components/lobby/HostSetupForm';

describe('HostSetupForm', () => {
  it('renders host name input, blinds inputs, and chips input', () => {
    render(<HostSetupForm onSubmit={jest.fn()} />);
    expect(screen.getByPlaceholderText('ホスト名')).toBeTruthy();
    expect(screen.getByTestId('host-sb-input')).toBeTruthy();
    expect(screen.getByTestId('host-bb-input')).toBeTruthy();
    expect(screen.getByTestId('host-chips-input')).toBeTruthy();
  });

  it('disables submit button when host name is empty', () => {
    render(<HostSetupForm onSubmit={jest.fn()} />);
    const btn = screen.getByTestId('host-create-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('enables submit button when host name is filled', () => {
    render(<HostSetupForm onSubmit={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText('ホスト名'), 'MyRoom');
    const btn = screen.getByTestId('host-create-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeFalsy();
  });

  it('calls onSubmit with form values when button pressed', () => {
    const onSubmit = jest.fn();
    render(<HostSetupForm onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByPlaceholderText('ホスト名'), 'MyRoom');
    fireEvent.press(screen.getByTestId('host-create-btn'));
    expect(onSubmit).toHaveBeenCalledWith({
      hostName: 'MyRoom',
      sb: '5',
      bb: '10',
      initialChips: '1000',
    });
  });
});
