import { test, expect } from '@playwright/test';

test.describe('Watchpoint', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-container', { timeout: 10000 });
    // Load mock program to enable watchpoint functionality
    await page.locator('.toolbar-btn:has-text("Open")').click();
    await page.waitForTimeout(500);
  });

  test('Watch tab is visible in the side panel', async ({ page }) => {
    const watch_tab = page.locator('.tab-btn:has-text("Watch")');
    await expect(watch_tab).toBeVisible();
  });

  test('switching to Watch tab shows watchpoint input', async ({ page }) => {
    await page.locator('.tab-btn:has-text("Watch")').click();
    await page.waitForTimeout(200);

    const input = page.locator('.watchpoint-input');
    await expect(input).toBeVisible();

    const add_btn = page.locator('.watchpoint-add-btn');
    await expect(add_btn).toBeVisible();
  });

  test('Watch button is disabled when input is empty', async ({ page }) => {
    await page.locator('.tab-btn:has-text("Watch")').click();
    await page.waitForTimeout(200);

    const add_btn = page.locator('.watchpoint-add-btn');
    await expect(add_btn).toBeDisabled();
  });

  test('Watch button is enabled when expression is entered', async ({ page }) => {
    await page.locator('.tab-btn:has-text("Watch")').click();
    await page.waitForTimeout(200);

    const input = page.locator('.watchpoint-input');
    await input.fill('x');

    const add_btn = page.locator('.watchpoint-add-btn');
    await expect(add_btn).toBeEnabled();
  });

  test('adding a watchpoint shows it in the list', async ({ page }) => {
    await page.locator('.tab-btn:has-text("Watch")').click();
    await page.waitForTimeout(200);

    // Mock initially has a demo watchpoint "x" shown
    const rows = page.locator('.bp-table tbody tr');
    const initial_count = await rows.count();
    expect(initial_count).toBeGreaterThanOrEqual(1);

    // Add a new watchpoint
    const input = page.locator('.watchpoint-input');
    await input.fill('z');
    await page.locator('.watchpoint-add-btn').click();
    await page.waitForTimeout(300);

    // Should now have at least 2 watchpoints
    const new_count = await rows.count();
    expect(new_count).toBeGreaterThanOrEqual(2);

    // The new watchpoint expression should appear
    await expect(page.locator('.bp-file:has-text("z")')).toBeVisible();
  });

  test('removing a watchpoint removes it from the list', async ({ page }) => {
    await page.locator('.tab-btn:has-text("Watch")').click();
    await page.waitForTimeout(200);

    const rows = page.locator('.bp-table tbody tr');
    const initial_count = await rows.count();

    if (initial_count > 0) {
      // Click the first remove button
      const remove_btn = page.locator('.bp-remove-btn').first();
      await remove_btn.click();
      await page.waitForTimeout(300);

      const new_count = await rows.count();
      expect(new_count).toBeLessThan(initial_count);
    }
  });

  test('pressing Enter in input adds a watchpoint', async ({ page }) => {
    await page.locator('.tab-btn:has-text("Watch")').click();
    await page.waitForTimeout(200);

    const rows = page.locator('.bp-table tbody tr');
    const initial_count = await rows.count();

    const input = page.locator('.watchpoint-input');
    await input.fill('counter');
    await input.press('Enter');
    await page.waitForTimeout(300);

    const new_count = await rows.count();
    expect(new_count).toBeGreaterThan(initial_count);
  });

  test('empty hint is shown when no watchpoints after removing all', async ({ page }) => {
    await page.locator('.tab-btn:has-text("Watch")').click();
    await page.waitForTimeout(200);

    // Remove all existing watchpoints
    const remove_btns = page.locator('.bp-remove-btn');
    const count = await remove_btns.count();
    for (let i = 0; i < count; i++) {
      await remove_btns.first().click();
      await page.waitForTimeout(200);
    }

    // Empty message should appear
    const empty = page.locator('.empty-panel');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('No watchpoints');
  });
});
