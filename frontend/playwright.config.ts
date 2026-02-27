import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 300_000,
    workers: 1,
    expect: { timeout: 10_000 },
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',
        trace: 'on-first-retry',
    },
    reporter: [['list']],
});
