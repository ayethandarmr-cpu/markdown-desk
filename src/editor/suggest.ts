import { Mark, mergeAttributes, type Editor, type MarkdownTokenizer } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Suggested edits, stored in Markdown as plain HTML that GitHub and AI tools understand:
 *   <del>old words</del><ins>new words</ins>
 * The app shows <del> struck through and <ins> in orange.
 */
function htmlTagTokenizer(name: string, tag: string): MarkdownTokenizer {
  const open = `<${tag}>`
  return {
    name,
    level: 'inline' as const,
    start: (src: string) => src.toLowerCase().indexOf(open),
    tokenize(src, _tokens, lexer) {
      if (!src.toLowerCase().startsWith(open)) return
      const end = src.toLowerCase().indexOf(`</${tag}>`, open.length)
      if (end < 0) return
      const text = src.slice(open.length, end)
      return { type: name, raw: src.slice(0, end + tag.length + 3), text, tokens: lexer.inlineTokens(text) }
    },
  }
}

export const SuggestDel = Mark.create({
  name: 'suggestDel',
  inclusive: false,
  excludes: 'suggestIns',
  parseHTML: () => [{ tag: 'del', priority: 100 }],
  renderHTML: ({ HTMLAttributes }) => ['del', mergeAttributes(HTMLAttributes, { class: 'sg-del' }), 0],
  renderMarkdown: (node, h) => `<del>${h.renderChildren(node)}</del>`,
  parseMarkdown: (token, h) => h.applyMark('suggestDel', h.parseInline(token.tokens || [])),
  markdownTokenizer: htmlTagTokenizer('suggestDel', 'del'),
})

export const SuggestIns = Mark.create({
  name: 'suggestIns',
  inclusive: false,
  excludes: 'suggestDel',
  parseHTML: () => [{ tag: 'ins', priority: 100 }],
  renderHTML: ({ HTMLAttributes }) => ['ins', mergeAttributes(HTMLAttributes, { class: 'sg-ins' }), 0],
  renderMarkdown: (node, h) => `<ins>${h.renderChildren(node)}</ins>`,
  parseMarkdown: (token, h) => h.applyMark('suggestIns', h.parseInline(token.tokens || [])),
  markdownTokenizer: htmlTagTokenizer('suggestIns', 'ins'),
})

/** Text ranges carrying a mark, merged when adjacent. */
function markRanges(doc: PMNode, markName: string) {
  const out: { from: number; to: number }[] = []
  doc.descendants((n, pos) => {
    if (!n.isText || !n.marks.some(m => m.type.name === markName)) return
    const last = out[out.length - 1]
    if (last && last.to === pos) last.to = pos + n.nodeSize
    else out.push({ from: pos, to: pos + n.nodeSize })
  })
  return out
}

export function countSuggestions(doc: PMNode) {
  // A change is a run of <del> and/or <ins> next to each other.
  const ranges = [...markRanges(doc, 'suggestDel'), ...markRanges(doc, 'suggestIns')].sort((a, b) => a.from - b.from)
  let n = 0
  let end = -1
  for (const r of ranges) { if (r.from > end) n++; end = Math.max(end, r.to) }
  return n
}

/** Replaces the selection with a tracked change: old text struck through, new text in orange. */
export function suggestReplace(editor: Editor, newText: string): boolean {
  const { state } = editor
  const { from, to, empty } = state.selection
  if (empty) return false
  const schema = state.schema
  const del = schema.marks.suggestDel
  const ins = schema.marks.suggestIns
  const tr = state.tr
  const oldText = state.doc.textBetween(from, to, '\n')
  if (oldText === newText) return false
  // Editing a suggestion that is already orange just rewrites it.
  if (oneMarkCovers(state.doc, from, to, 'suggestIns')) {
    const marks = state.doc.nodeAt(from)?.marks ?? [ins.create()]
    if (newText) tr.replaceWith(from, to, schema.text(newText, marks))
    else tr.delete(from, to)
    editor.view.dispatch(tr.scrollIntoView())
    return true
  }
  tr.removeMark(from, to, ins)
  tr.addMark(from, to, del.create())
  if (newText) {
    const base = state.doc.nodeAt(from)?.marks ?? []
    const marks = ins.create().addToSet(base.filter(m => m.type !== del && m.type !== ins))
    tr.insert(to, schema.text(newText, marks))
  }
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

function oneMarkCovers(doc: PMNode, from: number, to: number, markName: string) {
  let all = true
  doc.nodesBetween(from, to, n => { if (n.isText && !n.marks.some(m => m.type.name === markName)) all = false })
  return all
}

/** accept: keep the new text. reject: keep the old text. */
export function resolveAll(editor: Editor, accept: boolean): number {
  const { state } = editor
  const count = countSuggestions(state.doc)
  if (!count) return 0
  const drop = markRanges(state.doc, accept ? 'suggestDel' : 'suggestIns')
  const keep = accept ? state.schema.marks.suggestIns : state.schema.marks.suggestDel
  const tr = state.tr
  tr.removeMark(0, state.doc.content.size, keep)
  for (const r of drop.reverse()) tr.delete(r.from, r.to)
  editor.view.dispatch(tr)
  return count
}

/**
 * A compact list of the changed paragraphs (with their heading) to paste into an AI chat,
 * instead of the whole document.
 */
export function changesForAI(markdown: string, docName: string): string {
  const blocks = markdown.split(/\n{2,}/)
  let heading = ''
  let lastHeading = ''
  const parts: string[] = []
  for (const b of blocks) {
    if (/^#{1,6}\s/.test(b)) heading = b.split('\n')[0]
    if (!/<(del|ins)>/.test(b)) continue
    if (heading && heading !== lastHeading) { parts.push(heading); lastHeading = heading }
    parts.push(b)
  }
  return [
    `I edited the Markdown document "${docName}". Each change is marked <del>old</del><ins>new</ins>.`,
    'Please check every change for meaning, grammar and spelling, and suggest fixes.',
    '',
    ...parts.flatMap(p => [p, '']),
  ].join('\n').trim() + '\n'
}
