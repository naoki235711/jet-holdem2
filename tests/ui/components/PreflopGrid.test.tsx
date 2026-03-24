// tests/ui/components/PreflopGrid.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { PreflopGrid } from '../../../src/components/preflop/PreflopGrid';
import { GROUP_COLORS, FOLD_COLOR } from '../../../src/components/preflop/preflopData';

function getBgColor(style: unknown): string | undefined {
  if (Array.isArray(style)) {
    return (style as Array<{ backgroundColor?: string }>).find(s => s?.backgroundColor)?.backgroundColor;
  }
  return (style as { backgroundColor?: string } | null | undefined)?.backgroundColor;
}

describe('PreflopGrid', () => {
  it('renders 169 data cells', () => {
    const { getAllByTestId } = render(<PreflopGrid />);
    expect(getAllByTestId(/^preflop-cell-/).length).toBe(169);
  });

  it('diagonal cell (0,0) shows pair label "AA"', () => {
    const { getByTestId } = render(<PreflopGrid />);
    const cell = getByTestId('preflop-cell-0-0');
    expect(cell).toHaveTextContent('AA');
  });

  it('upper triangle cell (0,1) shows suited label "AKs"', () => {
    const { getByTestId } = render(<PreflopGrid />);
    const cell = getByTestId('preflop-cell-0-1');
    expect(cell).toHaveTextContent('AKs');
  });

  it('lower triangle cell (1,0) shows offsuit label "AKo"', () => {
    const { getByTestId } = render(<PreflopGrid />);
    const cell = getByTestId('preflop-cell-1-0');
    expect(cell).toHaveTextContent('AKo');
  });

  it('fold cell (2,12) has fold background color', () => {
    const { getByTestId } = render(<PreflopGrid />);
    const cell = getByTestId('preflop-cell-2-12');
    expect(getBgColor(cell.props.style)).toBe(FOLD_COLOR);
  });

  it('AA cell (0,0) has group 1 color background', () => {
    const { getByTestId } = render(<PreflopGrid />);
    const cell = getByTestId('preflop-cell-0-0');
    expect(getBgColor(cell.props.style)).toBe(GROUP_COLORS[1]);
  });

  it('tier-2 cell (A9s at 0,5) renders a freq indicator dot', () => {
    const { getByTestId } = render(<PreflopGrid />);
    expect(getByTestId('preflop-freq-dot-0-5')).toBeTruthy();
  });

  it('tier-1 cell (AA at 0,0) does not render a freq indicator dot', () => {
    const { queryByTestId } = render(<PreflopGrid />);
    expect(queryByTestId('preflop-freq-dot-0-0')).toBeNull();
  });
});
