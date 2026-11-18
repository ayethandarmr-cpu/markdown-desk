/** Collapses runs of 3+ blank lines (outside fenced code) and ensures a single trailing newline. */
export function tidyMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let fence: string | null = null
  let blanks = 0
  for (const line of lines) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line)
    if (m) {
      if (!fence) fence = m[1][0]
      else if (m[1][0] === fence) fence = null
    }
    if (!fence && line.trim() === '') {
      blanks++
      if (blanks > 1) continue
    } else blanks = 0
    out.push(line)
  }
  return out.join('\n').replace(/^\n+/, '').replace(/\n*$/, '\n')
}

/** Word-ish counting: Latin words by whitespace; Myanmar runs counted by syllable clusters is overkill, so count whitespace-separated runs. */
export function countWords(text: string): number {
  const m = text.trim().match(/\S+/gu)
  return m ? m.length : 0
}

export function baseName(name: string) {
  return name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '')
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function relativeTime(iso?: string) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`
  return new Date(iso).toLocaleDateString()
}

const KEY = 'markdown-desk:v2'
export interface Persisted {
  draft?: { markdown: string; name: string; driveId?: string; version?: string; savedText?: string; folderId?: string }
  prefs?: Partial<Prefs>
}
export interface Prefs {
  theme: 'system' | 'light' | 'dark'
  view: 'print' | 'web' | 'source'
  nav: boolean
  zoom: number
  autosave: boolean
  spellcheck: boolean
}
export const defaultPrefs: Prefs = { theme: 'system', view: 'print', nav: true, zoom: 100, autosave: true, spellcheck: false }

export function loadState(): Persisted {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}
export function saveState(patch: Persisted) {
  try {
    const cur = loadState()
    localStorage.setItem(KEY, JSON.stringify({ ...cur, ...patch }))
  } catch { /* storage unavailable */ }
}
