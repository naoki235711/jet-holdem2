import React from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GameContext, GameProvider } from '../../../src/contexts/GameContext';
import { useGame } from '../../../src/hooks/useGame';
import { LocalGameService } from '../../../src/services/LocalGameService';
import { createMockService, createMockGameState } from '../helpers/renderWithGame';
import { BleSpectatorGameService } from '../../../src/services/ble/BleSpectatorGameService';
import { MockBleClientTransport } from '../../../src/services/ble/MockBleTransport';
import { GameState } from '../../../src/gameEngine';

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

    expect(startGameSpy).toHaveBeenCalledWith(['A', 'B'], { sb: 5, bb: 10 }, 1000, undefined, 0);
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

describe('action timer integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exposes timerRemainingMs as null in debug mode', () => {
    function TimerReader() {
      const ctx = React.useContext(GameContext);
      return <Text testID="timerRemainingMs">{String(ctx?.timerRemainingMs)}</Text>;
    }

    const service = createMockService();
    (service.getState as jest.Mock).mockReturnValue(
      createMockGameState({ phase: 'preflop', activePlayer: 0 }),
    );
    render(
      <GameProvider service={service} mode="debug">
        <TimerReader />
      </GameProvider>,
    );

    expect(screen.getByTestId('timerRemainingMs').props.children).toBe('null');
  });

  it('auto-checks on timeout when canCheck is true', () => {
    function TimerReader() {
      const ctx = React.useContext(GameContext);
      return <Text testID="timerRemainingMs">{String(ctx?.timerRemainingMs)}</Text>;
    }

    const service = createMockService();
    const gameState = createMockGameState({ phase: 'preflop', activePlayer: 0 });
    (service.getState as jest.Mock).mockReturnValue(gameState);
    (service.getActionInfo as jest.Mock).mockReturnValue({
      canCheck: true, callAmount: 0, minRaise: 20, maxRaise: 1000, canRaise: true,
    });
    (service.handleAction as jest.Mock).mockReturnValue({ valid: true });

    render(
      <GameProvider service={service} mode="hotseat">
        <TimerReader />
      </GameProvider>,
    );

    act(() => { jest.advanceTimersByTime(30100); });

    expect(service.handleAction).toHaveBeenCalledWith(0, { action: 'check' });
  });

  it('auto-folds on timeout when canCheck is false', () => {
    function TimerReader() {
      const ctx = React.useContext(GameContext);
      return <Text testID="timerRemainingMs">{String(ctx?.timerRemainingMs)}</Text>;
    }

    const service = createMockService();
    const gameState = createMockGameState({ phase: 'preflop', activePlayer: 0 });
    (service.getState as jest.Mock).mockReturnValue(gameState);
    (service.getActionInfo as jest.Mock).mockReturnValue({
      canCheck: false, callAmount: 10, minRaise: 20, maxRaise: 1000, canRaise: true,
    });
    (service.handleAction as jest.Mock).mockReturnValue({ valid: true });

    render(
      <GameProvider service={service} mode="hotseat">
        <TimerReader />
      </GameProvider>,
    );

    act(() => { jest.advanceTimersByTime(30100); });

    expect(service.handleAction).toHaveBeenCalledWith(0, { action: 'fold' });
  });

  it('does not auto-action on timeout in ble-client mode', () => {
    function TimerReader() {
      const ctx = React.useContext(GameContext);
      return <Text testID="timerRemainingMs">{String(ctx?.timerRemainingMs)}</Text>;
    }

    const service = createMockService();
    const gameState = createMockGameState({ phase: 'preflop', activePlayer: 0 });
    (service.getState as jest.Mock).mockReturnValue(gameState);

    render(
      <GameProvider service={service} mode="ble-client">
        <TimerReader />
      </GameProvider>,
    );

    act(() => { jest.advanceTimersByTime(31000); });

    const calls = (service.handleAction as jest.Mock).mock.calls;
    const timeoutCalls = calls.filter(
      ([, action]: [number, any]) => action.action === 'check' || action.action === 'fold',
    );
    expect(timeoutCalls).toHaveLength(0);
  });
});

// Helper: creates a mock service that allows triggering state updates in tests
function createNotifiableService() {
  let _subscriber: ((state: GameState) => void) | null = null;
  const service = {
    ...createMockService({
      subscribe: jest.fn((cb: (state: GameState) => void) => {
        _subscriber = cb;
        return () => { _subscriber = null; };
      }),
    }),
    _notifyListeners: (state: GameState) => { _subscriber?.(state); },
  };
  return service;
}

function EffectiveModeConsumer() {
  const { mode } = useGame();
  return <Text testID="mode">{mode}</Text>;
}

describe('GameContext — ble-spectator mode', () => {
  it('exposes ble-spectator mode when mode prop is ble-spectator', () => {
    const transport = new MockBleClientTransport();
    const service = new BleSpectatorGameService(transport);
    const { getByTestId } = render(
      <GameProvider service={service} mode="ble-spectator">
        <EffectiveModeConsumer />
      </GameProvider>
    );
    expect(getByTestId('mode').props.children).toBe('ble-spectator');
  });
});

describe('GameContext — auto-transition to ble-spectator', () => {
  it('transitions effectiveMode when mySeat player status becomes out', async () => {
    const mockService = createNotifiableService();
    const { getByTestId } = render(
      <GameProvider service={mockService} mode="ble-client" mySeat={1}>
        <EffectiveModeConsumer />
      </GameProvider>
    );
    expect(getByTestId('mode').props.children).toBe('ble-client');

    const state = createMockGameState({
      players: [
        { seat: 0, name: 'Host', chips: 1000, status: 'active' as const, bet: 0, cards: [] },
        { seat: 1, name: 'Alice', chips: 0, status: 'out' as const, bet: 0, cards: [] },
        { seat: 2, name: 'Bob', chips: 1000, status: 'active' as const, bet: 0, cards: [] },
      ],
    });
    act(() => { mockService._notifyListeners(state); });

    expect(getByTestId('mode').props.children).toBe('ble-spectator');
  });

  it('does NOT transition when a different player becomes out', async () => {
    const mockService = createNotifiableService();
    const { getByTestId } = render(
      <GameProvider service={mockService} mode="ble-client" mySeat={0}>
        <EffectiveModeConsumer />
      </GameProvider>
    );

    const state = createMockGameState({
      players: [
        { seat: 0, name: 'Host', chips: 1000, status: 'active' as const, bet: 0, cards: [] },
        { seat: 1, name: 'Alice', chips: 0, status: 'out' as const, bet: 0, cards: [] },
        { seat: 2, name: 'Bob', chips: 1000, status: 'active' as const, bet: 0, cards: [] },
      ],
    });
    act(() => { mockService._notifyListeners(state); });

    expect(getByTestId('mode').props.children).toBe('ble-client');
  });

  it('does NOT transition in ble-host mode', async () => {
    const mockService = createNotifiableService();
    const { getByTestId } = render(
      <GameProvider service={mockService} mode="ble-host">
        <EffectiveModeConsumer />
      </GameProvider>
    );

    const state = createMockGameState({
      players: [
        { seat: 0, name: 'Host', chips: 0, status: 'out' as const, bet: 0, cards: [] },
        { seat: 1, name: 'Alice', chips: 1000, status: 'active' as const, bet: 0, cards: [] },
      ],
    });
    act(() => { mockService._notifyListeners(state); });

    expect(getByTestId('mode').props.children).toBe('ble-host');
  });
});
