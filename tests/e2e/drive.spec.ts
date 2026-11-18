import {expect,test,type Page} from '@playwright/test'

test.skip(process.env.TEST_MOCK_DRIVE !== '1','Run with a build containing mock public configuration.')
const origin = 'https://www.googleapis.com'
interface DriveFile {id:string; name:string; version:string; text:string; canEdit?:boolean; appProperties?:Record<string,string>}
const sample = {id:'chosen',name:'Training.md',version:'1',text:'# Drive source\r\nမင်္ဂလာပါ'}
async function mockGoogle(page:Page) {
  const state = {account:'account-a',expired:false,failedCreate:false,creates:0,updates:[] as string[]}
  const files = new Map<string,DriveFile>([[sample.id,{...sample}]])
  await page.route('https://accounts.google.com/gsi/client',route => route.fulfill({
    contentType:'application/javascript',
    body:`window.google = {accounts:{oauth2:{initTokenClient:({callback, scope}) => ({
      requestAccessToken: () => callback({access_token:'mock-token',scope,expires_in:3600})
    })}}};`,
  }))
  await page.route('https://apis.google.com/js/api.js',route => route.fulfill({
    contentType:'application/javascript',
    body:`window.gapi = {load:(_name,handlers) => handlers.callback()};
      window.google.picker = {
        ViewId:{DOCS:'docs'}, DocsViewMode:{LIST:'list'},
        DocsView:class {
          setMode(){return this} setIncludeFolders(value){this.includeFolders=value;return this}
          setSelectFolderEnabled(value){this.selectFolders=value;return this}
        },
        PickerBuilder:class {
          addView(view){
            if (!view.includeFolders || view.selectFolders !== false) throw new Error('Picker must browse folders and select files')
            return this
          } setAppId(){return this} setDeveloperKey(){return this}
          setOAuthToken(){return this} setOrigin(){return this} setCallback(cb){this.cb=cb;return this}
          build(){return {setVisible:() => this.cb({action:'picked',docs:[{id:'chosen'}]})}}
        }
      };`,
  }))
  await page.route(origin+'/**',async route => {
    const request = route.request()
    const url = new URL(request.url())
    const cors = {'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'}
    const respond = (status:number,body?:string) => route.fulfill({status,headers:cors,body})
    const json = (value:unknown) => respond(200,JSON.stringify(value))
    if (request.method() === 'OPTIONS') return respond(204)
    if (state.expired) {state.expired=false;return respond(401)}
    if (url.pathname.endsWith('/about')) return json({user:{permissionId:state.account}})
    if (url.pathname.endsWith('/generateIds')) return json({ids:['reserved-'+(state.creates+1)]})
    if (request.method() === 'POST') {
      const parts = request.postDataBuffer()!.toString('utf8').split('\r\n\r\n')
      const newFile = JSON.parse(parts[1].split('\r\n')[0]) as DriveFile
      if (files.has(newFile.id)) return respond(409)
      const tailStart = parts.slice(2).join('\r\n\r\n')
      Object.assign(newFile,{version:'1',text:tailStart.slice(0,tailStart.lastIndexOf('\r\n--'))})
      files.set(newFile.id,newFile)
      state.creates++
      if (state.failedCreate) {state.failedCreate=false;return route.abort('failed')}
      return json(newFile)
    }
    const id = url.pathname.split('/').at(-1)!
    const file = files.get(id)
    if (!file) return respond(404)
    if (request.method() === 'PATCH') {
      state.updates.push(id)
      if (url.searchParams.get('uploadType') === 'media') file.text = request.postDataBuffer()!.toString('utf8')
      else file.name = request.postDataJSON().name
      file.version = String(Number(file.version)+1)
    }
    if (url.searchParams.get('alt') === 'media') return respond(200,file.text)
    const {id:returnedId,name,version,appProperties} = file
    return json({id:returnedId,name,version,appProperties,mimeType:'text/markdown',capabilities:{canEdit:file.canEdit!==false,canRename:true}})
  })
  return {state,files}
}
async function connect(page:Page) {
  const connect = page.getByRole('button',{name:'Connect Drive'})
  if (await connect.isVisible()) await connect.click()
  await page.getByRole('button',{name:'Choose Google account'}).click()
  await expect(page.getByText('Drive connected',{exact:true})).toBeVisible()
}
test('Picker, same file ID, reconnect across accounts, and conflict preservation',async ({page}) => {
  const {state,files} = await mockGoogle(page)
  await page.goto('/')
  await connect(page)
  await page.getByRole('button',{name:'Open Drive'}).click()
  await expect(page.getByRole('heading',{name:'Drive source'})).toBeVisible()
  const editor = page.getByRole('textbox',{name:'Markdown source'})
  await editor.fill('# Local edit\n\nမြန်မာ')
  state.expired = true
  await page.getByRole('button',{name:'Save',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Reconnect required')
  await expect(page.getByRole('heading',{name:'Local edit'})).toBeVisible()
  state.account = 'account-b'
  await connect(page)
  await page.getByRole('button',{name:'Save',exact:true}).click()
  await expect(page.getByRole('button',{name:'Save to Drive',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'Close',exact:true}).click()
  await page.getByRole('button',{name:'Disconnect'}).click()
  state.account = 'account-a'
  await connect(page)
  await page.getByRole('button',{name:'Save',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Saved to Drive')
  expect(state.updates).toEqual(['chosen'])
  expect(files.get('chosen')?.text).toBe('# Local edit\r\n\r\nမြန်မာ')
  const file = files.get('chosen')!
  file.text = '# Someone else edited'
  file.version = '3'
  await editor.fill('# Unmerged local edit')
  await page.getByRole('button',{name:'Save',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Conflict')
  expect(state.updates).toEqual(['chosen'])
  await page.getByRole('button',{name:'Compare versions'}).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Someone else edited')
  await expect(dialog).toContainText('Unmerged local edit')
  await page.getByRole('button',{name:'Download local and reload Drive'}).click()
  await expect(page.getByRole('heading',{name:'Someone else edited'})).toBeVisible()
  await page.getByRole('button',{name:'Local recovery - Training.md'}).click()
  await expect(page.getByRole('heading',{name:'Unmerged local edit'})).toBeVisible()
})
test('retry after refresh and a lost create response adopts only one file',async ({page}) => {
  const {state,files} = await mockGoogle(page)
  await page.goto('/')
  await connect(page)
  await page.getByRole('textbox',{name:'Markdown source'}).fill('# မြန်မာ')
  state.failedCreate = true
  await page.getByRole('button',{name:'Save',exact:true}).click()
  page.once('dialog',dialog => dialog.accept('Draft.md'))
  await page.getByRole('button',{name:'Save to Drive',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Drive save failed')
  await expect(page.getByRole('status')).toContainText('Saved locally')
  await page.reload()
  await expect(page.getByRole('heading',{name:'မြန်မာ'})).toBeVisible()
  await connect(page)
  await page.getByRole('button',{name:'Save',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Saved to Drive')
  expect(state.creates).toBe(1)
  expect(files.get('reserved-1')?.text).toBe('# မြန်မာ')
})
