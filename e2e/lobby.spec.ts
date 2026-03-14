import { test, expect } from '@playwright/test';

test.describe('Lobby', () => {
  test('debug mode navigates to game screen', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('count-btn-2').click();
    await page.getByTestId('mode-btn-debug').click();
    await page.getByTestId('start-btn').click();

    // Should navigate to game screen with action buttons
    await expect(page.getByTestId('fold-btn')).toBeVisible({ timeout: 15_000 });
    // URL should contain /game
    expect(page.url()).toContain('/game');
  });
});
