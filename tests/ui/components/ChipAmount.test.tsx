// tests/ui/components/ChipAmount.test.tsx

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ChipAmount } from '../../../src/components/common/ChipAmount';

describe('ChipAmount', () => {
  it('renders amount as string', () => {
    render(<ChipAmount amount={1500} />);
    expect(screen.getByText('1,500')).toBeTruthy();
  });

  it('renders 0 correctly', () => {
    render(<ChipAmount amount={0} />);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('applies custom color', () => {
    const { getByText } = render(<ChipAmount amount={100} color="#10B981" />);
    const text = getByText('100');
    expect(text.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ color: '#10B981' }),
    ]));
  });
});
