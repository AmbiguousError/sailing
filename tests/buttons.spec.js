const { test, expect } = require('@playwright/test');

test.describe('Game Mode Buttons', () => {
  test('should start a single race when the "Single Race" button is clicked', async ({ page }) => {
    await page.goto('http://localhost:8000');

    // Wait for the start screen to be visible
    await expect(page.locator('#start-screen')).toBeVisible();

    // Click the "Single Race" button
    await page.locator('#single-race-btn').click();

    // Check that the start screen is hidden
    await expect(page.locator('#start-screen')).toBeHidden();

    // Check that the HUD is visible, indicating the game has started
    await expect(page.locator('#hud')).toBeVisible();
  });
});
