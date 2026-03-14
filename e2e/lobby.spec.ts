import { test, expect } from '@playwright/test';

test.describe('Lobby', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays title and default settings', async ({ page }) => {
    await expect(page.getByText('Jet Holdem')).toBeVisible();
    // Default: 3 players
    await expect(page.getByTestId('count-btn-3')).toBeVisible();
    await expect(page.getByTestId('start-btn')).toBeVisible();
  });

  test('switching player count changes name fields', async ({ page }) => {
    // Switch to 2 players
    await page.getByTestId('count-btn-2').click();
    await expect(page.locator('input[value="Player 0"]')).toBeVisible();
    await expect(page.locator('input[value="Player 1"]')).toBeVisible();
    // Player 2 should not exist
    await expect(page.locator('input[value="Player 2"]')).not.toBeVisible();

    // Switch to 4 players
    await page.getByTestId('count-btn-4').click();
    await expect(page.locator('input[value="Player 3"]')).toBeVisible();
  });

  test('debug mode navigates to game screen', async ({ page }) => {
    await page.getByTestId('count-btn-2').click();
    await page.getByTestId('mode-btn-debug').click();
    await page.getByTestId('start-btn').click();

    // Should navigate to game screen with action buttons
    await expect(page.getByTestId('fold-btn')).toBeVisible({ timeout: 15_000 });
    // URL should contain /game
    expect(page.url()).toContain('/game');
  });
});
