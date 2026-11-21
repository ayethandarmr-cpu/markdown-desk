import { useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Code, Highlighter, RemoveFormatting,
  List, ListOrdered, ListChecks, IndentDecrease, IndentIncrease, Quote, Search, Replace, TextSelect,
  Table2, Image, Link2, SquareCode, Minus, CalendarClock, FileText, Globe, FileCode2, PanelLeft,
  ZoomIn, ZoomOut, Scan, Moon, Sun, Monitor, Maximize2, BetweenHorizontalStart, BetweenHorizontalEnd,
  BetweenVerticalStart, BetweenVerticalEnd, Rows3, Columns3, Trash2, Heading, SpellCheck, Unlink,
  Baseline, ChevronDown, ChevronUp, ListCollapse, PencilLine, CheckCheck, X as XIcon, ClipboardCopy,
} from 'lucide-react'
import { RBtn, Group, Popover } from './controls'
import type { Prefs } from '../util'
import { countSuggestions } from '../editor/suggest'

export type Tab = 'home' | 'insert' | 'review' | 'view' | 'table'

export interface RibbonActions {
  suggest: () => void
  acceptAll: () => void
  rejectAll: () => void
  copyForAI: () => void
  openFile: () => void
  find: (replace: boolean) => void
  link: () => void
  image: () => void
  prefs: Prefs
  setPrefs: (p: Partial<Prefs>) => void
}

const STYLES: { id: string; label: string; level?: 1 | 2 | 3 | 4; cls: string }[] = [
  { id: 'p', label: 'Normal', cls: 'sty-normal' },
  { id: 'h1', label: 'Heading 1', level: 1, cls: 'sty-h1' },
  { id: 'h2', label: 'Heading 2', level: 2, cls: 'sty-h2' },
  { id: 'h3', label: 'Heading 3', level: 3, cls: 'sty-h3' },
  { id: 'h4', label: 'Heading 4', level: 4, cls: 'sty-h4' },
  { id: 'quote', label: 'Quote', cls: 'sty-quote' },
  { id: 'code', label: 'Code', cls: 'sty-code' },
]

const LANGS = ['', 'bash', 'json', 'yaml', 'python', 'javascript', 'typescript', 'html', 'css', 'sql', 'go', 'java', 'c', 'cpp', 'csharp', 'xml', 'markdown', 'plaintext']

export function Ribbon({ editor, tab, setTab, onFile, a }: {
  editor: Editor; tab: Tab; setTab: (t: Tab) => void; onFile: () => void; a: RibbonActions
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'),
      strike: e.isActive('strike'), code: e.isActive('code'), highlight: e.isActive('highlight'),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), task: e.isActive('taskList'),
      quote: e.isActive('blockquote'), codeBlock: e.isActive('codeBlock'), link: e.isActive('link'),
      h: [1, 2, 3, 4].find(l => e.isActive('heading', { level: l })) ?? 0,
      table: e.isActive('table'),
      canUndo: e.can().undo(), canRedo: e.can().redo(),
      canSink: e.can().sinkListItem('listItem') || e.can().sinkListItem('taskItem'),
      canLift: e.can().liftListItem('listItem') || e.can().liftListItem('taskItem'),
      lang: (e.getAttributes('codeBlock').language as string | null) ?? '',
      color: (e.getAttributes('textStyle').color as string | undefined) ?? '',
      toggle: e.isActive('details'),
      changes: countSuggestions(e.state.doc),
      hasSel: !e.state.selection.empty,
    }),
  })
  const c = () => editor.chain().focus()
  const currentStyle = s.codeBlock ? 'code' : s.quote ? 'quote' : s.h ? `h${s.h}` : 'p'
  const applyStyle = (id: string) => {
    const st = STYLES.find(x => x.id === id)!
    if (id === 'p') c().setParagraph().run()
    else if (st.level) c().setHeading({ level: st.level }).run()
    else if (id === 'quote') { if (!s.quote) c().setParagraph().setBlockquote().run() }
    else if (id === 'code') { if (!s.codeBlock) c().setCodeBlock().run() }
  }
  const toggleDetails = () => { if (s.toggle) c().unsetDetails().run(); else c().setDetails().updateAttributes('details', { open: true }).run() }
  const { prefs, setPrefs } = a
  const tabs: [Tab, string][] = [['home', 'Home'], ['insert', 'Insert'], ['review', 'Review'], ['view', 'View']]
  if (s.table) tabs.push(['table', 'Table'])
  const shown = tab === 'table' && !s.table ? 'home' : tab

  return (
    <div className="ribbon">
      <div className="ribbon-tabs" role="tablist">
        <button type="button" className="tab tab-file" onClick={onFile} data-testid="tab-file">File</button>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={shown === id}
            className={`tab${shown === id ? ' is-active' : ''}${id === 'table' ? ' tab-contextual' : ''}`}
            onClick={() => { setTab(id); if (!prefs.ribbon) setPrefs({ ribbon: true }) }}
            onDoubleClick={() => setPrefs({ ribbon: !prefs.ribbon })}>{label}</button>
        ))}
        <span className="ribbon-tabs-spacer" />
        <button type="button" className="ribbon-toggle" onClick={() => setPrefs({ ribbon: !prefs.ribbon })}
          aria-expanded={prefs.ribbon} aria-label={prefs.ribbon ? 'Hide toolbar' : 'Show toolbar'} data-testid="ribbon-toggle"
          title={prefs.ribbon ? 'Hide toolbar (Ctrl+F1)' : 'Show toolbar (Ctrl+F1)'}>
          {prefs.ribbon ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {prefs.ribbon && <div className="ribbon-body" role="tabpanel" data-testid="ribbon-body">
        {shown === 'home' && <>
          <Group label="Undo">
            <RBtn icon={Undo2} label="Undo" shortcut="Ctrl+Z" disabled={!s.canUndo} onClick={() => c().undo().run()} />
            <RBtn icon={Redo2} label="Redo" shortcut="Ctrl+Y" disabled={!s.canRedo} onClick={() => c().redo().run()} />
          </Group>
          <Group label="Font">
            <div className="rgrid">
              <RBtn icon={Bold} label="Bold" shortcut="Ctrl+B" active={s.bold} onClick={() => c().toggleBold().run()} testId="btn-bold" />
              <RBtn icon={Italic} label="Italic" shortcut="Ctrl+I" active={s.italic} onClick={() => c().toggleItalic().run()} />
              <RBtn icon={Underline} label="Underline" shortcut="Ctrl+U" active={s.underline} onClick={() => c().toggleUnderline().run()} />
              <RBtn icon={Strikethrough} label="Strikethrough" active={s.strike} onClick={() => c().toggleStrike().run()} />
              <RBtn icon={Code} label="Inline code" shortcut="Ctrl+E" active={s.code} onClick={() => c().toggleCode().run()} />
              <RBtn icon={Highlighter} label="Highlight" shortcut="Ctrl+Shift+H" active={s.highlight} onClick={() => c().toggleHighlight().run()} />
              <ColorPicker editor={editor} current={s.color} />
              <RBtn icon={RemoveFormatting} label="Clear formatting" onClick={() => c().unsetAllMarks().clearNodes().run()} />
            </div>
          </Group>
          <Group label="Paragraph">
            <div className="rgrid">
              <RBtn icon={List} label="Bullets" shortcut="Ctrl+Shift+8" active={s.bullet} onClick={() => c().toggleBulletList().run()} />
              <RBtn icon={ListOrdered} label="Numbering" shortcut="Ctrl+Shift+7" active={s.ordered} onClick={() => c().toggleOrderedList().run()} />
              <RBtn icon={ListChecks} label="Checklist" shortcut="Ctrl+Shift+9" active={s.task} onClick={() => c().toggleTaskList().run()} />
              <RBtn icon={IndentDecrease} label="Decrease indent" shortcut="Shift+Tab" disabled={!s.canLift}
                onClick={() => { if (!c().liftListItem('listItem').run()) c().liftListItem('taskItem').run() }} />
              <RBtn icon={IndentIncrease} label="Increase indent" shortcut="Tab" disabled={!s.canSink}
                onClick={() => { if (!c().sinkListItem('listItem').run()) c().sinkListItem('taskItem').run() }} />
              <RBtn icon={Quote} label="Quote" active={s.quote} onClick={() => c().toggleBlockquote().run()} />
              <RBtn icon={Minus} label="Horizontal line" onClick={() => c().setHorizontalRule().run()} />
              <RBtn icon={ListCollapse} label="Toggle (collapsible section)" active={s.toggle} onClick={() => toggleDetails()} testId="btn-toggle" />
            </div>
          </Group>
          <Group label="Styles">
            <div className="styles-gallery" role="listbox" aria-label="Styles">
              {STYLES.map(st => (
                <button key={st.id} type="button" role="option" aria-selected={currentStyle === st.id}
                  className={`style-chip ${st.cls}${currentStyle === st.id ? ' is-active' : ''}`}
                  onMouseDown={e => e.preventDefault()} onClick={() => applyStyle(st.id)}>
                  <span className="style-sample">AaBb</span><span className="style-name">{st.label}</span>
                </button>
              ))}
            </div>
          </Group>
          <Group label="Editing">
            <div className="rstack">
              <RBtn icon={Search} label="Find" shortcut="Ctrl+F" showLabel onClick={() => a.find(false)} />
              <RBtn icon={Replace} label="Replace" shortcut="Ctrl+H" showLabel onClick={() => a.find(true)} />
              <RBtn icon={TextSelect} label="Select all" shortcut="Ctrl+A" showLabel onClick={() => c().selectAll().run()} />
            </div>
          </Group>
        </>}

        {shown === 'insert' && <>
          <Group label="Tables">
            <TablePicker onPick={(rows, cols) => c().insertTable({ rows, cols, withHeaderRow: true }).run()} />
          </Group>
          <Group label="Media">
            <RBtn icon={Image} label="Picture" big onClick={a.image} />
          </Group>
          <Group label="Links">
            <RBtn icon={Link2} label="Link" big shortcut="Ctrl+K" active={s.link} onClick={a.link} />
            {s.link && <RBtn icon={Unlink} label="Remove link" big onClick={() => c().extendMarkRange('link').unsetLink().run()} />}
          </Group>
          <Group label="Blocks">
            <RBtn icon={SquareCode} label="Code block" big active={s.codeBlock} onClick={() => c().toggleCodeBlock().run()} />
            <RBtn icon={ListChecks} label="Checklist" big active={s.task} onClick={() => c().toggleTaskList().run()} />
            <RBtn icon={ListCollapse} label="Toggle" big active={s.toggle} onClick={() => toggleDetails()} />
            <RBtn icon={Minus} label="Line" big onClick={() => c().setHorizontalRule().run()} />
            <RBtn icon={Heading} label="Heading" big onClick={() => c().setHeading({ level: 2 }).run()} />
          </Group>
          <Group label="Text">
            <RBtn icon={CalendarClock} label="Date & time" big onClick={() => c().insertContent(new Date().toLocaleString()).run()} />
          </Group>
          {s.codeBlock && (
            <Group label="Code language">
              <select className="rselect" value={s.lang} aria-label="Code language"
                onChange={e => c().updateAttributes('codeBlock', { language: e.target.value || null }).run()}>
                {LANGS.map(l => <option key={l} value={l}>{l || 'Auto / none'}</option>)}
              </select>
            </Group>
          )}
        </>}

        {shown === 'review' && <>
          <Group label="Suggest">
            <RBtn icon={PencilLine} label="Suggest edit" big disabled={!s.hasSel} onClick={a.suggest} testId="ribbon-suggest" />
          </Group>
          <Group label={`Changes (${s.changes})`}>
            <RBtn icon={CheckCheck} label="Accept all" big disabled={!s.changes} onClick={a.acceptAll} testId="accept-all" />
            <RBtn icon={XIcon} label="Reject all" big disabled={!s.changes} onClick={a.rejectAll} testId="reject-all" />
          </Group>
          <Group label="AI check">
            <RBtn icon={ClipboardCopy} label="Copy for AI" big disabled={!s.changes} onClick={a.copyForAI} testId="copy-ai" />
          </Group>
        </>}

        {shown === 'view' && <>
          <Group label="Toolbar">
            <RBtn icon={ChevronUp} label="Hide toolbar" big shortcut="Ctrl+F1" onClick={() => setPrefs({ ribbon: false })} />
          </Group>
          <Group label="Views">
            <RBtn icon={FileText} label="Print Layout" big active={prefs.view === 'print'} onClick={() => setPrefs({ view: 'print' })} testId="view-print" />
            <RBtn icon={Globe} label="Web Layout" big active={prefs.view === 'web'} onClick={() => setPrefs({ view: 'web' })} />
            <RBtn icon={FileCode2} label="Markdown" big active={prefs.view === 'source'} onClick={() => setPrefs({ view: 'source' })} testId="view-source" />
          </Group>
          <Group label="Show">
            <RBtn icon={PanelLeft} label="Navigation" big active={prefs.nav} onClick={() => setPrefs({ nav: !prefs.nav })} />
            <RBtn icon={SpellCheck} label="Spelling" big active={prefs.spellcheck} onClick={() => setPrefs({ spellcheck: !prefs.spellcheck })} />
          </Group>
          <Group label="Zoom">
            <RBtn icon={ZoomOut} label="Zoom out" big onClick={() => setPrefs({ zoom: Math.max(50, prefs.zoom - 10) })} />
            <RBtn icon={Scan} label="100%" big onClick={() => setPrefs({ zoom: 100 })} />
            <RBtn icon={ZoomIn} label="Zoom in" big onClick={() => setPrefs({ zoom: Math.min(200, prefs.zoom + 10) })} />
          </Group>
          <Group label="Theme">
            <RBtn icon={Sun} label="Light" big active={prefs.theme === 'light'} onClick={() => setPrefs({ theme: 'light' })} />
            <RBtn icon={Moon} label="Dark" big active={prefs.theme === 'dark'} onClick={() => setPrefs({ theme: 'dark' })} />
            <RBtn icon={Monitor} label="System" big active={prefs.theme === 'system'} onClick={() => setPrefs({ theme: 'system' })} />
          </Group>
          <Group label="Immersive">
            <RBtn icon={Maximize2} label="Full screen" big onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen()
              else void document.documentElement.requestFullscreen?.()
            }} />
          </Group>
        </>}

        {shown === 'table' && <>
          <Group label="Rows & Columns">
            <RBtn icon={BetweenHorizontalStart} label="Insert above" big onClick={() => c().addRowBefore().run()} />
            <RBtn icon={BetweenHorizontalEnd} label="Insert below" big onClick={() => c().addRowAfter().run()} />
            <RBtn icon={BetweenVerticalStart} label="Insert left" big onClick={() => c().addColumnBefore().run()} />
            <RBtn icon={BetweenVerticalEnd} label="Insert right" big onClick={() => c().addColumnAfter().run()} />
          </Group>
          <Group label="Delete">
            <RBtn icon={Rows3} label="Delete row" big onClick={() => c().deleteRow().run()} />
            <RBtn icon={Columns3} label="Delete column" big onClick={() => c().deleteColumn().run()} />
            <RBtn icon={Trash2} label="Delete table" big onClick={() => c().deleteTable().run()} />
          </Group>
          <Group label="Options">
            <RBtn icon={Table2} label="Header row" big onClick={() => c().toggleHeaderRow().run()} />
          </Group>
        </>}
      </div>}
    </div>
  )
}

function TablePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState<[number, number]>([0, 0])
  return (
    <Popover trigger={(toggle, open) => <RBtn icon={Table2} label="Table" big active={open} onClick={toggle} testId="btn-table" />}>
      {close => (
        <div className="table-picker">
          <div className="table-picker-title">{hover[0] ? `${hover[1]} × ${hover[0]} table` : 'Insert table'}</div>
          <div className="table-grid" onMouseLeave={() => setHover([0, 0])}>
            {Array.from({ length: 8 }, (_, r) => Array.from({ length: 10 }, (_, col) => (
              <button type="button" key={`${r}-${col}`} aria-label={`${col + 1} by ${r + 1}`}
                className={r < hover[0] && col < hover[1] ? 'on' : ''}
                onMouseEnter={() => setHover([r + 1, col + 1])}
                onFocus={() => setHover([r + 1, col + 1])}
                onClick={() => { onPick(r + 1, col + 1); close() }} />
            )))}
          </div>
        </div>
      )}
    </Popover>
  )
}

const COLORS: [string, string][] = [
  ['#000000', 'Black'], ['#7f7f7f', 'Gray'], ['#c00000', 'Dark red'], ['#e03131', 'Red'], ['#f08c00', 'Orange'],
  ['#e6b800', 'Gold'], ['#2f9e44', 'Green'], ['#0b7285', 'Teal'], ['#1a5fd0', 'Blue'], ['#1c3d7a', 'Navy'],
  ['#7048e8', 'Purple'], ['#c2255c', 'Pink'],
]

function ColorPicker({ editor, current }: { editor: Editor; current: string }) {
  const [last, setLast] = useState('#c00000')
  const apply = (color: string | null) => {
    const ch = editor.chain().focus()
    if (color) { ch.setColor(color).run(); setLast(color) } else ch.unsetColor().removeEmptyTextStyle().run()
  }
  return (
    <Popover trigger={(toggle, open) => (
      <span className="split-btn">
        <button type="button" className="rbtn color-btn" title="Font color" aria-label="Font color"
          onMouseDown={e => e.preventDefault()} onClick={() => apply(last)} data-testid="btn-color">
          <Baseline size={16} strokeWidth={1.75} />
          <span className="color-bar" style={{ background: last }} />
        </button>
        <button type="button" className={`rbtn split-arrow${open ? ' is-active' : ''}`} aria-label="More font colors"
          onMouseDown={e => e.preventDefault()} onClick={toggle} data-testid="btn-color-menu"><ChevronDown size={12} /></button>
      </span>
    )}>
      {close => (
        <div className="color-menu">
          <button type="button" className="color-auto" onMouseDown={e => e.preventDefault()} onClick={() => { apply(null); close() }}>
            <span className="swatch" style={{ background: 'var(--text)' }} /> Automatic
          </button>
          <div className="color-grid">
            {COLORS.map(([hex, name]) => (
              <button type="button" key={hex} title={name} aria-label={name} className={`swatch${current === hex ? ' is-active' : ''}`}
                style={{ background: hex }} onMouseDown={e => e.preventDefault()} onClick={() => { apply(hex); close() }} />
            ))}
          </div>
          <label className="color-custom">
            More colors…
            <input type="color" value={current || last} onChange={e => apply(e.target.value)} />
          </label>
        </div>
      )}
    </Popover>
  )
}
