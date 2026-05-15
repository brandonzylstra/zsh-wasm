const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 120_000,
    use: {
        baseURL: 'http://localhost:8765',
    },
    webServer: {
        command: 'python3 -m http.server 8765 --directory web',
        url: 'http://localhost:8765',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
