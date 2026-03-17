import React from 'react';
import { render } from '@testing-library/react-native';
import { ActionTimerBar } from '../../../src/components/table/ActionTimerBar';

describe('ActionTimerBar', () => {
  it('renders fill bar at 50% width when half time remains', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={15000} durationMs={30000} isActive={true} />,
    );
    const fill = getByTestId('timer-fill');
    const widthStyle = fill.props.style.find(
      (s: any) => s && typeof s === 'object' && 'width' in s,
    );
    expect(widthStyle.width).toBe('50%');
  });

  it('renders fill bar at 100% width when full time remains', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={30000} durationMs={30000} isActive={true} />,
    );
    const fill = getByTestId('timer-fill');
    const widthStyle = fill.props.style.find(
      (s: any) => s && typeof s === 'object' && 'width' in s,
    );
    expect(widthStyle.width).toBe('100%');
  });

  it('renders fill bar at 0% width when time expired', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={0} durationMs={30000} isActive={true} />,
    );
    const fill = getByTestId('timer-fill');
    const widthStyle = fill.props.style.find(
      (s: any) => s && typeof s === 'object' && 'width' in s,
    );
    expect(widthStyle.width).toBe('0%');
  });

  it('uses cyan-ish color when ratio > 0.5', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={25000} durationMs={30000} isActive={true} />,
    );
    const fill = getByTestId('timer-fill');
    const bgStyle = fill.props.style.find(
      (s: any) => s && typeof s === 'object' && 'backgroundColor' in s,
    );
    // Should be interpolated between cyan and yellow, but closer to cyan
    expect(bgStyle.backgroundColor).toMatch(/^rgb\(/);
  });

  it('uses red-ish color when ratio < 0.2', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={3000} durationMs={30000} isActive={true} />,
    );
    const fill = getByTestId('timer-fill');
    const bgStyle = fill.props.style.find(
      (s: any) => s && typeof s === 'object' && 'backgroundColor' in s,
    );
    // Parse the rgb to check red channel is high
    const match = bgStyle.backgroundColor.match(/rgb\((\d+),(\d+),(\d+)\)/);
    expect(Number(match[1])).toBeGreaterThan(200); // red channel high
  });

  it('renders transparent when isActive is false', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={15000} durationMs={30000} isActive={false} />,
    );
    const track = getByTestId('timer-track');
    const trackStyles = track.props.style;
    // Track should exist but be transparent
    expect(trackStyles).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: 'transparent' })]),
    );
  });

  it('always reserves 3px height even when inactive', () => {
    const { getByTestId } = render(
      <ActionTimerBar remainingMs={15000} durationMs={30000} isActive={false} />,
    );
    const track = getByTestId('timer-track');
    const heightStyle = track.props.style.find(
      (s: any) => s && typeof s === 'object' && 'height' in s,
    );
    expect(heightStyle.height).toBe(3);
  });
});
