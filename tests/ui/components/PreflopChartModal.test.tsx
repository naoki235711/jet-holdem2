// tests/ui/components/PreflopChartModal.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PreflopChartModal } from '../../../src/components/preflop/PreflopChartModal';

describe('PreflopChartModal', () => {
  it('renders modal container when visible=true', () => {
    const { getByTestId } = render(
      <PreflopChartModal visible={true} onClose={jest.fn()} />,
    );
    expect(getByTestId('preflop-chart-modal')).toBeTruthy();
  });

  it('does not render content when visible=false', () => {
    const { queryByTestId } = render(
      <PreflopChartModal visible={false} onClose={jest.fn()} />,
    );
    expect(queryByTestId('preflop-chart-modal')).toBeNull();
  });

  it('shows title text', () => {
    const { getByText } = render(
      <PreflopChartModal visible={true} onClose={jest.fn()} />,
    );
    expect(getByText('Preflop RFI Chart')).toBeTruthy();
  });

  it('calls onClose when close button is pressed', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <PreflopChartModal visible={true} onClose={onClose} />,
    );
    fireEvent.press(getByTestId('preflop-chart-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the grid (at least one cell visible)', () => {
    const { getByTestId } = render(
      <PreflopChartModal visible={true} onClose={jest.fn()} />,
    );
    expect(getByTestId('preflop-cell-0-0')).toBeTruthy();
  });
});
