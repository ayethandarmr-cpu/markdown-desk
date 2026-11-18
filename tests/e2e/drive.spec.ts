import { test, expect } from '@playwright/test'
import { mockGoogle } from './google-mock'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
})

test('opens a Drive file, edits it and AutoSave writes it back', async ({ page }) => {
  const store = await mockGoogle(page, [{ id: 'f1', name: 'Notes.md', text: '# Notes\n\nfirst line\n', version: 3 }], { file: 'f1' })
  await page.reload()
  await page.getByTestId('tab-file').click()
  await page.getByTestId('open-drive').click()
  await expect(page.getByTestId('editor').locator('h1')).toHaveText('Notes')
  await expect(page.getByTestId('doc-title')).toContainText('Saved to Drive')
  await page.getByTestId('editor').locator('p').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' plus more')
  await expect.poll(() => store.get('f1')!.text, { timeout: 8000 }).toBe('# Notes\n\nfirst line plus more\n')
  await expect(page.getByTestId('doc-title')).toContainText('Saved to Drive')
})

test('saves a new document into Drive and lists it in recent files', async ({ page }) => {
  const store = await mockGoogle(page, [])
  await page.reload()
  await page.getByTestId('tab-file').click()
  await page.getByText('Blank document').click()
  await page.getByTestId('editor').click()
  await page.keyboard.type('Brand new')
  await page.waitForTimeout(400)
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('doc-title')).toContainText('Saved to Drive')
  const created = [...store.values()][0]
  expect(created.name).toBe('Untitled.md')
  expect(created.text).toBe('Brand new\n')
  await page.getByTestId('tab-file').click()
  await expect(page.getByRole('button', { name: /Untitled\.md/ })).toBeVisible()
})

test('warns about a conflict when Drive changed elsewhere', async ({ page }) => {
  const store = await mockGoogle(page, [{ id: 'f1', name: 'Shared.md', text: 'v1\n', version: 1 }], { file: 'f1' })
  await page.reload()
  await page.locator('.autosave').click()
  await expect(page.getByRole('switch')).not.toBeChecked()
  await page.getByTestId('tab-file').click()
  await page.getByTestId('open-drive').click()
  await expect(page.getByTestId('editor')).toContainText('v1')
  store.get('f1')!.version = 9
  await page.getByTestId('editor').click()
  await page.keyboard.type(' local')
  await page.waitForTimeout(400)
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('dialog', { name: 'File changed in Google Drive' })).toBeVisible()
  await page.getByRole('button', { name: 'Overwrite' }).click()
  await expect(page.getByTestId('doc-title')).toContainText('Saved to Drive')
  expect(store.get('f1')!.text).toContain('local')
})
