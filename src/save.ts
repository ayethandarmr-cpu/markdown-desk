import { associate, createFile, reservedId, updateFile } from './drive'
import type { Session } from './google'
import type { Draft, Pending } from './model'

export class SaveQueue {
  private running = new Map<string,Promise<void>>()
  has(id:string) {return this.running.has(id)}
  get busy() {return this.running.size > 0}
  run(id:string,save:()=>Promise<void>) {
    const existing = this.running.get(id)
    if (existing) return existing
    const task = Promise.resolve().then(save).finally(() => this.running.delete(id))
    this.running.set(id,task)
    return task
  }
}
export interface SaveWorkspace {
  update(id:string,update:(draft:Draft)=>Draft):void
  flush():Promise<void>
}
export async function saveDraft(session:Session,draft:Draft,workspace:SaveWorkspace) {
  if (draft.remote) {
    const result = await updateFile(session,draft.remote,draft.text)
    workspace.update(draft.id,current => ({...current,remote:associate(result,session,draft.rev,new Date().toISOString())}))
    return
  }
  const pending:Pending = draft.pending || {
    id:await reservedId(session),account:session.account,name:draft.name,source:draft.text,rev:draft.rev,
  }
  workspace.update(draft.id,current => ({...current,pending}))
  // If recovery storage fails, do not send a create that cannot be reconciled after a reload.
  await workspace.flush()
  const result = await createFile(session,pending)
  workspace.update(draft.id,current => ({
    ...current,pending:undefined,name:result.name,
    remote:associate(result,session,pending.rev,new Date().toISOString()),
  }))
}
