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

test('shows images from the folder next to the document and repairs loose bold', async ({ page }) => {
  // 1×1 red PNG
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
  const store = await mockGoogle(page, [
    { id: 'f1', name: 'Lesson.md', text: '# Lesson\n\n- **Backup and replication: **Virtual environments\n\n![Diagram](images/Diagram_001.png)\n', version: 1, parents: ['course'] },
    { id: 'imgdir', name: 'images', text: '', version: 1, parents: ['course'], mimeType: 'application/vnd.google-apps.folder' },
    { id: 'img1', name: 'Diagram_001.png', text: '', version: 1, parents: ['imgdir'], mimeType: 'image/png', base64: png },
  ], { file: 'f1' })
  await page.reload()
  await page.getByTestId('tab-file').click()
  await page.getByTestId('open-drive').click()
  const editor = page.getByTestId('editor')
  await expect(editor.locator('h1')).toHaveText('Lesson')
  await expect(editor.locator('strong')).toHaveText('Backup and replication:')
  const img = editor.locator('img[alt="Diagram"]')
  await expect(img).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1)
  // Saving keeps the original relative path, not the temporary blob URL.
  await editor.locator('h1').click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await expect.poll(() => store.get('f1')!.text, { timeout: 8000 }).toContain('Lesson!')
  expect(store.get('f1')!.text).toContain('](images/Diagram_001.png)')
  expect(store.get('f1')!.text).toContain('**Backup and replication:** Virtual')
})

test('Ctrl+click on a relative link opens the linked Drive file', async ({ page }) => {
  await mockGoogle(page, [
    { id: 'idx', name: 'README.md', text: '# Track 1\n\n- [Page 2: Next chapter](Fundamentals/02_Next.md)\n', version: 1, parents: ['course'] },
    { id: 'dir', name: 'Fundamentals', text: '', version: 1, parents: ['course'], mimeType: 'application/vnd.google-apps.folder' },
    { id: 'p2', name: '02_Next.md', text: '# Next chapter\n\nBody\n', version: 1, parents: ['dir'] },
  ], { file: 'idx' })
  await page.reload()
  await page.getByTestId('tab-file').click()
  await page.getByTestId('open-drive').click()
  const editor = page.getByTestId('editor')
  await expect(editor.locator('h1')).toHaveText('Track 1')
  // A plain click only places the cursor, like Word.
  await editor.getByRole('link', { name: /Page 2/ }).click()
  await expect(editor.locator('h1')).toHaveText('Track 1')
  await editor.getByRole('link', { name: /Page 2/ }).click({ modifiers: ['ControlOrMeta'] })
  await expect(editor.locator('h1')).toHaveText('Next chapter')
  await expect(page.getByTestId('doc-title')).toContainText('02_Next')
})

test('pins the document folder and opens a file from it later', async ({ page }) => {
  await mockGoogle(page, [
    { id: 'course', name: 'AI Basics', text: '', version: 1, mimeType: 'application/vnd.google-apps.folder' },
    { id: 'f1', name: '01_Intro.md', text: '# Intro\n', version: 1, parents: ['course'] },
  ], { file: 'f1' })
  await page.reload()
  await page.getByTestId('tab-file').click()
  await page.getByTestId('open-drive').click()
  await expect(page.getByTestId('editor').locator('h1')).toHaveText('Intro')
  await page.getByTestId('tab-file').click()
  await page.getByTestId('pin-current').click()
  await expect(page.getByTestId('pins')).toContainText('AI Basics')
  await expect(page.getByTestId('pin-current')).toHaveCount(0)
  // Pins survive a reload and open the Picker in that folder.
  await page.reload()
  await page.getByTestId('tab-file').click()
  await page.getByTestId('pins').getByRole('button', { name: 'AI Basics', exact: true }).click()
  await expect(page.getByTestId('editor').locator('h1')).toHaveText('Intro')
  await page.getByTestId('tab-file').click()
  await page.getByRole('button', { name: 'Unpin AI Basics' }).click()
  await expect(page.getByTestId('pins')).toHaveCount(0)
})
