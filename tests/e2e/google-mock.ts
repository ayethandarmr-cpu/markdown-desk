import type { Page } from '@playwright/test'

export interface MockFile { id: string; name: string; text: string; version: number; parents?: string[] }

/** Replaces Google Identity, Picker and Drive REST with an in-memory fake. */
export async function mockGoogle(page: Page, files: MockFile[], pick: { file?: string; folder?: string } = {}) {
  const store = new Map(files.map(f => [f.id, { ...f }]))
  let next = 1
  const meta = (f: MockFile) => ({
    id: f.id, name: f.name, mimeType: 'text/markdown', version: String(f.version), modifiedTime: new Date().toISOString(),
    parents: f.parents ?? ['root'], webViewLink: `https://drive.google.com/file/d/${f.id}/view`, capabilities: { canEdit: true, canRename: true },
  })
  await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = window.google || {};
    google.accounts = { oauth2: { initTokenClient: o => ({ requestAccessToken: () => setTimeout(() => o.callback({ access_token: 'tok', expires_in: 3600, scope: o.scope }), 10) }) } };
  ` }))
  await page.route('https://apis.google.com/js/api.js', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.gapi = { load: (n, o) => setTimeout(o.callback, 5) };
    window.google = window.google || {};
    class View { constructor(id) { this.id = id } setMode() { return this } setIncludeFolders() { return this } setSelectFolderEnabled() { return this } setMimeTypes() { return this } }
    class Builder { addView(v) { this.v = v; return this } setOAuthToken() { return this } setDeveloperKey() { return this } setAppId() { return this } setOrigin() { return this } setTitle() { return this }
      setCallback(cb) { this.cb = cb; return this }
      build() { const s = this; return { setVisible() { const id = s.v.id === 'folders' ? ${JSON.stringify(pick.folder ?? null)} : ${JSON.stringify(pick.file ?? null)}; setTimeout(() => s.cb(id ? { action: 'picked', docs: [{ id }] } : { action: 'cancel' }), 10) } } } }
    google.picker = { DocsView: View, DocsViewMode: { LIST: 'list' }, ViewId: { DOCS: 'docs', FOLDERS: 'folders' }, PickerBuilder: Builder };
  ` }))
  await page.route('https://www.googleapis.com/**', async r => {
    const req = r.request()
    const url = new URL(req.url())
    const json = (body: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/drive/v3/about') return json({ user: { displayName: 'Test User', emailAddress: 'test@example.com', permissionId: 'p1' } })
    if (url.pathname === '/drive/v3/files' && req.method() === 'GET') return json({ files: [...store.values()].map(meta) })
    if (url.pathname === '/upload/drive/v3/files' && req.method() === 'POST') {
      const body = req.postData() || ''
      const parts = body.split(/--md-desk-[^\r\n]+/)
      const m = JSON.parse(parts[1].split('\r\n\r\n')[1])
      const text = parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '')
      const f = { id: `new${next++}`, name: m.name, text, version: 1, parents: m.parents }
      store.set(f.id, f)
      return json(meta(f))
    }
    const up = url.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/)
    if (up && req.method() === 'PATCH') {
      const f = store.get(decodeURIComponent(up[1]))!
      f.text = req.postData() || ''
      f.version++
      return json(meta(f))
    }
    const one = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/)
    if (one) {
      const f = store.get(decodeURIComponent(one[1]))
      if (!f) return json({ error: 'not found' }, 404)
      if (req.method() === 'PATCH') { Object.assign(f, JSON.parse(req.postData() || '{}')); f.version++; return json(meta(f)) }
      if (url.searchParams.get('alt') === 'media') return r.fulfill({ status: 200, contentType: 'text/markdown', body: f.text })
      return json(meta(f))
    }
    return json({ error: 'unhandled ' + url.pathname }, 500)
  })
  return store
}
