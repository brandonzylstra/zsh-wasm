const { test, expect } = require('@playwright/test');

test('all zsh-wasm tests pass', async ({ page }) => {
    await page.goto('/test.html');
    await page.waitForSelector('[data-tests-complete]', { timeout: 120_000 });
    // data-known-fail rows are expected failures (e.g. pending rebuild); exclude them.
    const failures = await page.locator('tr:not([data-known-fail]) [data-test-status="fail"]').count();
    expect(failures, 'some tests failed — open test.html to see details').toBe(0);
});
