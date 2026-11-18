import Image from '@tiptap/extension-image'
import type { Token } from '../google'
import { readRelative } from '../drive'

/** Where relative image paths (e.g. `images/a.png`) are looked up: the open Drive file's folder. */
interface ImageContext { folderId?: string; token: () => Token | null }
let ctx: ImageContext = { token: () => null }
let cache = new Map<string, Promise<string | null>>()
/** Images that couldn't load yet because nobody was signed in; retried when a token arrives. */
const waiting = new Set<() => void>()

export function setImageContext(next: ImageContext) {
  const prev = ctx.folderId
  if (next.folderId !== prev) {
    for (const p of cache.values()) void p.then(u => u && URL.revokeObjectURL(u))
    cache = new Map()
    // Images still waiting belong to the previous document unless there was no folder before.
    if (prev) waiting.clear()
  }
  ctx = next
  if (next.folderId && next.token()) {
    const retry = [...waiting]
    waiting.clear()
    retry.forEach(f => f())
  }
}

export const isRelativeSrc = (src: string) => !!src && !/^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(src)

function resolve(src: string): Promise<string | null> {
  const token = ctx.token()
  if (!ctx.folderId || !token) return Promise.resolve(null)
  const key = `${ctx.folderId}|${src}`
  let p = cache.get(key)
  if (!p) {
    p = readRelative(token, ctx.folderId, src)
      .then(b => (b && b.type.startsWith('image/') ? URL.createObjectURL(b) : null))
      .catch(() => null)
    p.then(u => { if (!u) cache.delete(key) })
    cache.set(key, p)
  }
  return p
}

/**
 * Image node that keeps the Markdown `src` untouched (so saving writes the same relative path)
 * but shows relative images by loading them from the Drive folder next to the document.
 */
export const DriveImage = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement('img')
      let current = ''
      const apply = (n: typeof node) => {
        const src = String(n.attrs.src || '')
        img.alt = n.attrs.alt || ''
        if (n.attrs.title) img.title = n.attrs.title; else img.removeAttribute('title')
        if (src === current) return
        current = src
        load(src)
      }
      const load = (src: string) => {
        if (!isRelativeSrc(src)) { img.src = src; img.classList.remove('img-missing'); return }
        img.removeAttribute('src')
        img.classList.add('img-loading')
        const needsSignIn = !ctx.folderId || !ctx.token()
        if (needsSignIn) waiting.add(retry)
        void resolve(src).then(url => {
          if (current !== src) return
          img.classList.remove('img-loading')
          if (url) { img.src = url; img.classList.remove('img-missing') } else img.classList.add('img-missing')
        })
      }
      const retry = () => { if (isRelativeSrc(current)) load(current) }
      apply(node)
      return {
        dom: img,
        update: n => { if (n.type !== node.type) return false; apply(n); return true },
        destroy: () => { waiting.delete(retry) },
      }
    }
  },
})
