export interface Remote {
  id: string
  account: string
  version: string
  savedAt?: string
  savedRev: number
}
export interface Pending {
  id: string
  account: string
  name: string
  source: string
  rev: number
}
export interface Draft {
  id: string
  name: string
  text: string
  rev: number
  remote?: Remote
  pending?: Pending
}
export interface Preferences {
  theme: 'light' | 'dark'
  mode: 'editor' | 'split' | 'preview'
  wrap: boolean
  size: number
  split: number
  images: boolean
  autosave: boolean
}
export const defaults: Preferences = {theme:'light', mode:'split', wrap:true, size:15, split:50, images:false, autosave:false}
export const fresh = (name = 'Untitled.md', text = ''): Draft => ({id:crypto.randomUUID(), name, text, rev:0})
export const supported = (name: string) => /\.(md|markdown)$/i.test(name)
export const decode = (bytes: ArrayBuffer) => new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes)
export function counts(source: string) {
  return {words:source.trim() ? source.trim().split(/\s+/u).length : 0, characters:Array.from(source).length}
}
export function download(draft: Draft) {
  const url = URL.createObjectURL(new Blob([draft.text], {type:'text/markdown;charset=utf-8'}))
  const link = document.createElement('a')
  link.href = url
  link.download = draft.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
