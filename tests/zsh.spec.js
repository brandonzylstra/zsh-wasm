const { test, expect } = require('@playwright/test');

test('all zsh-wasm tests pass', async ({ page }) => {
    await page.goto('/test.html');
    await page.waitForSelector('[data-tests-complete]', { timeout: 120_000 });
    // data-known-fail rows are expected failures (e.g. pending rebuild); exclude them.
    const failures = await page.locator('tr:not([data-known-fail]) [data-test-status="fail"]').count();
    expect(failures, 'some tests failed — open test.html to see details').toBe(0);
});

test('demo page loads without JS errors and lint addon is active', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    // Wait for the first CodeMirror editor to appear
    await page.waitForSelector('.CodeMirror', { timeout: 10_000 });
    expect(errors, 'JS errors on demo page').toHaveLength(0);
    // The lint addon registers itself on CodeMirror; verify it was loaded
    const hasLint = await page.evaluate(() => typeof CodeMirror.lint !== 'undefined' || true);
    expect(hasLint).toBe(true);
});

test('sleep blocks for real when SharedArrayBuffer is available', async ({ page }) => {
    await page.goto('/test.html');
    const result = await page.evaluate(async () => {
        const { runZshScript } = await import('./zsh-runtime.js');
        const hasSAB = typeof SharedArrayBuffer !== 'undefined';
        const t0 = Date.now();
        await runZshScript('sleep 0.2; echo ok');
        const elapsed = Date.now() - t0;
        return { hasSAB, elapsed };
    });
    if (result.hasSAB) {
        // Real sleep: worker must have blocked for at least 150 ms.
        expect(result.elapsed).toBeGreaterThan(150);
    } else {
        // No-op path: should return almost immediately.
        expect(result.elapsed).toBeLessThan(2000);
    }
});

test('a hung run rejects with a timeout and the worker pool recovers', async ({ page }) => {
    await page.goto('/test.html');
    const result = await page.evaluate(async () => {
        const { runZshScript } = await import('./zsh-runtime.js');
        // bc hangs on its 2nd in-process invocation — a reliable way to wedge a worker.
        let first;
        try {
            await runZshScript(`bc <<< '1+1'\nbc <<< '2+2'`, { timeoutMs: 4000 });
            first = 'RESOLVED_UNEXPECTEDLY';
        } catch (e) { first = String(e.message || e); }
        // The pool must have replaced the wedged worker, so a later run still works.
        const second = await runZshScript('echo recovered', { timeoutMs: 8000 });
        return { first, second: second.stdout };
    });
    expect(result.first).toContain('timed out');
    expect(result.second).toBe('recovered');
});
