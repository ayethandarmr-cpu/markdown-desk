import {useEffect, useMemo, useRef, useState} from 'react'
import {Editor, editorCommand, type EditorControls} from './Editor'
import {markdown} from './markdown'
import {counts, decode, defaults, download, fresh, supported, type Draft, type Preferences} from './model'
import {useWorkspace} from './workspace'
import {configured, pick, prepareIdentity, requestToken, type Session} from './google'
import {associate, authorize, ConflictError, DriveError, openFile, renameFile, requireAccount} from './drive'
import {saveDraft, SaveQueue} from './save'

type Comparison = {draftId:string; remote:Awaited<ReturnType<typeof openFile>>; account:string}
const tools = [
  ['Heading','# ','','Heading'], ['Bold','**','**'], ['Italic','_','_'],
  ['List','- '], ['Tasks','- [ ] '], ['Quote','> '],
  ['Code','```text\n','\n```','code'], ['Link','[','](https://example.com)','label'],
  ['Image','![','](https://example.com/image.png)','description'],
  ['Table','','','| Column | Value |\n| --- | --- |\n| Item | Details |'],
]
export function App() {
  const ws = useWorkspace()
  const {snapshot,ready,saved,storageError,latest,change,flush} = ws
  const {drafts,prefs} = snapshot
  const draft = drafts.find(d => d.id === snapshot.active)!
  const controls = useRef<EditorControls>({}).current
  const queue = useRef(new SaveQueue()).current
  const [session,setSession] = useState<Session>()
  const [online,setOnline] = useState(navigator.onLine)
  const [identityReady,setIdentityReady] = useState(false)
  const [connecting,setConnecting] = useState(false)
  const [picking,setPicking] = useState(false)
  const [saving,setSaving] = useState<string[]>([])
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [failed,setFailed] = useState<string[]>([])
  const [comparison,setComparison] = useState<Comparison>()
  const [conflicts,setConflicts] = useState<string[]>([])
  const [destination,setDestination] = useState(false)
  const [editorEpoch,setEditorEpoch] = useState(0)
  const upload = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const compareDialog = useRef<HTMLDialogElement>(null)
  const preview = useRef<HTMLElement>(null)
  const rendered = useMemo(() => markdown(draft.text,prefs.images),[draft.text,prefs.images])
  const statistics = useMemo(() => counts(draft.text),[draft.text])
  const dirty = draft.remote?.savedRev !== draft.rev
  const disabled = !ready
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online',update)
    window.addEventListener('offline',update)
    return () => {window.removeEventListener('online',update);window.removeEventListener('offline',update)}
  },[])
  useEffect(() => {
    if (!session) return
    const timer = setTimeout(() => {
      setSession(current => current === session ? undefined : current)
      setError('Google authorization expired. Reconnect to save to Drive.')
    },Math.max(0,session.expires-Date.now()))
    return () => clearTimeout(timer)
  },[session])
  useEffect(() => {
    if (destination) dialog.current?.showModal()
    else dialog.current?.close()
  },[destination])
  useEffect(() => {
    if (comparison) compareDialog.current?.showModal()
    else compareDialog.current?.close()
  },[comparison])
  function preferences(values:Partial<Preferences>) {
    change(s => ({...s,prefs:{...s.prefs,...values}}))
  }
  function append(d:Draft) {
    change(s => ({...s,active:d.id,drafts:[...s.drafts,d]}))
  }
  function update(id:string,edit:(previous:Draft)=>Draft) {
    change(s => ({...s,drafts:s.drafts.map(d => d.id === id ? edit(d) : d)}))
  }
  function message(error:unknown,used?:Session) {
    if (error instanceof DriveError && error.status === 401) setSession(current => current === used ? undefined : current)
    setError(error instanceof Error ? error.message : 'The operation failed. Try again.')
  }
  async function connect() {
    setError('')
    setConnecting(true)
    try {
      // Keep popup launch in the direct button gesture after the script is ready.
      if (!identityReady) {
        await prepareIdentity()
        setIdentityReady(true)
        setNotice('Google authorization is ready. Choose your Google account to continue.')
      } else {
        setNotice('')
        const token = await requestToken()
        setSession(await authorize(token))
      }
    } catch (error) {message(error)}
    finally {setConnecting(false)}
  }
  async function importLocal(file?:File) {
    if (!file) return
    setError('')
    try {
      if (!supported(file.name)) throw new Error('Choose a .md or .markdown file.')
      append(fresh(file.name,decode(await file.arrayBuffer())))
    } catch (error) {message(error)}
  }
  async function fromDrive() {
    if (!session || picking) return
    const used = session
    setError('')
    setPicking(true)
    try {
      const id = await pick(used)
      if (!id) return
      const found = latest.current.drafts.find(d => (d.remote?.id === id && d.remote.account === used.account) || (d.pending?.id === id && d.pending.account === used.account))
      if (found) {
        change(s => ({...s,active:found.id}))
        return
      }
      const opened = await openFile(used,id)
      append({...fresh(opened.meta.name,opened.text),remote:associate(opened.meta,used,0)})
    } catch (error) {message(error,used)}
    finally {setPicking(false)}
  }
  function cloud(target:Draft, name?:string) {
    if (!session || !online || queue.has(target.id)) return
    const used = session
    setError('')
    setDestination(false)
    setSaving(ids => [...ids,target.id])
    setFailed(ids => ids.filter(id => id !== target.id))
    void queue.run(target.id,async () => {
      try {
        if (name !== undefined) {
          if (!target.remote) return
          const result = await renameFile(used,target.remote,name)
          update(target.id,current => ({...current,name:result.name,
            remote:associate(result,used,target.remote!.savedRev,target.remote!.savedAt)}))
        } else {
          await saveDraft(used,target,{update,flush})
        }
        setConflicts(ids => ids.filter(id => id !== target.id))
      } catch (error) {
        message(error,used)
        setFailed(ids => [...new Set([...ids,target.id])])
        if (error instanceof ConflictError && (target.remote || latest.current.drafts.find(d => d.id === target.id)?.pending)) {
          setConflicts(ids => [...new Set([...ids,target.id])])
        }
      } finally {
        setSaving(ids => ids.filter(id => id !== target.id))
      }
    })
  }
  async function compare() {
    const association = draft.remote ?? draft.pending
    if (!session || !association) return
    const used = session
    try {
      requireAccount(used,association)
      const remote = await openFile(used,association.id)
      if (!draft.remote && remote.meta.appProperties?.markdownDeskCreate !== association.id) {
        throw new Error('The pending file could not be verified. Download the draft or save a separate copy.')
      }
      setComparison({draftId:draft.id,remote,account:used.account})
    } catch (error) {message(error,used)}
  }
  function reloadRemote() {
    if (!comparison || !session || session.account !== comparison.account || queue.has(comparison.draftId)) return
    const {draftId,remote} = comparison
    const current = latest.current.drafts.find(d => d.id === draftId)
    if (!current) return
    download({...current,name:'Local recovery - '+current.name})
    change(s => ({...s,active:draftId,drafts:[
      ...s.drafts.map(d => d.id === draftId ? {
        ...d,pending:undefined,name:remote.meta.name,text:remote.text,rev:d.rev+1,remote:associate(remote.meta,session,d.rev+1),
      } : d),
      fresh('Local recovery - '+current.name,current.text),
    ]}))
    setEditorEpoch(value => value+1)
    setConflicts(ids => ids.filter(id => id !== draftId))
    setFailed(ids => ids.filter(id => id !== draftId))
    setComparison(undefined)
    setError('')
  }
  function saveShortcut() {
    if (draft.remote || draft.pending) {
      if (session && sameAccount && online && !conflicts.includes(draft.id)) cloud(draft)
      else setDestination(true)
    } else setDestination(true)
  }
  useEffect(() => {
    function key(event:KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (ready) saveShortcut()
      }
    }
    window.addEventListener('keydown',key)
    return () => window.removeEventListener('keydown',key)
  })
  const savingDraft = saving.includes(draft.id)
  const conflict = conflicts.includes(draft.id)
  const sameAccount = !!session && (draft.remote?.account ?? draft.pending?.account ?? session.account) === session.account
  const canSave = sameAccount && online && !savingDraft && !conflict
  useEffect(() => {
    if (!prefs.autosave || !session || !draft.remote || !dirty || !canSave || failed.includes(draft.id) || !saved) return
    const timer = setTimeout(() => cloud(draft),1800)
    return () => clearTimeout(timer)
  })
  function chooseName(label:string,prior:string) {
    const name = window.prompt(label,prior)?.trim()
    if (!name) return
    if (!supported(name) || /[\/\\\u0000-\u001f]/.test(name)) {
      setError('Enter a valid filename ending in .md or .markdown.')
      return
    }
    return name
  }
  function copy(original = draft) {
    const name = chooseName('Name for the separate Drive copy','Copy of '+original.name)
    if (!name) return
    const fork = fresh(name,original.text)
    append(fork)
    cloud(fork)
    setComparison(undefined)
  }
  function clearDrafts() {
    if (queue.busy || picking || !window.confirm('Clear all local drafts and preferences? Download any work you need first. Drive files will be kept.')) return
    const blank = fresh()
    change(() => ({active:blank.id,drafts:[blank],prefs:defaults}))
    setConflicts([])
    setError('')
    void flush().catch(message)
  }
  function jump(heading:typeof rendered.headings[number]) {
    if (prefs.mode !== 'editor') preview.current?.querySelector('#'+heading.id)?.scrollIntoView({block:'start'})
    const view = controls.view
    if (view && prefs.mode !== 'preview') {
      const line = view.state.doc.line(Math.min(heading.line,view.state.doc.lines))
      view.dispatch({selection:{anchor:line.from},scrollIntoView:true})
      view.focus()
    }
  }
  const remoteStatus = savingDraft ? 'Saving to Drive…' : conflict ? 'Conflict' :
    !online ? 'Offline' : (draft.remote || draft.pending) && !sameAccount ? 'Reconnect required' :
    failed.includes(draft.id) ? 'Drive save failed' :
    draft.remote && !dirty && draft.remote.savedAt ? 'Saved to Drive' :
    draft.remote && !dirty ? 'Opened from Drive' :
    draft.remote || draft.pending ? 'Unsaved Drive changes' : 'Local document'
  return <div className="app" data-theme={prefs.theme}>
    <header className="top">
      <div className="brand"><span aria-hidden="true" className="mark">M↓</span> Markdown Desk</div>
      <div className="drive-actions">
        <span className="connection"><i className={session?'connected':''}/>{session?'Drive connected':'Drive disconnected'}</span>
        {session ? <button disabled={queue.busy||picking} onClick={() => {setSession(undefined);setComparison(undefined)}}>Disconnect</button>
          : <button disabled={!configured || connecting || queue.busy || picking || !online} onClick={() => void connect()}>{connecting?'Connecting…':identityReady?'Choose Google account':'Connect Drive'}</button>}
      </div>
    </header>
    <main>
      <aside className="rail" aria-label="Document navigation">
        <div className="rail-head"><h2>Documents</h2><button aria-label="New document" title="New document" disabled={disabled} onClick={() => append(fresh())}>＋</button></div>
        <div className="documents">{drafts.map(d => <button key={d.id} disabled={disabled} className={draft.id===d.id?'selected':''} onClick={() => change(s => ({...s,active:d.id}))} title={d.name}>{d.name}</button>)}</div>
        <div className="rail-head outline-title"><h2>Outline</h2></div>
        <nav className="outline" aria-label="Document headings">{rendered.headings.length ? rendered.headings.map(h => <button key={h.id} style={{paddingInlineStart:8+(h.level-1)*8}} onClick={() => jump(h)}>{h.title}</button>) : <p>No headings yet</p>}</nav>
        <button className="clear" disabled={disabled||queue.busy||picking} onClick={clearDrafts}>Clear local drafts</button>
      </aside>
      <section className="work" aria-label="Markdown workspace">
        <div className="filebar">
          <div className="filename"><h1 title={draft.name}>{draft.name}</h1>{draft.remote?.savedAt && <small>Drive save {new Date(draft.remote.savedAt).toLocaleString()}</small>}</div>
          <div className="file-actions">
            <button disabled={disabled} onClick={() => upload.current?.click()}>Open local</button>
            <input ref={upload} type="file" accept=".md,.markdown" hidden onChange={event => {const file=event.target.files?.[0];event.target.value='';void importLocal(file)}}/>
            <button disabled={disabled||!session||!online||picking||connecting} onClick={() => void fromDrive()}>{picking?'Opening…':'Open Drive'}</button>
            <button disabled={disabled} onClick={() => download(draft)}>Download</button>
            <button className="primary" disabled={disabled||savingDraft} onClick={saveShortcut}>{savingDraft?'Saving…':'Save'}</button>
            <details className="options"><summary aria-label="Document settings">Settings</summary><div className="popover">
              <button disabled={disabled||!session||!online||savingDraft} onClick={() => copy()}>Save a Drive copy</button>
              <button disabled={disabled||!draft.remote||!canSave} onClick={() => {const name=chooseName('Rename Drive file',draft.name);if(name) cloud(draft,name)}}>Rename Drive file</button>
              <label>Font size <input type="number" min="12" max="26" value={prefs.size} onChange={e => {const size=e.target.valueAsNumber;if(size>=12&&size<=26)preferences({size})}}/></label>
              <label><input type="checkbox" checked={prefs.wrap} onChange={e => preferences({wrap:e.target.checked})}/> Wrap lines</label>
              <label><input type="checkbox" checked={prefs.theme==='dark'} onChange={e => preferences({theme:e.target.checked?'dark':'light'})}/> Dark theme</label>
              <label><input type="checkbox" checked={prefs.autosave} onChange={e => preferences({autosave:e.target.checked})}/> Autosave Drive edits</label>
              <label><input type="checkbox" checked={prefs.images} onChange={e => {
                if (!e.target.checked || window.confirm('Load HTTPS images? Image hosts can see your IP address and request timing.')) preferences({images:e.target.checked})
              }}/> Load remote images</label>
            </div></details>
          </div>
        </div>
        {(!configured || error || notice || storageError || conflict) && <div className="messages" aria-live="polite">
          {!configured && <p>Drive setup requires a browser OAuth client ID, Picker API key and Google Cloud project number. Local editing is available.</p>}
          {notice && <p>{notice}</p>}
          {storageError && <p role="alert">{storageError}</p>}
          {error && <p role="alert">{error} <button onClick={() => setError('')}>Dismiss</button></p>}
          {conflict && <p><button disabled={!sameAccount||!online} onClick={() => void compare()}>Compare versions</button> <button disabled={!session||!online} onClick={() => copy()}>Save local copy to Drive</button></p>}
        </div>}
        <div className="toolbar" aria-label="Formatting and view">
          <div className="format">
            {tools.map(([label,before,after,placeholder]) => <button key={label} disabled={disabled||prefs.mode==='preview'} onClick={() => editorCommand(controls,'insert',before,after,placeholder)}>{label}</button>)}
            {['undo','redo','find'].map(action => <button key={action} disabled={disabled||prefs.mode==='preview'} onClick={() => editorCommand(controls,action)}>{action[0].toUpperCase()+action.slice(1)}</button>)}
          </div>
          <div className="views" aria-label="View mode">{(['editor','split','preview'] as const).map(mode => <button disabled={disabled} key={mode} aria-pressed={prefs.mode===mode} onClick={() => preferences({mode})}>{mode}</button>)}</div>
        </div>
        <div className={'panes '+prefs.mode} style={prefs.mode==='split' ? {gridTemplateColumns:'minmax(0,'+prefs.split+'fr) minmax(0,'+(100-prefs.split)+'fr)'}:undefined}>
          {!ready ? <p className="empty">Restoring local drafts…</p> : <section className="source" hidden={prefs.mode==='preview'} aria-label="Source panel" style={{fontSize:prefs.size}}>
            <Editor key={draft.id+':'+editorEpoch} controls={controls} source={draft.text} wrap={prefs.wrap} onEdit={text => update(draft.id,d => ({...d,text,rev:d.rev+1}))}/>
          </section>}
          <section className="preview" hidden={prefs.mode==='editor'} ref={preview} aria-label="Rendered preview">
            {draft.text ? <div className="prose" dangerouslySetInnerHTML={{__html:rendered.html}}/> : <p className="empty">Your Markdown preview will appear here.</p>}
          </section>
        </div>
        <footer className="status" role="status">
          <span>{saved?'Saved locally':storageError?'Local recovery unavailable':draft.text?'Unsaved local changes':'New draft'}</span>
          <span>{remoteStatus}</span>
          {prefs.mode==='split' && <label className="resize">Panel width <input aria-label="Editor panel width" type="range" min="20" max="80" value={prefs.split} onChange={e => preferences({split:e.target.valueAsNumber})}/></label>}
          <span className="counts">{statistics.words} words · {statistics.characters} characters</span>
        </footer>
      </section>
    </main>
    <dialog ref={dialog} onClose={() => setDestination(false)}>
      <h2>Save document</h2>
      <p>{draft.remote || draft.pending ? 'Use the associated Google account to save to the existing destination.' : 'Choose where to save this Markdown document.'}</p>
      <div className="dialog-actions">
        <button onClick={() => {download(draft);setDestination(false)}}>Download Markdown</button>
        <button disabled={!canSave} onClick={() => {
          if (draft.remote || draft.pending) cloud(draft)
          else {
            const name = chooseName('New Drive filename',draft.name)
            if (name) {update(draft.id,d => ({...d,name}));cloud({...draft,name})}
          }
        }}>{draft.pending?'Retry Drive creation':'Save to Drive'}</button>
        <button onClick={() => setDestination(false)}>Close</button>
      </div>
    </dialog>
    <dialog ref={compareDialog} className="compare" onClose={() => setComparison(undefined)}>
      <h2>Compare local and Drive versions</h2>
      {comparison && <><div className="comparison">
        <section><h3>Local draft</h3><pre>{drafts.find(d => d.id === comparison.draftId)?.text}</pre></section>
        <section><h3>Drive version</h3><pre>{comparison.remote.text}</pre></section>
      </div><div className="dialog-actions">
        <button disabled={!session||!online} onClick={() => {const d=latest.current.drafts.find(d=>d.id===comparison.draftId);if(d)copy(d)}}>Save local as Drive copy</button>
        <button onClick={reloadRemote}>Download local and reload Drive</button>
        <button onClick={() => setComparison(undefined)}>Close</button>
      </div></>}
    </dialog>
  </div>
}
