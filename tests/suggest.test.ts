import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '../src/editor/extensions'
import { suggestReplace, resolveAll, countSuggestions, changesForAI } from '../src/editor/suggest'

let editor: Editor | undefined
afterEach(() => editor?.destroy())
const make = (md: string) => (editor = new Editor({ extensions: buildExtensions(), content: md, contentType: 'markdown' }))
const select = (e: Editor, word: string) => {
  let pos = -1
  e.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text!.includes(word)) pos = p + n.text!.indexOf(word) })
  e.commands.setTextSelection({ from: pos, to: pos + word.length })
}

describe('suggested edits', () => {
  it('marks old text deleted and new text inserted, and round-trips', () => {
    const e = make('The cat sat on the mat.')
    select(e, 'cat')
    expect(suggestReplace(e, 'dog')).toBe(true)
    const md = e.getMarkdown()
    expect(md).toContain('The <del>cat</del><ins>dog</ins> sat')
    expect(countSuggestions(e.state.doc)).toBe(1)
    const again = make(md)
    expect(again.getMarkdown()).toContain('<del>cat</del><ins>dog</ins>')
    expect(JSON.stringify(again.getJSON())).toContain('suggestIns')
  })
  it('keeps bold around the new text and handles Myanmar text', () => {
    const e = make('**မင်္ဂလာပါ** ခင်ဗျာ')
    select(e, 'မင်္ဂလာပါ')
    suggestReplace(e, 'ဟယ်လို')
    expect(e.getMarkdown()).toContain('<del>')
    expect(JSON.stringify(e.getJSON())).toMatch(/"bold".*"suggestIns"|"suggestIns".*"bold"/)
  })
  it('rewrites an orange suggestion instead of nesting it', () => {
    const e = make('A <del>cat</del><ins>dog</ins> here')
    select(e, 'dog')
    suggestReplace(e, 'fox')
    expect(e.getMarkdown()).toContain('<del>cat</del><ins>fox</ins>')
  })
  it('accepts and rejects all changes', () => {
    const md = 'One <del>cat</del><ins>dog</ins> and <del>red</del><ins>blue</ins> car.'
    const a = make(md)
    expect(resolveAll(a, true)).toBe(2)
    expect(a.getMarkdown().trim()).toBe('One dog and blue car.')
    const r = make(md)
    resolveAll(r, false)
    expect(r.getMarkdown().trim()).toBe('One cat and red car.')
  })
  it('lists only the changed paragraphs for AI, with their heading', () => {
    const out = changesForAI('# Title\n\nSame text.\n\n## Part 2\n\nA <del>cat</del><ins>dog</ins>.\n\nOther.\n', 'notes.md')
    expect(out).toContain('## Part 2\n\nA <del>cat</del><ins>dog</ins>.')
    expect(out).not.toContain('Same text')
    expect(out).not.toContain('Other.')
  })
})

describe('suggestion at the start of a line', () => {
  it('still parses as a change, not raw HTML', () => {
    const e = make('<del>cat</del><ins>dog</ins> sat.\n\n- <del>a</del><ins>b</ins> item')
    expect(countSuggestions(e.state.doc)).toBe(2)
    expect(e.getMarkdown()).toContain('<del>cat</del><ins>dog</ins> sat.')
  })
})
