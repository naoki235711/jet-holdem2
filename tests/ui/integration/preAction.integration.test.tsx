import React from 'react';
import { act, waitFor, fireEvent } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import { GameProvider } from '../../../src/contexts/GameContext';
import { LocalGameService } from '../../../src/services/LocalGameService';
import { useGame } from '../../../src/hooks/useGame';
import { View, Text, TouchableOpacity } from 'react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

/**
 * Minimal test harness that exposes pre-action controls and game state.
 */
function PreActionTestView() {
  const { state, preAction, setPreAction, doAction, getActionInfo } = useGame();
  if (!state) return null;

  return (
    <View>
      <Text testID="phase">{state.phase}</Text>
      <Text testID="active-player">{state.activePlayer}</Text>
      <Text testID="pre-action">{String(preAction)}</Text>
      <Text testID="seat0-status">{state.players[0]?.status}</Text>
      <TouchableOpacity testID="set-checkFold" onPress={() => setPreAction('checkFold')} />
      <TouchableOpacity testID="set-call" onPress={() => setPreAction('call')} />
      <TouchableOpacity testID="set-callAny" onPress={() => setPreAction('callAny')} />
      <TouchableOpacity testID="clear-preaction" onPress={() => setPreAction(null)} />
      <TouchableOpacity
        testID="do-action"
        onPress={() => {
          if (state.activePlayer >= 0) {
            const info = getActionInfo(state.activePlayer);
            doAction(state.activePlayer, info.canCheck ? { action: 'check' } : { action: 'call' });
          }
        }}
      />
    </View>
  );
}

function renderPreActionTest(service: LocalGameService) {
  return render(
    <GameProvider service={service} mode="ble-host">
      <PreActionTestView />
    </GameProvider>,
  );
}

describe('Pre-action integration', () => {
  it('auto-executes Check/Fold when turn arrives (canCheck=true → check)', async () => {
    const service = new LocalGameService();
    service.startGame(['Host', 'B', 'C'], { sb: 5, bb: 10 }, 1000);
    service.startRound();

    // Host = seat 0, activePlayer starts at 0 (UTG in 3-player)
    // First, advance seat 0 past its turn so we can set a pre-action
    await act(async () => {
      service.handleAction(0, { action: 'call' }); // seat 0 calls
    });

    const renderAPI = renderPreActionTest(service);

    // Now seat 1 is active. Set pre-action for seat 0 (host)
    await act(async () => {
      const { getByTestId } = renderAPI;
      // Verify seat 1 is active
      expect(getByTestId('active-player').props.children).toBe(1);
    });

    // Set Check/Fold pre-action for host (seat 0)
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('set-checkFold'));
    });

    // Verify pre-action is set
    expect(renderAPI.getByTestId('pre-action').props.children).toBe('checkFold');

    // Advance: seat 1 calls, seat 2 checks (BB) → flop
    // Postflop order: seat 1 acts first (first active after dealer=0), then seat 2, then seat 0
    await act(async () => {
      service.handleAction(1, { action: 'call' }); // seat 1 calls
    });

    await act(async () => {
      service.handleAction(2, { action: 'check' }); // seat 2 (BB) checks → flop starts
    });

    // On flop, seat 1 acts first (postflop). Advance seat 1 and seat 2 so seat 0 gets the turn.
    await act(async () => {
      service.handleAction(1, { action: 'check' }); // seat 1 checks on flop
    });

    await act(async () => {
      service.handleAction(2, { action: 'check' }); // seat 2 checks on flop → seat 0's turn
    });

    // Now it's seat 0's turn on the flop, and pre-action (checkFold) should auto-execute
    await waitFor(() => {
      // Pre-action should be cleared after execution
      expect(renderAPI.getByTestId('pre-action').props.children).toBe('null');
    });

    // Verify the check was actually executed (activePlayer moved past seat 0)
    const finalState = service.getState();
    expect(finalState.activePlayer).not.toBe(0);
  });

  it('resets Call pre-action when currentBet changes', async () => {
    const service = new LocalGameService();
    // Use 3 players so that after seat 1 raises, seat 2 acts before seat 0,
    // giving time for the reset to be visible before auto-execute would kick in.
    service.startGame(['Host', 'B', 'C'], { sb: 5, bb: 10 }, 1000);
    service.startRound();

    // Advance preflop: seat 0 calls, then render
    await act(async () => {
      service.handleAction(0, { action: 'call' }); // seat 0 calls
    });

    const renderAPI = renderPreActionTest(service);

    // seat 1 is now active; set Call pre-action for host (seat 0)
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('set-call'));
    });
    expect(renderAPI.getByTestId('pre-action').props.children).toBe('call');

    // seat 1 raises → currentBet changes → Call should reset
    // seat 2 (BB) still needs to act, so it's NOT seat 0's turn yet
    await act(async () => {
      service.handleAction(1, { action: 'raise', amount: 30 });
    });

    // Call pre-action should be reset because currentBet changed
    await waitFor(() => {
      expect(renderAPI.getByTestId('pre-action').props.children).toBe('null');
    });
  });

  it('does NOT reset Call Any when currentBet changes', async () => {
    const service = new LocalGameService();
    // Use 3 players: seat 1 raises, seat 2 must act before seat 0.
    // This lets us verify callAny persists through the currentBet change
    // without being auto-executed (seat 0's turn hasn't come yet).
    service.startGame(['Host', 'B', 'C'], { sb: 5, bb: 10 }, 1000);
    service.startRound();

    // Advance preflop: seat 0 calls, then render
    await act(async () => {
      service.handleAction(0, { action: 'call' }); // seat 0 calls
    });

    const renderAPI = renderPreActionTest(service);

    // seat 1 is active; set Call Any pre-action for host (seat 0)
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('set-callAny'));
    });
    expect(renderAPI.getByTestId('pre-action').props.children).toBe('callAny');

    // seat 1 raises → currentBet changes → Call Any should NOT reset
    // seat 2 (BB) still needs to act before seat 0, so no auto-execute yet
    await act(async () => {
      service.handleAction(1, { action: 'raise', amount: 30 });
    });

    // callAny stays (not reset by currentBet change, unlike 'call')
    expect(renderAPI.getByTestId('pre-action').props.children).toBe('callAny');
  });
});
