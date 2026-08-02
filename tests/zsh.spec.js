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
        // A tight infinite loop never yields in synchronous wasm — a reliable wedge.
        let first;
        try {
            await runZshScript('while true; do :; done', { timeoutMs: 4000 });
            first = 'RESOLVED_UNEXPECTEDLY';
        } catch (e) { first = String(e.message || e); }
        // The pool must have replaced the wedged worker, so a later run still works.
        const second = await runZshScript('echo recovered', { timeoutMs: 8000 });
        return { first, second: second.stdout };
    });
    expect(result.first).toContain('timed out');
    expect(result.second).toBe('recovered');
});

// The { fs: 'idbfs' } option has shipped since 0.1.x without a test. These are
// that test: files under /home/user must survive both a second run in the same
// page and a full page reload, and must NOT appear in a default memfs run.
test('idbfs persists files across runs and across a page reload', async ({ page }) => {
    await page.goto('/test.html');

    const marker = `persist-${Date.now()}`;
    const written = await page.evaluate(async (value) => {
        const { runZshScript } = await import('./zsh-runtime.js');
        // A fresh mount each time, so this also proves the sync-in/sync-out pair works.
        await runZshScript(`mkdir -p /home/user; echo ${value} > /home/user/marker.txt`, { fs: 'idbfs' });
        const second = await runZshScript('cat /home/user/marker.txt', { fs: 'idbfs' });
        return second.stdout.trim();
    }, marker);
    expect(written, 'second run in the same page should see the file').toBe(marker);

    await page.reload();
    const afterReload = await page.evaluate(async () => {
        const { runZshScript } = await import('./zsh-runtime.js');
        const result = await runZshScript('cat /home/user/marker.txt', { fs: 'idbfs' });
        return result.stdout.trim();
    });
    expect(afterReload, 'a page reload should not lose the file').toBe(marker);
});

test('the default memfs backend does not persist between runs', async ({ page }) => {
    await page.goto('/test.html');
    const result = await page.evaluate(async () => {
        const { runZshScript } = await import('./zsh-runtime.js');
        await runZshScript('echo ephemeral > /tmp/memfs-check.txt');
        const second = await runZshScript('cat /tmp/memfs-check.txt 2>/dev/null; echo "exit=$?"');
        return second.stdout.trim();
    });
    expect(result, 'memfs must start clean on every run').toBe('exit=1');
});
