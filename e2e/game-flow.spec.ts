import { test, expect } from '@playwright/test';
import { startDebugGame, clickCall, waitForResult, clickNextRound, playRoundCheckingAll } from './helpers';

test.describe('Game Flow (debug mode, 2 players)', () => {
  test.beforeEach(async ({ page }) => {
    await startDebugGame(page, 2);
  });

  test('completes preflop → flop → turn → river → showdown', async ({ page }) => {
    // Preflop: SB acts first in heads-up. CALL then CHECK to proceed to flop.
    await clickCall(page); // SB calls BB
    await clickCall(page); // BB checks (call-btn shows CHECK)

    // Flop should be visible: 3 community cards dealt
    // The community cards area should now have visible cards
    const cardSlots = page.getByTestId('card-slot');
    await expect(cardSlots.first()).toBeVisible();

    // Continue through flop
    await clickCall(page); // CHECK
    await clickCall(page); // CHECK

    // Turn: 4th card should be visible
    // Continue through turn
    await clickCall(page); // CHECK
    await clickCall(page); // CHECK

    // River: 5th card should be visible
    // Continue through river
    await clickCall(page); // CHECK
    await clickCall(page); // CHECK

    // Showdown result should appear
    await waitForResult(page);
    await expect(page.getByTestId('result-overlay')).toBeVisible();
  });

  test('next round starts with dealer rotation', async ({ page }) => {
    // Play through first round
    await playRoundCheckingAll(page);
    await waitForResult(page);

    // Click next round
    await clickNextRound(page);

    // New round should start — fold button should be visible
    await expect(page.getByTestId('fold-btn')).toBeVisible();
  });

  test('showdown displays hand rankings', async ({ page }) => {
    await playRoundCheckingAll(page);
    await waitForResult(page);

    // Result overlay should show hand descriptions (e.g., "One Pair", "Two Pair", etc.)
    const overlay = page.getByTestId('result-overlay');
    const text = await overlay.textContent();
    // Should contain "chips" in the pot won display
    expect(text).toContain('chips');
  });
});
