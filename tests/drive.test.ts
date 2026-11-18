import { describe, it, expect, vi, afterEach } from 'vitest'
import { createFile, updateFile, ConflictError, withMdExtension, decodeText } from '../src/drive'

const token = { token: 't', expires: Date.now() + 60_000 }
afterEach(() => vi.unstubAllGlobals())

describe('drive helpers', () => {
  it('adds a .md extension and strips unsafe characters', () => {
    expect(withMdExtension('Report')).toBe('Report.md')
    expect(withMdExtension('a/b:c')).toBe('a-b-c.md')
    expect(withMdExtension('notes.markdown')).toBe('notes.markdown')
    expect(withMdExtension('  ')).toBe('Untitled.md')
  })
  it('strips a UTF-8 BOM and rejects invalid UTF-8', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]).buffer)).toBe('hi')
    expect(() => decodeText(new Uint8Array([0xff, 0xfe]).buffer)).toThrow()
  })
  it('creates a file with multipart metadata and parent folder', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'x', name: 'A.md', version: '1', mimeType: 'text/markdown' })))
    vi.stubGlobal('fetch', fetch)
    await createFile(token, 'A', '# hi', 'folder1')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/upload/drive/v3/files?uploadType=multipart')
    expect(String(init.body)).toContain('"parents":["folder1"]')
    expect(String(init.body)).toContain('"name":"A.md"')
    expect(String(init.body)).toContain('# hi')
  })
  it('refuses to overwrite when the Drive version moved on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'x', name: 'A.md', version: '5', mimeType: 'text/markdown' }))))
    await expect(updateFile(token, 'x', 'new', '4')).rejects.toBeInstanceOf(ConflictError)
  })
})
