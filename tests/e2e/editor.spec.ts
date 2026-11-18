import {expect,test} from '@playwright/test'
import {readFile} from 'node:fs/promises'
test('create, edit, preview, keyboard save, download, and restore',async ({page}) => {
  const source = '# မြန်မာ\n\nDocumentation'
  await page.goto('/')
  const editor = page.getByRole('textbox',{name:'Markdown source'})
  await editor.fill(source)
  await expect(page.getByRole('heading',{name:'မြန်မာ'})).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Saved locally')
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('dialog')).toBeVisible()
  const result = page.waitForEvent('download')
  await page.getByRole('button',{name:'Download Markdown'}).click()
  const download = await result
  expect(download.suggestedFilename()).toBe('Untitled.md')
  expect(await readFile((await download.path())!,'utf8')).toBe(source)
  await page.reload()
  await expect(page.getByRole('heading',{name:'မြန်မာ'})).toBeVisible()
  await page.getByRole('button',{name:'New document'}).click()
  await expect(page.getByText('Your Markdown preview will appear here.')).toBeVisible()
})
test('import retains bytes; malformed preview makes no image requests',async ({page}) => {
  const source = '\ufeff# Myanmar\r\n\r\nမင်္ဂလာပါ\n\n<img src=x onerror=alert(1)>\n\n![blocked](https://example.org/a.png)\r'
  let imageRequests = 0
  page.on('request',request => {if (request.url().includes('example.org')) imageRequests++})
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({name:'Training.markdown',mimeType:'text/markdown',buffer:Buffer.from(source)})
  await expect(page.getByRole('heading',{name:'Training.markdown'})).toBeVisible()
  await expect(page.getByLabel('Rendered preview').locator('img')).toHaveCount(0)
  const result = page.waitForEvent('download')
  await page.getByRole('button',{name:'Download',exact:true}).click()
  expect(await readFile((await (await result).path())!,'utf8')).toBe(source)
  expect(imageRequests).toBe(0)
})
test('editing still works when IndexedDB is denied and Drive is unavailable',async ({page,context}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('Denied','SecurityError')}})
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText('Local recovery unavailable')
  await context.setOffline(true)
  await page.getByRole('textbox',{name:'Markdown source'}).fill('# Offline work')
  await expect(page.getByRole('heading',{name:'Offline work'})).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Offline')
})
test('concurrent tab cannot overwrite the recovery workspace',async ({page,context}) => {
  await page.goto('/')
  await page.getByRole('textbox',{name:'Markdown source'}).fill('# Tab one')
  await expect(page.getByRole('status')).toContainText('Saved locally')
  const second = await context.newPage()
  await second.goto('/')
  await expect(second.getByRole('alert')).toContainText('active in another tab')
  await second.getByRole('textbox',{name:'Markdown source'}).fill('# Tab two')
  await expect(second.getByRole('heading',{name:'Tab two'})).toBeVisible()
  await second.close()
  await page.reload()
  await expect(page.getByRole('heading',{name:'Tab one'})).toBeVisible()
})
