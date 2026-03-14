import { test, expect } from '@playwright/test';
import { startDebugGame, clickFold, clickCall, clickRaise, waitForResult, getCallButtonText, getRaiseButtonText } from './helpers';

test.describe('Player Actions (debug mode, 2 players)', () => {
  test.beforeEach(async ({ page }) => {
    await startDebugGame(page, 2);
  });

  test('FOLD ends round immediately, opponent wins', async ({ page }) => {
    await clickFold(page);

    // Result overlay should appear with winner
    await waitForResult(page);
    const overlayText = await page.getByTestId('result-overlay').textContent();
    expect(overlayText).toContain('wins!');
  });

  test('CALL in preflop advances to flop', async ({ page }) => {
    // SB calls BB
    await clickCall(page);
    // BB should now have CHECK option
    const callText = await getCallButtonText(page);
    expect(callText).toBe('CHECK');
  });

  test('RAISE increases bet and gives opponent CALL option', async ({ page }) => {
    // SB raises (default minimum raise)
    await clickRaise(page);

    // BB should now see CALL option with increased amount
    const callText = await getCallButtonText(page);
    expect(callText).toMatch(/CALL \d+/);
  });

  test('ALL-IN via max raise slider', async ({ page }) => {
    // Drag slider to maximum by filling its value via JavaScript
    const slider = page.getByTestId('raise-slider');
    const box = await slider.boundingBox();
    if (box) {
      // Click near the right end of the slider to set max value
      await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
    }
    await page.waitForTimeout(300);

    // Raise button should show ALL IN
    const raiseText = await getRaiseButtonText(page);
    expect(raiseText).toMatch(/ALL IN/);

    // Click the ALL IN button
    await clickRaise(page);

    // Opponent should see CALL or FOLD options
    const callText = await getCallButtonText(page);
    expect(callText).toMatch(/CALL \d+/);
  });

  test('chip total is preserved across round', async ({ page }) => {
    // Fold to end round quickly
    await clickFold(page);
    await waitForResult(page);

    // Click next round
    await page.getByTestId('next-round-btn').click();
    await page.getByTestId('fold-btn').waitFor({ timeout: 10_000 });

    // Sum chip stacks + bet amounts using dedicated testIDs
    const chips = await page.evaluate(() => {
      let total = 0;
      document.querySelectorAll('[data-testid^="chip-stack-"], [data-testid^="bet-amount-"]').forEach(el => {
        const num = parseInt((el.textContent ?? '').replace(/,/g, ''), 10);
        if (!isNaN(num)) total += num;
      });
      return total;
    });

    expect(chips).toBe(2000);
  });
});
