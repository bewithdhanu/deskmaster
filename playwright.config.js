const { defineConfig } = require('@playwright/test')
const path = require('path')

module.exports = defineConfig({
  testDir: path.join(__dirname, 'tests/e2e'),
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  }
})
