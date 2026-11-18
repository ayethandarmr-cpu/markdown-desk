import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

export interface Match { from: number; to: number }
interface SearchState { query: string; caseSensitive: boolean; matches: Match[]; index: number; deco: DecorationSet }

export const searchKey = new PluginKey<SearchState>('find-replace')

/** Finds matches inside each textblock, so a match can span bold/italic boundaries. */
export function findMatches(doc: PMNode, query: string, caseSensitive: boolean): Match[] {
  if (!query) return []
  const needle = caseSensitive ? query : query.toLocaleLowerCase()
  const out: Match[] = []
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true
    let text = ''
    const map: number[] = []
    block.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) { map.push(blockPos + 1 + offset + i); text += child.text![i] }
      } else {
        map.push(-1); text += '￼'
      }
    })
    const hay = caseSensitive ? text : text.toLocaleLowerCase()
    let i = hay.indexOf(needle)
    while (i !== -1) {
      const from = map[i], last = map[i + needle.length - 1]
      if (from >= 0 && last >= 0) out.push({ from, to: last + 1 })
      i = hay.indexOf(needle, i + Math.max(needle.length, 1))
    }
    return false
  })
  return out
}

function build(doc: PMNode, query: string, caseSensitive: boolean, index: number): SearchState {
  const matches = findMatches(doc, query, caseSensitive)
  const idx = matches.length ? Math.min(Math.max(index, 0), matches.length - 1) : -1
  const deco = DecorationSet.create(doc, matches.map((m, i) =>
    Decoration.inline(m.from, m.to, { class: i === idx ? 'search-hit search-hit-current' : 'search-hit' })))
  return { query, caseSensitive, matches, index: idx, deco }
}

type Meta = { query?: string; caseSensitive?: boolean; index?: number }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    search: {
      setSearch: (query: string, caseSensitive?: boolean) => ReturnType
      findNext: () => ReturnType
      findPrev: () => ReturnType
      replaceCurrent: (replacement: string) => ReturnType
      replaceAll: (replacement: string) => ReturnType
      clearSearch: () => ReturnType
    }
  }
}

const getState = (s: EditorState) => searchKey.getState(s)!

function select(tr: Transaction, m: Match | undefined) {
  if (m) tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView()
  return tr
}

export const Search = Extension.create({
  name: 'search',
  addProseMirrorPlugins() {
    return [new Plugin<SearchState>({
      key: searchKey,
      state: {
        init: (_, { doc }) => build(doc, '', false, 0),
        apply(tr, prev) {
          const meta = tr.getMeta(searchKey) as Meta | undefined
          if (meta) {
            return build(tr.doc, meta.query ?? prev.query, meta.caseSensitive ?? prev.caseSensitive, meta.index ?? prev.index)
          }
          if (tr.docChanged && prev.query) return build(tr.doc, prev.query, prev.caseSensitive, prev.index)
          return prev
        },
      },
      props: { decorations: s => getState(s).deco },
    })]
  },
  addCommands() {
    return {
      setSearch: (query, caseSensitive) => ({ tr, state, dispatch }) => {
        const pos = state.selection.from
        const matches = findMatches(state.doc, query, caseSensitive ?? getState(state).caseSensitive)
        const index = Math.max(0, matches.findIndex(m => m.from >= pos))
        if (dispatch) dispatch(tr.setMeta(searchKey, { query, caseSensitive, index }))
        return true
      },
      findNext: () => ({ tr, state, dispatch }) => {
        const s = getState(state)
        if (!s.matches.length) return false
        const index = (s.index + 1) % s.matches.length
        if (dispatch) dispatch(select(tr.setMeta(searchKey, { index }), s.matches[index]))
        return true
      },
      findPrev: () => ({ tr, state, dispatch }) => {
        const s = getState(state)
        if (!s.matches.length) return false
        const index = (s.index - 1 + s.matches.length) % s.matches.length
        if (dispatch) dispatch(select(tr.setMeta(searchKey, { index }), s.matches[index]))
        return true
      },
      replaceCurrent: replacement => ({ tr, state, dispatch }) => {
        const s = getState(state)
        const m = s.matches[s.index]
        if (!m) return false
        if (dispatch) {
          if (replacement) tr.insertText(replacement, m.from, m.to)
          else tr.delete(m.from, m.to)
          tr.setMeta(searchKey, { index: s.index })
          dispatch(tr)
        }
        return true
      },
      replaceAll: replacement => ({ tr, state, dispatch }) => {
        const s = getState(state)
        if (!s.matches.length) return false
        if (dispatch) {
          for (const m of [...s.matches].reverse()) {
            if (replacement) tr.insertText(replacement, m.from, m.to)
            else tr.delete(m.from, m.to)
          }
          tr.setMeta(searchKey, { index: 0 })
          dispatch(tr)
        }
        return true
      },
      clearSearch: () => ({ tr, dispatch }) => {
        if (dispatch) dispatch(tr.setMeta(searchKey, { query: '', index: 0 }))
        return true
      },
    }
  },
})
