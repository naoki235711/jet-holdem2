// tests/ui/components/RaiseSlider.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { RaiseSlider } from '../../../src/components/actions/RaiseSlider';

describe('RaiseSlider', () => {
  const defaultProps = {
    minRaise: 20,
    maxRaise: 1000,
    bbSize: 10,
    value: 20,
    onValueChange: jest.fn(),
  };

  it('renders slider', () => {
    const { getByTestId } = render(<RaiseSlider {...defaultProps} />);
    expect(getByTestId('raise-slider')).toBeTruthy();
  });

  it('displays current value', () => {
    render(<RaiseSlider {...defaultProps} value={50} />);
    expect(screen.getByText('50')).toBeTruthy();
  });

  it('shows ALL IN label when value equals maxRaise', () => {
    render(<RaiseSlider {...defaultProps} value={1000} />);
    expect(screen.getByText('ALL IN')).toBeTruthy();
  });

  it('calls onValueChange when slider moves', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <RaiseSlider {...defaultProps} onValueChange={onChange} />,
    );
    fireEvent(getByTestId('raise-slider'), 'valueChange', 50);
    expect(onChange).toHaveBeenCalledWith(50);
  });
});
