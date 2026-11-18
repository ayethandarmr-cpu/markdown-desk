import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'

export function RBtn(p: {
  icon: LucideIcon; label: string; onClick?: () => void; active?: boolean; disabled?: boolean
  big?: boolean; shortcut?: string; showLabel?: boolean; testId?: string
}) {
  const Icon = p.icon
  const tip = p.shortcut ? `${p.label} (${p.shortcut})` : p.label
  return (
    <button
      type="button"
      className={`rbtn${p.big ? ' rbtn-big' : ''}${p.active ? ' is-active' : ''}${p.showLabel ? ' with-label' : ''}`}
      onMouseDown={e => e.preventDefault()}
      onClick={p.onClick}
      disabled={p.disabled}
      aria-pressed={p.active === undefined ? undefined : p.active}
      aria-label={p.label}
      title={tip}
      data-testid={p.testId}
    >
      <Icon size={p.big ? 22 : 16} strokeWidth={1.75} />
      {(p.big || p.showLabel) && <span>{p.label}</span>}
    </button>
  )
}

export function Group(p: { label: string; children: ReactNode }) {
  return (
    <div className="rgroup" role="group" aria-label={p.label}>
      <div className="rgroup-body">{p.children}</div>
      <div className="rgroup-label">{p.label}</div>
    </div>
  )
}

export function Popover(p: { trigger: (open: () => void, isOpen: boolean) => ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="popover-anchor" ref={ref}>
      {p.trigger(() => setOpen(o => !o), open)}
      {open && <div className="popover" role="dialog">{p.children(() => setOpen(false))}</div>}
    </div>
  )
}

export function Modal(p: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [p])
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) p.onClose() }}>
      <div className={`modal${p.wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={p.title}>
        <header>
          <h2>{p.title}</h2>
          <button type="button" className="icon-btn" onClick={p.onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="modal-body">{p.children}</div>
        {p.footer && <footer>{p.footer}</footer>}
      </div>
    </div>
  )
}
