// Google Identity Services (token model) + Google Picker, loaded on demand.
export const config = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '',
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY?.trim() || '',
  projectNumber: import.meta.env.VITE_GOOGLE_PROJECT_NUMBER?.trim() || '',
}
export const driveConfigured =
  /\.apps\.googleusercontent\.com$/.test(config.clientId) && !!config.apiKey && /^\d+$/.test(config.projectNumber)

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export interface Token { token: string; expires: number }

interface TokenReply { access_token?: string; expires_in?: number; scope?: string; error?: string }
interface PickerView {
  setMode(mode: string): PickerView
  setIncludeFolders(v: boolean): PickerView
  setSelectFolderEnabled(v: boolean): PickerView
  setMimeTypes(v: string): PickerView
  setParent?(id: string): PickerView
}
interface PickerBuilderT {
  addView(v: unknown): PickerBuilderT
  setOAuthToken(t: string): PickerBuilderT
  setDeveloperKey(k: string): PickerBuilderT
  setAppId(id: string): PickerBuilderT
  setOrigin(o: string): PickerBuilderT
  setTitle(t: string): PickerBuilderT
  setCallback(cb: (r: { action: string; docs?: { id: string; name?: string }[] }) => void): PickerBuilderT
  build(): { setVisible(v: boolean): void }
}
interface GoogleNS {
  accounts: { oauth2: { initTokenClient(o: {
    client_id: string; scope: string; include_granted_scopes: boolean
    callback: (r: TokenReply) => void; error_callback: (e: { type: string }) => void
  }): { requestAccessToken(o: { prompt: string }): void } } }
  picker: {
    DocsView: new (viewId?: string) => PickerView
    DocsViewMode: { LIST: string; GRID: string }
    ViewId: { DOCS: string; FOLDERS: string }
    PickerBuilder: new () => PickerBuilderT
  }
}
type GapiT = { load(name: string, o: { callback: () => void; onerror: () => void; ontimeout: () => void; timeout: number }): void }
const g = window as Window & { google?: GoogleNS; gapi?: GapiT }

const loading = new Map<string, Promise<void>>()
function loadScript(src: string) {
  const existing = loading.get(src)
  if (existing) return existing
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    const fail = () => { clearTimeout(t); el.remove(); reject(new Error('Google services could not load. Check your connection and try again.')) }
    const t = setTimeout(fail, 15000)
    el.onload = () => { clearTimeout(t); resolve() }
    el.onerror = fail
    el.async = true
    el.src = src
    document.head.append(el)
  }).catch(err => { loading.delete(src); throw err })
  loading.set(src, p)
  return p
}

export const preloadIdentity = () => loadScript('https://accounts.google.com/gsi/client')

export async function requestToken(prompt: '' | 'select_account' | 'consent' = 'select_account'): Promise<Token> {
  await preloadIdentity()
  const oauth = g.google?.accounts?.oauth2
  if (!oauth) throw new Error('Google sign-in is still loading. Try again.')
  return new Promise((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: config.clientId,
      scope: DRIVE_SCOPE,
      include_granted_scopes: false,
      callback: r => {
        if (!r.access_token || !r.scope?.split(' ').includes(DRIVE_SCOPE)) {
          reject(new Error('Google Drive permission was declined.'))
          return
        }
        resolve({ token: r.access_token, expires: Date.now() + Number(r.expires_in || 3600) * 1000 - 60_000 })
      },
      error_callback: e => reject(new Error(e.type === 'popup_failed_to_open'
        ? 'The sign-in popup was blocked. Allow popups for this site and try again.'
        : 'The sign-in window was closed.')),
    })
    client.requestAccessToken({ prompt })
  })
}

export type PickMode = 'file' | 'folder'
export interface Picked { id: string; name?: string }

export async function openPicker(token: Token, mode: PickMode): Promise<Picked | undefined> {
  await loadScript('https://apis.google.com/js/api.js')
  await new Promise<void>((resolve, reject) => {
    const fail = () => reject(new Error('Google Picker could not load. Check the API key and that the Picker API is enabled.'))
    if (!g.gapi) return fail()
    g.gapi.load('picker', { callback: resolve, onerror: fail, ontimeout: fail, timeout: 12000 })
  })
  const api = g.google!.picker
  const view = mode === 'folder'
    ? new api.DocsView(api.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder')
    : new api.DocsView(api.ViewId.DOCS).setMode(api.DocsViewMode.LIST).setIncludeFolders(true).setSelectFolderEnabled(false)
  return new Promise(resolve => {
    new api.PickerBuilder()
      .addView(view)
      .setTitle(mode === 'folder' ? 'Choose a folder to save in' : 'Open a Markdown file')
      .setAppId(config.projectNumber)
      .setDeveloperKey(config.apiKey)
      .setOAuthToken(token.token)
      .setOrigin(location.origin)
      .setCallback(r => {
        if (r.action === 'picked') resolve(r.docs?.[0] ? { id: r.docs[0].id, name: r.docs[0].name } : undefined)
        else if (r.action === 'cancel') resolve(undefined)
      })
      .build()
      .setVisible(true)
  })
}
