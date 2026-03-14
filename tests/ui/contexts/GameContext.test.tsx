import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GameProvider } from '../../../src/contexts/GameContext';
import { useGame } from '../../../src/hooks/useGame';
import { LocalGameService } from '../../../src/services/LocalGameService';

function TestConsumer() {
  const { state, mode, viewingSeat } = useGame();
  return (
    <>
      <Text testID="phase">{state?.phase ?? 'null'}</Text>
      <Text testID="mode">{mode}</Text>
      <Text testID="seat">{String(viewingSeat)}</Text>
    </>
  );
}

describe('GameContext', () => {
  it('provides state from service subscription', () => {
    const service = new LocalGameService();
    service.startGame(['A', 'B', 'C'], { sb: 5, bb: 10 }, 1000);

    const { getByTestId } = render(
      <GameProvider service={service} mode="debug">
        <TestConsumer />
      </GameProvider>,
    );

    expect(getByTestId('phase').props.children).toBe('waiting');
    expect(getByTestId('mode').props.children).toBe('debug');
  });

  it('updates state when service notifies', () => {
    const service = new LocalGameService();
    service.startGame(['A', 'B', 'C'], { sb: 5, bb: 10 }, 1000);

    const { getByTestId } = render(
      <GameProvider service={service} mode="debug">
        <TestConsumer />
      </GameProvider>,
    );

    act(() => { service.startRound(); });
    expect(getByTestId('phase').props.children).toBe('preflop');
  });
});
