import { defaults, type Draft, type Preferences } from './model'
export interface Snapshot {active: string; drafts: Draft[]; prefs: Preferences}
let connection: Promise<IDBDatabase> | undefined
function database() {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve,reject) => {
      const request = indexedDB.open('markdown-desk', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('workspace')
      request.onsuccess = () => {
        request.result.onversionchange = () => {request.result.close(); connection = undefined}
        resolve(request.result)
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Close other editor tabs and reload.'))
    }).catch(error => {connection = undefined; throw error})
  }
  return connection
}
function object(value: unknown): value is Record<string,unknown> {
  return !!value && typeof value === 'object'
}
function validDraft(d: unknown): d is Draft {
  if (!object(d) || typeof d.id !== 'string' || typeof d.name !== 'string' || typeof d.text !== 'string' || !Number.isSafeInteger(d.rev)) return false
  const r = d.remote, p = d.pending
  const validRemote = r === undefined || (object(r) && typeof r.id === 'string' && typeof r.account === 'string' && typeof r.version === 'string' && Number.isSafeInteger(r.savedRev) && (r.savedAt === undefined || typeof r.savedAt === 'string'))
  const validPending = p === undefined || (object(p) && typeof p.id === 'string' && typeof p.account === 'string' && typeof p.name === 'string' && typeof p.source === 'string' && Number.isSafeInteger(p.rev))
  return validRemote && validPending
}
export async function restore(): Promise<Snapshot | undefined> {
  const db = await database()
  const value: unknown = await new Promise((resolve,reject) => {
    const req = db.transaction('workspace').objectStore('workspace').get('current')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  if (value === undefined) return
  if (!object(value) || value.schema !== 1 || !Array.isArray(value.drafts) || !value.drafts.every(validDraft) || typeof value.active !== 'string' || !value.drafts.some((d: Draft) => d.id === value.active)) {
    throw new Error('Stored drafts could not be read. Existing storage has been preserved.')
  }
  const p = object(value.prefs) ? value.prefs : {}
  const prefs: Preferences = {
    ...defaults,
    theme:p.theme === 'dark' ? 'dark' : 'light',
    mode:p.mode === 'editor' || p.mode === 'preview' ? p.mode : 'split',
    wrap:p.wrap !== false, images:p.images === true, autosave:p.autosave === true,
    size:typeof p.size === 'number' && p.size >= 12 && p.size <= 26 ? p.size : defaults.size,
    split:typeof p.split === 'number' && p.split >= 20 && p.split <= 80 ? p.split : defaults.split,
  }
  return {active:value.active, drafts:value.drafts, prefs}
}
export async function persist(snapshot: Snapshot) {
  const db = await database()
  await new Promise<void>((resolve,reject) => {
    const tx = db.transaction('workspace','readwrite')
    tx.objectStore('workspace').put({...snapshot,schema:1},'current')
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
    tx.onerror = () => reject(tx.error)
  })
}
