// tests/ui/integration/gameFlow.integration.test.tsx
//
// Integration tests F-1 through F-4: full UI-to-engine flow using a real
// LocalGameService (no mocks except expo-router).

import React from 'react';
import { act, fireEvent, waitFor, screen } from '@testing-library/react-native';
import {
  setupIntegrationTest,
  renderGameScreen,
  advanceToPhase,
  completeCurrentBettingRound,
} from './helpers/integrationTestHelper';
import { LocalGameService } from '../../../src/services/LocalGameService';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

describe('Game Flow Integration Tests', () => {
  let service: LocalGameService;

  // ─────────────────────────────────────────────────────────
  // F-1: Initial display after game start
  // ─────────────────────────────────────────────────────────
  describe('F-1: Initial display after game start', () => {
    beforeEach(() => {
      ({ service } = setupIntegrationTest());
    });

    it('phase is preflop after setup', () => {
      const state = service.getState();
      expect(state.phase).toBe('preflop');
    });

    it('renders 3 PlayerSeats', () => {
      renderGameScreen(service, 'debug');

      expect(screen.getByTestId('player-seat-0')).toBeTruthy();
      expect(screen.getByTestId('player-seat-1')).toBeTruthy();
      expect(screen.getByTestId('player-seat-2')).toBeTruthy();
    });

    it('displays player names (Alice, Bob, Charlie)', () => {
      renderGameScreen(service, 'debug');

      expect(screen.getByText('Alice')).toBeTruthy();
      expect(screen.getByText('Bob')).toBeTruthy();
      expect(screen.getByText('Charlie')).toBeTruthy();
    });

    it('PotDisplay is not shown during preflop (blinds not yet collected into pots)', () => {
      renderGameScreen(service, 'debug');

      // During preflop, blinds are in player.bet, not yet collected into pots.
      // PotDisplay returns null when total pot is 0.
      expect(screen.queryByTestId('pot-display')).toBeNull();

      // Verify blinds are in player bets instead
      const state = service.getState();
      const totalBets = state.players.reduce((sum, p) => sum + p.bet, 0);
      expect(totalBets).toBe(15); // SB(5) + BB(10)
    });

    it('ActionButtons are visible with FOLD button', () => {
      renderGameScreen(service, 'debug');

      expect(screen.getByTestId('fold-btn')).toBeTruthy();
      expect(screen.getByText('FOLD')).toBeTruthy();
    });

    it('shows the dealer badge on seat 0', () => {
      renderGameScreen(service, 'debug');

      // Dealer is seat 0 — the "D" badge text should appear
      expect(screen.getByText('D')).toBeTruthy();
    });

    it('shows 5 card slots, all empty in preflop', () => {
      renderGameScreen(service, 'debug');

      const cardSlots = screen.getAllByTestId('card-slot');
      expect(cardSlots).toHaveLength(5);

      const emptySlots = screen.getAllByTestId('empty-slot');
      expect(emptySlots).toHaveLength(5);
    });

    it('preflop first to act is seat 0 (UTG) in 3-player game', () => {
      const state = service.getState();
      // dealer=0, SB=seat1, BB=seat2, UTG/first-to-act=seat0
      expect(state.activePlayer).toBe(0);
    });

    it('blind amounts are correctly deducted', () => {
      const state = service.getState();
      const seat0 = state.players.find(p => p.seat === 0)!;
      const seat1 = state.players.find(p => p.seat === 1)!;
      const seat2 = state.players.find(p => p.seat === 2)!;

      // seat0 = dealer/UTG: no blind, chips=1000, bet=0
      expect(seat0.chips).toBe(1000);
      expect(seat0.bet).toBe(0);

      // seat1 = SB: 5 chips posted
      expect(seat1.chips).toBe(995);
      expect(seat1.bet).toBe(5);

      // seat2 = BB: 10 chips posted
      expect(seat2.chips).toBe(990);
      expect(seat2.bet).toBe(10);
    });
  });

  // ─────────────────────────────────────────────────────────
  // F-2: Preflop betting complete -> Flop transition
  // ─────────────────────────────────────────────────────────
  describe('F-2: Preflop betting complete -> Flop transition', () => {
    beforeEach(() => {
      ({ service } = setupIntegrationTest());
    });

    it('transitions to flop after all players call/check through preflop', async () => {
      renderGameScreen(service, 'debug');

      // Preflop action order: seat0 (UTG) -> seat1 (SB) -> seat2 (BB)
      // seat0 calls 10 (matching BB)
      await act(async () => {
        service.handleAction(0, { action: 'call' });
      });

      // seat1 calls 5 more (SB already has 5 in, needs 5 more to match BB of 10)
      await act(async () => {
        service.handleAction(1, { action: 'call' });
      });

      // seat2 checks (already has BB posted)
      await act(async () => {
        service.handleAction(2, { action: 'check' });
      });

      // After preflop completes, phase should be flop
      await waitFor(() => {
        const state = service.getState();
        expect(state.phase).toBe('flop');
      });
    });

    it('flop deals exactly 3 community cards', async () => {
      renderGameScreen(service, 'debug');

      // Complete preflop
      await act(async () => {
        service.handleAction(0, { action: 'call' });
      });
      await act(async () => {
        service.handleAction(1, { action: 'call' });
      });
      await act(async () => {
        service.handleAction(2, { action: 'check' });
      });

      await waitFor(() => {
        const state = service.getState();
        expect(state.community).toHaveLength(3);
      });
    });

    it('updates community card slots in UI after flop transition', async () => {
      renderGameScreen(service, 'debug');

      // Complete preflop
      await act(async () => {
        service.handleAction(0, { action: 'call' });
      });
      await act(async () => {
        service.handleAction(1, { action: 'call' });
      });
      await act(async () => {
        service.handleAction(2, { action: 'check' });
      });

      // 3 community cards dealt, 2 empty slots remain
      await waitFor(() => {
        const emptySlots = screen.getAllByTestId('empty-slot');
        expect(emptySlots).toHaveLength(2);
      });
    });

    it('pot accumulates all preflop bets (30 total)', async () => {
      renderGameScreen(service, 'debug');

      // Each player puts in 10: 3 * 10 = 30
      await act(async () => {
        service.handleAction(0, { action: 'call' });
      });
      await act(async () => {
        service.handleAction(1, { action: 'call' });
      });
      await act(async () => {
        service.handleAction(2, { action: 'check' });
      });

      await waitFor(() => {
        expect(screen.getByText('30')).toBeTruthy();
      });
    });

    it('postflop first to act is seat 1 (first active after dealer)', async () => {
      renderGameScreen(service, 'debug');

      // Complete preflop
      await act(async () => {
        service.handleAction(0, { action: 'call' });
      });
      await act(async () => {
        service.handleAction(1, { action: 'call' });
      });
      await act(async () => {
        service.handleAction(2, { action: 'check' });
      });

      await waitFor(() => {
        const state = service.getState();
        expect(state.phase).toBe('flop');
        // Postflop: first active player after dealer (seat 0), which is seat 1
        expect(state.activePlayer).toBe(1);
      });
    });
  });

  // ─────────────────────────────────────────────────────────
  // F-3: All phases through to Showdown -> ResultOverlay
  // ─────────────────────────────────────────────────────────
  describe('F-3: All phases through to Showdown -> ResultOverlay', () => {
    it('progresses through all phases: preflop -> flop -> turn -> river -> showdown -> roundEnd', async () => {
      ({ service } = setupIntegrationTest());
      renderGameScreen(service, 'debug');

      // Track phases as we go
      expect(service.getState().phase).toBe('preflop');

      // --- Preflop ---
      await act(async () => {
        service.handleAction(0, { action: 'call' });
      });
      await act(async () => {
        service.handleAction(1, { action: 'call' });
      });
      await act(async () => {
        service.handleAction(2, { action: 'check' });
      });
      expect(service.getState().phase).toBe('flop');
      expect(service.getState().community).toHaveLength(3);

      // --- Flop --- (first to act: seat 1)
      await act(async () => {
        service.handleAction(1, { action: 'check' });
      });
      await act(async () => {
        service.handleAction(2, { action: 'check' });
      });
      await act(async () => {
        service.handleAction(0, { action: 'check' });
      });
      expect(service.getState().phase).toBe('turn');
      expect(service.getState().community).toHaveLength(4);

      // --- Turn --- (first to act: seat 1)
      await act(async () => {
        service.handleAction(1, { action: 'check' });
      });
      await act(async () => {
        service.handleAction(2, { action: 'check' });
      });
      await act(async () => {
        service.handleAction(0, { action: 'check' });
      });
      expect(service.getState().phase).toBe('river');
      expect(service.getState().community).toHaveLength(5);

      // --- River --- (first to act: seat 1)
      // The last action in the river triggers showdown, which GameContext
      // auto-resolves to roundEnd via doAction.
      // However, we're calling handleAction directly on the service here,
      // not through the UI's doAction. The GameContext auto-resolution is
      // triggered by doAction. So let's use fireEvent on the UI buttons
      // for the last round, or manually call through the service and then
      // resolve.
      await act(async () => {
        service.handleAction(1, { action: 'check' });
      });
      await act(async () => {
        service.handleAction(2, { action: 'check' });
      });
      await act(async () => {
        service.handleAction(0, { action: 'check' });
      });

      // After river betting completes, engine phase = showdown
      // But we called handleAction directly, not via doAction,
      // so auto-resolve hasn't happened through GameContext.
      // We need to resolve showdown manually.
      expect(service.getState().phase).toBe('showdown');

      await act(async () => {
        service.resolveShowdown();
      });

      await waitFor(() => {
        expect(service.getState().phase).toBe('roundEnd');
      });

      // ResultOverlay should appear and ActionButtons should hide
      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
        expect(screen.queryByTestId('fold-btn')).toBeNull();
      });
    });

    it('shows ResultOverlay and hides ActionButtons using advanceToPhase helper', async () => {
      ({ service } = setupIntegrationTest());

      // Advance through all phases before rendering
      advanceToPhase(service, 'showdown');
      expect(service.getState().phase).toBe('showdown');

      service.resolveShowdown();
      expect(service.getState().phase).toBe('roundEnd');

      // Now render with the game already at roundEnd
      renderGameScreen(service, 'debug');

      // ActionButtons hidden at roundEnd, ResultOverlay visible
      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
        expect(screen.queryByTestId('fold-btn')).toBeNull();
      });
    });

    it('shows "次のラウンドへ" button in ResultOverlay', async () => {
      ({ service } = setupIntegrationTest());

      advanceToPhase(service, 'showdown');
      service.resolveShowdown();

      renderGameScreen(service, 'debug');

      await waitFor(() => {
        expect(screen.getByText('次のラウンドへ')).toBeTruthy();
      });
    });

    it('community cards show all 5 cards after river', async () => {
      ({ service } = setupIntegrationTest());

      advanceToPhase(service, 'showdown');
      expect(service.getState().community).toHaveLength(5);

      service.resolveShowdown();

      renderGameScreen(service, 'debug');

      await waitFor(() => {
        const emptySlots = screen.queryAllByTestId('empty-slot');
        expect(emptySlots).toHaveLength(0);
      });
    });
  });

  // ─────────────────────────────────────────────────────────
  // F-4: "次のラウンドへ" button starts new round
  // ─────────────────────────────────────────────────────────
  describe('F-4: "次のラウンドへ" button starts new round', () => {
    it('pressing "次のラウンドへ" resets to preflop and rotates dealer', async () => {
      ({ service } = setupIntegrationTest());

      // Advance to roundEnd before rendering
      advanceToPhase(service, 'showdown');
      service.resolveShowdown();
      expect(service.getState().phase).toBe('roundEnd');
      expect(service.getState().dealer).toBe(0); // Dealer was 0 in round 1

      renderGameScreen(service, 'debug');

      // Verify ResultOverlay is showing
      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
      });

      // Press the next round button
      await act(async () => {
        fireEvent.press(screen.getByText('次のラウンドへ'));
      });

      // ResultOverlay should disappear
      await waitFor(() => {
        expect(screen.queryByTestId('result-overlay')).toBeNull();
      });

      // Phase should be preflop again
      await waitFor(() => {
        const state = service.getState();
        expect(state.phase).toBe('preflop');
      });

      // Dealer should have rotated from 0 to 1
      const newState = service.getState();
      expect(newState.dealer).toBe(1);
    });

    it('ActionButtons reappear after new round starts', async () => {
      ({ service } = setupIntegrationTest());

      advanceToPhase(service, 'showdown');
      service.resolveShowdown();

      renderGameScreen(service, 'debug');

      // ResultOverlay visible, ActionButtons hidden at roundEnd
      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
        expect(screen.queryByTestId('fold-btn')).toBeNull();
      });

      // Start next round
      await act(async () => {
        fireEvent.press(screen.getByText('次のラウンドへ'));
      });

      // Action buttons should reappear
      await waitFor(() => {
        expect(screen.getByTestId('fold-btn')).toBeTruthy();
        expect(screen.getByText('FOLD')).toBeTruthy();
      });
    });

    it('new round has correct blinds and pot', async () => {
      ({ service } = setupIntegrationTest());

      advanceToPhase(service, 'showdown');
      service.resolveShowdown();

      renderGameScreen(service, 'debug');

      await waitFor(() => {
        expect(screen.getByText('次のラウンドへ')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByText('次のラウンドへ'));
      });

      // After new round: dealer=1, SB=seat2, BB=seat0
      await waitFor(() => {
        const state = service.getState();
        expect(state.phase).toBe('preflop');
        expect(state.dealer).toBe(1);
      });

      // During preflop, blinds are in player.bet (not yet collected into pots)
      // Verify blinds are correctly posted for the new round
      const newState = service.getState();
      const totalBets = newState.players.reduce((sum, p) => sum + p.bet, 0);
      expect(totalBets).toBe(15); // SB(5) + BB(10)
    });

    it('community cards are cleared for the new round', async () => {
      ({ service } = setupIntegrationTest());

      advanceToPhase(service, 'showdown');
      service.resolveShowdown();

      renderGameScreen(service, 'debug');

      await waitFor(() => {
        expect(screen.getByText('次のラウンドへ')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByText('次のラウンドへ'));
      });

      // All 5 community card slots should be empty again
      await waitFor(() => {
        const emptySlots = screen.getAllByTestId('empty-slot');
        expect(emptySlots).toHaveLength(5);
      });
    });

    it('all 3 players are still present in the new round', async () => {
      ({ service } = setupIntegrationTest());

      advanceToPhase(service, 'showdown');
      service.resolveShowdown();

      renderGameScreen(service, 'debug');

      await waitFor(() => {
        expect(screen.getByText('次のラウンドへ')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByText('次のラウンドへ'));
      });

      // All 3 players should still be rendered
      await waitFor(() => {
        expect(screen.getByTestId('player-seat-0')).toBeTruthy();
        expect(screen.getByTestId('player-seat-1')).toBeTruthy();
        expect(screen.getByTestId('player-seat-2')).toBeTruthy();
      });

      // Player names should still be visible
      expect(screen.getByText('Alice')).toBeTruthy();
      expect(screen.getByText('Bob')).toBeTruthy();
      expect(screen.getByText('Charlie')).toBeTruthy();
    });
  });
});
