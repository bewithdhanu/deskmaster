const { test, expect, _electron: electron } = require('@playwright/test')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '../../')

test.describe('DeskMaster Agent', () => {
  let electronApp
  let page

  test.beforeAll(async () => {
    const userDataDir = path.join(PROJECT_ROOT, '.playwright-user-data', String(Date.now()))
    electronApp = await electron.launch({
      args: [
        path.join(PROJECT_ROOT, 'main.js'),
        `--user-data-dir=${userDataDir}`
      ],
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_ENABLE_LOGGING: '1'
      }
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.getTitle() === 'DeskMaster')
      if (win) {
        win.show()
        win.focus()
      }
    })
    await page.getByRole('button', { name: 'Home' }).waitFor({ state: 'visible', timeout: 30000 })
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
      await new Promise((r) => setTimeout(r, 1000))
    }
  })

  test('Agent tab loads and New Chat creates a session', async () => {
    const agentTab = page.getByRole('button', { name: 'Agent' })
    await expect(agentTab).toBeVisible({ timeout: 10000 })
    await agentTab.click()

    const newChatButton = page.getByRole('button', { name: /New Chat/i })
    await expect(newChatButton).toBeVisible({ timeout: 15000 })
    await newChatButton.click()

    await page.waitForTimeout(1500)

    const chatItems = page.locator('aside .overflow-y-auto button')
    await expect(chatItems.first()).toBeVisible({ timeout: 10000 })
    const count = await chatItems.count()
    expect(count).toBeGreaterThan(0)
  })

  test('capability toggles are visible on Agent tab', async () => {
    const agentTab = page.getByRole('button', { name: 'Agent' })
    await agentTab.click()

    await expect(page.getByRole('button', { name: /Knowledge Base/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /DeskMaster Tools/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Integrations/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Connect apps/i })).toBeVisible()
  })
})
