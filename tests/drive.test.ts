// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest'
import {authorize,ConflictError,createFile,openFile,renameFile,updateFile} from '../src/drive'
import type {Session} from '../src/google'
import {fresh,type Draft} from '../src/model'
import {SaveQueue,saveDraft} from '../src/save'

const session:Session = {token:'mock',account:'a',expires:Date.now()+600_000}
const meta = {id:'existing',version:'2',name:'Network.md',mimeType:'text/markdown',capabilities:{canEdit:true,canRename:true}}
const remote = {id:meta.id,version:meta.version,account:session.account,savedRev:0}
const pending = {id:'reserved',account:session.account,name:'Script.md',source:'မင်္ဂလာပါ\r\n',rev:1}
const json = (data:unknown,status=200) => Response.json(data,{status})
function mock(...responses:(Response|Error)[]) {
  const fetch = vi.fn()
  for (const value of responses) {
    if (value instanceof Error) fetch.mockRejectedValueOnce(value)
    else fetch.mockResolvedValueOnce(value)
  }
  vi.stubGlobal('fetch',fetch)
  return fetch
}
afterEach(() => vi.unstubAllGlobals())
describe('Drive request behavior',() => {
  it('identifies the account from Drive without profile scopes',async () => {
    const fetch = mock(json({user:{permissionId:'a'}}))
    expect(await authorize({token:'mock',expires:session.expires})).toEqual(session)
    expect(fetch.mock.calls[0][0]).toContain('about?fields=user(permissionId)')
  })
  it('opens stable .md media with original source and rejects unsupported files',async () => {
    mock(json(meta),new Response(pending.source),json(meta))
    expect(await openFile(session,'existing')).toEqual({meta,text:pending.source})
    const fetch = mock(json({...meta,name:'Notes.txt'}))
    await expect(openFile(session,'existing')).rejects.toThrow('UTF-8')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('updates and renames only the associated file ID',async () => {
    const fetch = mock(json(meta),json({...meta,version:'3'}),json({...meta,version:'3'}),json({...meta,version:'4',name:'Renamed.md'}))
    await updateFile(session,remote,pending.source)
    await renameFile(session,{...remote,version:'3'},'Renamed.md')
    expect(fetch.mock.calls[1][0]).toContain('/upload/drive/v3/files/existing?')
    expect(fetch.mock.calls[1][1].body).toBe(pending.source)
    expect(fetch.mock.calls[3][0]).toContain('/drive/v3/files/existing?')
  })
  it('blocks a different account, remote versions, lack of write permission and missing files',async () => {
    const fetch = mock()
    await expect(updateFile({...session,account:'b'},remote,'updated')).rejects.toThrow('different Google account')
    expect(fetch).not.toHaveBeenCalled()
    mock(json({...meta,version:'3'}))
    await expect(updateFile(session,remote,'updated')).rejects.toBeInstanceOf(ConflictError)
    mock(json({...meta,capabilities:{canEdit:false}}))
    await expect(updateFile(session,remote,'updated')).rejects.toThrow('lacks permission')
    mock(new Response(null,{status:404}))
    await expect(updateFile(session,remote,'updated')).rejects.toMatchObject({status:404})
    mock(new Response(null,{status:403}))
    await expect(updateFile(session,remote,'updated')).rejects.toMatchObject({status:403})
  })
  it('reconciles an uncertain create by verifying the same reserved ID and source',async () => {
    const existing = {...meta,id:pending.id,name:pending.name,appProperties:{markdownDeskCreate:pending.id}}
    const fetch = mock(new Error('network lost'),new Response(null,{status:409}),json(existing),new Response(pending.source),json(existing))
    await expect(createFile(session,pending)).rejects.toThrow('did not confirm')
    expect(await createFile(session,pending)).toEqual(existing)
    for (const call of fetch.mock.calls.slice(0,2)) expect(await call[1].body.text()).toContain('"id":"reserved"')
    expect(fetch.mock.calls[2][0]).toContain('/drive/v3/files/reserved?')
    mock(new Response(null,{status:409}),json(existing),new Response('different'),json(existing))
    await expect(createFile(session,pending)).rejects.toBeInstanceOf(ConflictError)
  })
})
describe('save coordination',() => {
  it('does not send create until the pending request is locally committed',async () => {
    const fetch = mock(json({ids:[pending.id]}))
    let draft = fresh()
    await expect(saveDraft(session,draft,{
      update:(_,edit) => {draft=edit(draft)},
      flush:() => Promise.reject(new Error('quota'))
    })).rejects.toThrow('quota')
    expect(draft.pending?.id).toBe(pending.id)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('deduplicates a save for one draft while allowing another draft to proceed',async () => {
    const queue = new SaveQueue()
    let finish!:()=>void
    const hold = new Promise<void>(resolve => {finish=resolve})
    const write = vi.fn(() => hold)
    const first = queue.run('one',write)
    expect(queue.run('one',write)).toBe(first)
    await queue.run('two',async () => {})
    expect(queue.has('one')).toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
    finish()
    await first
    expect(queue.busy).toBe(false)
  })
  it('preserves newer edits, another active draft and source through expiry and failed save',async () => {
    let draft:Draft = {...fresh(meta.name,'original'),rev:1,remote}
    const other = fresh('Other.md','other content')
    let active = draft.id
    const adapter = {
      update: (id:string,edit:(value:Draft)=>Draft) => {expect(id).toBe(draft.id); draft = edit(draft)},
      flush: async () => {}
    }
    mock(new Response(null,{status:401}))
    await expect(saveDraft(session,draft,adapter)).rejects.toMatchObject({status:401})
    expect(draft.text).toBe('original')
    mock(json(meta),new Response(null,{status:503}))
    await expect(saveDraft(session,draft,adapter)).rejects.toMatchObject({status:503})
    expect(draft.remote).toEqual(remote)
    mock(json(meta),json({...meta,version:'3'}))
    const saving = saveDraft({...session,token:'replacement'},draft,adapter)
    draft = {...draft,rev:2,text:'newer'}
    active = other.id
    await saving
    expect(draft.text).toBe('newer')
    expect(draft.remote?.savedRev).toBe(1)
    expect(active).toBe(other.id)
  })
})
