import { test, expect } from '@playwright/test';

test.describe('Data Structure Visualization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-container', { timeout: 10000 });
    // Load mock program to enable the Viz tab
    await page.locator('.toolbar-btn:has-text("Open")').click();
    await page.waitForTimeout(500);
  });

  test('Viz tab is visible in the side panel', async ({ page }) => {
    const viz_tab = page.locator('.tab-btn:has-text("Viz")');
    await expect(viz_tab).toBeVisible();
  });

  test('Visualize button is disabled without an expression', async ({ page }) => {
    await page.locator('.tab-btn:has-text("Viz")').click();
    await page.waitForTimeout(200);

    const btn = page.locator('.graph-viz-btn');
    await expect(btn).toBeDisabled();
  });

  test('entering an expression renders graph nodes', async ({ page }) => {
    await page.locator('.tab-btn:has-text("Viz")').click();
    await page.waitForTimeout(200);

    const input = page.locator('.graph-expr-input');
    await input.fill('root');
    await page.locator('.graph-viz-btn').click();
    await page.waitForTimeout(300);

    // Mock graph has 5 nodes — check node rects exist
    const node_rects = page.locator('.graph-viewer svg g rect');
    await expect(node_rects.first()).toBeVisible();
    const count = await node_rects.count();
    expect(count).toBeGreaterThanOrEqual(5);

    // Empty state should be gone
    const empty = page.locator('.graph-empty');
    await expect(empty).toHaveCount(0);
  });

  test('hovering a node shows tooltip with fields', async ({ page }) => {
    await page.locator('.tab-btn:has-text("Viz")').click();
    await page.waitForTimeout(200);

    const input = page.locator('.graph-expr-input');
    await input.fill('root');
    await page.locator('.graph-viz-btn').click();
    await page.waitForTimeout(300);

    // Hover over the root node (first rect in the SVG)
    const first_node = page.locator('.graph-viewer svg g rect').first();
    await first_node.hover();
    await page.waitForTimeout(200);

    const tooltip = page.locator('.graph-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('value');
    await expect(tooltip).toContainText('left');
    await expect(tooltip).toContainText('right');
  });

  test('NULL pointer fields are marked in the tooltip', async ({ page }) => {
    await page.locator('.tab-btn:has-text("Viz")').click();
    await page.waitForTimeout(200);

    const input = page.locator('.graph-expr-input');
    await input.fill('root');
    await page.locator('.graph-viz-btn').click();
    await page.waitForTimeout(300);

    // Hover the node whose right child is NULL (n1, second in tree order)
    const nodes = page.locator('.graph-viewer svg g rect');
    const count = await nodes.count();
    expect(count).toBeGreaterThanOrEqual(2);
    await nodes.nth(1).hover();
    await page.waitForTimeout(200);

    const tooltip = page.locator('.graph-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('NULL');
  });

  test('graph clears after stopping the debug session', async ({ page }) => {
    await page.locator('.tab-btn:has-text("Viz")').click();
    await page.waitForTimeout(200);

    const input = page.locator('.graph-expr-input');
    await input.fill('root');
    await page.locator('.graph-viz-btn').click();
    await page.waitForTimeout(300);

    // Stop the session
    await page.locator('.toolbar-btn:has-text("Stop")').click();
    await page.waitForTimeout(300);

    // Graph should be cleared (empty state back)
    const empty = page.locator('.graph-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('No graph data');
  });
});
