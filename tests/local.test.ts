import 'fake-indexeddb/auto'
import {describe,expect,it,vi} from 'vitest'
import {EditorState} from '@codemirror/state'
import {preserveLines} from '../src/Editor'
import {markdown} from '../src/markdown'
import {counts,decode,defaults,fresh} from '../src/model'
import {persist,restore} from '../src/storage'

describe('local source and recovery',() => {
  it('preserves BOM, mixed line endings and Myanmar code points',() => {
    const source = '\ufeffမြန်မာ\r\n# Heading\nလေ့လာခြင်း\r'
    expect(decode(new TextEncoder().encode(source).buffer)).toBe(source)
    const state = EditorState.create({doc:source})
    expect(preserveLines(source,state.changes({from:state.doc.length,insert:'မြန်မာ'}))).toBe(source+'မြန်မာ')
    expect(preserveLines(source,state.changes({from:state.doc.line(2).from,insert:'English\n'}))).toBe(source.replace('# Heading','English\r\n# Heading'))
    expect(counts('မြန်မာ စာ')).toEqual({words:2,characters:9})
    expect(() => decode(Uint8Array.of(255).buffer)).toThrow()
  })
  it('round trips full source and pending Drive metadata',async () => {
    const draft = {...fresh('Script.md','မင်္ဂလာပါ\r\n'),pending:{id:'reserved',account:'account',name:'Script.md',source:'မင်္ဂလာပါ\r\n',rev:0}}
    const data = {active:draft.id,drafts:[draft],prefs:{...defaults,size:18}}
    await persist(data)
    expect(await restore()).toEqual(data)
  })
  it('reports quota failure without replacing stored content',async () => {
    const data = await restore()
    const spy = vi.spyOn(IDBObjectStore.prototype,'put').mockImplementationOnce(() => {throw new DOMException('Quota exceeded','QuotaExceededError')})
    await expect(persist(data!)).rejects.toMatchObject({name:'QuotaExceededError'})
    expect(await restore()).toEqual(data)
    spy.mockRestore()
  })
})
describe('preview',() => {
  it('renders headings, task lists, tables and highlighted fenced code',() => {
    const result = markdown('# မြန်မာ\n\n- [x] Done\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst x = 2\n```',false)
    expect(result.headings).toEqual([{id:'heading-0',line:1,title:'မြန်မာ',level:1}])
    expect(result.html).toContain('checked')
    expect(result.html).toContain('<table>')
    expect(result.html).toContain('hljs-keyword')
  })
  it('blocks raw HTML and unsafe URLs and makes image loading opt-in',() => {
    const sample = '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))\n\n![a](https://example.org/a.png)\n\n[link](https://example.org)'
    const blocked = markdown(sample,false).html
    expect(blocked).not.toMatch(/<script|<img|href="javascript:/)
    expect(blocked).toContain('noopener noreferrer')
    expect(markdown(sample,true).html).toContain('src="https://example.org/a.png"')
    expect(markdown(sample,true).html).toContain('referrerpolicy="no-referrer"')
  })
})
