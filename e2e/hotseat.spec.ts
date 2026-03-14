import { test, expect } from '@playwright/test';
import { startHotseatGame } from './helpers';

test.describe('Hotseat Mode', () => {
  test('shows pass-device screen on turn change', async ({ page }) => {
    await startHotseatGame(page, 3);

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
});
