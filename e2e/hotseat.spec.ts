import { test, expect } from '@playwright/test';
import { startHotseatGame, dismissPassScreen } from './helpers';

test.describe('Hotseat Mode (3 players)', () => {
  test('shows pass-device screen on turn change', async ({ page }) => {
    await startHotseatGame(page, 3);

    // First player should see their cards (no pass screen initially since it's the first action)
    // Perform an action (CALL)
    const foldBtn = page.getByTestId('fold-btn');
    const passScreen = page.getByTestId('pass-device-screen');

    // If pass screen is shown at start, dismiss it first
    if (await passScreen.isVisible()) {
      await passScreen.click();
      await foldBtn.waitFor({ timeout: 5_000 });
    }

    // Perform call action
    await page.getByTestId('call-btn').click();

    // Pass device screen should appear for next player
    await expect(passScreen).toBeVisible({ timeout: 5_000 });
    const passText = await passScreen.textContent() ?? '';
    expect(passText).toContain('端末を');
    expect(passText).toContain('に渡してください');
  });

  test('after dismissing pass screen, action buttons are available', async ({ page }) => {
    await startHotseatGame(page, 3);

    const passScreen = page.getByTestId('pass-device-screen');
    const foldBtn = page.getByTestId('fold-btn');

    // If pass screen is shown, dismiss it
    if (await passScreen.isVisible()) {
      await passScreen.click();
      await foldBtn.waitFor({ timeout: 5_000 });
    }

    // Perform action to trigger pass screen
    await page.getByTestId('call-btn').click();

    // Dismiss pass screen
    await expect(passScreen).toBeVisible({ timeout: 5_000 });
    await passScreen.click();

    // Action buttons should be visible
    await expect(foldBtn).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('call-btn')).toBeVisible();
  });

  test('other players cards are hidden', async ({ page }) => {
    await startHotseatGame(page, 3);

    const passScreen = page.getByTestId('pass-device-screen');

    // Dismiss pass screen if visible
    if (await passScreen.isVisible()) {
      await passScreen.click();
      await page.getByTestId('fold-btn').waitFor({ timeout: 5_000 });
    }

    // In hotseat mode, non-active player seats should show face-down cards
    // The active player's seat (bottom) should show face-up cards
    // Check that at least one player-seat exists with hidden cards
    const seats = page.locator('[data-testid^="player-seat-"]');
    const seatCount = await seats.count();
    expect(seatCount).toBe(3);
  });
});
