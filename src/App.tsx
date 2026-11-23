import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  Save, Undo2, Redo2, Search, Cloud, CloudOff, CloudUpload, Check, AlertCircle, Loader2, Bold, Italic,
  Underline, Strikethrough, Code, Highlighter, Link2, NotebookPen, PencilLine,
} from 'lucide-react'
import { buildExtensions } from './editor/extensions'
import { Ribbon, type Tab } from './ui/Ribbon'
import { Backstage } from './ui/Backstage'
import { NavPane, FindBar, StatusBar } from './ui/Panels'
import { Modal } from './ui/controls'
import { driveConfigured, preloadIdentity, requestToken, openPicker, type Token } from './google'
import {
  whoAmI, readFile, createFile, updateFile, renameFile, listRecent, withMdExtension,
  resolvePath, getFile, isMarkdownName, FOLDER_MIME,
  ConflictError, DriveError, type DriveFile, type DriveUser,
} from './drive'
import { setImageContext } from './editor/images'
import { suggestReplace, resolveAll, changesForAI } from './editor/suggest'
import { tidyMarkdown, fixLooseEmphasis, slugify, baseName, download, escapeHtml, loadState, saveState, defaultPrefs, type Prefs, type PinnedFolder } from './util'
import { WELCOME } from './welcome'

interface DocMeta {
  name: string
  driveId?: string
  version?: string
  folderId?: string
  webViewLink?: string
  savedText: string
}
type Dialog =
  | { kind: 'link' } | { kind: 'image' } | { kind: 'rename' }
  | { kind: 'conflict'; remote: DriveFile }
  | { kind: 'discard'; then: () => void }
  | null
type SaveStatus = 'idle' | 'saving' | 'error'

const initial = loadState()
const initialDoc: DocMeta = initial.draft
  ? { name: initial.draft.name, driveId: initial.draft.driveId, version: initial.draft.version, folderId: initial.draft.folderId, savedText: initial.draft.savedText ?? '' }
  : { name: 'Welcome.md', savedText: '' }
const initialMarkdown = initial.draft?.markdown ?? WELCOME
const isFirstRun = !initial.draft
const narrow = typeof window !== 'undefined' && window.innerWidth < 900

export default function App() {
  const [prefs, setPrefsState] = useState<Prefs>({ ...defaultPrefs, ...initial.prefs, ...(narrow ? { nav: false, ribbon: initial.prefs?.ribbon ?? false } : {}) })
  const setPrefs = useCallback((p: Partial<Prefs>) => setPrefsState(cur => ({ ...cur, ...p })), [])
  const [doc, setDocState] = useState<DocMeta>(initialDoc)
  const docRef = useRef(doc)
  const setDoc = useCallback((d: DocMeta | ((d: DocMeta) => DocMeta)) => {
    setDocState(cur => { const next = typeof d === 'function' ? d(cur) : d; docRef.current = next; return next })
  }, [])
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [sourceText, setSourceText] = useState(initialMarkdown)
  const [tab, setTab] = useState<Tab>('home')
  const [backstage, setBackstage] = useState(false)
  const [pins, setPinsState] = useState<PinnedFolder[]>(initial.pins ?? [])
  const setPins = (next: PinnedFolder[]) => { setPinsState(next); saveState({ pins: next }) }
  const [find, setFind] = useState<{ replace: boolean } | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [toast, setToast] = useState<{ text: string; tone?: 'error' | 'ok'; action?: { label: string; run: () => void } } | null>(null)
  // Sign-in survives a page refresh: a still-valid token is reused, and a known account
  // gets a new token without the account chooser.
  const savedToken = initial.auth?.token && initial.auth.token.expires > Date.now() ? initial.auth.token : null
  const [token, setTokenState] = useState<Token | null>(savedToken)
  const tokenRef = useRef<Token | null>(savedToken)
  const [user, setUserState] = useState<DriveUser | undefined>(initial.auth?.user)
  const userRef = useRef<DriveUser | undefined>(initial.auth?.user)
  const setToken = (t: Token | null) => {
    tokenRef.current = t; setTokenState(t)
    saveState({ auth: userRef.current ? { user: userRef.current, token: t ?? undefined } : null })
  }
  const setUser = (u: DriveUser | undefined) => {
    userRef.current = u; setUserState(u)
    saveState({ auth: u ? { user: u, token: tokenRef.current ?? undefined } : null })
  }
  const [recent, setRecent] = useState<DriveFile[]>()
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const savingRef = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const sourceRef = useRef(sourceText)
  sourceRef.current = sourceText

  const extensions = useMemo(() => buildExtensions(), [])
  const editor = useEditor({
    extensions,
    content: initialMarkdown,
    contentType: 'markdown',
    editorProps: { attributes: { class: 'doc', 'aria-label': 'Document', 'data-testid': 'editor' } },
    onUpdate: ({ editor: e }) => scheduleSync(e),
  })

  // --- markdown sync (debounced) ---
  const syncTimer = useRef<number>(0)
  const scheduleSync = (e: Editor) => {
    clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(() => setMarkdown(tidyMarkdown(e.getMarkdown())), 250)
  }
  const currentMarkdown = useCallback(() => {
    if (prefsRef.current.view === 'source') return sourceRef.current
    return editor ? tidyMarkdown(editor.getMarkdown()) : ''
  }, [editor])
  const loadIntoEditor = useCallback((md: string) => {
    editor?.commands.setContent(fixLooseEmphasis(md), { contentType: 'markdown', emitUpdate: false })
    editor?.commands.setTextSelection(1)
    const tidy = editor ? tidyMarkdown(editor.getMarkdown()) : md
    setMarkdown(tidy)
    setSourceText(tidy)
    return tidy
  }, [editor])

  // The welcome document starts out "clean" so it doesn't nag about saving.
  useEffect(() => {
    if (editor && isFirstRun) setDoc(d => (d.savedText ? d : { ...d, savedText: tidyMarkdown(editor.getMarkdown()) }))
  }, [editor, setDoc])
  useEffect(() => { if (editor && isFirstRun) setMarkdown(tidyMarkdown(editor.getMarkdown())) }, [editor])

  const dirty = markdown !== doc.savedText

  // Relative images (e.g. images/a.png) load from the Drive folder that holds the document.
  useEffect(() => { setImageContext({ folderId: doc.folderId, token: () => tokenRef.current }) }, [doc.folderId, token])

  // --- persistence ---
  useEffect(() => { saveState({ prefs }) }, [prefs])
  useEffect(() => {
    const t = setTimeout(() => saveState({ draft: { markdown, name: doc.name, driveId: doc.driveId, version: doc.version, savedText: doc.savedText, folderId: doc.folderId } }), 400)
    return () => clearTimeout(t)
  }, [markdown, doc])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (markdown !== docRef.current.savedText && !docRef.current.driveId) e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [markdown])
  useEffect(() => { document.title = `${dirty ? '• ' : ''}${baseName(doc.name)} — Markdown Desk` }, [doc.name, dirty])

  // --- theme ---
  useEffect(() => {
    const root = document.documentElement
    if (prefs.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', prefs.theme)
  }, [prefs.theme])
  useEffect(() => {
    if (editor) editor.view.dom.setAttribute('spellcheck', String(prefs.spellcheck))
  }, [editor, prefs.spellcheck])

  // --- source view switching ---
  const prevView = useRef(prefs.view)
  useEffect(() => {
    if (!editor) return
    if (prefs.view === 'source' && prevView.current !== 'source') {
      setSourceText(tidyMarkdown(editor.getMarkdown()))
    } else if (prefs.view !== 'source' && prevView.current === 'source') {
      editor.commands.setContent(sourceRef.current, { contentType: 'markdown', emitUpdate: false })
      setMarkdown(tidyMarkdown(editor.getMarkdown()))
    }
    prevView.current = prefs.view
  }, [prefs.view, editor])

  // --- toasts ---
  const notify = useCallback((text: string, tone?: 'error' | 'ok', action?: { label: string; run: () => void }) => {
    setToast({ text, tone, action })
  }, [])
  useEffect(() => {
    if (!toast || toast.action) return
    const t = setTimeout(() => setToast(null), toast.tone === 'error' ? 7000 : 3500)
    return () => clearTimeout(t)
  }, [toast])
  const fail = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    if (err instanceof DriveError && err.status === 401) {
      setToken(null)
      notify(msg, 'error', { label: 'Sign in', run: () => { setToast(null); void ensureToken(true) } })
    } else notify(msg, 'error')
  }, [notify])

  // --- Google auth ---
  useEffect(() => { if (driveConfigured) preloadIdentity().catch(() => {}) }, [])
  const ensureToken = useCallback(async (force = false): Promise<Token> => {
    const cur = tokenRef.current
    if (cur && cur.expires > Date.now() && !force) return cur
    if (!driveConfigured) throw new Error('Google Drive is not configured for this site.')
    const t = await requestToken(user ? '' : 'select_account', user?.emailAddress)
    const me = await whoAmI(t)
    setUser(me)
    setToken(t)
    return t
  }, [user])
  const refreshRecent = useCallback(async () => {
    const t = tokenRef.current
    if (!t) return
    setLoadingRecent(true)
    try { setRecent(await listRecent(t)) } catch (e) { fail(e) } finally { setLoadingRecent(false) }
  }, [fail])
  useEffect(() => { if (token && backstage && !recent) void refreshRecent() }, [token, backstage, recent, refreshRecent])
  const signIn = async () => {
    try { await ensureToken(true); notify('Signed in to Google Drive', 'ok'); void refreshRecent() } catch (e) { fail(e) }
  }
  const signOut = () => { setUser(undefined); setToken(null); setRecent(undefined); notify('Signed out') }

  // --- guard for replacing the current doc ---
  const guard = (then: () => void) => {
    if (currentMarkdown() !== docRef.current.savedText) setDialog({ kind: 'discard', then })
    else then()
  }

  const newDoc = () => guard(() => {
    setDoc({ name: 'Untitled.md', savedText: '' })
    loadIntoEditor('')
    editor?.commands.focus()
  })

  const openDriveFile = async (id: string) => {
    try {
      const t = await ensureToken()
      setSaveStatus('saving')
      const { file, text } = await readFile(t, id)
      setImageContext({ folderId: file.parents?.[0], token: () => tokenRef.current })
      const tidy = loadIntoEditor(text)
      setDoc({ name: file.name, driveId: file.id, version: file.version, folderId: file.parents?.[0], webViewLink: file.webViewLink, savedText: tidy })
      setBackstage(false)
      notify(`Opened ${file.name}`, 'ok')
    } catch (e) { fail(e) } finally { setSaveStatus('idle') }
  }
  const openFromDrive = () => guard(async () => {
    try {
      const t = await ensureToken()
      const picked = await openPicker(t, 'file')
      if (picked) await openDriveFile(picked.id)
    } catch (e) { fail(e) }
  })
  const openRecent = (f: DriveFile) => guard(() => void openDriveFile(f.id))

  // --- suggested edits (track changes) ---
  const [suggest, setSuggest] = useState<{ from: number; to: number; text: string } | null>(null)
  const startSuggest = () => {
    if (!editor) return
    const { from, to, empty } = editor.state.selection
    if (empty) { notify('Select the text you want to change first.'); return }
    setSuggest({ from, to, text: editor.state.doc.textBetween(from, to, '\n') })
  }
  const applySuggest = (text: string) => {
    if (!editor || !suggest) return
    editor.commands.setTextSelection({ from: suggest.from, to: suggest.to })
    suggestReplace(editor, text)
    setSuggest(null)
    editor.commands.focus()
  }
  const acceptReject = (accept: boolean) => {
    if (!editor) return
    const n = resolveAll(editor, accept)
    notify(n ? `${accept ? 'Accepted' : 'Rejected'} ${n} change${n === 1 ? '' : 's'}` : 'There are no suggested changes.', n ? 'ok' : undefined)
  }
  const copyChangesForAI = async () => {
    const md = currentMarkdown()
    if (!/<(del|ins)>/.test(md)) { notify('There are no suggested changes to copy.'); return }
    try {
      await navigator.clipboard.writeText(changesForAI(md, doc.name))
      notify('Copied the changed paragraphs. Paste them into your AI chat.', 'ok')
    } catch { notify('Could not copy to the clipboard.', 'error') }
  }

  // --- pinned folders: one click opens the Picker inside a favourite folder ---
  const addPin = (pin: PinnedFolder) => {
    if (pins.some(x => x.id === pin.id)) { notify(`“${pin.name}” is already pinned.`); return }
    setPins([...pins, pin])
    notify(`Pinned “${pin.name}”`, 'ok')
  }
  const pinCurrentFolder = async () => {
    const id = docRef.current.folderId
    if (!id) return
    try {
      const t = await ensureToken()
      const f = await getFile(t, id)
      addPin({ id, name: f.name || 'My Drive' })
    } catch (e) { fail(e) }
  }
  const pinPickedFolder = async () => {
    try {
      const t = await ensureToken()
      const picked = await openPicker(t, 'folder')
      if (!picked) return
      const name = picked.name || (await getFile(t, picked.id)).name
      addPin({ id: picked.id, name })
    } catch (e) { fail(e) }
  }
  const openPinned = async (pin: PinnedFolder) => {
    try {
      const t = await ensureToken()
      const picked = await openPicker(t, 'file', pin.id)
      if (picked) guard(() => void openDriveFile(picked.id))
    } catch (e) { fail(e) }
  }

  // --- following links (Ctrl/Cmd+click, like Word) ---
  const followLink = async (href: string) => {
    if (!editor) return
    if (href.startsWith('#')) {
      const target = slugify(decodeURIComponent(href.slice(1)))
      let found = -1
      editor.state.doc.descendants((n, pos) => {
        if (found < 0 && n.type.name === 'heading' && slugify(n.textContent) === target) found = pos
        return found < 0
      })
      if (found < 0) { notify('That heading is not in this document.', 'error'); return }
      ;(editor.view.nodeDOM(found) as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) { window.open(href, '_blank', 'noopener,noreferrer'); return }
    const folderId = docRef.current.folderId
    if (!folderId) { notify('Links to other files work when the document is opened from Google Drive.', 'error'); return }
    try {
      const t = await ensureToken()
      const hit = await resolvePath(t, folderId, href)
      if (!hit) { notify(`Could not find ${decodeURIComponent(href)} next to this document in Drive.`, 'error'); return }
      if (hit.mimeType === FOLDER_MIME) {
        const picked = await openPicker(t, 'file', hit.id)
        if (picked) guard(() => void openDriveFile(picked.id))
      } else if (hit.mimeType.startsWith('text/') || isMarkdownName(href.split(/[?#]/)[0])) {
        guard(() => void openDriveFile(hit.id))
      } else {
        const f = await getFile(t, hit.id)
        if (f.webViewLink) window.open(f.webViewLink, '_blank', 'noopener,noreferrer')
      }
    } catch (e) { fail(e) }
  }
  const followRef = useRef(followLink)
  followRef.current = followLink
  useEffect(() => {
    const dom = editor?.view.dom
    if (!dom) return
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
    const linkAt = (e: Event) => (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    const onClick = (e: MouseEvent) => {
      const a = linkAt(e)
      if (!a || !(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      e.stopPropagation()
      void followRef.current(a.getAttribute('href') || '')
    }
    const onOver = (e: MouseEvent) => {
      const a = linkAt(e)
      if (a && !a.title) a.title = `${a.getAttribute('href')}\n${isMac ? '⌘' : 'Ctrl'}+Click to follow link`
    }
    dom.addEventListener('click', onClick, true)
    dom.addEventListener('mouseover', onOver)
    return () => { dom.removeEventListener('click', onClick, true); dom.removeEventListener('mouseover', onOver) }
  }, [editor])
  const openLocal = () => guard(() => fileInput.current?.click())
  const readLocalFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      let text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
      setImageContext({ token: () => tokenRef.current })
      loadIntoEditor(text)
      setDoc({ name: withMdExtension(file.name), savedText: '' })
      notify(`Opened ${file.name} from this device. Save to put it in Google Drive.`, 'ok')
    } catch { notify('That file is not UTF-8 text.', 'error') }
  }

  // --- saving ---
  const save = useCallback(async (opts: { copy?: boolean; chooseFolder?: boolean; overwrite?: boolean; quiet?: boolean } = {}) => {
    if (savingRef.current) return
    const text = currentMarkdown()
    if (!driveConfigured) {
      download(withMdExtension(docRef.current.name), text, 'text/markdown;charset=utf-8')
      setDoc(d => ({ ...d, savedText: text }))
      notify('Downloaded. (Google Drive is not configured for this site.)')
      return
    }
    savingRef.current = true
    setSaveStatus('saving')
    try {
      const t = await ensureToken()
      const d = docRef.current
      let file: DriveFile
      if (d.driveId && !opts.copy) {
        file = await updateFile(t, d.driveId, text, opts.overwrite ? undefined : d.version)
      } else {
        let folderId = opts.copy ? undefined : d.folderId
        if (opts.chooseFolder) {
          const picked = await openPicker(t, 'folder')
          if (!picked) { setSaveStatus('idle'); return }
          folderId = picked.id
        }
        const name = opts.copy ? `${baseName(d.name)} (copy).md` : d.name
        file = await createFile(t, name, text, folderId)
        if (!opts.quiet) notify(`Saved “${file.name}” to Google Drive`, 'ok')
      }
      setDoc(cur => ({ ...cur, name: file.name, driveId: file.id, version: file.version, folderId: file.parents?.[0] ?? cur.folderId, webViewLink: file.webViewLink ?? cur.webViewLink, savedText: text }))
      setRecent(undefined)
      setSaveStatus('idle')
    } catch (e) {
      setSaveStatus('error')
      if (e instanceof ConflictError) setDialog({ kind: 'conflict', remote: e.remote })
      else fail(e)
    } finally {
      savingRef.current = false
    }
  }, [currentMarkdown, ensureToken, fail, notify, setDoc])

  // AutoSave for Drive-linked documents
  useEffect(() => {
    if (!prefs.autosave || !doc.driveId || !token || !dirty || saveStatus === 'error' || dialog) return
    const t = setTimeout(() => void save({ quiet: true }), 2000)
    return () => clearTimeout(t)
  }, [prefs.autosave, doc.driveId, token, dirty, markdown, saveStatus, dialog, save])

  const rename = async (name: string) => {
    const finalName = withMdExtension(name)
    setDialog(null)
    if (doc.driveId) {
      try {
        const t = await ensureToken()
        const f = await renameFile(t, doc.driveId, finalName)
        setDoc(d => ({ ...d, name: f.name, version: f.version }))
        notify(`Renamed to ${f.name}`, 'ok')
      } catch (e) { fail(e) }
    } else setDoc(d => ({ ...d, name: finalName }))
  }

  const downloadMd = () => download(withMdExtension(doc.name), currentMarkdown(), 'text/markdown;charset=utf-8')
  const downloadHtml = () => {
    if (!editor) return
    if (prefs.view === 'source') editor.commands.setContent(sourceText, { contentType: 'markdown', emitUpdate: false })
    download(`${baseName(doc.name)}.html`, exportHtml(baseName(doc.name), editor.getHTML()), 'text/html;charset=utf-8')
  }
  const print = () => {
    if (prefs.view === 'source') setPrefs({ view: 'print' })
    setTimeout(() => window.print(), 100)
  }

  // --- keyboard shortcuts ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); void save({ copy: e.shiftKey }) }
      else if (k === 'o') { e.preventDefault(); setBackstage(true) }
      else if (k === 'f' && !e.shiftKey) { e.preventDefault(); if (prefs.view !== 'source') setFind({ replace: false }) }
      else if (k === 'h' && !e.shiftKey) { e.preventDefault(); if (prefs.view !== 'source') setFind({ replace: true }) }
      else if (k === 'k') { e.preventDefault(); if (prefs.view !== 'source') setDialog({ kind: 'link' }) }
      else if (k === 'p') { e.preventDefault(); print() }
      else if (e.altKey && k === 'n') { e.preventDefault(); newDoc() }
      else if (k === 'f1') { e.preventDefault(); setPrefs({ ribbon: !prefs.ribbon }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // drag & drop a local .md file
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
    const drop = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0]
      if (f && /\.(md|markdown|txt)$/i.test(f.name)) { e.preventDefault(); guard(() => void readLocalFile(f)) }
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  })

  if (!editor) return null

  const linked = !!doc.driveId
  const statusChip = saveStatus === 'saving'
    ? { icon: <Loader2 size={14} className="spin" />, text: 'Saving…' }
    : saveStatus === 'error'
      ? { icon: <AlertCircle size={14} />, text: 'Not saved' }
      : dirty
        ? { icon: linked ? <CloudUpload size={14} /> : <CloudOff size={14} />, text: linked ? (prefs.autosave && token ? 'Saving soon…' : 'Unsaved changes') : 'Not saved to Drive' }
        : { icon: linked ? <Check size={14} /> : <Cloud size={14} />, text: linked ? 'Saved to Drive' : 'Draft' }
  const driveLabel = !driveConfigured ? 'Drive not configured' : user ? `Drive: ${user.emailAddress}` : 'Drive: signed out'

  return (
    <div className={`app view-${prefs.view}`} style={{ ['--zoom' as string]: prefs.zoom / 100 }}>
      <header className="titlebar">
        <div className="tb-left">
          <div className="app-mark" aria-hidden><NotebookPen size={18} /></div>
          <label className="autosave" title={linked ? 'Save changes to Google Drive automatically' : 'AutoSave works after the file is saved to Google Drive'}>
            <span>AutoSave</span>
            <input type="checkbox" role="switch" checked={prefs.autosave} onChange={e => setPrefs({ autosave: e.target.checked })} />
            <i aria-hidden />
          </label>
          <button type="button" className="tb-icon" title="Save (Ctrl+S)" onClick={() => void save()} data-testid="btn-save"><Save size={16} /></button>
          <button type="button" className="tb-icon" title="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16} /></button>
          <button type="button" className="tb-icon" title="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16} /></button>
        </div>
        <div className="tb-center">
          <button type="button" className="doc-title" onClick={() => setDialog({ kind: 'rename' })} title="Rename" data-testid="doc-title">
            <span className="doc-name">{baseName(doc.name)}</span>
            <span className={`save-chip${saveStatus === 'error' ? ' is-error' : ''}`}>{statusChip.icon}{statusChip.text}</span>
          </button>
          <button type="button" className="tb-search" onClick={() => setFind({ replace: false })} disabled={prefs.view === 'source'}>
            <Search size={14} /><span>Search</span><kbd>Ctrl F</kbd>
          </button>
        </div>
        <div className="tb-right">
          {user ? (
            <button type="button" className="avatar" title={`${user.displayName}\n${user.emailAddress}`} onClick={() => setBackstage(true)}>
              {user.photoLink ? <img src={user.photoLink} alt="" referrerPolicy="no-referrer" /> : user.displayName[0]}
            </button>
          ) : driveConfigured ? (
            <button type="button" className="btn btn-sm btn-on-dark" onClick={signIn}>Sign in</button>
          ) : null}
        </div>
      </header>

      <Ribbon editor={editor} tab={tab} setTab={setTab} onFile={() => setBackstage(true)}
        a={{ suggest: startSuggest, acceptAll: () => acceptReject(true), rejectAll: () => acceptReject(false), copyForAI: () => void copyChangesForAI(), openFile: () => setBackstage(true), find: replace => setFind({ replace }), link: () => setDialog({ kind: 'link' }), image: () => setDialog({ kind: 'image' }), prefs, setPrefs }} />

      <div className="workspace">
        {prefs.nav && prefs.view !== 'source' && <NavPane editor={editor} onClose={() => setPrefs({ nav: false })} />}
        <main className="canvas" onMouseDown={e => { if (e.target === e.currentTarget) editor.commands.focus('end') }}>
          {find && prefs.view !== 'source' && <FindBar editor={editor} replaceMode={find.replace} onClose={() => { setFind(null); editor.commands.focus() }} />}
          {prefs.view === 'source' ? (
            <div className="page page-source">
              <textarea className="source" value={sourceText} spellCheck={prefs.spellcheck} aria-label="Markdown source" data-testid="source"
                onChange={e => { setSourceText(e.target.value); setMarkdown(e.target.value) }} />
            </div>
          ) : (
            <div className="page" onMouseDown={e => { if (e.target === e.currentTarget) editor.commands.focus('end') }}>
              <EditorContent editor={editor} />
            </div>
          )}
        </main>
      </div>

      <BubbleMenu editor={editor} className="bubble" shouldShow={({ editor: e, from, to }) => !!suggest || (from !== to && !e.isActive('codeBlock') && !e.isActive('image'))}>
        {suggest ? <SuggestBox initial={suggest.text} onUpdate={applySuggest} onCancel={() => { setSuggest(null); editor.commands.focus() }} /> : <>
        <button type="button" onClick={startSuggest} className="bubble-suggest" title="Suggest an edit (old text is struck through, new text shows in orange)" data-testid="btn-suggest"><PencilLine size={15} /><span>Suggest edit</span></button>
        <span className="bubble-sep" />
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''} title="Bold"><Bold size={15} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'is-active' : ''} title="Italic"><Italic size={15} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={editor.isActive('underline') ? 'is-active' : ''} title="Underline"><Underline size={15} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={editor.isActive('strike') ? 'is-active' : ''} title="Strikethrough"><Strikethrough size={15} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={editor.isActive('code') ? 'is-active' : ''} title="Code"><Code size={15} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHighlight().run()} className={editor.isActive('highlight') ? 'is-active' : ''} title="Highlight"><Highlighter size={15} /></button>
        <span className="bubble-sep" />
        <button type="button" onClick={() => setDialog({ kind: 'link' })} className={editor.isActive('link') ? 'is-active' : ''} title="Link"><Link2 size={15} /></button>
        </>}
      </BubbleMenu>

      <StatusBar editor={editor} sourceText={sourceText} prefs={prefs} setPrefs={setPrefs} driveLabel={driveLabel} />

      <input ref={fileInput} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) void readLocalFile(f); e.target.value = '' }} />

      {backstage && (
        <Backstage
          onClose={() => setBackstage(false)} docName={doc.name} driveLinked={linked} webViewLink={doc.webViewLink}
          driveReady={driveConfigured} user={user} recent={recent} loadingRecent={loadingRecent} refreshRecent={() => void refreshRecent()}
          onNew={newDoc} onOpenDrive={openFromDrive} onOpenRecent={openRecent} onOpenLocal={openLocal}
          onSave={() => void save()} onSaveCopy={choose => void save({ copy: !!doc.driveId, chooseFolder: choose })}
          onRename={() => setDialog({ kind: 'rename' })} onDownloadMd={downloadMd} onDownloadHtml={downloadHtml} onPrint={print}
          onSignIn={signIn} onSignOut={signOut}
          pins={pins} canPinCurrent={!!doc.folderId && !pins.some(x => x.id === doc.folderId)}
          onOpenPinned={pin => void openPinned(pin)} onPinCurrent={() => void pinCurrentFolder()} onPinPick={() => void pinPickedFolder()}
          onUnpin={pin => setPins(pins.filter(x => x.id !== pin.id))} />
      )}

      {dialog?.kind === 'link' && <LinkDialog editor={editor} onClose={() => { setDialog(null); editor.commands.focus() }} />}
      {dialog?.kind === 'image' && <ImageDialog editor={editor} onClose={() => { setDialog(null); editor.commands.focus() }} />}
      {dialog?.kind === 'rename' && <RenameDialog name={baseName(doc.name)} onClose={() => setDialog(null)} onSave={rename} />}
      {dialog?.kind === 'discard' && (
        <Modal title="Unsaved changes" onClose={() => setDialog(null)} footer={<>
          <button type="button" className="btn" onClick={() => setDialog(null)}>Cancel</button>
          <button type="button" className="btn" onClick={() => { const t = dialog.then; setDialog(null); t() }}>Don't save</button>
          <button type="button" className="btn btn-primary" onClick={async () => { const t = dialog.then; setDialog(null); await save(); if (currentMarkdown() === docRef.current.savedText) t() }}>Save</button>
        </>}>
          <p>Do you want to save your changes to “{baseName(doc.name)}”?</p>
        </Modal>
      )}
      {dialog?.kind === 'conflict' && (
        <Modal title="File changed in Google Drive" onClose={() => setDialog(null)} footer={<>
          <button type="button" className="btn" onClick={() => setDialog(null)}>Cancel</button>
          <button type="button" className="btn" onClick={() => { setDialog(null); void save({ copy: true }) }}>Save as a copy</button>
          <button type="button" className="btn" onClick={() => { setDialog(null); void openDriveFile(doc.driveId!) }}>Load Drive version</button>
          <button type="button" className="btn btn-primary" onClick={() => { setDialog(null); setSaveStatus('idle'); void save({ overwrite: true }) }}>Overwrite</button>
        </>}>
          <p>“{dialog.remote.name}” was changed somewhere else after you opened it. Choose what to keep. Loading the Drive version discards your changes here.</p>
        </Modal>
      )}

      {toast && (
        <div className={`toast${toast.tone ? ` toast-${toast.tone}` : ''}`} role="status">
          <span>{toast.text}</span>
          {toast.action && <button type="button" className="link-btn" onClick={toast.action.run}>{toast.action.label}</button>}
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </div>
  )
}

function SuggestBox({ initial, onUpdate, onCancel }: { initial: string; onUpdate: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <div className="suggest-box" data-testid="suggest-box">
      <div className="suggest-old" title="Selected text (Shift+Enter adds a new line)">{initial}</div>
      <textarea ref={ref} value={text} rows={Math.min(6, Math.max(2, text.split('\n').length))} aria-label="New text"
        placeholder="Type the new text (leave empty to suggest deleting)"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onUpdate(text) }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }} />
      <div className="suggest-actions">
        <span className="suggest-hint">Enter = Update</span>
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => onUpdate(text)} data-testid="suggest-update">Update</button>
      </div>
    </div>
  )
}

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existing = (editor.getAttributes('link').href as string) || ''
  const { from, to } = editor.state.selection
  const selected = editor.state.doc.textBetween(from, to)
  const [url, setUrl] = useState(existing)
  const [text, setText] = useState(selected)
  const apply = () => {
    const href = url.trim()
    if (!href) { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onClose(); return }
    // "example.com/page" gets https://, while paths to files beside the document ("02_Next.md", "./images/") stay relative.
    const first = href.split(/[/?#]/)[0]
    const looksLikeDomain = /\.[a-z]{2,}$/i.test(first) && !/\.(md|markdown|txt|png|jpe?g|gif|svg|webp|pdf)$/i.test(first)
    const full = /^([a-z][a-z0-9+.-]*:|#|\/|\.)/i.test(href) || !looksLikeDomain ? href : `https://${href}`
    if (from === to && !existing) {
      editor.chain().focus().insertContent({ type: 'text', text: text || full, marks: [{ type: 'link', attrs: { href: full } }] }).run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: full }).run()
    }
    onClose()
  }
  return (
    <Modal title={existing ? 'Edit link' : 'Insert link'} onClose={onClose} footer={<>
      {existing && <button type="button" className="btn" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onClose() }}>Remove link</button>}
      <button type="button" className="btn" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-primary" onClick={apply}>OK</button>
    </>}>
      <form onSubmit={e => { e.preventDefault(); apply() }} className="form">
        {from === to && !existing && <label>Text to display<input value={text} onChange={e => setText(e.target.value)} /></label>}
        <label>Address<input autoFocus value={url} placeholder="https://… or 02_Chapter.md" onChange={e => setUrl(e.target.value)} /></label>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function ImageDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [src, setSrc] = useState('')
  const [alt, setAlt] = useState('')
  const apply = () => {
    if (/^https:\/\//i.test(src.trim())) editor.chain().focus().setImage({ src: src.trim(), alt }).run()
    onClose()
  }
  return (
    <Modal title="Insert picture" onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-primary" onClick={apply} disabled={!/^https:\/\//i.test(src.trim())}>Insert</button>
    </>}>
      <form onSubmit={e => { e.preventDefault(); apply() }} className="form">
        <label>Image address (https://…)<input autoFocus value={src} onChange={e => setSrc(e.target.value)} placeholder="https://example.com/picture.png" /></label>
        <label>Description (alt text)<input value={alt} onChange={e => setAlt(e.target.value)} /></label>
        <p className="form-hint">Markdown stores pictures as links, so use an image that's already online.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function RenameDialog({ name, onClose, onSave }: { name: string; onClose: () => void; onSave: (n: string) => void }) {
  const [v, setV] = useState(name)
  return (
    <Modal title="Rename" onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-primary" onClick={() => onSave(v)} disabled={!v.trim()}>Rename</button>
    </>}>
      <form onSubmit={e => { e.preventDefault(); if (v.trim()) onSave(v) }} className="form">
        <label>File name<div className="input-suffix"><input autoFocus value={v} onChange={e => setV(e.target.value)} onFocus={e => e.target.select()} /><span>.md</span></div></label>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function exportHtml(title: string, body: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
body{font:14px/1.65 "Inter","Pyidaungsu","Myanmar Text","Noto Sans Myanmar",system-ui,sans-serif;max-width:780px;margin:40px auto;padding:0 20px;color:#1f2328}
h1,h2,h3,h4{line-height:1.3;margin:1.4em 0 .5em}h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.25em}
pre{background:#f6f8fa;padding:14px;border-radius:8px;overflow:auto}code{font:.9em ui-monospace,Consolas,monospace;background:#f2f4f7;padding:.1em .35em;border-radius:4px}pre code{background:none;padding:0}
blockquote{margin:1em 0;padding:.2em 1em;border-left:4px solid #c9d4e3;color:#57606a}table{border-collapse:collapse}th,td{border:1px solid #d0d7de;padding:6px 12px}th{background:#f6f8fa}
img{max-width:100%}mark{background:#fff3a3}ul[data-type=taskList]{list-style:none;padding-left:4px}ul[data-type=taskList] li{display:flex;gap:8px}ul[data-type=taskList] p{margin:0}
</style></head><body>${body}</body></html>`
}
