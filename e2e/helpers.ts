import { Page, expect } from '@playwright/test';

/** Navigate to lobby and start a hotseat-mode game */
export async function startHotseatGame(page: Page, playerCount: 2 | 3 | 4 = 3) {
  await page.goto('/');
  await page.getByTestId(`count-btn-${playerCount}`).click();
  await page.getByTestId('mode-btn-hotseat').click();
  await page.getByTestId('start-btn').click();
  // Wait for game screen — either pass-device or fold button
  await expect(
    page.getByTestId('fold-btn').or(page.getByTestId('pass-device-screen'))
  ).toBeVisible({ timeout: 15_000 });
}
