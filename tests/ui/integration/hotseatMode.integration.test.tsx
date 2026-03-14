/**
 * Integration tests for hotseat mode (H-1 through H-4).
 *
 * These tests use a REAL LocalGameService and the full component tree
 * (via the integration test helper) to verify the PassDeviceScreen
 * interstitial flow in hotseat mode.
 */

import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import {
  setupIntegrationTest,
  renderGameScreen,
} from './helpers/integrationTestHelper';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

describe('Hotseat Mode Integration', () => {
  /**
   * H-1: PassDeviceScreen appears on turn change
   *
   * On initial render in hotseat mode the activePlayer transitions from
   * the ref's initial value (-1) to seat 0 (the preflop UTG player).
   * This change triggers PassDeviceScreen for "Alice".
   */
  it('H-1: PassDeviceScreen appears on initial render for the first active player', async () => {
    const { service } = setupIntegrationTest({ mode: 'hotseat' });
    const rendered = renderGameScreen(service, 'hotseat');

    await waitFor(() => {
      expect(rendered.getByTestId('pass-device-screen')).toBeTruthy();
    });

    expect(rendered.getByText('端末を Alice に渡してください')).toBeTruthy();
    expect(rendered.getByText('タップして続行')).toBeTruthy();
  });

  /**
   * H-2: Tapping PassDeviceScreen dismisses it
   *
   * After the PassDeviceScreen is shown, pressing it should dismiss it
   * and reveal the game view with action buttons.
   */
  it('H-2: tapping PassDeviceScreen dismisses it and reveals the game view', async () => {
    const { service } = setupIntegrationTest({ mode: 'hotseat' });
    const rendered = renderGameScreen(service, 'hotseat');

    // Wait for PassDeviceScreen to appear
    await waitFor(() => {
      expect(rendered.getByTestId('pass-device-screen')).toBeTruthy();
    });

    // Tap to dismiss
    await act(async () => {
      fireEvent.press(rendered.getByTestId('pass-device-screen'));
    });

    // PassDeviceScreen should be gone, game view visible
    await waitFor(() => {
      expect(rendered.getByTestId('game-view')).toBeTruthy();
    });

    expect(rendered.queryByTestId('pass-device-screen')).toBeNull();

    // Action buttons should be available (seat 0 is active, it is our turn)
    expect(rendered.getByTestId('fold-btn')).toBeTruthy();
    expect(rendered.getByTestId('call-btn')).toBeTruthy();
    expect(rendered.getByTestId('raise-btn')).toBeTruthy();
  });

  /**
   * H-3: viewingSeat auto-follows activePlayer
   *
   * After dismissing the first PassDeviceScreen and taking an action
   * (CALL as seat 0), the active player advances to seat 1 (Bob).
   * A new PassDeviceScreen should appear for "Bob".
   */
  it('H-3: after an action, PassDeviceScreen appears for the next active player', async () => {
    const { service } = setupIntegrationTest({ mode: 'hotseat' });
    const rendered = renderGameScreen(service, 'hotseat');

    // Wait for and dismiss the initial PassDeviceScreen (Alice, seat 0)
    await waitFor(() => {
      expect(rendered.getByTestId('pass-device-screen')).toBeTruthy();
    });
    expect(rendered.getByText('端末を Alice に渡してください')).toBeTruthy();

    await act(async () => {
      fireEvent.press(rendered.getByTestId('pass-device-screen'));
    });

    // Game view is now visible; seat 0 (Alice) is active in preflop
    await waitFor(() => {
      expect(rendered.getByTestId('game-view')).toBeTruthy();
    });

    // Seat 0 acts — press CALL (UTG calls the BB)
    await act(async () => {
      fireEvent.press(rendered.getByTestId('call-btn'));
    });

    // Active player should now be seat 1 (Bob) — PassDeviceScreen for Bob
    await waitFor(() => {
      expect(rendered.getByTestId('pass-device-screen')).toBeTruthy();
      expect(rendered.getByText('端末を Bob に渡してください')).toBeTruthy();
    });

    // Dismiss and let Bob act
    await act(async () => {
      fireEvent.press(rendered.getByTestId('pass-device-screen'));
    });

    await waitFor(() => {
      expect(rendered.getByTestId('game-view')).toBeTruthy();
    });

    // Bob acts — CALL
    await act(async () => {
      fireEvent.press(rendered.getByTestId('call-btn'));
    });

    // Active player should now be seat 2 (Charlie) — PassDeviceScreen for Charlie
    await waitFor(() => {
      expect(rendered.getByTestId('pass-device-screen')).toBeTruthy();
      expect(rendered.getByText('端末を Charlie に渡してください')).toBeTruthy();
    });
  });

  /**
   * H-4: No PassDeviceScreen during showdown/roundEnd
   *
   * When all but one player folds, the game moves directly to roundEnd.
   * PassDeviceScreen should NOT appear and ResultOverlay should show instead.
   */
  it('H-4: PassDeviceScreen does not appear during roundEnd; ResultOverlay shows', async () => {
    const { service } = setupIntegrationTest({ mode: 'hotseat' });
    const rendered = renderGameScreen(service, 'hotseat');

    // Dismiss initial PassDeviceScreen (Alice, seat 0)
    await waitFor(() => {
      expect(rendered.getByTestId('pass-device-screen')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(rendered.getByTestId('pass-device-screen'));
    });
    await waitFor(() => {
      expect(rendered.getByTestId('game-view')).toBeTruthy();
    });

    // Seat 0 (Alice) folds
    await act(async () => {
      fireEvent.press(rendered.getByTestId('fold-btn'));
    });

    // PassDeviceScreen should appear for seat 1 (Bob) since we're still in preflop
    await waitFor(() => {
      expect(rendered.getByTestId('pass-device-screen')).toBeTruthy();
      expect(rendered.getByText('端末を Bob に渡してください')).toBeTruthy();
    });

    // Dismiss and let Bob fold — this leaves only Charlie, triggering roundEnd
    await act(async () => {
      fireEvent.press(rendered.getByTestId('pass-device-screen'));
    });
    await waitFor(() => {
      expect(rendered.getByTestId('game-view')).toBeTruthy();
    });

    // Seat 1 (Bob) folds — only Charlie remains → roundEnd
    await act(async () => {
      fireEvent.press(rendered.getByTestId('fold-btn'));
    });

    // PassDeviceScreen should NOT appear (phase is roundEnd)
    // ResultOverlay should appear instead
    await waitFor(() => {
      expect(rendered.getByTestId('result-overlay')).toBeTruthy();
    });

    expect(rendered.queryByTestId('pass-device-screen')).toBeNull();
  });
});
