import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '../src/editor/extensions'
import { findMatches } from '../src/editor/search'
import { tidyMarkdown } from '../src/util'

describe('find', () => {
  it('matches across formatting and ignores case by default', () => {
    const e = new Editor({ extensions: buildExtensions(), content: 'Hel**lo Wo**rld and hello', contentType: 'markdown' })
    expect(findMatches(e.state.doc, 'hello', false)).toHaveLength(2)
    expect(findMatches(e.state.doc, 'Hello', true)).toHaveLength(1)
    e.commands.setSearch('hello', false)
    e.commands.replaceAll('bye')
    expect(e.getText()).toBe('bye World and bye')
    e.destroy()
  })
})

describe('tidyMarkdown', () => {
  it('collapses extra blank lines but not inside code fences', () => {
    expect(tidyMarkdown('a\n\n\n\nb\n```\nx\n\n\n\ny\n```')).toBe('a\n\nb\n```\nx\n\n\n\ny\n```\n')
  })
})
