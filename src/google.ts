export const configuration = {
  client: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '',
  key: import.meta.env.VITE_GOOGLE_API_KEY?.trim() || '',
  project: import.meta.env.VITE_GOOGLE_PROJECT_NUMBER?.trim() || '',
}
export const configured = /\.apps\.googleusercontent\.com$/.test(configuration.client) && !!configuration.key && /^\d+$/.test(configuration.project)
const scope = 'https://www.googleapis.com/auth/drive.file'
interface TokenReply {access_token?: string; expires_in?: number; scope?: string; error?: string}
interface TokenClient {requestAccessToken(options: {prompt:string}):void}
interface Google {
  accounts: {oauth2: {initTokenClient(options: {client_id:string; scope:string; include_granted_scopes:boolean; callback:(r:TokenReply)=>void; error_callback:(r:{type:string})=>void}):TokenClient}}
  picker: {
    DocsView: new (id:string) => {setMode(mode:string):unknown}
    DocsViewMode:{LIST:string}
    ViewId:{DOCS:string}
    PickerBuilder: new () => PickerBuilder
  }
}
interface PickerBuilder {
  addView(view:unknown):this
  setOAuthToken(token:string):this
  setDeveloperKey(key:string):this
  setAppId(id:string):this
  setOrigin(origin:string):this
  setCallback(callback:(r:{action:string; docs?:{id:string}[]})=>void):this
  build():{setVisible(visible:boolean):void}
}
const globals = window as Window & {google?:Google; gapi?:{load(name:string, callbacks:{callback:()=>void; onerror:()=>void; ontimeout:()=>void; timeout:number}):void}}
const scripts = new Map<string,Promise<void>>()
function script(url:string) {
  const existing = scripts.get(url)
  if (existing) return existing
  const loading = new Promise<void>((resolve,reject) => {
    const node = document.createElement('script')
    const fail = () => {clearTimeout(timer); node.remove(); reject(new Error('Google services could not load. Check your connection and retry.'))}
    const timer = setTimeout(fail,12000)
    node.onload = () => {clearTimeout(timer); resolve()}
    node.onerror = fail
    node.src = url
    document.head.append(node)
  }).catch(error => {scripts.delete(url); throw error})
  scripts.set(url,loading)
  return loading
}
export function prepareIdentity() {return script('https://accounts.google.com/gsi/client')}
export interface Session {token:string; expires:number; account:string}
export function requestToken():Promise<Omit<Session,'account'>> {
  return new Promise((resolve,reject) => {
    const identity = globals.google?.accounts?.oauth2
    if (!identity) {
      reject(new Error('Google authorization is still loading. Try Connect again.'))
      return
    }
    const client = identity.initTokenClient({
      client_id:configuration.client, scope, include_granted_scopes:false,
      callback:reply => {
        if (!reply.access_token || !reply.scope?.split(' ').includes(scope)) {
          reject(new Error('Drive permission was declined or blocked. Check Google consent and Workspace restrictions.'))
          return
        }
        resolve({token:reply.access_token,expires:Date.now()+Number(reply.expires_in || 0)*1000})
      },
      error_callback:err => reject(new Error(err.type === 'popup_failed_to_open' ? 'Allow popups for this site and retry Connect.' : 'The authorization window was closed.'))
    })
    client.requestAccessToken({prompt:'select_account'})
  })
}
export async function pick(session:Session):Promise<string | undefined> {
  if (session.expires <= Date.now()) throw new Error('Reconnect Google Drive to continue.')
  await script('https://apis.google.com/js/api.js')
  await new Promise<void>((resolve,reject) => {
    const fail = () => reject(new Error('Picker could not load. Check API configuration and your connection.'))
    if (!globals.gapi) return fail()
    globals.gapi.load('picker',{callback:resolve,onerror:fail,ontimeout:fail,timeout:10000})
  })
  return new Promise((resolve) => {
    const api = globals.google!.picker
    const picker = new api.PickerBuilder()
      .addView(new api.DocsView(api.ViewId.DOCS).setMode(api.DocsViewMode.LIST))
      .setAppId(configuration.project).setDeveloperKey(configuration.key)
      .setOAuthToken(session.token).setOrigin(location.origin)
      .setCallback(result => {
        if (result.action === 'picked') resolve(result.docs?.[0]?.id)
        if (result.action === 'cancel') resolve(undefined)
      }).build()
    picker.setVisible(true)
  })
}
