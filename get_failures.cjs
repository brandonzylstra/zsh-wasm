const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8765/test.html');
  await page.waitForSelector('[data-tests-complete]', { timeout: 120000 });
  const rows = await page.evaluate(() => {
    return [...document.querySelectorAll('tr:not([data-known-fail])')].flatMap(tr => {
      const status = tr.querySelector('[data-test-status]');
      if (!status || status.getAttribute('data-test-status') !== 'fail') return [];
      const name = tr.querySelector('.test-name')?.textContent;
      const detail = tr.querySelector('pre.detail')?.textContent;
      return [{ name, detail }];
    });
  });
  console.log(JSON.stringify(rows, null, 2));
  await browser.close();
})();
