import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
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

function RematchConsumer() {
  const { state, rematch, showdownResult } = useGame();
  return (
    <>
      <Text testID="phase">{state?.phase ?? 'null'}</Text>
      <Text testID="showdown">{showdownResult ? 'yes' : 'no'}</Text>
      <Text testID="rematch-btn" onPress={rematch}>rematch</Text>
    </>
  );
}

describe('rematch', () => {
  it('calls startGame and startRound on service', () => {
    const service = new LocalGameService();
    service.startGame(['A', 'B'], { sb: 5, bb: 10 }, 1000);
    service.startRound();

    const startGameSpy = jest.spyOn(service, 'startGame');
    const startRoundSpy = jest.spyOn(service, 'startRound');

    const { getByTestId } = render(
      <GameProvider service={service} mode="debug" playerNames={['A', 'B']} initialChips={1000} blinds={{ sb: 5, bb: 10 }}>
        <RematchConsumer />
      </GameProvider>,
    );

    act(() => {
      fireEvent.press(getByTestId('rematch-btn'));
    });

    expect(startGameSpy).toHaveBeenCalledWith(['A', 'B'], { sb: 5, bb: 10 }, 1000);
    expect(startRoundSpy).toHaveBeenCalled();
    expect(getByTestId('phase').props.children).toBe('preflop');
  });

  it('clears showdownResult', () => {
    const service = new LocalGameService();
    service.startGame(['A', 'B'], { sb: 5, bb: 10 }, 1000);
    service.startRound();

    const { getByTestId } = render(
      <GameProvider service={service} mode="debug" playerNames={['A', 'B']} initialChips={1000} blinds={{ sb: 5, bb: 10 }}>
        <RematchConsumer />
      </GameProvider>,
    );

    // showdownResult starts as null
    expect(getByTestId('showdown').props.children).toBe('no');

    act(() => {
      fireEvent.press(getByTestId('rematch-btn'));
    });

    expect(getByTestId('showdown').props.children).toBe('no');
  });
});
