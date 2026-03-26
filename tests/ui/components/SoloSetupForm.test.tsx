import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SoloSetupForm } from '../../../src/components/lobby/SoloSetupForm';

describe('SoloSetupForm', () => {
  it('renders player name input', () => {
    render(<SoloSetupForm onSubmit={jest.fn()} />);
    expect(screen.getByPlaceholderText('あなたの名前')).toBeTruthy();
  });

  it('renders total player count buttons 2-9', () => {
    render(<SoloSetupForm onSubmit={jest.fn()} />);
    [2, 3, 4, 5, 6, 7, 8, 9].forEach(n => {
      expect(screen.getByTestId(`solo-count-btn-${n}`)).toBeTruthy();
    });
  });

  it('renders chips, SB, BB inputs', () => {
    render(<SoloSetupForm onSubmit={jest.fn()} />);
    expect(screen.getByTestId('solo-chips-input')).toBeTruthy();
    expect(screen.getByTestId('solo-sb-input')).toBeTruthy();
    expect(screen.getByTestId('solo-bb-input')).toBeTruthy();
  });

  it('disables start button when player name is empty', () => {
    render(<SoloSetupForm onSubmit={jest.fn()} />);
    const btn = screen.getByTestId('solo-start-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });

  it('enables start button when player name is filled', () => {
    render(<SoloSetupForm onSubmit={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText('あなたの名前'), 'Alice');
    const btn = screen.getByTestId('solo-start-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeFalsy();
  });

  it('calls onSubmit with correct values', () => {
    const onSubmit = jest.fn();
    render(<SoloSetupForm onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByPlaceholderText('あなたの名前'), 'Alice');
    fireEvent.press(screen.getByTestId('solo-count-btn-4'));
    fireEvent.press(screen.getByTestId('solo-start-btn'));
    expect(onSubmit).toHaveBeenCalledWith({
      playerName: 'Alice',
      totalCount: 4,
      initialChips: '1000',
      sb: '5',
      bb: '10',
    });
  });
});
