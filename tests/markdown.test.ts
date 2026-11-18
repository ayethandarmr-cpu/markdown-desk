import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '../src/editor/extensions'

let editor: Editor | undefined
afterEach(() => editor?.destroy())
const make = (md: string) => (editor = new Editor({ extensions: buildExtensions(), content: md, contentType: 'markdown' }))

describe('markdown round trip', () => {
  it('keeps common Markdown', () => {
    const md = [
      '# Title', '', 'Some **bold**, *italic*, ~~strike~~, `code` and [a link](https://example.com).', '',
      '- one', '- two', '  - nested', '', '1. first', '2. second', '',
      '- [ ] todo', '- [x] done', '', '> quote', '', '```ts', 'const a = 1', '```', '',
      '| A | B |', '| --- | --- |', '| 1 | 2 |', '', '---', '', 'မြန်မာစာ စမ်းသပ်ချက်',
    ].join('\n')
    const out = make(md).getMarkdown()
    for (const piece of ['# Title', '**bold**', '*italic*', '~~strike~~', '`code`', '[a link](https://example.com)', '- [ ] todo', '- [x] done', '> quote', '```ts', '| A', 'မြန်မာစာ']) {
      expect(out).toContain(piece)
    }
  })
})
