import { useEffect, useState } from 'react'
import {
  ArrowLeft, FilePlus2, FolderOpen, Save, CopyPlus, PencilLine, Download, Printer, UserRound,
  FileText, RefreshCw, HardDrive, Upload, ExternalLink, LogOut,
} from 'lucide-react'
import type { DriveFile, DriveUser } from '../drive'
import { relativeTime } from '../util'

type Pane = 'home' | 'save' | 'export' | 'account'

export interface BackstageProps {
  onClose: () => void
  docName: string
  driveLinked: boolean
  webViewLink?: string
  driveReady: boolean
  user?: DriveUser
  recent?: DriveFile[]
  loadingRecent: boolean
  refreshRecent: () => void
  onNew: () => void
  onOpenDrive: () => void
  onOpenRecent: (f: DriveFile) => void
  onOpenLocal: () => void
  onSave: () => void
  onSaveCopy: (chooseFolder: boolean) => void
  onRename: () => void
  onDownloadMd: () => void
  onDownloadHtml: () => void
  onPrint: () => void
  onSignIn: () => void
  onSignOut: () => void
}

export function Backstage(p: BackstageProps) {
  const [pane, setPane] = useState<Pane>('home')
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [p])
  const item = (id: Pane | null, Icon: typeof FileText, label: string, onClick?: () => void) => (
    <button type="button" className={`bs-nav-item${id && pane === id ? ' is-active' : ''}`}
      onClick={onClick ?? (() => id && setPane(id))}><Icon size={18} strokeWidth={1.75} /><span>{label}</span></button>
  )
  return (
    <div className="backstage" role="dialog" aria-label="File">
      <nav className="bs-nav">
        <button type="button" className="bs-back" onClick={p.onClose} aria-label="Back to document"><ArrowLeft size={20} /></button>
        {item('home', FileText, 'Home')}
        {item(null, FilePlus2, 'New', () => { p.onNew(); p.onClose() })}
        {item(null, FolderOpen, 'Open', () => setPane('home'))}
        <div className="bs-sep" />
        {item(null, Save, 'Save', () => { p.onSave(); p.onClose() })}
        {item('save', CopyPlus, 'Save a Copy')}
        {item(null, PencilLine, 'Rename', () => { p.onClose(); p.onRename() })}
        {item('export', Download, 'Export')}
        {item(null, Printer, 'Print', () => { p.onClose(); setTimeout(p.onPrint, 50) })}
        <div className="bs-spacer" />
        {item('account', UserRound, 'Account')}
      </nav>
      <main className="bs-main">
        {pane === 'home' && <>
          <h1>Good {greeting()}</h1>
          <div className="bs-cards">
            <button type="button" className="bs-card bs-card-blank" onClick={() => { p.onNew(); p.onClose() }}>
              <div className="bs-thumb"><FilePlus2 size={28} /></div><span>Blank document</span>
            </button>
            <button type="button" className="bs-card" onClick={p.onOpenDrive} disabled={!p.driveReady} data-testid="open-drive">
              <div className="bs-thumb bs-thumb-drive"><HardDrive size={28} /></div><span>Open from Google Drive</span>
            </button>
            <button type="button" className="bs-card" onClick={() => { p.onOpenLocal(); p.onClose() }}>
              <div className="bs-thumb"><Upload size={28} /></div><span>Open from this device</span>
            </button>
          </div>
          <div className="bs-section-head">
            <h2>Recent in Google Drive</h2>
            {p.user && <button type="button" className="link-btn" onClick={p.refreshRecent}><RefreshCw size={14} /> Refresh</button>}
          </div>
          {!p.driveReady && <p className="bs-muted">Google Drive isn't configured for this site yet. See <code>docs/google-cloud.md</code>.</p>}
          {p.driveReady && !p.user && (
            <div className="bs-empty">
              <p>Sign in with Google to open and save Markdown files in your Drive.</p>
              <button type="button" className="btn btn-primary" onClick={p.onSignIn}>Sign in with Google</button>
            </div>
          )}
          {p.user && (p.loadingRecent ? <p className="bs-muted">Loading…</p> :
            p.recent?.length ? (
              <ul className="bs-files">
                {p.recent.map(f => (
                  <li key={f.id}>
                    <button type="button" onClick={() => p.onOpenRecent(f)}>
                      <FileText size={18} className="bs-file-icon" />
                      <span className="bs-file-name">{f.name}</span>
                      <span className="bs-file-time">{relativeTime(f.modifiedTime)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="bs-muted">No files yet. Files you open or create here will show up in this list. Use <b>Open from Google Drive</b> to pick an existing .md file.</p>)}
        </>}

        {pane === 'save' && <>
          <h1>Save a Copy</h1>
          <div className="bs-cards">
            <button type="button" className="bs-card" disabled={!p.driveReady} onClick={() => { p.onSaveCopy(false); p.onClose() }}>
              <div className="bs-thumb bs-thumb-drive"><HardDrive size={28} /></div><span>Google Drive — My Drive</span>
            </button>
            <button type="button" className="bs-card" disabled={!p.driveReady} onClick={() => { p.onSaveCopy(true); p.onClose() }}>
              <div className="bs-thumb bs-thumb-drive"><FolderOpen size={28} /></div><span>Google Drive — choose folder…</span>
            </button>
            <button type="button" className="bs-card" onClick={() => { p.onDownloadMd(); p.onClose() }}>
              <div className="bs-thumb"><Download size={28} /></div><span>This device (.md)</span>
            </button>
          </div>
        </>}

        {pane === 'export' && <>
          <h1>Export</h1>
          <div className="bs-list">
            <button type="button" onClick={p.onDownloadMd}><Download size={20} /><div><b>Markdown (.md)</b><span>Plain text that opens anywhere.</span></div></button>
            <button type="button" onClick={p.onDownloadHtml}><Download size={20} /><div><b>Web page (.html)</b><span>Styled, self-contained page.</span></div></button>
            <button type="button" onClick={() => { p.onClose(); setTimeout(p.onPrint, 50) }}><Printer size={20} /><div><b>PDF</b><span>Use Print, then choose “Save as PDF”.</span></div></button>
          </div>
        </>}

        {pane === 'account' && <>
          <h1>Account</h1>
          {p.user ? (
            <div className="bs-account">
              {p.user.photoLink ? <img src={p.user.photoLink} alt="" referrerPolicy="no-referrer" /> : <div className="avatar-lg">{p.user.displayName[0]}</div>}
              <div><b>{p.user.displayName}</b><span>{p.user.emailAddress}</span></div>
              <button type="button" className="btn" onClick={p.onSignOut}><LogOut size={16} /> Sign out</button>
            </div>
          ) : p.driveReady
            ? <button type="button" className="btn btn-primary" onClick={p.onSignIn}>Sign in with Google</button>
            : <p className="bs-muted">Google Drive isn't configured for this site.</p>}
          {p.driveLinked && p.webViewLink && (
            <p><a href={p.webViewLink} target="_blank" rel="noopener noreferrer" className="link-btn">Open “{p.docName}” in Google Drive <ExternalLink size={14} /></a></p>
          )}
          <p className="bs-muted">This app only sees Drive files you open or create with it (Google's <code>drive.file</code> permission). Your access token stays in this tab's memory.</p>
        </>}
      </main>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}
