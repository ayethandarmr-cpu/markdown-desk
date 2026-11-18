import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '../src/editor/extensions'

let editor: Editor | undefined
afterEach(() => editor?.destroy())
const make = (md: string) => (editor = new Editor({ extensions: buildExtensions(), content: md, contentType: 'markdown' }))

describe('text colour', () => {
  it('parses and writes coloured spans, keeping Markdown inside', () => {
    const e = make('Say <span style="color: #c00000">hello **world**</span> now')
    const json = JSON.stringify(e.getJSON())
    expect(json).toContain('"color":"#c00000"')
    expect(json).toContain('"bold"')
    expect(e.getMarkdown()).toContain('<span style="color: #c00000">hello **world**</span>')
  })
  it('sets colour from a command', () => {
    const e = make('plain text')
    e.chain().selectAll().setColor('#2e75b6').run()
    expect(e.getMarkdown()).toContain('<span style="color: #2e75b6">plain text</span>')
  })
})

describe('toggle', () => {
  it('round-trips <details> with Markdown content', () => {
    const md = 'Intro\n\n<details>\n<summary>Show **answer**</summary>\n\n- one\n- two\n\nMore text\n\n</details>\n\nAfter'
    const e = make(md)
    const types = (e.getJSON().content ?? []).map(n => n.type)
    expect(types).toEqual(['paragraph', 'details', 'paragraph'])
    const out = e.getMarkdown()
    expect(out).toContain('<details>\n<summary>Show **answer**</summary>\n\n- one\n- two\n\nMore text\n\n</details>')
    expect(out.trim().endsWith('After')).toBe(true)
  })
  it('handles nested toggles', () => {
    const e = make('<details>\n<summary>A</summary>\n\n<details>\n<summary>B</summary>\n\nin\n\n</details>\n\n</details>')
    const outer = e.getJSON().content![0]
    expect(outer.type).toBe('details')
    expect(JSON.stringify(outer.content![1])).toContain('"details"')
  })
})
