// tests/ui/integration/bettingActions.integration.test.tsx
//
// Integration tests B-1 through B-7: Betting action UI with a REAL LocalGameService.
// These tests verify the full flow from button press -> engine state change -> UI update.

import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import {
  setupIntegrationTest,
  renderGameScreen,
  advanceToPhase,
} from './helpers/integrationTestHelper';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// ---------------------------------------------------------------------------
// B-1: Fold button
// ---------------------------------------------------------------------------
describe('B-1: Fold button', () => {
  it('active player presses FOLD -> status becomes folded, seat dims, turn moves to next player', async () => {
    const { service } = setupIntegrationTest();
    const state0 = service.getState();
    expect(state0.activePlayer).toBe(0);

    const renderAPI = renderGameScreen(service, 'debug');

    // Seat 0 should not be folded yet
    const seat0Before = renderAPI.getByTestId('player-seat-0');
    expect(seat0Before.props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0.5 })]),
    );

    // Press FOLD
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('fold-btn'));
    });

    // After fold: seat 0 should have folded style (opacity 0.5)
    await waitFor(() => {
      const seat0After = renderAPI.getByTestId('player-seat-0');
      expect(seat0After.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ opacity: 0.5 })]),
      );
    });

    // Engine state confirms fold and turn advance
    const stateAfter = service.getState();
    expect(stateAfter.players.find(p => p.seat === 0)!.status).toBe('folded');
    expect(stateAfter.activePlayer).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// B-2: Check button
// ---------------------------------------------------------------------------
describe('B-2: Check button', () => {
  it('when canCheck, press CHECK -> turn moves, pot unchanged', async () => {
    const { service } = setupIntegrationTest();

    // Advance to flop so all bets are 0 and checks are possible
    advanceToPhase(service, 'flop');

    const stateAtFlop = service.getState();
    expect(stateAtFlop.phase).toBe('flop');
    const potBefore = stateAtFlop.pots.reduce((s, p) => s + p.amount, 0);
    const firstToAct = stateAtFlop.activePlayer;
    expect(firstToAct).toBeGreaterThanOrEqual(0);

    const info = service.getActionInfo(firstToAct);
    expect(info.canCheck).toBe(true);

    const renderAPI = renderGameScreen(service, 'debug');

    // Button should say CHECK
    await waitFor(() => {
      expect(renderAPI.getByText('CHECK')).toBeTruthy();
    });

    // Press CHECK
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('call-btn'));
    });

    // Turn should move to next player
    await waitFor(() => {
      const stateAfter = service.getState();
      expect(stateAfter.activePlayer).not.toBe(firstToAct);
    });

    // Pot should be unchanged
    const stateAfter = service.getState();
    const potAfter = stateAfter.pots.reduce((s, p) => s + p.amount, 0);
    expect(potAfter).toBe(potBefore);
  });
});

// ---------------------------------------------------------------------------
// B-3: Call button
// ---------------------------------------------------------------------------
describe('B-3: Call button', () => {
  it('when currentBet > playerBet, press CALL -> chips decrease, pot increases, turn moves', async () => {
    const { service } = setupIntegrationTest();
    const state0 = service.getState();
    expect(state0.activePlayer).toBe(0);
    expect(state0.currentBet).toBe(10);

    const player0Before = state0.players.find(p => p.seat === 0)!;
    expect(player0Before.bet).toBe(0);
    const chipsBefore = player0Before.chips; // 1000

    const renderAPI = renderGameScreen(service, 'debug');

    // Button should say CALL with the call amount
    await waitFor(() => {
      expect(renderAPI.getByText(/CALL/)).toBeTruthy();
    });

    // Press CALL
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('call-btn'));
    });

    // Chips should decrease by callAmount (10) and turn should move
    await waitFor(() => {
      const stateAfter = service.getState();
      const player0After = stateAfter.players.find(p => p.seat === 0)!;
      expect(player0After.chips).toBe(chipsBefore - 10);
      expect(player0After.bet).toBe(10);
    });

    const stateAfter = service.getState();
    expect(stateAfter.activePlayer).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// B-4: Raise via slider -> Raise execute
// ---------------------------------------------------------------------------
describe('B-4: Raise via slider -> Raise execute', () => {
  it('set slider value, press RAISE -> currentBet updates, chips decrease, others get action', async () => {
    const { service } = setupIntegrationTest();
    const state0 = service.getState();
    expect(state0.activePlayer).toBe(0);
    expect(state0.currentBet).toBe(10);

    const info = service.getActionInfo(0);
    expect(info.minRaise).toBe(20); // currentBet(10) + BB(10)

    const renderAPI = renderGameScreen(service, 'debug');

    // The raise slider should be visible
    await waitFor(() => {
      expect(renderAPI.getByTestId('raise-slider')).toBeTruthy();
    });

    // Adjust the slider to raise to 30
    const raiseTarget = 30;
    await act(async () => {
      fireEvent(renderAPI.getByTestId('raise-slider'), 'onValueChange', raiseTarget);
    });

    // Raise button should show the new raise amount
    await waitFor(() => {
      expect(renderAPI.getByText(`RAISE ${raiseTarget}`)).toBeTruthy();
    });

    // Press RAISE
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('raise-btn'));
    });

    // After raise: currentBet should be updated, chips decreased, turn moved
    await waitFor(() => {
      const stateAfter = service.getState();
      expect(stateAfter.currentBet).toBe(raiseTarget);
    });

    const stateAfter = service.getState();
    const player0 = stateAfter.players.find(p => p.seat === 0)!;
    expect(player0.chips).toBe(1000 - raiseTarget);
    expect(player0.bet).toBe(raiseTarget);
    expect(stateAfter.activePlayer).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// B-5: All-in
// ---------------------------------------------------------------------------
describe('B-5: All-in', () => {
  it('when raiseValue >= maxRaise, button shows ALL IN -> press it -> chips=0, status=allIn', async () => {
    // Use low chips so all-in is easy to trigger
    const { service } = setupIntegrationTest({
      initialChips: 50,
      blinds: { sb: 5, bb: 10 },
    });
    const state0 = service.getState();
    expect(state0.activePlayer).toBe(0);

    // seat0: 50 chips, bet=0 => maxRaise = 50
    const info = service.getActionInfo(0);
    expect(info.maxRaise).toBe(50);

    const renderAPI = renderGameScreen(service, 'debug');

    // Move slider to max (all-in)
    await act(async () => {
      fireEvent(renderAPI.getByTestId('raise-slider'), 'onValueChange', info.maxRaise);
    });

    // Button should show ALL IN
    await waitFor(() => {
      expect(renderAPI.getByText(`ALL IN ${info.maxRaise}`)).toBeTruthy();
    });

    // Press ALL IN
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('raise-btn'));
    });

    // Player's chips should be 0 and status should be allIn
    await waitFor(() => {
      const stateAfter = service.getState();
      const player0 = stateAfter.players.find(p => p.seat === 0)!;
      expect(player0.chips).toBe(0);
      expect(player0.status).toBe('allIn');
    });
  });
});

// ---------------------------------------------------------------------------
// B-6: Buttons disabled when not your turn
// ---------------------------------------------------------------------------
describe('B-6: Buttons disabled when not your turn', () => {
  it('in hotseat mode, buttons are enabled only after pass-device dismiss for the active player', async () => {
    const { service } = setupIntegrationTest();
    const renderAPI = renderGameScreen(service, 'hotseat');

    // Pass device screen shows first -- action buttons should NOT be rendered
    await waitFor(() => {
      expect(renderAPI.getByTestId('pass-device-screen')).toBeTruthy();
    });
    expect(renderAPI.queryByTestId('fold-btn')).toBeNull();

    // Dismiss pass screen by tapping it
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('pass-device-screen'));
    });

    // Now viewing seat 0 (active player) -- buttons should be enabled
    await waitFor(() => {
      expect(renderAPI.getByTestId('fold-btn').props.accessibilityState?.disabled).toBe(false);
    });
    expect(renderAPI.getByTestId('call-btn').props.accessibilityState?.disabled).toBe(false);

    // Seat 0 presses CALL -- turn moves to seat 1
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('call-btn'));
    });

    // Pass device screen shows again for the next player -- buttons are hidden
    await waitFor(() => {
      expect(renderAPI.getByTestId('pass-device-screen')).toBeTruthy();
    });
    expect(renderAPI.queryByTestId('fold-btn')).toBeNull();

    // Dismiss pass screen for seat 1
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('pass-device-screen'));
    });

    // Buttons enabled for seat 1 (the new active player)
    await waitFor(() => {
      expect(renderAPI.getByTestId('fold-btn').props.accessibilityState?.disabled).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// B-7: All fold -> last player wins
// ---------------------------------------------------------------------------
describe('B-7: All fold -> last player wins', () => {
  it('two players fold in 3-player game -> roundEnd without showdown, ResultOverlay shows fold winner', async () => {
    const { service } = setupIntegrationTest();
    const state0 = service.getState();
    expect(state0.activePlayer).toBe(0);

    const renderAPI = renderGameScreen(service, 'debug');

    // Seat 0 (Alice) folds
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('fold-btn'));
    });

    // Seat 1 (Bob) should now be active
    await waitFor(() => {
      const state1 = service.getState();
      expect(state1.activePlayer).toBe(1);
    });

    // Seat 1 (Bob) folds
    await act(async () => {
      fireEvent.press(renderAPI.getByTestId('fold-btn'));
    });

    // Game should be in roundEnd phase
    await waitFor(() => {
      const stateFinal = service.getState();
      expect(stateFinal.phase).toBe('roundEnd');
    });

    // ResultOverlay should show with fold winner "Charlie wins!"
    await waitFor(() => {
      expect(renderAPI.getByTestId('result-overlay')).toBeTruthy();
    });
    expect(renderAPI.getByText('Charlie wins!')).toBeTruthy();
  });
});
