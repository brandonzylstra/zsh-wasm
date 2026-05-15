const { test, expect } = require('@playwright/test');

test('all zsh-wasm tests pass', async ({ page }) => {
    await page.goto('/test.html');
    await page.waitForSelector('[data-tests-complete]', { timeout: 120_000 });
    const failures = await page.locator('[data-test-status="fail"]').count();
    expect(failures, 'some tests failed — open test.html to see details').toBe(0);
});
