import { test, expect } from '@playwright/test';

test.describe('DDD Debugger GUI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the mock API to inject and the app to render
    await page.waitForSelector('.app-container', { timeout: 10000 });
  });

  test('should render the toolbar with all debug buttons', async ({ page }) => {
    // Verify toolbar exists
    const toolbar = page.locator('.toolbar');
    await expect(toolbar).toBeVisible();

    // Check all debug control buttons are present (Run/Continue combined into one)
    const buttons = toolbar.locator('.toolbar-btn');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(7);

    // Verify specific buttons
    await expect(page.locator('.toolbar-btn:has-text("Open")')).toBeVisible();
    await expect(page.locator('.toolbar-btn:has-text("Stop")')).toBeVisible();
    await expect(page.locator('.toolbar-btn:has-text("Run")')).toBeVisible();
    await expect(page.locator('.toolbar-btn:has-text("Pause")')).toBeVisible();
    await expect(page.locator('.toolbar-btn:has-text("Step Over")')).toBeVisible();
    await expect(page.locator('.toolbar-btn:has-text("Step Into")')).toBeVisible();
    await expect(page.locator('.toolbar-btn:has-text("Step Out")')).toBeVisible();
  });

  test('should show empty state before loading a program', async ({ page }) => {
    // Source viewer should show empty message
    const empty_message = page.locator('.empty-message');
    await expect(empty_message).toBeVisible();
    await expect(empty_message).toContainText('No source code loaded');
  });

  test('should load mock program when Open is clicked', async ({ page }) => {
    // Click the Open button (opens mock file dialog)
    const open_btn = page.locator('.toolbar-btn:has-text("Open")');
    await open_btn.click();

    // After mock API returns, source code should appear
    // The mock open_file_dialog returns 'demo_program', then start returns true,
    // then get_source_file_path returns 'demo.c', then get_source returns demo code
    await page.waitForTimeout(500);

    // Check that source viewer no longer shows empty message
    const empty_message = page.locator('.empty-message');
    await expect(empty_message).toHaveCount(0);

    // Source viewer should now show code
    const source_viewer = page.locator('.source-viewer');
    await expect(source_viewer).toBeVisible();

    // Status bar should show program loaded
    const status_bar = page.locator('.status-bar');
    await expect(status_bar).toContainText('Program loaded');
  });

  test('should run program and stop at breakpoint', async ({ page }) => {
    // Load program first
    await page.locator('.toolbar-btn:has-text("Open")').click();
    await page.waitForTimeout(500);

    // Click Run
    const run_btn = page.locator('.toolbar-btn:has-text("Run")');
    await expect(run_btn).toBeEnabled();
    await run_btn.click();

    // Wait for the mock to simulate hitting a breakpoint (500ms delay in mock)
    await page.waitForTimeout(800);

    // Status should show stopped at breakpoint
    const status_bar = page.locator('.status-bar');
    await expect(status_bar).toContainText('stopped');

    // Pause button should now be disabled (not running)
    const pause_btn = page.locator('.toolbar-btn:has-text("Pause")');
    await expect(pause_btn).toBeDisabled();

    // Continue and Step buttons should be enabled
    const continue_btn = page.locator('.toolbar-btn:has-text("Continue")');
    await expect(continue_btn).toBeEnabled();
    const step_over_btn = page.locator('.toolbar-btn:has-text("Step Over")');
    await expect(step_over_btn).toBeEnabled();
  });

  test('should show variables and stack frames after stopping', async ({ page }) => {
    // Load and run
    await page.locator('.toolbar-btn:has-text("Open")').click();
    await page.waitForTimeout(300);
    await page.locator('.toolbar-btn:has-text("Run")').click();
    await page.waitForTimeout(800);

    // Switch to Variables tab if not already active
    const variables_tab = page.locator('.tab-btn:has-text("Variables")');
    await variables_tab.click();

    // Check variables table has rows
    const var_table = page.locator('.var-table');
    await expect(var_table).toBeVisible();

    // Check for specific mock variables
    await expect(page.locator('.var-name:has-text("x")')).toBeVisible();
    await expect(page.locator('.var-name:has-text("argc")')).toBeVisible();
    await expect(page.locator('.var-name:has-text("result")')).toBeVisible();

    // Check call stack section
    const stack_section = page.locator('.section-header:has-text("Call Stack")');
    await expect(stack_section).toBeVisible();

    // Expand stack if collapsed
    const arrow = stack_section.locator('.arrow');
    const is_expanded = await arrow.evaluate(el =>
      el.classList.contains('expanded')
    );
    if (!is_expanded) {
      await stack_section.click();
    }

    // Check stack frames
    await expect(page.locator('.stack-frame')).toHaveCount(2);
    // main appears in both "main" and "__libc_start_main" - use exact match
    await expect(page.getByText('main', { exact: true })).toBeVisible();
  });

  test('should show breakpoints in the breakpoint manager after running', async ({ page }) => {
    // Load program and run to trigger breakpoint refresh
    await page.locator('.toolbar-btn:has-text("Open")').click();
    await page.waitForTimeout(300);
    await page.locator('.toolbar-btn:has-text("Run")').click();
    await page.waitForTimeout(800);

    // Switch to Breakpoints tab
    const bp_tab = page.locator('.tab-btn:has-text("Breakpoints")');
    await bp_tab.click();

    // Should show demo breakpoints (refreshed after stop)
    const bp_table = page.locator('.bp-table');
    await expect(bp_table).toBeVisible();

    // Mock adds breakpoints at lines 9 and 14
    const rows = bp_table.locator('tbody tr');
    const row_count = await rows.count();
    expect(row_count).toBeGreaterThanOrEqual(1);
  });

  test('should step over and update state', async ({ page }) => {
    // Load and run to breakpoint
    await page.locator('.toolbar-btn:has-text("Open")').click();
    await page.waitForTimeout(300);
    await page.locator('.toolbar-btn:has-text("Run")').click();
    await page.waitForTimeout(800);

    // Click Step Over
    const step_over_btn = page.locator('.toolbar-btn:has-text("Step Over")');
    await step_over_btn.click();

    // Wait for mock step (200ms delay)
    await page.waitForTimeout(500);

    // Status should show stopped again after step
    const status_bar = page.locator('.status-bar');
    await expect(status_bar).toContainText('stopped');
  });

  test('should switch tabs and show memory viewer', async ({ page }) => {
    // Load program
    await page.locator('.toolbar-btn:has-text("Open")').click();
    await page.waitForTimeout(300);

    // Switch to Memory tab
    const memory_tab = page.locator('.tab-btn:has-text("Memory")');
    await memory_tab.click();

    // Memory viewer should be visible
    const memory_viewer = page.locator('.memory-viewer');
    await expect(memory_viewer).toBeVisible();

    // Address input should exist
    const addr_input = page.locator('.addr-input');
    await expect(addr_input).toBeVisible();

    // Enter an address and click Read
    await addr_input.fill('0x400000');
    const read_btn = page.locator('.read-btn:has-text("Read")');
    await read_btn.click();

    // Output should appear with mock memory data
    await page.waitForTimeout(300);
    const output = page.locator('.memory-output');
    await expect(output).not.toBeEmpty();
  });

  test('should stop debugging and return to idle state', async ({ page }) => {
    // Load program
    await page.locator('.toolbar-btn:has-text("Open")').click();
    await page.waitForTimeout(300);

    // Click Stop
    const stop_btn = page.locator('.toolbar-btn:has-text("Stop")');
    await stop_btn.click();

    // Should show empty state again
    const empty_message = page.locator('.empty-message');
    await expect(empty_message).toBeVisible();

    // Run button should be disabled (no program loaded)
    const run_btn = page.locator('.toolbar-btn:has-text("Run")');
    await expect(run_btn).toBeDisabled();
  });

  test('should show status bar with correct initial state', async ({ page }) => {
    const status_bar = page.locator('.status-bar');
    await expect(status_bar).toBeVisible();
    await expect(status_bar).toContainText('Open a program');

    // Status indicator should have the idle state class
    const indicator = page.locator('.status-indicator');
    await expect(indicator).toHaveClass(/idle/);
  });
});
