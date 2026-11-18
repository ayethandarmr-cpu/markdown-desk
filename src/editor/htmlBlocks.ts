import { TextStyle, Color } from '@tiptap/extension-text-style'
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details'

/** Finds the index just past the `</tag>` that closes the `<tag …>` at the start of `src`, honouring nesting. */
function closingEnd(src: string, tag: string): number {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
  let depth = 0
  for (let m = re.exec(src); m; m = re.exec(src)) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return m.index + m[0].length
  }
  return -1
}

const COLOR_OPEN = /^<span\s+style\s*=\s*"\s*color\s*:\s*([^";]+?)\s*;?\s*"\s*>/i

/**
 * Text colour, stored in Markdown as `<span style="color: #c00">text</span>`
 * (GitHub and most viewers render that). Markdown inside the span keeps working.
 */
export const ColoredText = TextStyle.extend({
  renderMarkdown(node, h) {
    const inner = h.renderChildren(node.content ?? [])
    const color = node.attrs?.color as string | undefined
    return color ? `<span style="color: ${color}">${inner}</span>` : inner
  },
  parseMarkdown(token, h) {
    return h.applyMark('textStyle', h.parseInline(token.tokens || []), { color: token.color })
  },
  markdownTokenizer: {
    name: 'textStyle',
    level: 'inline',
    start: (src: string) => src.search(/<span\s+style\s*=\s*"\s*color/i),
    tokenize(src, _tokens, lexer) {
      const open = COLOR_OPEN.exec(src)
      if (!open) return
      const end = closingEnd(src, 'span')
      if (end < 0) return
      const text = src.slice(open[0].length, end - '</span>'.length)
      return { type: 'textStyle', raw: src.slice(0, end), text, color: open[1], tokens: lexer.inlineTokens(text) }
    },
  },
})

export { Color }

/**
 * Collapsible "toggle" sections, stored as GitHub-style HTML:
 *
 *   <details>
 *   <summary>Title</summary>
 *
 *   Markdown content
 *
 *   </details>
 */
export const Toggle = Details.extend({
  renderMarkdown(node, h) {
    const [summary, content] = node.content ?? []
    const title = h.renderChildren(summary?.content ?? []).replace(/\n+/g, ' ')
    const body = (content?.content ?? []).map(c => h.renderChildren([c])).join('\n\n').trim()
    return `<details${node.attrs?.open ? ' open' : ''}>\n<summary>${title}</summary>\n\n${body}\n\n</details>`
  },
  parseMarkdown(token, h) {
    const blocks = h.parseChildren(token.tokens || [])
    return h.createNode('details', { open: !!token.open }, [
      h.createNode('detailsSummary', {}, h.parseInline(token.summaryTokens || [])),
      h.createNode('detailsContent', {}, blocks.length ? blocks : [{ type: 'paragraph' }]),
    ])
  },
  markdownTokenizer: {
    name: 'details',
    level: 'block',
    start: (src: string) => src.search(/<details\b/i),
    tokenize(src, _tokens, lexer) {
      const tag = /^ {0,3}<details\b([^>]*)>/i.exec(src)
      if (!tag) return
      const end = closingEnd(src, 'details')
      if (end < 0) return
      const raw = src.slice(0, end) + (/^[^\S\n]*\n?/.exec(src.slice(end))?.[0] ?? '')
      const inner = src.slice(src.indexOf('>') + 1, end - '</details>'.length)
      const sm = /^\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/i.exec(inner)
      const summary = sm ? sm[1].trim() : 'Details'
      const body = sm ? inner.slice(sm[0].length) : inner
      return { type: 'details', raw, open: /\bopen\b/i.test(tag[1]), summaryTokens: lexer.inlineTokens(summary), tokens: lexer.blockTokens(body.trim()) }
    },
  },
}).configure({ persist: true, HTMLAttributes: { class: 'toggle' } })

export { DetailsSummary, DetailsContent }
