import { useLayoutEffect, useRef } from 'react'
import { Compartment, EditorSelection, EditorState, type ChangeSet } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands'
import { search, searchKeymap, openSearchPanel } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'

export function preserveLines(original:string, changes:ChangeSet) {
  // CodeMirror exposes line-break positions as one character even for CRLF.
  const expanded: number[] = []
  for (const match of original.matchAll(/\r\n/g)) expanded.push(match.index - expanded.length)
  function offset(position:number) {
    let low = 0, high = expanded.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (expanded[middle] < position) low = middle + 1
      else high = middle
    }
    return position + low
  }
  const separator = original.match(/\r\n|[\r\n]/)?.[0] || '\n'
  let cursor = 0, result = ''
  changes.iterChanges((from,to,_a,_b,inserted) => {
    result += original.slice(cursor,offset(from)) + inserted.sliceString(0,inserted.length,separator)
    cursor = offset(to)
  })
  return result + original.slice(cursor)
}
export interface EditorControls {view?:EditorView}
export function Editor({source, onEdit, wrap, controls}:{source:string; onEdit:(text:string)=>void; wrap:boolean; controls:EditorControls}) {
  const host = useRef<HTMLDivElement>(null)
  const wrapConfig = useRef(new Compartment())
  const current = useRef({source,onEdit})
  current.current = {source,onEdit}
  useLayoutEffect(() => {
    const view = new EditorView({parent:host.current!,state:EditorState.create({
      doc:current.current.source,
      extensions:[
        lineNumbers(), highlightActiveLine(), drawSelection(), history(), search({top:true}),
        keymap.of([...searchKeymap,...defaultKeymap,...historyKeymap]),
        markdown(), syntaxHighlighting(defaultHighlightStyle),
        EditorView.contentAttributes.of({'aria-label':'Markdown source','spellcheck':'false'}),
        wrapConfig.current.of([]),
        EditorView.updateListener.of(update => {
          if (!update.docChanged) return
          const text = preserveLines(current.current.source,update.changes)
          current.current.source = text
          current.current.onEdit(text)
        }),
      ],
    })})
    controls.view = view
    return () => {view.destroy(); delete controls.view}
  },[controls])
  useLayoutEffect(() => {
    controls.view?.dispatch({effects:wrapConfig.current.reconfigure(wrap ? EditorView.lineWrapping : [])})
  },[wrap,controls])
  return <div className="editor-host" ref={host}/>
}
export function editorCommand(controls:EditorControls, action:string, before='', after='', placeholder='text') {
  const view = controls.view
  if (!view) return
  if (action === 'undo') undo(view)
  else if (action === 'redo') redo(view)
  else if (action === 'find') {openSearchPanel(view); return}
  else view.dispatch(view.state.changeByRange(range => {
    const selected = view.state.sliceDoc(range.from,range.to)
    const insert = before+(selected || placeholder)+after
    return {
      changes:{from:range.from,to:range.to,insert},
      range:EditorSelection.range(range.from + before.length, range.from + before.length + (selected || placeholder).length),
    }
  }))
  view.focus()
}
