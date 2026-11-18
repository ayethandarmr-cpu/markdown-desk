import { useEffect, useRef, useState } from 'react'
import { defaults, fresh } from './model'
import { persist, restore, type Snapshot } from './storage'
export function useWorkspace() {
  const [snapshot,setSnapshot] = useState<Snapshot>(() => {
    const draft = fresh()
    return {active:draft.id,drafts:[draft],prefs:defaults}
  })
  const [ready,setReady] = useState(false)
  const [saved,setSaved] = useState(false)
  const [storageError,setStorageError] = useState('')
  const latest = useRef(snapshot)
  const protection = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const chain = useRef(Promise.resolve())
  function flush() {
    clearTimeout(timer.current)
    const value = latest.current
    const write = chain.current.then(async () => {
      if (!protection.current) throw new Error('Draft storage is unavailable in this tab.')
      await persist(value)
      if (latest.current === value) {setSaved(true); setStorageError('')}
    })
    chain.current = write.catch(() => {
      setStorageError('Local recovery is unavailable. Download this draft to keep a copy.')
    })
    return write
  }
  function change(update:(previous:Snapshot)=>Snapshot) {
    const next = update(latest.current)
    latest.current = next
    setSnapshot(next)
    setSaved(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {void flush().catch(() => {})},250)
  }
  useEffect(() => {
    let active = true
    let unlock:()=>void = () => {}
    async function load() {
      try {
        const restored = await restore()
        if (!active) return
        protection.current = true
        if (restored) {
          latest.current = restored
          setSnapshot(restored)
          setSaved(true)
        }
      } catch (error) {
        if (active) setStorageError(error instanceof Error ? error.message : 'Local drafts could not be loaded.')
      } finally {
        if (active) setReady(true)
      }
    }
    if (navigator.locks) {
      void navigator.locks.request('markdown-desk-workspace',{ifAvailable:true},async lock => {
        if (!active) return
        if (!lock) {
          setStorageError('Local recovery is active in another tab. Close it and reload this tab to use recovery.')
          setReady(true)
          return
        }
        const hold = new Promise<void>(resolve => {unlock = resolve})
        await load()
        await hold
      }).catch(() => {if (active) {setStorageError('Local recovery could not be locked. Download drafts to keep them.'); setReady(true)}})
    } else {
      setStorageError('This browser does not support exclusive draft recovery. Download drafts to keep them.')
      setReady(true)
    }
    return () => {active = false; unlock(); clearTimeout(timer.current)}
  },[])
  useEffect(() => {
    const warn = (event:BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = ''}
    if (ready && !saved && snapshot.drafts.some(draft => draft.text || draft.pending)) window.addEventListener('beforeunload',warn)
    return () => window.removeEventListener('beforeunload',warn)
  },[ready,saved,snapshot])
  return {snapshot,ready,saved,storageError,latest,change,flush}
}
