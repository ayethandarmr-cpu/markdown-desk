import type { Session } from './google'
import { decode, supported, type Pending, type Remote } from './model'
const api = 'https://www.googleapis.com'
const fileFields = 'id,name,mimeType,version,trashed,capabilities(canEdit,canRename),appProperties'
export interface Metadata {
  id:string
  name:string
  mimeType:string
  version:string
  trashed?:boolean
  capabilities?:{canEdit?:boolean; canRename?:boolean}
  appProperties?:Record<string,string>
}
export class DriveError extends Error {
  constructor(public status:number, message:string) {super(message)}
}
export class ConflictError extends Error {
  constructor() {super('Drive changed since this draft was opened or saved. Compare the versions before continuing.')}
}
export function requireAccount(session:Session, association:{account:string}) {
  if (association.account !== session.account) throw new Error('This destination belongs to a different Google account. Reconnect with that account or create a separate copy.')
}
function failure(status:number) {
  const messages:Record<number,string> = {
    401:'Google authorization expired. Reconnect to continue.',
    403:'Drive denied access. Check file permissions, enabled APIs, and Workspace policy.',
    404:'Drive file was deleted, moved to Trash, or is inaccessible in this account.',
    429:'Drive rate limit reached. Try again shortly.',
  }
  return new DriveError(status,messages[status] || 'Drive request failed (HTTP ' + status + '). Try again or download a local copy.')
}
async function request(session:Pick<Session,'token'|'expires'>, path:string, options:RequestInit = {}) {
  const retryableRead = !options.method || options.method === 'GET'
  for (let attempt=0; ; attempt++) {
    if (Date.now() >= session.expires) throw failure(401)
    let response: Response
    try {
      response = await fetch(api+path,{...options,cache:'no-store',signal:AbortSignal.timeout(20000),headers:{...options.headers,Authorization:'Bearer '+session.token}})
    } catch {
      if (!retryableRead || attempt >= 2) throw new Error('Drive did not confirm the request. Check your network and retry.')
      await new Promise(resolve => setTimeout(resolve,350*2**attempt))
      continue
    }
    if (response.ok) return response
    if (!retryableRead || attempt >= 2 || ![429,500,502,503,504].includes(response.status)) throw failure(response.status)
    await new Promise(resolve => setTimeout(resolve,350*2**attempt))
  }
}
export async function authorize(token:Omit<Session,'account'>):Promise<Session> {
  const response = await request(token,'/drive/v3/about?fields=user(permissionId)')
  const account: unknown = (await response.json()).user?.permissionId
  if (typeof account !== 'string' || !account) throw new Error('Drive could not identify the authorized account. Reconnect before opening or saving files.')
  return {...token,account}
}
const filePath = (id:string) => '/drive/v3/files/'+encodeURIComponent(id)
export async function metadata(session:Session,id:string):Promise<Metadata> {
  const response = await request(session,filePath(id)+'?supportsAllDrives=true&fields='+fileFields)
  const meta:Metadata = await response.json()
  if (meta.trashed) throw failure(404)
  if (typeof meta.version !== 'string') throw new Error('Drive did not return a file version.')
  return meta
}
export async function openFile(session:Session,id:string) {
  for (let i=0;i<2;i++) {
    const before = await metadata(session,id)
    if (!supported(before.name) || before.mimeType.startsWith('application/vnd.google-apps.')) throw new Error('Select a UTF-8 .md or .markdown file.')
    const bytes = await request(session,filePath(id)+'?alt=media&supportsAllDrives=true')
    const text = decode(await bytes.arrayBuffer())
    const after = await metadata(session,id)
    if (after.version === before.version) return {meta:after,text}
  }
  throw new ConflictError()
}
export function associate(meta:Metadata,session:Session,rev:number,savedAt?:string):Remote {
  return {id:meta.id,account:session.account,version:meta.version,savedRev:rev,savedAt}
}
export async function reservedId(session:Session) {
  const response = await request(session,'/drive/v3/files/generateIds?count=1&space=drive')
  const id: unknown = (await response.json()).ids?.[0]
  if (typeof id !== 'string' || !id) throw new Error('Drive could not allocate a file ID.')
  return id
}
export async function createFile(session:Session,pending:Pending):Promise<Metadata> {
  requireAccount(session,pending)
  // Each retry uses the previously persisted Google-generated file ID.
  const boundary = 'markdown-desk-' + crypto.randomUUID()
  const mimeType = 'text/markdown'
  const meta = {id:pending.id,name:pending.name,mimeType,appProperties:{markdownDeskCreate:pending.id}}
  const body = new Blob([
    '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta),
    '\r\n--'+boundary+'\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n',
    pending.source,'\r\n--'+boundary+'--\r\n',
  ])
  try {
    const result = await request(session,'/upload/drive/v3/files?uploadType=multipart&fields='+fileFields,{
      method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body
    })
    return await result.json()
  } catch (error) {
    if (!(error instanceof DriveError) || error.status !== 409) throw error
    const existing = await openFile(session,pending.id)
    if (existing.meta.appProperties?.markdownDeskCreate !== pending.id || existing.text !== pending.source || existing.meta.name !== pending.name) throw new ConflictError()
    return existing.meta
  }
}
async function baseline(session:Session,remote:Remote, capability:'canEdit'|'canRename') {
  requireAccount(session,remote)
  const current = await metadata(session,remote.id)
  if (current.version !== remote.version) throw new ConflictError()
  if (!current.capabilities?.[capability]) throw new Error('The connected Google account lacks permission to change this file.')
}
export async function updateFile(session:Session,remote:Remote,text:string):Promise<Metadata> {
  await baseline(session,remote,'canEdit')
  const response = await request(session,'/upload'+filePath(remote.id)+'?uploadType=media&supportsAllDrives=true&fields='+fileFields,{
    method:'PATCH',headers:{'Content-Type':'text/markdown; charset=UTF-8'},body:text
  })
  return response.json()
}
export async function renameFile(session:Session,remote:Remote,name:string):Promise<Metadata> {
  await baseline(session,remote,'canRename')
  const response = await request(session,filePath(remote.id)+'?supportsAllDrives=true&fields='+fileFields,{
    method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})
  })
  return response.json()
}
