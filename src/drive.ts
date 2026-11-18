import type { Token } from './google'

const API = 'https://www.googleapis.com'
const FIELDS = 'id,name,mimeType,version,modifiedTime,parents,webViewLink,capabilities(canEdit,canRename)'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  version: string
  modifiedTime?: string
  parents?: string[]
  webViewLink?: string
  capabilities?: { canEdit?: boolean; canRename?: boolean }
}
export interface DriveUser { displayName: string; emailAddress: string; photoLink?: string; permissionId: string }

export class DriveError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export class ConflictError extends Error {
  constructor(public remote: DriveFile) { super('This file was changed in Google Drive after you opened it.') }
}

const messages: Record<number, string> = {
  401: 'Your Google sign-in expired. Sign in again to continue.',
  403: 'Google Drive denied access to this file. To edit it, open it once with File › Open from Google Drive.',
  404: 'The file was not found. It may have been deleted or moved to Trash.',
  429: 'Google Drive is busy. Try again in a moment.',
}

async function call(token: Token, path: string, init: RequestInit = {}): Promise<Response> {
  if (Date.now() >= token.expires) throw new DriveError(401, messages[401])
  const isRead = !init.method || init.method === 'GET'
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(API + path, { ...init, cache: 'no-store', headers: { ...init.headers, Authorization: `Bearer ${token.token}` } })
    } catch {
      if (!isRead || attempt >= 2) throw new DriveError(0, 'Could not reach Google Drive. Check your connection.')
      await sleep(400 * 2 ** attempt)
      continue
    }
    if (res.ok) return res
    if (isRead && attempt < 2 && [429, 500, 502, 503, 504].includes(res.status)) { await sleep(400 * 2 ** attempt); continue }
    throw new DriveError(res.status, messages[res.status] || `Google Drive request failed (HTTP ${res.status}).`)
  }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const filePath = (id: string) => `/drive/v3/files/${encodeURIComponent(id)}`

export const isMarkdownName = (name: string) => /\.(md|markdown|mdown|mkd|txt)$/i.test(name)
export const withMdExtension = (name: string) => {
  const clean = name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'Untitled'
  return isMarkdownName(clean) ? clean : `${clean}.md`
}

export async function whoAmI(token: Token): Promise<DriveUser> {
  const r = await call(token, '/drive/v3/about?fields=user(displayName,emailAddress,photoLink,permissionId)')
  const { user } = await r.json()
  if (!user?.permissionId) throw new Error('Google Drive did not identify the signed-in account.')
  return user
}

export async function getFile(token: Token, id: string): Promise<DriveFile> {
  const r = await call(token, `${filePath(id)}?supportsAllDrives=true&fields=${FIELDS}`)
  return r.json()
}

export function decodeText(buf: ArrayBuffer): string {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export async function readFile(token: Token, id: string): Promise<{ file: DriveFile; text: string }> {
  const file = await getFile(token, id)
  if (file.mimeType.startsWith('application/vnd.google-apps.')) {
    throw new Error('That is a Google Docs/Sheets file. Choose a .md file instead.')
  }
  const r = await call(token, `${filePath(id)}?alt=media&supportsAllDrives=true`)
  let text: string
  try { text = decodeText(await r.arrayBuffer()) } catch { throw new Error('This file is not UTF-8 text, so it cannot be opened as Markdown.') }
  return { file, text }
}

export async function listRecent(token: Token, limit = 25): Promise<DriveFile[]> {
  // With the drive.file scope this only lists files the app created or the user opened with it.
  const q = encodeURIComponent("trashed = false and mimeType != 'application/vnd.google-apps.folder'")
  const r = await call(token, `/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=${limit}&fields=files(${FIELDS})&supportsAllDrives=true&includeItemsFromAllDrives=true`)
  const { files } = await r.json()
  return (files as DriveFile[] || []).filter(f => isMarkdownName(f.name) || f.mimeType === 'text/markdown')
}

export async function createFile(token: Token, name: string, text: string, folderId?: string): Promise<DriveFile> {
  const boundary = `md-desk-${crypto.randomUUID()}`
  const meta = { name: withMdExtension(name), mimeType: 'text/markdown', ...(folderId ? { parents: [folderId] } : {}) }
  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n${text}\r\n`,
    `--${boundary}--\r\n`,
  ].join('')
  const r = await call(token, `/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=${FIELDS}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return r.json()
}

/** Overwrites file content. If expectedVersion is given and Drive has moved on, throws ConflictError. */
export async function updateFile(token: Token, id: string, text: string, expectedVersion?: string): Promise<DriveFile> {
  if (expectedVersion) {
    const current = await getFile(token, id)
    if (current.version !== expectedVersion) throw new ConflictError(current)
    if (current.capabilities && current.capabilities.canEdit === false) throw new DriveError(403, 'You only have view access to this file. Use "Save a copy" instead.')
  }
  const r = await call(token, `/upload${filePath(id)}?uploadType=media&supportsAllDrives=true&fields=${FIELDS}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'text/markdown; charset=UTF-8' },
    body: text,
  })
  return r.json()
}

export async function renameFile(token: Token, id: string, name: string): Promise<DriveFile> {
  const r = await call(token, `${filePath(id)}?supportsAllDrives=true&fields=${FIELDS}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: withMdExtension(name) }),
  })
  return r.json()
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** Finds a child of a folder by exact name. Needs a scope that can see the folder (drive.readonly). */
export async function findChild(token: Token, parentId: string, name: string, folder?: boolean): Promise<string | null> {
  const clauses = [`${q(parentId)} in parents`, `name = ${q(name)}`, 'trashed = false']
  if (folder) clauses.push("mimeType = 'application/vnd.google-apps.folder'")
  const r = await call(token, `/drive/v3/files?q=${encodeURIComponent(clauses.join(' and '))}&pageSize=1&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`)
  const { files } = await r.json()
  return files?.[0]?.id ?? null
}

/**
 * Resolves a relative path such as `images/a.png` or `../img/b.png` against a Drive folder
 * and returns the file's bytes as a Blob, or null if it isn't there.
 */
export async function readRelative(token: Token, folderId: string, relPath: string): Promise<Blob | null> {
  const parts = relPath.split(/[?#]/)[0].split('/').filter(p => p && p !== '.').map(p => { try { return decodeURIComponent(p) } catch { return p } })
  if (!parts.length) return null
  let dir = folderId
  for (const [i, part] of parts.entries()) {
    const last = i === parts.length - 1
    if (part === '..') {
      if (last) return null
      const parent = (await getFile(token, dir)).parents?.[0]
      if (!parent) return null
      dir = parent
      continue
    }
    const id = await findChild(token, dir, part, !last)
    if (!id) return null
    if (last) {
      const r = await call(token, `${filePath(id)}?alt=media&supportsAllDrives=true`)
      return r.blob()
    }
    dir = id
  }
  return null
}
