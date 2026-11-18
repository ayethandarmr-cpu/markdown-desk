import { useEffect, useRef, useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { ChevronUp, ChevronDown, X, CaseSensitive, FileText, Globe, FileCode2, Minus, Plus } from 'lucide-react'
import { searchKey } from '../editor/search'
import type { Prefs } from '../util'
import { countWords } from '../util'

export function NavPane({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const items = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const out: { level: number; text: string; pos: number }[] = []
      e.state.doc.descendants((n, pos) => {
        if (n.type.name === 'heading') out.push({ level: n.attrs.level, text: n.textContent, pos })
        return n.isBlock && n.type.name !== 'heading'
      })
      const sel = e.state.selection.from
      let current = -1
      out.forEach((h, i) => { if (h.pos <= sel) current = i })
      return { out, current }
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  })
  const go = (pos: number) => {
    const { state, view } = editor
    view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(pos + 1))))
    const dom = view.nodeDOM(pos) as HTMLElement | null
    dom?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    view.focus()
  }
  return (
    <aside className="navpane" aria-label="Navigation">
      <header><h2>Navigation</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Close navigation"><X size={16} /></button></header>
      <div className="navpane-sub">Headings</div>
      {items.out.length === 0
        ? <p className="navpane-empty">Add headings (Home › Styles) to see your document's outline here.</p>
        : <ul>{items.out.map((h, i) => (
          <li key={`${h.pos}`}>
            <button type="button" className={i === items.current ? 'is-active' : ''} style={{ paddingLeft: 10 + (h.level - 1) * 14 }}
              onClick={() => go(h.pos)} title={h.text}>{h.text || <em>(empty heading)</em>}</button>
          </li>))}
        </ul>}
    </aside>
  )
}

export function FindBar({ editor, replaceMode, onClose }: { editor: Editor; replaceMode: boolean; onClose: () => void }) {
  const [q, setQ] = useState(() => {
    const { from, to } = editor.state.selection
    return from !== to ? editor.state.doc.textBetween(from, to).slice(0, 100) : ''
  })
  const [r, setR] = useState('')
  const [cs, setCs] = useState(false)
  const [showReplace, setShowReplace] = useState(replaceMode)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { setShowReplace(replaceMode); input.current?.select() }, [replaceMode])
  useEffect(() => { editor.commands.setSearch(q, cs) }, [q, cs, editor])
  useEffect(() => () => { editor.commands.clearSearch() }, [editor])
  const st = useEditorState({ editor, selector: ({ editor: e }) => {
    const s = searchKey.getState(e.state)
    return { n: s?.matches.length ?? 0, i: s?.index ?? -1 }
  } })
  return (
    <div className="findbar" role="search">
      <div className="findbar-row">
        <input ref={input} autoFocus value={q} placeholder="Find in document" aria-label="Find"
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) editor.commands.findPrev(); else editor.commands.findNext() }
            if (e.key === 'Escape') onClose()
          }} />
        <span className="findbar-count">{q ? (st.n ? `${st.i + 1} of ${st.n}` : 'No results') : ''}</span>
        <button type="button" className={`icon-btn${cs ? ' is-active' : ''}`} onClick={() => setCs(!cs)} title="Match case" aria-pressed={cs}><CaseSensitive size={16} /></button>
        <button type="button" className="icon-btn" onClick={() => editor.commands.findPrev()} title="Previous (Shift+Enter)" disabled={!st.n}><ChevronUp size={16} /></button>
        <button type="button" className="icon-btn" onClick={() => editor.commands.findNext()} title="Next (Enter)" disabled={!st.n}><ChevronDown size={16} /></button>
        <button type="button" className="link-btn" onClick={() => setShowReplace(!showReplace)}>{showReplace ? 'Hide replace' : 'Replace'}</button>
        <button type="button" className="icon-btn" onClick={onClose} title="Close (Esc)"><X size={16} /></button>
      </div>
      {showReplace && (
        <div className="findbar-row">
          <input value={r} placeholder="Replace with" aria-label="Replace with" onChange={e => setR(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); editor.commands.replaceCurrent(r) } if (e.key === 'Escape') onClose() }} />
          <button type="button" className="btn btn-sm" disabled={!st.n} onClick={() => editor.commands.replaceCurrent(r)}>Replace</button>
          <button type="button" className="btn btn-sm" disabled={!st.n} onClick={() => editor.commands.replaceAll(r)}>Replace all</button>
        </div>
      )}
    </div>
  )
}

export function StatusBar({ editor, sourceText, prefs, setPrefs, driveLabel }: {
  editor: Editor; sourceText?: string; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; driveLabel: string
}) {
  const stats = useEditorState({ editor, selector: ({ editor: e }) => {
    const { from, to } = e.state.selection
    const all = e.state.doc.textBetween(0, e.state.doc.content.size, '\n', ' ')
    const sel = from !== to ? e.state.doc.textBetween(from, to, '\n', ' ') : ''
    return { words: countWords(all), chars: [...all].length, selWords: sel ? countWords(sel) : 0 }
  } })
  const words = prefs.view === 'source' && sourceText !== undefined ? countWords(sourceText) : stats.words
  const chars = prefs.view === 'source' && sourceText !== undefined ? [...sourceText].length : stats.chars
  return (
    <footer className="statusbar">
      <span data-testid="word-count">{stats.selWords && prefs.view !== 'source' ? `${stats.selWords} of ${words} words` : `${words.toLocaleString()} words`}</span>
      <span>{chars.toLocaleString()} characters</span>
      <span className="status-drive">{driveLabel}</span>
      <span className="status-spacer" />
      <div className="status-views" role="group" aria-label="Views">
        <button type="button" className={prefs.view === 'print' ? 'is-active' : ''} title="Print Layout" onClick={() => setPrefs({ view: 'print' })}><FileText size={15} /></button>
        <button type="button" className={prefs.view === 'web' ? 'is-active' : ''} title="Web Layout" onClick={() => setPrefs({ view: 'web' })}><Globe size={15} /></button>
        <button type="button" className={prefs.view === 'source' ? 'is-active' : ''} title="Markdown source" onClick={() => setPrefs({ view: 'source' })}><FileCode2 size={15} /></button>
      </div>
      <div className="status-zoom">
        <button type="button" onClick={() => setPrefs({ zoom: Math.max(50, prefs.zoom - 10) })} aria-label="Zoom out"><Minus size={14} /></button>
        <input type="range" min={50} max={200} step={10} value={prefs.zoom} aria-label="Zoom" onChange={e => setPrefs({ zoom: Number(e.target.value) })} />
        <button type="button" onClick={() => setPrefs({ zoom: Math.min(200, prefs.zoom + 10) })} aria-label="Zoom in"><Plus size={14} /></button>
        <button type="button" className="zoom-label" onClick={() => setPrefs({ zoom: 100 })} title="Reset zoom">{prefs.zoom}%</button>
      </div>
    </footer>
  )
}
