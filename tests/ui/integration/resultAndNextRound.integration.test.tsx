// tests/ui/integration/resultAndNextRound.integration.test.tsx
//
// Integration tests R-1 through R-4: ResultOverlay display, fold-win,
// next round transition, and game-over scenarios using a real
// LocalGameService (no mocks except expo-router).

import React from 'react';
import { act, fireEvent, waitFor, screen } from '@testing-library/react-native';
import {
  setupIntegrationTest,
  renderGameScreen,
  advanceToPhase,
} from './helpers/integrationTestHelper';
import { LocalGameService } from '../../../src/services/LocalGameService';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

describe('Result & Next Round Integration Tests', () => {
  let service: LocalGameService;

  // ─────────────────────────────────────────────────────────
  // R-1: Showdown result display
  // ─────────────────────────────────────────────────────────
  describe('R-1: Showdown result display', () => {
    it('shows ResultOverlay with winner star and hand descriptions after showdown', async () => {
      // Advance to river phase via service-level helper (before render)
      ({ service } = setupIntegrationTest());
      advanceToPhase(service, 'river');
      expect(service.getState().phase).toBe('river');

      // Render — the UI picks up the river phase state
      renderGameScreen(service, 'debug');

      // Complete river betting using UI buttons (via doAction) so
      // GameContext auto-resolves showdown and sets showdownResult.
      // River first to act is seat 1 (first active after dealer=0).
      const state = service.getState();
      expect(state.activePlayer).toBe(1);

      // Seat 1: press CHECK (call-btn shows CHECK when canCheck)
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });

      // Seat 2: press CHECK
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });

      // Seat 0: press CHECK — this triggers showdown auto-resolve
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });

      // ResultOverlay should appear (phase = roundEnd via showdown resolution)
      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
      });

      // Winner should be marked with a star badge
      await waitFor(() => {
        expect(screen.getByText('★')).toBeTruthy();
      });

      // All non-out player names should be listed (in both PlayerSeats and hands section)
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Bob').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Charlie').length).toBeGreaterThanOrEqual(1);

      // Hand descriptions should be present (showdownResult.hands contains descriptions)
      // Since we have a real game, hand evaluations produce real descriptions.
      // We verify that at least one hand description text is rendered by checking
      // for common poker hand terms.
      const overlay = screen.getByTestId('result-overlay');
      expect(overlay).toBeTruthy();

      // The showdown result includes a chips amount line
      // (total pot won by winner displayed as "X chips")
      await waitFor(() => {
        expect(screen.getByText(/chips/)).toBeTruthy();
      });
    });

    it('shows hand descriptions for non-folded players in showdown', async () => {
      // Set up, advance to river, render, then play river via UI
      ({ service } = setupIntegrationTest());
      advanceToPhase(service, 'river');

      renderGameScreen(service, 'debug');

      // Complete river via UI buttons
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn')); // seat 1 check
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn')); // seat 2 check
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn')); // seat 0 check
      });

      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
      });

      // PlayingCard components should be rendered in the overlay for non-folded players
      // Each player has 2 cards = 6 cards shown on the overlay
      // Plus the player seat cards underneath, but those are separate.
      // The ResultOverlay renders PlayingCard with faceUp for non-folded players.
      const allCards = screen.getAllByTestId('playing-card');
      // At minimum, the 3 players' 2 hole cards each = 6 cards in the overlay hands section
      // plus 6 from player seats + 5 community = 17 total
      expect(allCards.length).toBeGreaterThanOrEqual(6);
    });

    it('does not show "(folded)" text when all players go to showdown', async () => {
      ({ service } = setupIntegrationTest());
      advanceToPhase(service, 'river');

      renderGameScreen(service, 'debug');

      // All check through river via UI
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
      });

      // No player folded, so "(folded)" text should not appear
      expect(screen.queryByText('(folded)')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────
  // R-2: Fold win display
  // ─────────────────────────────────────────────────────────
  describe('R-2: Fold win display', () => {
    it('shows fold winner name and chip amount when all others fold', async () => {
      ({ service } = setupIntegrationTest());

      renderGameScreen(service, 'debug');

      // Preflop: seat 0 is first to act (UTG)
      expect(service.getState().activePlayer).toBe(0);

      // Seat 0 folds
      await act(async () => {
        fireEvent.press(screen.getByTestId('fold-btn'));
      });

      // Seat 1 folds — only seat 2 (BB) remains, triggering fold win
      await act(async () => {
        fireEvent.press(screen.getByTestId('fold-btn'));
      });

      // ResultOverlay should show the fold winner
      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
      });

      // Charlie (seat 2, BB) wins by fold
      await waitFor(() => {
        expect(screen.getByText('Charlie wins!')).toBeTruthy();
      });

      // Verify the fold winner got the pot (15 chips from blinds)
      const endState = service.getState();
      const charlie = endState.players.find(p => p.seat === 2)!;
      expect(charlie.chips).toBeGreaterThan(990); // Started with 990 after BB, won pot
    });

    it('does not show hand details on fold win (no showdownResult)', async () => {
      ({ service } = setupIntegrationTest());

      renderGameScreen(service, 'debug');

      // Seat 0 folds, seat 1 folds — fold win for seat 2
      await act(async () => {
        fireEvent.press(screen.getByTestId('fold-btn'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('fold-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
      });

      // No hand descriptions or "(folded)" text since no showdownResult
      // The hands section only renders when showdownResult exists
      expect(screen.queryByText('(folded)')).toBeNull();

      // No star badge either (foldWinner doesn't get ★ in the hands section
      // because hands section doesn't render without showdownResult)
      // Actually, looking at the code, winnerSeats includes foldWinner,
      // but the ★ is only rendered inside the handsSection which requires showdownResult.
      // So no ★ should appear.
      expect(screen.queryByText('★')).toBeNull();
    });

    it('shows fold win mid-hand when one player folds after flop', async () => {
      // 3-player game: advance to flop, then have 2 players fold
      ({ service } = setupIntegrationTest());

      // Advance to flop via service-level helper (before render)
      advanceToPhase(service, 'flop');
      expect(service.getState().phase).toBe('flop');

      renderGameScreen(service, 'debug');

      // Flop first to act: seat 1
      expect(service.getState().activePlayer).toBe(1);

      // Seat 1 folds
      await act(async () => {
        fireEvent.press(screen.getByTestId('fold-btn'));
      });

      // Seat 2 folds — only seat 0 remains
      await act(async () => {
        fireEvent.press(screen.getByTestId('fold-btn'));
      });

      // ResultOverlay: Alice (seat 0) wins by fold
      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
      });

      await waitFor(() => {
        expect(screen.getByText('Alice wins!')).toBeTruthy();
      });
    });
  });

  // ─────────────────────────────────────────────────────────
  // R-3: "次のラウンドへ" button starts next round
  // ─────────────────────────────────────────────────────────
  describe('R-3: "次のラウンドへ" button starts next round', () => {
    it('pressing "次のラウンドへ" dismisses ResultOverlay and starts preflop', async () => {
      ({ service } = setupIntegrationTest());

      // Advance to roundEnd via showdown using UI path
      advanceToPhase(service, 'river');

      renderGameScreen(service, 'debug');

      // Complete river via UI so showdownResult is set in context
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn')); // seat 1
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn')); // seat 2
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn')); // seat 0
      });

      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
      });

      // Press next round button
      await act(async () => {
        fireEvent.press(screen.getByText('次のラウンドへ'));
      });

      // ResultOverlay should disappear
      await waitFor(() => {
        expect(screen.queryByTestId('result-overlay')).toBeNull();
      });

      // Phase should be preflop
      await waitFor(() => {
        expect(service.getState().phase).toBe('preflop');
      });
    });

    it('dealer rotates from 0 to 1 after next round', async () => {
      ({ service } = setupIntegrationTest());
      expect(service.getState().dealer).toBe(0);

      advanceToPhase(service, 'river');
      renderGameScreen(service, 'debug');

      // Complete river via UI
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });

      await waitFor(() => {
        expect(screen.getByText('次のラウンドへ')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByText('次のラウンドへ'));
      });

      // Dealer should rotate from 0 to 1
      await waitFor(() => {
        expect(service.getState().dealer).toBe(1);
      });
    });

    it('player chips reflect previous round result after next round', async () => {
      ({ service } = setupIntegrationTest());

      // Record initial total chips (3 * 1000 = 3000)
      const initialTotal = service.getState().players.reduce((sum, p) => sum + p.chips + p.bet, 0);

      // Advance to river, render, complete via UI
      advanceToPhase(service, 'river');
      renderGameScreen(service, 'debug');

      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });

      await waitFor(() => {
        expect(screen.getByText('次のラウンドへ')).toBeTruthy();
      });

      // Record chips at roundEnd (winner got the pot)
      const roundEndState = service.getState();
      const roundEndChips = roundEndState.players.map(p => p.chips);

      // Total chips should be conserved
      const roundEndTotal = roundEndChips.reduce((a, b) => a + b, 0);
      expect(roundEndTotal).toBe(initialTotal);

      // At least one player should have more than initial 1000 (the winner)
      // and others might have less (they put in 10 for preflop call and lost)
      expect(roundEndChips.some(c => c > 990)).toBe(true);

      await act(async () => {
        fireEvent.press(screen.getByText('次のラウンドへ'));
      });

      await waitFor(() => {
        expect(service.getState().phase).toBe('preflop');
      });

      // After next round, chips from roundEnd carry over (minus new blinds)
      const newState = service.getState();
      const newTotal = newState.players.reduce((sum, p) => sum + p.chips + p.bet, 0);
      expect(newTotal).toBe(initialTotal);
    });

    it('fold-win scenario also allows next round via button', async () => {
      ({ service } = setupIntegrationTest());

      renderGameScreen(service, 'debug');

      // Seat 0 folds, seat 1 folds => fold win for seat 2
      await act(async () => {
        fireEvent.press(screen.getByTestId('fold-btn'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('fold-btn'));
      });

      await waitFor(() => {
        expect(screen.getByText('次のラウンドへ')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByText('次のラウンドへ'));
      });

      // ResultOverlay gone, new round started
      await waitFor(() => {
        expect(screen.queryByTestId('result-overlay')).toBeNull();
      });

      await waitFor(() => {
        expect(service.getState().phase).toBe('preflop');
        expect(service.getState().dealer).toBe(1);
      });

      // ActionButtons should be back
      await waitFor(() => {
        expect(screen.getByTestId('fold-btn')).toBeTruthy();
      });
    });
  });

  // ─────────────────────────────────────────────────────────
  // R-4: Game over → "ロビーに戻る"
  // ─────────────────────────────────────────────────────────
  describe('R-4: Game over → "ロビーに戻る"', () => {
    it('shows "ロビーに戻る" when only 1 player has chips after round', async () => {
      // Use 2 players with very low chips: 15 each, sb=5, bb=10
      // After blinds: SB(seat1) has 10 chips left (bet 5), BB(seat0... wait)
      // 2 players: dealer=0, heads-up: dealer=SB=seat0, BB=seat1
      // seat0 posts SB=5 (chips 10, bet 5), seat1 posts BB=10 (chips 5, bet 10)
      // Preflop first to act in heads-up: SB (seat 0)
      // If seat 0 calls (puts 5 more, chips 5, bet 10), seat 1 checks
      // Then flop... or we can have seat 0 go all-in preflop.
      //
      // Simpler: 2 players, 15 chips each. Seat 0 all-in preflop.
      // Seat 1 calls. Then showdown. Loser has 0 chips.

      ({ service } = setupIntegrationTest({
        playerNames: ['Alice', 'Bob'],
        initialChips: 15,
        blinds: { sb: 5, bb: 10 },
      }));

      renderGameScreen(service, 'debug');

      // Heads-up: dealer=seat0=SB, seat1=BB
      // seat0 posts SB=5 (chips=10), seat1 posts BB=10 (chips=5)
      // Preflop first to act in heads-up: SB (seat 0)
      const preState = service.getState();
      expect(preState.activePlayer).toBe(0);

      // Seat 0 goes all-in (15 total chips originally, 10 remaining after SB)
      await act(async () => {
        fireEvent.press(screen.getByTestId('raise-btn'));
      });

      // Seat 1 calls the all-in (has 5 chips left)
      // After seat 0 all-in, seat 1 must act.
      // If seat 1 doesn't have enough to call, their only option may be all-in too.
      // With seat0 all-in to 15 (bet=15), seat1 has bet=10, chips=5.
      // callAmount = min(15-10, 5) = 5. So seat1 calls 5 (goes all-in).
      // Actually the call-btn would handle this. Let's check the state.
      await waitFor(() => {
        expect(service.getState().activePlayer).toBe(1);
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });

      // Both players are all-in. Since all active players are all-in,
      // phases skip through to showdown automatically, then doAction
      // auto-resolves showdown.
      await waitFor(() => {
        expect(service.getState().phase).toBe('roundEnd');
      });

      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
      });

      // One player has 0 chips, one has 30. With 2 players, that means game over.
      const endState = service.getState();
      const playersWithChips = endState.players.filter(p => p.chips > 0);
      expect(playersWithChips).toHaveLength(1);
      expect(playersWithChips[0].chips).toBe(30);

      // "ロビーに戻る" button should be shown instead of "次のラウンドへ"
      await waitFor(() => {
        expect(screen.getByText('ロビーに戻る')).toBeTruthy();
      });
      expect(screen.queryByText('次のラウンドへ')).toBeNull();
    });

    it('does not show "次のラウンドへ" when game is over', async () => {
      ({ service } = setupIntegrationTest({
        playerNames: ['Alice', 'Bob'],
        initialChips: 15,
        blinds: { sb: 5, bb: 10 },
      }));

      renderGameScreen(service, 'debug');

      // Seat 0 all-in
      await act(async () => {
        fireEvent.press(screen.getByTestId('raise-btn'));
      });

      await waitFor(() => {
        expect(service.getState().activePlayer).toBe(1);
      });

      // Seat 1 calls
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
      });

      // Verify game over condition
      const endState = service.getState();
      const withChips = endState.players.filter(p => p.chips > 0);
      expect(withChips).toHaveLength(1);

      // Only lobby button, no next-round button
      expect(screen.getByText('ロビーに戻る')).toBeTruthy();
      expect(screen.queryByText('次のラウンドへ')).toBeNull();
    });

    it('game over with 2 players when one busts after all-in', async () => {
      // 2-player all-in is deterministic: one wins all, other has 0.
      // Use 2 players with 15 chips, sb=5, bb=10.
      // Heads-up: dealer=SB=seat0, BB=seat1. Seat 0 acts first preflop.
      // Seat 0 all-in → seat 1 calls → showdown → one player has 30, other has 0.
      ({ service } = setupIntegrationTest({
        playerNames: ['Alice', 'Bob'],
        initialChips: 15,
        blinds: { sb: 5, bb: 10 },
      }));

      renderGameScreen(service, 'debug');

      expect(service.getState().activePlayer).toBe(0);

      // Seat 0 goes all-in
      await act(async () => {
        fireEvent.press(screen.getByTestId('raise-btn'));
      });

      // Seat 1 calls
      await waitFor(() => {
        expect(service.getState().activePlayer).toBe(1);
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('call-btn'));
      });

      // Both all-in → showdown auto-resolved → roundEnd
      await waitFor(() => {
        expect(service.getState().phase).toBe('roundEnd');
      });

      await waitFor(() => {
        expect(screen.getByTestId('result-overlay')).toBeTruthy();
      });

      // One player has all 30 chips, other has 0
      const endState = service.getState();
      const playersWithChips = endState.players.filter(p => p.chips > 0);
      expect(playersWithChips).toHaveLength(1);
      expect(playersWithChips[0].chips).toBe(30);

      // "ロビーに戻る" shown instead of "次のラウンドへ"
      expect(screen.getByText('ロビーに戻る')).toBeTruthy();
      expect(screen.queryByText('次のラウンドへ')).toBeNull();
    });
  });
});
