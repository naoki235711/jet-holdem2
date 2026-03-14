import { Page, expect } from '@playwright/test';

/** Navigate to lobby and start a debug-mode game */
export async function startDebugGame(page: Page, playerCount: 2 | 3 | 4 = 2) {
  await page.goto('/');
  await page.getByTestId(`count-btn-${playerCount}`).click();
  await page.getByTestId('mode-btn-debug').click();
  await page.getByTestId('start-btn').click();
  // Wait for game screen to load
  await page.getByTestId('fold-btn').waitFor({ timeout: 15_000 });
}

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

/** Click an action button */
export async function clickFold(page: Page) {
  await page.getByTestId('fold-btn').click();
}

export async function clickCall(page: Page) {
  await page.getByTestId('call-btn').click();
}

export async function clickRaise(page: Page) {
  await page.getByTestId('raise-btn').click();
}

/** Dismiss the pass-device screen if visible */
export async function dismissPassScreen(page: Page) {
  const screen = page.getByTestId('pass-device-screen');
  if (await screen.isVisible()) {
    await screen.click();
    await screen.waitFor({ state: 'hidden', timeout: 3_000 });
  }
}

/** Get text content of the call button to determine check vs call */
export async function getCallButtonText(page: Page): Promise<string> {
  return (await page.getByTestId('call-btn').textContent()) ?? '';
}

/** Get text content of the raise button */
export async function getRaiseButtonText(page: Page): Promise<string> {
  return (await page.getByTestId('raise-btn').textContent()) ?? '';
}

/** Wait for the result overlay to appear */
export async function waitForResult(page: Page) {
  await page.getByTestId('result-overlay').waitFor({ timeout: 10_000 });
}

/** Click "次のラウンドへ" button in result overlay */
export async function clickNextRound(page: Page) {
  await page.getByTestId('next-round-btn').click();
  // Wait for result overlay to disappear and new round to start
  await page.getByTestId('fold-btn').waitFor({ timeout: 10_000 });
}

/** Play through a full round by calling/checking every action (debug mode) */
export async function playRoundCheckingAll(page: Page) {
  // Keep clicking call/check until result overlay appears
  for (let i = 0; i < 20; i++) {
    const resultVisible = await page.getByTestId('result-overlay').isVisible();
    if (resultVisible) return;

    const callBtn = page.getByTestId('call-btn');
    await callBtn.waitFor({ timeout: 5_000 });
    await callBtn.click();

    // Small wait for state transition
    await page.waitForTimeout(200);
  }
}

/** Get total chips across all player seats shown on screen */
export async function getTotalChipsOnScreen(page: Page, playerCount: number): Promise<number> {
  let total = 0;
  for (let seat = 0; seat < playerCount; seat++) {
    const seatEl = page.getByTestId(`player-seat-${seat}`);
    const text = await seatEl.textContent() ?? '';
    // Extract chip count — appears as a number in the seat element
    // The chip display format is like "Player 0 D\n6♥ T♥\n990\n10"
    // We need to find the main chip number (not the bet)
    const numbers = text.match(/[\d,]+/g) ?? [];
    // The chip count is typically the largest number
    const chipValues = numbers.map(n => parseInt(n.replace(/,/g, ''), 10)).filter(n => !isNaN(n));
    if (chipValues.length > 0) {
      total += Math.max(...chipValues);
    }
  }
  return total;
}
