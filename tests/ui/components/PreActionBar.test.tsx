import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PreActionBar } from '../../../src/components/actions/PreActionBar';

describe('PreActionBar', () => {
  it('renders three toggle buttons', () => {
    render(<PreActionBar selected={null} onSelect={jest.fn()} callAmount={100} />);
    expect(screen.getByText('Check/Fold')).toBeTruthy();
    expect(screen.getByText('Call 100')).toBeTruthy();
    expect(screen.getByText('Call Any')).toBeTruthy();
  });

  it('calls onSelect with checkFold when Check/Fold pressed', () => {
    const onSelect = jest.fn();
    render(<PreActionBar selected={null} onSelect={onSelect} callAmount={100} />);
    fireEvent.press(screen.getByText('Check/Fold'));
    expect(onSelect).toHaveBeenCalledWith('checkFold');
  });

  it('calls onSelect with call when Call pressed', () => {
    const onSelect = jest.fn();
    render(<PreActionBar selected={null} onSelect={onSelect} callAmount={50} />);
    fireEvent.press(screen.getByText('Call 50'));
    expect(onSelect).toHaveBeenCalledWith('call');
  });

  it('calls onSelect with callAny when Call Any pressed', () => {
    const onSelect = jest.fn();
    render(<PreActionBar selected={null} onSelect={onSelect} callAmount={100} />);
    fireEvent.press(screen.getByText('Call Any'));
    expect(onSelect).toHaveBeenCalledWith('callAny');
  });

  it('deselects when pressing the already-selected button', () => {
    const onSelect = jest.fn();
    render(<PreActionBar selected="checkFold" onSelect={onSelect} callAmount={100} />);
    fireEvent.press(screen.getByText('Check/Fold'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('shows selected button with active styling (testID check)', () => {
    const { getByTestId } = render(
      <PreActionBar selected="call" onSelect={jest.fn()} callAmount={100} />,
    );
    expect(getByTestId('preaction-call-selected')).toBeTruthy();
  });
});
